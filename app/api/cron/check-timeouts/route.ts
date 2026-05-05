import { NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Flow, FlowNode, MessageNodeData, Profile, Contact } from "@/lib/types"
import type { Edge } from "@xyflow/react"

// This route is called by Vercel Cron to check for timed out user inputs
// Schedule: daily at midnight (Hobby plan limitation)

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
export const maxDuration = 60

export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without secret
    if (process.env.NODE_ENV === "production" && process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const now = new Date().toISOString()
  
  try {
    // Find all conversation states that are awaiting input and have timed out
    const { data: timedOutStates, error: queryError } = await getSupabaseAdmin()
      .from("conversation_state")
      .select("*")
      .eq("awaiting_input", true)
      .not("variables->__input_timeout_at", "is", null)

    if (queryError) {
      console.error("[v0] Error querying timed out states:", queryError)
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    if (!timedOutStates || timedOutStates.length === 0) {
      return NextResponse.json({ message: "No timed out inputs", processed: 0 })
    }

    let processed = 0
    const errors: string[] = []

    for (const state of timedOutStates) {
      try {
        const variables = state.variables as Record<string, unknown>
        const timeoutAt = variables.__input_timeout_at as string
        
        // Check if actually timed out
        if (!timeoutAt || new Date(timeoutAt) > new Date(now)) {
          continue
        }

        console.log("[v0] Processing timed out input for contact:", state.contact_id)

        // Get the flow
        const { data: flow, error: flowError } = await getSupabaseAdmin()
          .from("flows")
          .select("*")
          .eq("id", state.flow_id)
          .single()

        if (flowError || !flow) {
          console.error("[v0] Could not find flow:", flowError)
          continue
        }

        // Get the profile for WhatsApp credentials
        const { data: profile, error: profileError } = await getSupabaseAdmin()
          .from("profiles")
          .select("*")
          .eq("id", state.user_id)
          .single()

        if (profileError || !profile) {
          console.error("[v0] Could not find profile:", profileError)
          continue
        }

        // Get the contact
        const { data: contact, error: contactError } = await getSupabaseAdmin()
          .from("contacts")
          .select("*")
          .eq("id", state.contact_id)
          .single()

        if (contactError || !contact) {
          console.error("[v0] Could not find contact:", contactError)
          continue
        }

        // Use published nodes/edges if available
        const nodes = (flow.published_nodes || flow.nodes) as FlowNode[]
        const edges = (flow.published_edges || flow.edges) as Edge[]
        const currentNodeId = state.current_node_id

        // Find the current node
        const currentNode = nodes.find(n => n.id === currentNodeId)
        if (!currentNode || currentNode.type !== "message") {
          console.error("[v0] Could not find current message node:", currentNodeId)
          continue
        }

        const nodeData = currentNode.data as MessageNodeData
        if (nodeData.messageType !== "getUserData") {
          continue
        }

        // Find the timeout edge (connected to the "timeout" handle)
        const timeoutEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === "timeout")
        
        if (!timeoutEdge) {
          console.log("[v0] No timeout edge configured for node:", currentNodeId)
          // Just clear the awaiting state without continuing
          await getSupabaseAdmin()
            .from("conversation_state")
            .update({
              awaiting_input: false,
              awaiting_input_type: null,
              variables: {
                ...variables,
                __waiting_for_input: false,
                __input_timeout: undefined,
                __input_timeout_at: undefined,
              },
              last_activity: now,
            })
            .eq("id", state.id)
          continue
        }

        // Find the next node
        const nextNode = nodes.find(n => n.id === timeoutEdge.target)
        if (!nextNode) {
          console.error("[v0] Could not find timeout target node:", timeoutEdge.target)
          continue
        }

        // Log the timeout event
        await getSupabaseAdmin().from("events").insert({
          user_id: state.user_id,
          contact_id: state.contact_id,
          flow_id: state.flow_id,
          node_id: currentNodeId,
          event_type: "input_timeout",
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

        // Update conversation state to continue from timeout node
        await getSupabaseAdmin()
          .from("conversation_state")
          .update({
            awaiting_input: false,
            awaiting_input_type: null,
            current_node_id: nextNode.id,
            variables: newVariables,
            last_activity: now,
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
        console.log("[v0] Successfully processed timeout for contact:", state.contact_id)

      } catch (err) {
        console.error("[v0] Error processing timeout:", err)
        errors.push(String(err))
      }
    }

    return NextResponse.json({
      message: "Timeout check complete",
      processed,
      total: timedOutStates.length,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error) {
    console.error("[v0] Error in timeout cron:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
