import { NextRequest, NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Flow, FlowNode, Profile, Contact } from "@/lib/types"
import type { Edge } from "@xyflow/react"
import { sendWhatsAppMessage } from "@/lib/engine/whatsapp"

// This endpoint is called by pg_cron via pg_net to continue a flow after timeout

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

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from our database or has valid auth
    const authHeader = request.headers.get("Authorization")
    const expectedToken = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    
    if (authHeader !== expectedToken) {
      console.error("[continue-flow] Unauthorized request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const body = await request.json()
    const { contactId, userId, flowId, nodeId, reason } = body
    
    if (!contactId || !userId || !flowId || !nodeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    console.log(`[continue-flow] Processing: contact=${contactId}, node=${nodeId}, reason=${reason}`)
    
    // Get the flow definition
    const { data: flows, error: flowError } = await getSupabaseAdmin()
      .from("flows")
      .select("*")
      .eq("id", flowId)
      .eq("user_id", userId)
    
    if (flowError) {
      console.error("[continue-flow] Flow query error:", flowError)
      return NextResponse.json({ error: "Failed to fetch flow" }, { status: 500 })
    }

    if (!flows || flows.length === 0) {
      console.error("[continue-flow] Flow not found")
      return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    }

    const flow = flows[0]
    
    // Get the profile (for WhatsApp credentials)
    const { data: profiles, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", userId)
    
    if (profileError) {
      console.error("[continue-flow] Profile query error:", profileError)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) {
      console.error("[continue-flow] Profile not found")
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const profile = profiles[0]
    
    // Get the contact
    const { data: contacts, error: contactError } = await getSupabaseAdmin()
      .from("contacts")
      .select("*")
      .eq("id", contactId)
    
    if (contactError) {
      console.error("[continue-flow] Contact query error:", contactError)
      return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 })
    }

    if (!contacts || contacts.length === 0) {
      console.error("[continue-flow] Contact not found")
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    const contact = contacts[0]
    
    // Get the conversation state for variables
    const { data: convStates, error: stateError } = await getSupabaseAdmin()
      .from("conversation_state")
      .select("variables")
      .eq("contact_id", contactId)
    
    if (stateError) {
      console.error("[continue-flow] State query error:", stateError)
    }
    
    const variables = convStates?.[0]?.variables || {}
    
    // Get the node to execute
    const definition = flow.definition as { nodes: FlowNode[]; edges: Edge[] }
    const nodes = definition.nodes || []
    const edges = definition.edges || []
    
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      console.error("[continue-flow] Node not found:", nodeId)
      return NextResponse.json({ error: "Node not found" }, { status: 404 })
    }
    
    // Execute the node based on its type
    await executeTimeoutNode(node, nodes, edges, profile, contact, flow, variables, userId, contactId)
    
    return NextResponse.json({ success: true, nodeId, reason })
    
  } catch (error) {
    console.error("[continue-flow] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function executeTimeoutNode(
  node: FlowNode,
  nodes: FlowNode[],
  edges: Edge[],
  profile: Profile,
  contact: Contact,
  flow: Flow,
  variables: Record<string, unknown>,
  userId: string,
  contactId: string
) {
  // Helper to interpolate variables in text
  const interpolate = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === "name") return contact.name || contact.phone
      if (key === "phone") return contact.phone
      return String(variables[key] ?? `{{${key}}}`)
    })
  }
  
  // Helper to find next node
  const findNextNode = (currentNodeId: string): FlowNode | undefined => {
    const edge = edges.find(e => e.source === currentNodeId && !e.sourceHandle)
    if (edge) {
      return nodes.find(n => n.id === edge.target)
    }
    return undefined
  }
  
  // Process the node
  if (node.type === "message") {
    const data = node.data as Record<string, unknown>
    const messageType = data.messageType as string || "text"
    
    if (messageType === "text" && data.text) {
      const text = interpolate(data.text as string)
      
      if (profile.whatsapp_phone_id && profile.whatsapp_token) {
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id,
          profile.whatsapp_token,
          contact.phone,
          { type: "text", text }
        )
        
        // Log the message
        await getSupabaseAdmin()
          .from("messages")
          .insert({
            user_id: userId,
            contact_id: contactId,
            flow_id: flow.id,
            direction: "outgoing",
            type: "text",
            content: { text },
          })
      }
    }
    
    // Continue to next node if not waiting for input
    if (!["button", "card", "getUserData"].includes(messageType)) {
      const nextNode = findNextNode(node.id)
      if (nextNode) {
        await executeTimeoutNode(nextNode, nodes, edges, profile, contact, flow, variables, userId, contactId)
      }
    }
  }
  
  // Update conversation state
  await getSupabaseAdmin()
    .from("conversation_state")
    .upsert({
      contact_id: contactId,
      user_id: userId,
      flow_id: flow.id,
      current_node_id: node.id,
      awaiting_input: false,
      variables,
      last_activity: new Date().toISOString(),
    }, { onConflict: "contact_id" })
  
  // Log the event
  await getSupabaseAdmin()
    .from("flow_events")
    .insert({
      user_id: userId,
      contact_id: contactId,
      flow_id: flow.id,
      node_id: node.id,
      event_type: "timeout_node_executed",
      event_data: { nodeType: node.type },
    })
}
