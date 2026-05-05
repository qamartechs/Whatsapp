import { NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Flow, FlowNode, MessageNodeData, Profile, Contact } from "@/lib/types"
import type { Edge } from "@xyflow/react"

// This API can be called to check for timed out user inputs
// Can be triggered by: client-side polling, external cron services, or Vercel cron

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: Request) {
  // Optional: verify API key for security
  const authHeader = request.headers.get("authorization")
  const apiKey = process.env.TIMEOUT_CHECK_API_KEY
  
  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    // In development, allow without key
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const now = new Date()
  
  try {
    // Find all conversation states that are awaiting input with auto-skip enabled
    const { data: states, error: queryError } = await getSupabaseAdmin()
      .from("conversation_state")
      .select("*")
      .eq("awaiting_input", true)

    if (queryError) {
      console.error("[Timeout] Error querying states:", queryError)
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    if (!states || states.length === 0) {
      return NextResponse.json({ message: "No pending inputs", processed: 0 })
    }

    let processed = 0
    let skipped = 0

    for (const state of states) {
      try {
        const variables = state.variables as Record<string, unknown>
        const timeoutAt = variables.__input_timeout_at as string
        const autoSkipEnabled = variables.__auto_skip_enabled as boolean
        
        // Only process if auto-skip is enabled and has timed out
        if (!autoSkipEnabled || !timeoutAt) {
          skipped++
          continue
        }
        
        if (new Date(timeoutAt) > now) {
          skipped++
          continue
        }

        console.log("[Timeout] Processing timed out input for contact:", state.contact_id)

        // Get the flow
        const { data: flows, error: flowError } = await getSupabaseAdmin()
          .from("flows")
          .select("*")
          .eq("id", state.flow_id)

        if (flowError) {
          console.error("[Timeout] Flow query error:", flowError)
          continue
        }

        if (!flows || flows.length === 0) {
          console.error("[Timeout] Could not find flow")
          continue
        }

        const flow = flows[0]

        // Get the profile for WhatsApp credentials
        const { data: profiles, error: profileError } = await getSupabaseAdmin()
          .from("profiles")
          .select("*")
          .eq("id", state.user_id)

        if (profileError) {
          console.error("[Timeout] Profile query error:", profileError)
          continue
        }

        if (!profiles || profiles.length === 0) {
          console.error("[Timeout] Could not find profile")
          continue
        }

        const profile = profiles[0]

        // Get the contact
        const { data: contacts, error: contactError } = await getSupabaseAdmin()
          .from("contacts")
          .select("*")
          .eq("id", state.contact_id)

        if (contactError) {
          console.error("[Timeout] Contact query error:", contactError)
          continue
        }

        if (!contacts || contacts.length === 0) {
          console.error("[Timeout] Could not find contact")
          continue
        }

        const contact = contacts[0]

        // Use published nodes/edges if available
        const nodes = (flow.published_nodes || flow.nodes) as FlowNode[]
        const edges = (flow.published_edges || flow.edges) as Edge[]
        const currentNodeId = state.current_node_id

        // Find the current node
        const currentNode = nodes.find(n => n.id === currentNodeId)
        if (!currentNode || currentNode.type !== "message") {
          console.error("[Timeout] Invalid current node:", currentNodeId)
          continue
        }

        const nodeData = currentNode.data as MessageNodeData
        if (nodeData.messageType !== "getUserData" || !nodeData.autoSkipEnabled) {
          continue
        }

        // Find the timeout edge (connected to the "timeout" handle)
        const timeoutEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === "timeout")
        
        if (!timeoutEdge) {
          console.log("[Timeout] No timeout edge for node:", currentNodeId)
          // Clear the awaiting state
          await getSupabaseAdmin()
            .from("conversation_state")
            .update({
              awaiting_input: false,
              awaiting_input_type: null,
              variables: {
                ...variables,
                __waiting_for_input: false,
                __auto_skip_enabled: undefined,
                __input_timeout: undefined,
                __input_timeout_at: undefined,
              },
              last_activity: now.toISOString(),
            })
            .eq("id", state.id)
          continue
        }

        // Find the next node
        const nextNode = nodes.find(n => n.id === timeoutEdge.target)
        if (!nextNode) {
          console.error("[Timeout] Could not find timeout target:", timeoutEdge.target)
          continue
        }

        // Log the timeout event
        await getSupabaseAdmin().from("events").insert({
          user_id: state.user_id,
          contact_id: state.contact_id,
          flow_id: state.flow_id,
          node_id: currentNodeId,
          event_type: "auto_skip_triggered",
          payload: {
            variableName: nodeData.variableName,
            timeout: variables.__input_timeout,
            nextNodeId: nextNode.id,
          },
        })

        // Clear timeout variables and update state
        const newVariables = { ...variables }
        delete newVariables.__waiting_for_input
        delete newVariables.__input_variable
        delete newVariables.__input_type
        delete newVariables.__input_validation
        delete newVariables.__input_error_message
        delete newVariables.__input_timeout
        delete newVariables.__input_timeout_at
        delete newVariables.__current_node_id
        delete newVariables.__auto_skip_enabled

        // Update conversation state to continue from timeout node
        await getSupabaseAdmin()
          .from("conversation_state")
          .update({
            awaiting_input: false,
            awaiting_input_type: null,
            current_node_id: nextNode.id,
            variables: newVariables,
            last_activity: now.toISOString(),
          })
          .eq("id", state.id)

        // Import and execute from the next node
        const { executeFlow } = await import("@/lib/engine/executor")
        
        await executeFlow(
          state.user_id,
          contact as Contact,
          profile as Profile,
          { ...(flow as Flow), nodes, edges },
          newVariables,
          nextNode.id
        )

        processed++
        console.log("[Timeout] Auto-skip triggered for contact:", state.contact_id)

      } catch (err) {
        console.error("[Timeout] Error processing:", err)
      }
    }

    return NextResponse.json({
      message: "Timeout check complete",
      processed,
      skipped,
      total: states.length,
    })

  } catch (error) {
    console.error("[Timeout] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Also support POST for flexibility
export async function POST(request: Request) {
  return GET(request)
}
