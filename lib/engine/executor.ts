import type {
  ExecutionContext,
  FlowNode,
  FlowCallNodeData,
  MessageNodeData,
  ListNodeData,
  ConditionNodeData,
  ApiNodeData,
  DelayNodeData,
  AiNodeData,
  AiTriggerNodeData,
  AiChatNodeData,
  TransferToHumanNodeData,
  SetVariableNodeData,
  SetLabelNodeData,
  WhatsAppIncomingMessage,
  Flow,
  Contact,
  Profile,
} from "@/lib/types"
import type { Edge } from "@xyflow/react"
import { sendWhatsAppMessage } from "./whatsapp"
import { generateAiResponse, getApiKeysFromProfile } from "./ai"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

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

export interface ExecutionResult {
  success: boolean
  awaitingInput?: boolean
  awaitingInputType?: "button" | "list" | "text"
  error?: string
  nextNodeId?: string
  sentMessages?: Array<{
    type: string
    content: Record<string, unknown>
    nodeId: string
  }>
}

/**
 * PAYLOAD STRUCTURE FOR EVENT-DRIVEN ROUTING:
 * 
 * Every button/list item payload should be structured as:
 * {
 *   action: "goto_node",      // Action type
 *   flow_id: "uuid",          // Target flow ID (or "_current")
 *   node_id: "uuid",          // Target node ID to execute
 *   data: { ... }             // Optional additional data
 * }
 * 
 * This allows any button from ANY message (past or present) to trigger
 * the correct node execution without relying on conversation state.
 */

interface ActionPayload {
  action: string
  flow_id?: string
  node_id?: string
  data?: Record<string, unknown>
}

/**
 * Parses a payload string into an ActionPayload object
 */
function parsePayload(payload: string): ActionPayload | null {
  try {
    // Try JSON first
    if (payload.startsWith("{")) {
      return JSON.parse(payload)
    }
    // Simple format: action:flow_id:node_id
    const parts = payload.split(":")
    if (parts.length >= 3) {
      return {
        action: parts[0],
        flow_id: parts[1],
        node_id: parts[2],
        data: parts[3] ? JSON.parse(parts[3]) : undefined,
      }
    }
    // Button/list ID format - look up the target node from edges
    return { action: "button_reply", data: { button_id: payload } }
  } catch {
    return { action: "text_input", data: { text: payload } }
  }
}

/**
 * Replaces {{variable}} placeholders with actual values
 */
function interpolate(
  template: string,
  variables: Record<string, unknown>
): string {
  if (!template) return ""
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key]
    if (value === undefined || value === null) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  })
}

/**
 * Finds the next node based on edge connections
 */
function findNextNode(
  nodes: FlowNode[],
  edges: Edge[],
  sourceNodeId: string,
  handleId?: string
): FlowNode | null {
  // First try exact handle match
  if (handleId) {
    const edge = edges.find(
      (e) => e.source === sourceNodeId && e.sourceHandle === handleId
    )
    if (edge) {
      return nodes.find((n) => n.id === edge.target) || null
    }
  }
  
  // Then try any edge from this node
  const edge = edges.find((e) => e.source === sourceNodeId)
  if (edge) {
    return nodes.find((n) => n.id === edge.target) || null
  }
  
  return null
}

/**
 * Gets the target node ID for a button/list item by looking at edges
 */
function getTargetNodeForButton(
  edges: Edge[],
  sourceNodeId: string,
  buttonId: string
): string | null {
  // Look for an edge with this button ID as sourceHandle
  const edge = edges.find(
    (e) => e.source === sourceNodeId && e.sourceHandle === buttonId
  )
  return edge?.target || null
}

/**
 * Evaluates a condition
 */
function evaluateCondition(
  variable: string,
  operator: string,
  value: string,
  variables: Record<string, unknown>
): boolean {
  const actualValue = variables[variable]
  const strValue = actualValue !== undefined ? String(actualValue) : ""

  switch (operator) {
    case "equals":
      return strValue.toLowerCase() === value.toLowerCase()
    case "contains":
      return strValue.toLowerCase().includes(value.toLowerCase())
    case "startsWith":
      return strValue.toLowerCase().startsWith(value.toLowerCase())
    case "endsWith":
      return strValue.toLowerCase().endsWith(value.toLowerCase())
    case "regex":
      try {
        return new RegExp(value, "i").test(strValue)
      } catch {
        return false
      }
    case "greaterThan":
      return Number(strValue) > Number(value)
    case "lessThan":
      return Number(strValue) < Number(value)
    default:
      return false
  }
}

/**
 * Logs an event to the database
 */
async function logEvent(
  userId: string,
  contactId: string | null,
  flowId: string | null,
  nodeId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  await getSupabaseAdmin().from("events").insert({
    user_id: userId,
    contact_id: contactId,
    flow_id: flowId,
    node_id: nodeId,
    event_type: eventType,
    payload,
  })
}

/**
 * Saves outbound message to database
 */
async function saveMessage(
  userId: string,
  contactId: string,
  flowId: string | null,
  messageType: string,
  content: Record<string, unknown>,
  whatsappMessageId?: string
) {
  await getSupabaseAdmin().from("messages").insert({
    user_id: userId,
    contact_id: contactId,
    flow_id: flowId,
    direction: "outbound",
    message_type: messageType,
    content,
    whatsapp_message_id: whatsappMessageId,
    status: whatsappMessageId ? "sent" : "pending",
  })
}

/**
 * Creates a payload string that encodes the action for event-driven routing
 */
function createButtonPayload(flowId: string, sourceNodeId: string, buttonId: string, edges: Edge[]): string {
  const targetNodeId = getTargetNodeForButton(edges, sourceNodeId, buttonId)
  return JSON.stringify({
    action: "goto_node",
    flow_id: flowId,
    node_id: targetNodeId || sourceNodeId, // Fallback to same node if no edge
    source_node_id: sourceNodeId,
    button_id: buttonId,
  })
}

/**
 * Executes a single node - this is stateless and does not depend on conversation state
 */
async function executeNode(
  node: FlowNode,
  ctx: ExecutionContext,
  depth: number = 0
): Promise<ExecutionResult> {
  // Prevent infinite loops
  if (depth > 50) {
    console.error("[v0] EXECUTOR: Max depth exceeded", { nodeId: node.id, depth })
    return { success: false, error: "Max execution depth exceeded" }
  }

  const { flow, contact, profile, variables } = ctx
  const nodes = flow.published_nodes || flow.nodes
  const edges = flow.published_edges || flow.edges

  console.log(`[v0] EXECUTOR: Executing node [${node.type}]`, {
    nodeId: node.id,
    nodeType: node.type,
    nodeLabel: (node.data as { label?: string })?.label,
    depth,
    flowId: ctx.flowId,
    variableKeys: Object.keys(variables),
  })

  await logEvent(
    ctx.userId,
    ctx.contactId,
    ctx.flowId,
    node.id,
    "node_executed",
    { 
      nodeType: node.type, 
      nodeLabel: (node.data as { label?: string })?.label || node.type,
      depth 
    }
  )

  switch (node.type) {
    case "start": {
      // Log flow started with all initial variables
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "flow_started", {
        flowName: ctx.flow.name,
        flowId: ctx.flowId,
        contactName: contact.name || contact.phone,
        contactPhone: contact.phone,
        initialVariables: Object.entries(variables).map(([k, v]) => ({
          name: k,
          value: typeof v === "object" ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50),
        })),
        triggerMessage: ctx.incomingMessage?.text?.body?.slice(0, 100) || "(none)",
      })
      
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "message": {
      const data = node.data as MessageNodeData
      const messageType = data.messageType || "text"
      
      try {
        switch (messageType) {
          case "text": {
            const text = interpolate(data.text || "", variables)
            if (text) {
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "text", text }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "text", textPreview: text.slice(0, 50) })
            }
            break
          }
          
          case "image": {
            if (data.mediaUrl) {
              const caption = data.caption ? interpolate(data.caption, variables) : undefined
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "image", mediaUrl: data.mediaUrl, caption }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "image", { mediaUrl: data.mediaUrl, caption }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "image", hasCaption: !!caption })
            }
            break
          }
          
          case "video": {
            if (data.mediaUrl) {
              const caption = data.caption ? interpolate(data.caption, variables) : undefined
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "video", mediaUrl: data.mediaUrl, caption }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "video", { mediaUrl: data.mediaUrl, caption }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "video", hasCaption: !!caption })
            }
            break
          }
          
          case "gif": {
            if (data.mediaUrl) {
              const caption = data.caption ? interpolate(data.caption, variables) : undefined
              // GIFs are sent as video in WhatsApp
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "video", mediaUrl: data.mediaUrl, caption }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "gif", { mediaUrl: data.mediaUrl, caption }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "gif" })
            }
            break
          }
          
          case "file": {
            if (data.mediaUrl) {
              const caption = data.caption ? interpolate(data.caption, variables) : undefined
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "document", mediaUrl: data.mediaUrl, caption, filename: data.fileName }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "document", { mediaUrl: data.mediaUrl, fileName: data.fileName, caption }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "file", fileName: data.fileName })
            }
            break
          }
          
          case "card": {
            // Card = Image with caption + buttons (interactive message)
            // Buttons are non-linear like button/list - can be clicked anytime
            const bodyText = data.text ? interpolate(data.text, variables) : undefined
            const footer = data.footer ? interpolate(data.footer, variables) : undefined
            
            // Separate buttons by type
            const replyButtons = (data.cardButtons || []).filter(btn => btn.type === "reply")
            const urlButtons = (data.cardButtons || []).filter(btn => btn.type === "url")
            const phoneButtons = (data.cardButtons || []).filter(btn => btn.type === "phone")
            
            // Send URL buttons as CTA URL messages (each as separate message)
            for (const urlBtn of urlButtons) {
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                {
                  type: "interactive",
                  interactive: {
                    type: "cta_url",
                    header: data.cardImageUrl ? { type: "image", image: { link: data.cardImageUrl } } : undefined,
                    body: { text: bodyText || "Click the button below" },
                    footer: footer ? { text: footer.slice(0, 60) } : undefined,
                    action: {
                      name: "cta_url",
                      parameters: {
                        display_text: urlBtn.text.slice(0, 20),
                        url: urlBtn.payload,
                      },
                    },
                  },
                }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "interactive", { 
                imageUrl: data.cardImageUrl, text: bodyText, footer, buttonType: "cta_url", buttonText: urlBtn.text, url: urlBtn.payload 
              }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "cta_url", url: urlBtn.payload })
            }
            
            // Phone buttons - append as text with image
            if (phoneButtons.length > 0) {
              let phoneText = bodyText || ""
              for (const phoneBtn of phoneButtons) {
                phoneText += `\n\n${phoneBtn.text}: ${phoneBtn.payload}`
              }
              if (data.cardImageUrl) {
                const result = await sendWhatsAppMessage(
                  profile.whatsapp_phone_id!,
                  profile.whatsapp_token!,
                  contact.phone,
                  { type: "image", mediaUrl: data.cardImageUrl, caption: phoneText.trim() }
                )
                await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "image", { mediaUrl: data.cardImageUrl, caption: phoneText.trim() }, result?.messages?.[0]?.id)
              } else if (phoneText.trim()) {
                const result = await sendWhatsAppMessage(
                  profile.whatsapp_phone_id!,
                  profile.whatsapp_token!,
                  contact.phone,
                  { type: "text", text: phoneText.trim() }
                )
                await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: phoneText.trim() }, result?.messages?.[0]?.id)
              }
            }
            
            // Quick reply buttons with image header
            if (replyButtons.length > 0) {
              const buttons = replyButtons.slice(0, 3).map((btn) => ({
                type: "reply" as const,
                reply: {
                  id: createButtonPayload(ctx.flowId, node.id, btn.id, edges),
                  title: btn.text.slice(0, 20),
                },
              }))
              
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                {
                  type: "interactive",
                  interactive: {
                    type: "button",
                    header: data.cardImageUrl ? { type: "image", image: { link: data.cardImageUrl } } : undefined,
                    body: { text: bodyText || "Select an option" },
                    footer: footer ? { text: footer.slice(0, 60) } : undefined,
                    action: { buttons },
                  },
                }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "card", { imageUrl: data.cardImageUrl, text: bodyText, footer, buttons: replyButtons }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "card", buttonCount: replyButtons.length })
              
              // Save conversation state so we can resume when button is clicked
              await getSupabaseAdmin()
                .from("conversation_state")
                .upsert({
                  contact_id: ctx.contactId,
                  user_id: ctx.userId,
                  flow_id: ctx.flowId,
                  current_node_id: node.id,
                  awaiting_input: true,
                  awaiting_input_type: "button",
                  variables: ctx.variables,
                  last_activity: new Date().toISOString(),
                }, { onConflict: "contact_id" })
              
              // Return without waiting - buttons are non-linear (can be clicked anytime)
              return { success: true, awaitingInput: true, awaitingInputType: "button" }
            } else if (urlButtons.length === 0 && phoneButtons.length === 0 && data.cardImageUrl) {
              // Just image with caption, no buttons at all
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "image", mediaUrl: data.cardImageUrl, caption: bodyText }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "image", { mediaUrl: data.cardImageUrl, caption: bodyText }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "card_image" })
            }
            break
          }
          
          case "carousel": {
            // Carousel messages require template approval in WhatsApp
            // For now, send as multiple card messages
            const cards = data.carouselCards || []
            for (const card of cards.slice(0, 10)) {
              const title = card.title ? interpolate(card.title, variables) : ""
              const description = card.description ? interpolate(card.description, variables) : ""
              const text = `*${title}*\n${description}`
              
              if (card.imageUrl) {
                await sendWhatsAppMessage(
                  profile.whatsapp_phone_id!,
                  profile.whatsapp_token!,
                  contact.phone,
                  { type: "image", mediaUrl: card.imageUrl, caption: text }
                )
              } else {
                await sendWhatsAppMessage(
                  profile.whatsapp_phone_id!,
                  profile.whatsapp_token!,
                  contact.phone,
                  { type: "text", text }
                )
              }
            }
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "carousel", { cards: data.carouselCards })
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "carousel", cardCount: cards.length })
            break
          }
          
case "getUserData": {
  // Log getUserData node started
  await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "get_user_data_started", {
    nodeLabel: data.label || "Get User Data",
    variableName: data.variableName || "user_input",
    inputType: data.inputType || "any",
    hasValidation: !!(data.validationRegex),
    autoSkipEnabled: !!data.autoSkipEnabled,
    timeout: data.timeout,
    hasPrompt: !!data.prompt,
  })
  
  // Send prompt message and wait for user input
  const prompt = data.prompt ? interpolate(data.prompt, variables) : ""
  if (prompt) {
  await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "prompt_sent", {
    promptText: prompt.slice(0, 100),
    variableName: data.variableName || "user_input",
  })
  
  const result = await sendWhatsAppMessage(
  profile.whatsapp_phone_id!,
  profile.whatsapp_token!,
  contact.phone,
  { type: "text", text: prompt }
  )
  await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: prompt }, result?.messages?.[0]?.id)
  }
            
            // Save state to wait for user input
            ctx.variables.__waiting_for_input = true
            ctx.variables.__input_variable = data.variableName || "user_input"
            ctx.variables.__input_type = data.inputType || "any"
            ctx.variables.__input_validation = data.validationRegex || ""
            ctx.variables.__input_error_message = data.errorMessage || "Invalid input. Please try again."
            ctx.variables.__current_node_id = node.id
            
            // Store timeout info if auto-skip is enabled (minimum 10 seconds)
            if (data.autoSkipEnabled && data.timeout && data.timeout >= 10) {
              ctx.variables.__input_timeout = data.timeout
              ctx.variables.__input_timeout_at = new Date(Date.now() + data.timeout * 1000).toISOString()
              ctx.variables.__auto_skip_enabled = true
            } else {
              delete ctx.variables.__input_timeout
              delete ctx.variables.__input_timeout_at
              delete ctx.variables.__auto_skip_enabled
            }
            
            // Save conversation state to database - upsert to create or update
            const { error: upsertError } = await getSupabaseAdmin()
              .from("conversation_state")
              .upsert({
                contact_id: ctx.contactId,
                user_id: ctx.userId,
                flow_id: ctx.flowId,
                current_node_id: node.id,
                awaiting_input: true,
                awaiting_input_type: "getUserData",
                variables: ctx.variables,
                last_activity: new Date().toISOString(),
              }, { onConflict: "contact_id" })
            
            if (upsertError) {
              console.error("[v0] Error saving conversation state for getUserData:", upsertError)
            } else {
              console.log("[v0] Saved getUserData state for contact:", ctx.contactId, "node:", node.id)
            }
            
  await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "waiting_for_input", {
    nodeLabel: data.label || "Get User Data",
    variableName: data.variableName || "user_input",
    inputType: data.inputType || "any",
    validationRegex: data.validationRegex || null,
    timeout: data.timeout || null,
    autoSkipEnabled: !!data.autoSkipEnabled,
    timeoutAt: data.autoSkipEnabled && data.timeout ? new Date(Date.now() + data.timeout * 1000).toISOString() : null,
  })
            
            return { success: true, waitingForInput: true }
          }
          
          case "typing": {
            // Send typing indicator using WhatsApp's typing_indicator API
            // It requires a message_id to respond to - use the last received message
            const lastMessageId = ctx.variables.__last_message_id as string
            if (lastMessageId && profile.whatsapp_phone_id && profile.whatsapp_token) {
              const { sendTypingIndicator } = await import("./whatsapp")
              await sendTypingIndicator(
                profile.whatsapp_phone_id,
                profile.whatsapp_token,
                lastMessageId
              )
            }
            // Wait for the specified duration
            const duration = (data.typingDuration || 3) * 1000
            await new Promise(resolve => setTimeout(resolve, Math.min(duration, 25000)))
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "typing_indicator", { duration: data.typingDuration || 3 })
            break
          }
          
          case "button": {
            // Button message - interactive buttons within message node
            const text = data.text ? interpolate(data.text, variables) : ""
            const header = data.header ? interpolate(data.header, variables) : undefined
            const footer = data.footer ? interpolate(data.footer, variables) : undefined
            
            // Separate buttons by type
            const replyButtons = (data.buttons || []).filter(btn => btn.type === "reply")
            const urlButtons = (data.buttons || []).filter(btn => btn.type === "url")
            const phoneButtons = (data.buttons || []).filter(btn => btn.type === "phone")
            
            // Send URL buttons as CTA URL interactive messages
            for (const urlBtn of urlButtons) {
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                {
                  type: "interactive",
                  interactive: {
                    type: "cta_url",
                    header: header ? { type: "text", text: header.slice(0, 60) } : undefined,
                    body: { text: text || "Click the button below" },
                    footer: footer ? { text: footer.slice(0, 60) } : undefined,
                    action: {
                      name: "cta_url",
                      parameters: {
                        display_text: urlBtn.text.slice(0, 20),
                        url: urlBtn.payload,
                      },
                    },
                  },
                }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "interactive", { 
                text, header, footer, buttonType: "cta_url", buttonText: urlBtn.text, url: urlBtn.payload 
              }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "cta_url", url: urlBtn.payload })
            }
            
            // Phone buttons - append as text since WhatsApp doesn't support phone CTA in interactive
            if (phoneButtons.length > 0) {
              let phoneText = text || ""
              for (const phoneBtn of phoneButtons) {
                phoneText += `\n\n${phoneBtn.text}: ${phoneBtn.payload}`
              }
              if (phoneText.trim()) {
                const result = await sendWhatsAppMessage(
                  profile.whatsapp_phone_id!,
                  profile.whatsapp_token!,
                  contact.phone,
                  { type: "text", text: phoneText.trim() }
                )
                await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: phoneText.trim() }, result?.messages?.[0]?.id)
              }
            }
            
            // Send quick reply buttons as interactive button message
            if (replyButtons.length > 0) {
              const buttons = replyButtons.slice(0, 3).map((btn) => ({
                type: "reply" as const,
                reply: {
                  id: createButtonPayload(ctx.flowId, node.id, btn.id, edges),
                  title: btn.text.slice(0, 20),
                },
              }))
              
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                {
                  type: "interactive",
                  interactive: {
                    type: "button",
                    header: header ? { type: "text", text: header.slice(0, 60) } : undefined,
                    body: { text: text || "Select an option" },
                    footer: footer ? { text: footer.slice(0, 60) } : undefined,
                    action: { buttons },
                  },
                }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "interactive", { text, header, footer, buttons: replyButtons }, result?.messages?.[0]?.id)
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "message_sent", { type: "button", buttonCount: replyButtons.length })
              
              // Save conversation state so we can resume when button is clicked
              await getSupabaseAdmin()
                .from("conversation_state")
                .upsert({
                  contact_id: ctx.contactId,
                  user_id: ctx.userId,
                  flow_id: ctx.flowId,
                  current_node_id: node.id,
                  awaiting_input: true,
                  awaiting_input_type: "button",
                  variables: ctx.variables,
                  last_activity: new Date().toISOString(),
                }, { onConflict: "contact_id" })
              
              // Return without waiting - response comes from button click (non-linear)
              return { success: true, awaitingInput: true, awaitingInputType: "button" }
            } else if (urlButtons.length === 0 && phoneButtons.length === 0 && text) {
              // No buttons at all, just send text
              const result = await sendWhatsAppMessage(
                profile.whatsapp_phone_id!,
                profile.whatsapp_token!,
                contact.phone,
                { type: "text", text }
              )
              await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text }, result?.messages?.[0]?.id)
            }
            break
          }
          
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "whatsapp_error", { 
          error: errorMessage,
          messageType,
        })
        return { success: false, error: errorMessage }
      }

      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

case "list": {
  const data = node.data as ListNodeData
  const bodyText = interpolate(data.bodyText, variables)
  const footer = data.footer ? interpolate(data.footer, variables) : undefined
  
  // Create sections with embedded payloads for event-driven routing
  const sections = data.sections.map((section) => ({
    title: section.title,
    rows: section.rows.map((row) => ({
      id: createButtonPayload(ctx.flowId, node.id, row.id, edges),
      title: row.title.slice(0, 24), // WhatsApp limit
      description: row.description?.slice(0, 72),
    })),
  }))
  
  // Log list node execution
  await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "list_sent", {
    nodeLabel: data.label || "List",
    bodyText: bodyText.slice(0, 100),
    buttonText: data.buttonText,
    sectionsCount: sections.length,
    totalRows: sections.reduce((acc, s) => acc + s.rows.length, 0),
    sections: sections.map(s => ({ title: s.title, rowCount: s.rows.length })),
  })
  
  try {
        const result = await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          {
            type: "interactive",
            interactive: {
              type: "list",
              header: data.headerText ? { type: "text", text: data.headerText } : undefined,
              body: { text: bodyText },
              footer: footer ? { text: footer } : undefined,
              action: {
                button: data.buttonText,
                sections,
              },
            },
          }
        )

        await saveMessage(
          ctx.userId,
          ctx.contactId,
          ctx.flowId,
          "interactive",
          { bodyText, footer, sections: data.sections, buttonText: data.buttonText, nodeId: node.id },
          result?.messages?.[0]?.id
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logEvent(
          ctx.userId,
          ctx.contactId,
          ctx.flowId,
          node.id,
          "whatsapp_error",
          { 
            error: errorMessage,
            nodeType: "list",
            sectionCount: data.sections.length,
            bodyTextLength: bodyText.length,
          }
        )
        return { success: false, error: errorMessage }
      }

      return { success: true, awaitingInput: true, awaitingInputType: "list" }
    }

    case "condition": {
      const data = node.data as ConditionNodeData
      
      // Evaluate each condition
      for (let i = 0; i < data.conditions.length; i++) {
        const cond = data.conditions[i]
        const result = evaluateCondition(cond.variable, cond.operator, cond.value, variables)
        const actualValue = variables[cond.variable]
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "condition_evaluated", {
          conditionIndex: i,
          conditionId: cond.id,
          variableName: cond.variable,
          operator: cond.operator,
          compareValue: cond.value,
          actualValue: actualValue !== undefined ? String(actualValue).slice(0, 100) : "(undefined)",
          result: result,
        })
        
        if (result) {
          const nextNode = findNextNode(nodes, edges, node.id, cond.id)
          if (nextNode) {
            return executeNode(nextNode, ctx, depth + 1)
          }
        }
      }
      
      // Use default branch
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "condition_default", {
        reason: "No conditions matched, using default branch",
      })
      
      const defaultNode = findNextNode(nodes, edges, node.id, "default")
      if (defaultNode) {
        return executeNode(defaultNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "api": {
      const data = node.data as ApiNodeData
      const url = interpolate(data.url, variables)
      const body = data.body ? interpolate(data.body, variables) : undefined

      // Log API request
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "api_request", {
        method: data.method,
        url: url.slice(0, 200),
        hasBody: !!body,
        timeout: data.timeout || 30000,
      })

      try {
        const response = await fetch(url, {
          method: data.method,
          headers: data.headers,
          body: body ? body : undefined,
          signal: AbortSignal.timeout(data.timeout || 30000),
        })

        const responseData = await response.json()
        const previousValue = ctx.variables[data.responseVariable]
        ctx.variables[data.responseVariable] = responseData

        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "api_response", {
          url: url.slice(0, 200),
          status: response.status,
          variableName: data.responseVariable,
        })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "variable_changed", {
          variableName: data.responseVariable,
          previousValue: previousValue !== undefined ? JSON.stringify(previousValue).slice(0, 100) : null,
          newValue: JSON.stringify(responseData).slice(0, 100),
          source: "api_response",
        })
      } catch (error) {
        const previousValue = ctx.variables[data.responseVariable]
        ctx.variables[data.responseVariable] = { error: String(error) }
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "api_error", {
          url,
          error: String(error),
        })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "variable_changed", {
          variableName: data.responseVariable,
          previousValue: previousValue !== undefined ? JSON.stringify(previousValue).slice(0, 100) : null,
          newValue: JSON.stringify({ error: String(error) }).slice(0, 100),
          source: "api_error",
        })
      }

      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "delay": {
      const data = node.data as DelayNodeData
      let delayMs = data.duration

      switch (data.unit) {
        case "minutes":
          delayMs *= 60 * 1000
          break
        case "hours":
          delayMs *= 60 * 60 * 1000
          break
        case "days":
          delayMs *= 24 * 60 * 60 * 1000
          break
        default:
          delayMs *= 1000
      }

      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "delay_started", {
        duration: data.duration,
        unit: data.unit,
        delayMs,
      })

      // For short delays, wait inline
      if (delayMs <= 10000) {
        await new Promise((r) => setTimeout(r, delayMs))
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "delay_completed", {
          duration: data.duration,
          unit: data.unit,
        })
      }

      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "ai": {
      const data = node.data as AiNodeData
      const userPrompt = interpolate(data.userPromptTemplate || "{{user_input}}", variables)
      
      console.log("[v0] AI Node raw data:", JSON.stringify(node.data, null, 2))
      console.log("[v0] AI Node execution:", {
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt?.slice(0, 50),
        userPromptTemplate: data.userPromptTemplate,
        userPrompt: userPrompt?.slice(0, 50),
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        variables: JSON.stringify(variables).slice(0, 200),
      })

      try {
        // Get API keys from the user's profile
        const apiKeys = getApiKeysFromProfile(profile)
        
        const response = await generateAiResponse(
          data.provider,
          data.model,
          data.systemPrompt || "You are a helpful assistant.",
          userPrompt || "Hello",
          apiKeys,
          data.temperature || 0.7,
          data.maxTokens || 500
        )
        
        console.log("[v0] AI Response received:", response?.slice(0, 100))

        const previousValue = ctx.variables[data.responseVariable]
        ctx.variables[data.responseVariable] = response

        // Send AI response as message
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          { type: "text", text: response }
        )

        await saveMessage(
          ctx.userId,
          ctx.contactId,
          ctx.flowId,
          "text",
          { text: response, ai: true }
        )

        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_response", {
          provider: data.provider,
          model: data.model,
          responsePreview: response.slice(0, 100),
        })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "variable_changed", {
          variableName: data.responseVariable,
          previousValue: previousValue !== undefined ? String(previousValue).slice(0, 100) : null,
          newValue: response.slice(0, 100),
          source: "ai_response",
        })
      } catch (error) {
        console.error("[v0] AI generation failed:", {
          error: error instanceof Error ? error.message : String(error),
          provider: data.provider,
          model: data.model,
        })
        
        const previousValue = ctx.variables[data.responseVariable]
        // Use custom fallback message if provided, otherwise default
        const errorResponse = data.fallbackMessage || "Sorry, I couldn't process that request."
        ctx.variables[data.responseVariable] = errorResponse
        
        // Send fallback message to user
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          { type: "text", text: errorResponse }
        )
        
        await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: errorResponse })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_error", {
          error: error instanceof Error ? error.message : String(error),
          provider: data.provider,
          model: data.model,
          fallbackUsed: errorResponse,
        })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "variable_changed", {
          variableName: data.responseVariable,
          previousValue: previousValue !== undefined ? String(previousValue).slice(0, 100) : null,
          newValue: errorResponse,
          source: "ai_error",
        })
      }

      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

case "setVariable": {
    const data = node.data as SetVariableNodeData
    
    if (!data.variableName) {
      // No variable specified, just continue
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }
    
    const previousValue = ctx.variables[data.variableName]
    let newValue: string | number | boolean | object | undefined
    
    // Interpolate value if provided
    const interpolatedValue = data.value ? interpolate(data.value, variables) : undefined
    
    switch (data.action) {
      case "set":
        // Parse value based on type hint
        if (data.valueType === "number") {
          newValue = parseFloat(interpolatedValue || "0") || 0
        } else if (data.valueType === "boolean") {
          newValue = interpolatedValue?.toLowerCase() === "true"
        } else if (data.valueType === "json") {
          try {
            newValue = JSON.parse(interpolatedValue || "{}")
          } catch {
            newValue = interpolatedValue
          }
        } else {
          newValue = interpolatedValue
        }
        break
        
      case "clear":
        newValue = undefined
        break
        
      case "append":
        const currentStr = String(previousValue || "")
        newValue = currentStr + (interpolatedValue || "")
        break
        
      case "increment":
        const currentNum = parseFloat(String(previousValue)) || 0
        const incrementBy = parseFloat(interpolatedValue || "1") || 1
        newValue = currentNum + incrementBy
        break
        
      case "decrement":
        const currentNumDec = parseFloat(String(previousValue)) || 0
        const decrementBy = parseFloat(interpolatedValue || "1") || 1
        newValue = currentNumDec - decrementBy
        break
        
      default:
        newValue = interpolatedValue
    }
    
    // Update context variables
    if (newValue === undefined) {
      delete ctx.variables[data.variableName]
    } else {
      ctx.variables[data.variableName] = newValue
    }
    
    await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "variable_changed", {
      variableName: data.variableName,
      action: data.action,
      previousValue: previousValue !== undefined ? String(previousValue).slice(0, 100) : null,
      newValue: newValue !== undefined ? String(newValue).slice(0, 100) : null,
      source: "set_variable_node",
    })
    
    const nextNode = findNextNode(nodes, edges, node.id)
    if (nextNode) {
      return executeNode(nextNode, ctx, depth + 1)
    }
    return { success: true }
  }

  case "setLabel": {
    const data = node.data as SetLabelNodeData
    
    if (!data.labelIds?.length) {
      // No labels selected, just continue
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }
    
    // Get current contact labels (stored in metadata.labels)
    const { data: currentContact } = await getSupabaseAdmin()
      .from("contacts")
      .select("metadata")
      .eq("id", ctx.contactId)
      .single()
    
    const currentMetadata = currentContact?.metadata || {}
    let currentLabels: string[] = (currentMetadata as Record<string, unknown>).labels as string[] || []
    
    if (data.action === "add") {
      // Add labels (avoid duplicates)
      currentLabels = [...new Set([...currentLabels, ...data.labelIds])]
    } else if (data.action === "remove") {
      // Remove specified labels
      currentLabels = currentLabels.filter(l => !data.labelIds.includes(l))
    }
    
    // Update contact metadata with new labels
    const newMetadata = { ...currentMetadata as Record<string, unknown>, labels: currentLabels }
    await getSupabaseAdmin()
      .from("contacts")
      .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
      .eq("id", ctx.contactId)
    
    await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "labels_updated", {
      action: data.action,
      labelsModified: data.labelIds,
      previousLabels: (currentMetadata as Record<string, unknown>).labels || [],
      newLabels: currentLabels,
    })
    
    const nextNode = findNextNode(nodes, edges, node.id)
    if (nextNode) {
      return executeNode(nextNode, ctx, depth + 1)
    }
    return { success: true }
  }
  
  case "flow": {
  const data = node.data as FlowCallNodeData
      
      if (!data.targetFlowId) {
        return { success: false, error: "No target flow specified" }
      }

      // Handle "_current" flow (jump within same flow)
      if (data.targetFlowId === "_current") {
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "flow_call", {
          targetFlowId: "_current",
          targetFlowName: "(same flow)",
          targetNodeId: data.targetNodeId || "(start)",
        })
        
        if (data.targetNodeId) {
          const targetNode = nodes.find((n) => n.id === data.targetNodeId)
          if (targetNode) {
            return executeNode(targetNode, ctx, depth + 1)
          }
        }
        return { success: true }
      }

      // Load target flow
      const { data: targetFlow } = await getSupabaseAdmin()
        .from("flows")
        .select("*")
        .eq("id", data.targetFlowId)
        .single()

      if (!targetFlow) {
        return { success: false, error: "Target flow not found" }
      }

      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "flow_call", {
        targetFlowId: data.targetFlowId,
        targetFlowName: targetFlow.name,
        targetNodeId: data.targetNodeId || "(start)",
        passVariables: !!data.passVariables,
      })

      // Create new context for target flow
      const targetNodes = targetFlow.published_nodes || targetFlow.nodes
      const targetEdges = targetFlow.published_edges || targetFlow.edges

      const targetCtx: ExecutionContext = {
        ...ctx,
        flowId: targetFlow.id,
        flow: targetFlow as Flow,
        variables: data.passVariables ? { ...ctx.variables } : { ...ctx.variables },
      }

      // Find start node (or specific target node)
      let startNode: FlowNode | null = null
      if (data.targetNodeId) {
        startNode = targetNodes.find((n: FlowNode) => n.id === data.targetNodeId) || null
      }
      if (!startNode) {
        startNode = targetNodes.find((n: FlowNode) => n.type === "start") || null
      }

      if (!startNode) {
        return { success: false, error: "No start node in target flow" }
      }

      return executeNode(startNode, targetCtx, depth + 1)
    }

    // Legacy node types - these are standalone versions of functionality now in "message" node
    case "button": {
      // Standalone button node - treat like message node with messageType: "button"
      const data = node.data as MessageNodeData
      const text = data.text ? interpolate(data.text, variables) : ""
      const header = data.header ? interpolate(data.header, variables) : undefined
      const footer = data.footer ? interpolate(data.footer, variables) : undefined
      
      const replyButtons = (data.buttons || []).filter(btn => btn.type === "reply")
      const urlButtons = (data.buttons || []).filter(btn => btn.type === "url")
      const phoneButtons = (data.buttons || []).filter(btn => btn.type === "phone")
      
      try {
        // URL buttons
        for (const urlBtn of urlButtons) {
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            {
              type: "interactive",
              interactive: {
                type: "cta_url",
                header: header ? { type: "text", text: header } : undefined,
                body: { text: text || "Click the button below" },
                footer: footer ? { text: footer } : undefined,
                action: {
                  name: "cta_url",
                  parameters: { display_text: urlBtn.text, url: urlBtn.payload },
                },
              },
            }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "interactive", { 
            text, header, footer, buttonType: "cta_url", buttonText: urlBtn.text, url: urlBtn.payload 
          }, result?.messages?.[0]?.id)
        }
        
        // Phone buttons - send as text
        if (phoneButtons.length > 0) {
          let phoneText = text || ""
          for (const phoneBtn of phoneButtons) {
            phoneText += `\n\n${phoneBtn.text}: ${phoneBtn.payload}`
          }
          if (phoneText.trim()) {
            const result = await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "text", text: phoneText.trim() }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: phoneText.trim() }, result?.messages?.[0]?.id)
          }
        }
        
        // Reply buttons
        if (replyButtons.length > 0) {
          const buttons = replyButtons.slice(0, 3).map((btn) => ({
            type: "reply" as const,
            reply: {
              id: createButtonPayload(ctx.flowId, node.id, btn.id, edges),
              title: btn.text.slice(0, 20),
            },
          }))
          
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            {
              type: "interactive",
              interactive: {
                type: "button",
                header: header ? { type: "text", text: header.slice(0, 60) } : undefined,
                body: { text: text || "Select an option" },
                footer: footer ? { text: footer.slice(0, 60) } : undefined,
                action: { buttons },
              },
            }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "interactive", { text, header, footer, buttons: replyButtons }, result?.messages?.[0]?.id)
          
          // Save conversation state
          await getSupabaseAdmin()
            .from("conversation_state")
            .upsert({
              contact_id: ctx.contactId,
              user_id: ctx.userId,
              flow_id: ctx.flowId,
              current_node_id: node.id,
              awaiting_input: true,
              awaiting_input_type: "button",
              variables: ctx.variables,
              last_activity: new Date().toISOString(),
            }, { onConflict: "contact_id" })
          
          return { success: true, awaitingInput: true, awaitingInputType: "button" }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
      
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "card": {
      // Standalone card node - treat like message node with messageType: "card"
      const data = node.data as MessageNodeData
      const bodyText = data.text ? interpolate(data.text, variables) : ""
      const footer = data.footer ? interpolate(data.footer, variables) : undefined
      
      const replyButtons = (data.buttons || []).filter(btn => btn.type === "reply")
      const urlButtons = (data.buttons || []).filter(btn => btn.type === "url")
      const phoneButtons = (data.buttons || []).filter(btn => btn.type === "phone")
      
      try {
        // URL buttons with image
        for (const urlBtn of urlButtons) {
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            {
              type: "interactive",
              interactive: {
                type: "cta_url",
                header: data.cardImageUrl ? { type: "image", image: { link: data.cardImageUrl } } : undefined,
                body: { text: bodyText || "Click the button below" },
                footer: footer ? { text: footer } : undefined,
                action: {
                  name: "cta_url",
                  parameters: { display_text: urlBtn.text, url: urlBtn.payload },
                },
              },
            }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "card", { 
            imageUrl: data.cardImageUrl, text: bodyText, footer, buttonType: "cta_url", buttonText: urlBtn.text, url: urlBtn.payload 
          }, result?.messages?.[0]?.id)
        }
        
        // Phone buttons
        if (phoneButtons.length > 0) {
          let phoneText = bodyText || ""
          for (const phoneBtn of phoneButtons) {
            phoneText += `\n\n${phoneBtn.text}: ${phoneBtn.payload}`
          }
          if (data.cardImageUrl) {
            const result = await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "image", mediaUrl: data.cardImageUrl, caption: phoneText.trim() }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "image", { mediaUrl: data.cardImageUrl, caption: phoneText.trim() }, result?.messages?.[0]?.id)
          } else if (phoneText.trim()) {
            const result = await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "text", text: phoneText.trim() }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: phoneText.trim() }, result?.messages?.[0]?.id)
          }
        }
        
        // Reply buttons with image header
        if (replyButtons.length > 0) {
          const buttons = replyButtons.slice(0, 3).map((btn) => ({
            type: "reply" as const,
            reply: {
              id: createButtonPayload(ctx.flowId, node.id, btn.id, edges),
              title: btn.text.slice(0, 20),
            },
          }))
          
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            {
              type: "interactive",
              interactive: {
                type: "button",
                header: data.cardImageUrl ? { type: "image", image: { link: data.cardImageUrl } } : undefined,
                body: { text: bodyText || "Select an option" },
                footer: footer ? { text: footer.slice(0, 60) } : undefined,
                action: { buttons },
              },
            }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "card", { imageUrl: data.cardImageUrl, text: bodyText, footer, buttons: replyButtons }, result?.messages?.[0]?.id)
          
          // Save conversation state
          await getSupabaseAdmin()
            .from("conversation_state")
            .upsert({
              contact_id: ctx.contactId,
              user_id: ctx.userId,
              flow_id: ctx.flowId,
              current_node_id: node.id,
              awaiting_input: true,
              awaiting_input_type: "button",
              variables: ctx.variables,
              last_activity: new Date().toISOString(),
            }, { onConflict: "contact_id" })
          
          return { success: true, awaitingInput: true, awaitingInputType: "button" }
        } else if (urlButtons.length === 0 && phoneButtons.length === 0 && data.cardImageUrl) {
          // Just image with optional caption
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "image", mediaUrl: data.cardImageUrl, caption: bodyText || undefined }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "image", { mediaUrl: data.cardImageUrl, caption: bodyText }, result?.messages?.[0]?.id)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
      
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "userInput": {
      // Legacy userInput node - treat like message node with messageType: "getUserData"
      const data = node.data as MessageNodeData
      const prompt = data.prompt ? interpolate(data.prompt, variables) : data.text ? interpolate(data.text, variables) : ""
      
      if (prompt) {
        try {
          const result = await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "text", text: prompt }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: prompt }, result?.messages?.[0]?.id)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return { success: false, error: errorMessage }
        }
      }
      
      // Save conversation state
      await getSupabaseAdmin()
        .from("conversation_state")
        .upsert({
          contact_id: ctx.contactId,
          user_id: ctx.userId,
          flow_id: ctx.flowId,
          current_node_id: node.id,
          awaiting_input: true,
          awaiting_input_type: "getUserData",
          variables: ctx.variables,
          last_activity: new Date().toISOString(),
        }, { onConflict: "contact_id" })
      
      return { success: true, waitingForInput: true }
    }

    case "setTag": {
      // Legacy setTag node - similar to setLabel
      const data = node.data as { label?: string; tag?: string; action?: "add" | "remove" }
      const tagName = data.label || data.tag || ""
      const action = data.action || "add"
      
      if (tagName) {
        try {
          // Get or create tag
          let tagId: string | null = null
          const { data: existingTag } = await getSupabaseAdmin()
            .from("tags")
            .select("id")
            .eq("name", tagName)
            .eq("user_id", ctx.userId)
            .single()
          
          if (existingTag) {
            tagId = existingTag.id
          } else if (action === "add") {
            const { data: newTag } = await getSupabaseAdmin()
              .from("tags")
              .insert({ name: tagName, user_id: ctx.userId })
              .select("id")
              .single()
            tagId = newTag?.id || null
          }
          
          if (tagId) {
            if (action === "add") {
              await getSupabaseAdmin()
                .from("contact_tags")
                .upsert({ contact_id: ctx.contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" })
            } else if (action === "remove") {
              await getSupabaseAdmin()
                .from("contact_tags")
                .delete()
                .eq("contact_id", ctx.contactId)
                .eq("tag_id", tagId)
            }
          }
        } catch (error) {
          console.error("[v0] Error in setTag:", error)
        }
      }
      
      const nextNode = findNextNode(nodes, edges, node.id)
      if (nextNode) {
        return executeNode(nextNode, ctx, depth + 1)
      }
      return { success: true }
    }

    case "aiTrigger": {
      const data = node.data as AiTriggerNodeData
      const nodeLabel = data.label || "AI Trigger"
      const inputSource = data.inputSource || "previous"
      const inputVariable = data.inputVariable || "user_input"
      
      // Support both old field names (availableFlows) and new (targetFlows) for backward compatibility
      const rawData = node.data as Record<string, unknown>
      const oldFlows = rawData.availableFlows as Array<{flowId: string; flowName: string; description: string}> || []
      const newFlows = data.targetFlows || []
      const targetFlows = newFlows.length > 0 ? newFlows : oldFlows
      
      console.log("[v0] AI_TRIGGER: Node data keys:", Object.keys(rawData))
      console.log("[v0] AI_TRIGGER: inputSource from data:", data.inputSource, "-> resolved:", inputSource)
      console.log("[v0] AI_TRIGGER: targetFlows from data:", data.targetFlows)
      console.log("[v0] AI_TRIGGER: availableFlows (old):", oldFlows)
      console.log("[v0] AI_TRIGGER: Final targetFlows:", targetFlows)
      
      // Log: AI Trigger started with full debug info
      const previousVariableValue = variables[inputVariable]
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_started", {
        nodeLabel,
        inputSource,
        inputVariable,
        previousVariableValue: previousVariableValue ? String(previousVariableValue).slice(0, 100) : "(empty)",
        provider: data.provider,
        model: data.model,
        targetFlowCount: targetFlows.length,
        targetFlows: targetFlows.map(f => ({ name: f.flowName, description: f.description || "(no description)" })),
        fullNodeData: JSON.stringify(rawData).slice(0, 1000),
      })
      
      let userInput: string
      
      // Get user input based on source mode
      if (inputSource === "previous") {
        // Use the last user message (stored in user_input)
        userInput = String(variables.user_input || "")
        
        if (!userInput) {
          await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
            nodeLabel,
            step: "get_previous_input",
            error: "No previous user input found",
          })
          
          // Send fallback message on error (no user input is an error state)
          if (data.fallbackMessage) {
            const fallbackMsg = interpolate(data.fallbackMessage, variables)
            await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "text", text: fallbackMsg }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: fallbackMsg })
          }
          
          return { success: false, error: "No user input available" }
        }
        
        // Store in the configured variable
        ctx.variables[inputVariable] = userInput
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_input_stored", {
          nodeLabel,
          inputVariable,
          previousValue: previousVariableValue ? String(previousVariableValue).slice(0, 100) : "(empty)",
          newValue: userInput.slice(0, 200),
          source: "previous",
        })
        
      } else {
        // Fresh input mode - works like getUserData
        const isResuming = variables.__ai_trigger_waiting === node.id
        
        if (!isResuming) {
          // First time: send prompt and wait
          const promptMessage = data.promptMessage ? interpolate(data.promptMessage, variables) : "How can I help you today?"
          
          await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_prompt_sent", {
            nodeLabel,
            promptMessage,
          })
          
          try {
            const result = await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "text", text: promptMessage }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: promptMessage }, result?.messages?.[0]?.id)
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
              nodeLabel,
              step: "send_prompt",
              error: errorMessage,
            })
            return { success: false, error: errorMessage }
          }
          
          // Save state to wait for input
          await getSupabaseAdmin()
            .from("conversation_state")
            .upsert({
              contact_id: ctx.contactId,
              user_id: ctx.userId,
              flow_id: ctx.flowId,
              current_node_id: node.id,
              awaiting_input: true,
              awaiting_input_type: "aiTrigger",
              variables: {
                ...ctx.variables,
                __ai_trigger_waiting: node.id,
              },
              last_activity: new Date().toISOString(),
            }, { onConflict: "contact_id" })
          
          await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_awaiting_input", {
            nodeLabel,
          })
          
          return { success: true, waitingForInput: true }
        }
        
        // Resuming: we have user input
        userInput = String(variables.user_input || "")
        
        // Store in the configured variable
        ctx.variables[inputVariable] = userInput
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_input_stored", {
          nodeLabel,
          inputVariable,
          previousValue: previousVariableValue ? String(previousVariableValue).slice(0, 100) : "(empty)",
          newValue: userInput.slice(0, 200),
          source: "fresh",
        })
        
        // Clear the waiting flag
        delete ctx.variables.__ai_trigger_waiting
      }
      
      // Check if we have target flows configured - this is an error state
      if (targetFlows.length === 0) {
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
          nodeLabel,
          step: "no_targets",
          error: "No target flows configured",
        })
        
        // Send fallback message on error
        if (data.fallbackMessage) {
          const fallbackMsg = interpolate(data.fallbackMessage, variables)
          await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "text", text: fallbackMsg }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: fallbackMsg })
        }
        
        return { success: false, error: "No target flows configured" }
      }
      
      // Build prompt with flow names and descriptions
      const flowInfo = targetFlows.map(f => `- ${f.flowName}: ${f.description || "No description"}`).join("\n")
      const flowNames = targetFlows.map(f => f.flowName)
      
      const systemPrompt = `You are a routing assistant. Based on the user's message, decide which flow best matches their intent.

Available flows:
${flowInfo}

IMPORTANT INSTRUCTIONS:
1. Analyze the user's message carefully
2. Match it against the flow descriptions above
3. Return ONLY the exact flow name that best matches
4. Do not include any explanation or formatting
5. If no flow matches, respond with: NONE

You must respond with ONLY one of these exact flow names: ${flowNames.join(", ")} or NONE`
      
      const userPrompt = `User message: ${userInput}`
      
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_calling_ai", {
        nodeLabel,
        provider: data.provider,
        model: data.model,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        targetFlows: targetFlows.map(f => ({ name: f.flowName, description: f.description })),
      })
      
      try {
        const apiKeys = getApiKeysFromProfile(profile)
        
        const response = await generateAiResponse(
          data.provider,
          data.model,
          systemPrompt,
          `User message: ${userInput}`,
          apiKeys,
          data.temperature || 0.3,
          data.maxTokens || 50
        )
        
        const aiDecision = response.trim()
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_ai_response", {
          nodeLabel,
          aiOutput: aiDecision,
          availableFlowNames: flowNames,
        })
        
        // Find matching target flow (case-insensitive)
        const matchedTarget = targetFlows.find(tf => 
          tf.flowName.toLowerCase() === aiDecision.toLowerCase()
        )
        
        if (matchedTarget) {
          // Fetch and execute the matched flow
          const { data: targetFlow, error: flowError } = await getSupabaseAdmin()
            .from("flows")
            .select("*")
            .eq("id", matchedTarget.flowId)
            .single()
          
          if (flowError) {
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
              nodeLabel,
              step: "fetch_flow",
              error: flowError.message,
              flowId: matchedTarget.flowId,
            })
          }
          
          if (targetFlow) {
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_flow_matched", {
              nodeLabel,
              matchedFlowName: matchedTarget.flowName,
              matchedFlowId: matchedTarget.flowId,
            })
            
            const targetNodes = (targetFlow.published_nodes || targetFlow.nodes) as FlowNode[]
            const startNode = targetNodes.find(n => n.type === "start")
            
            if (startNode) {
              const targetCtx: ExecutionContext = {
                ...ctx,
                flowId: targetFlow.id,
                flow: targetFlow as Flow,
              }
              return executeNode(startNode, targetCtx, depth + 1)
            } else {
              await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
                nodeLabel,
                step: "no_start_node",
                error: "Target flow has no start node",
                flowName: matchedTarget.flowName,
              })
            }
          }
        }
        
        // AI responded but no match found - follow the "no_match" connection (NO fallback message)
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_no_match", {
          nodeLabel,
          aiDecision,
          availableFlows: flowNames,
        })
        
        // Follow the "no_match" handle connection
        const noMatchEdge = edges.find(e => e.source === node.id && e.sourceHandle === "no_match")
        if (noMatchEdge) {
          const noMatchNode = nodes.find(n => n.id === noMatchEdge.target)
          if (noMatchNode) {
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_routing_no_match", {
              nodeLabel,
              targetNodeId: noMatchNode.id,
            })
            return executeNode(noMatchNode, ctx, depth + 1)
          }
        }
        
        // No no_match connection - just end
        return { success: true }
        
      } catch (error) {
        console.error("[v0] AI_TRIGGER ERROR:", error)
        
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_trigger_error", {
          nodeLabel,
          step: "ai_call",
          error: errorMessage,
          fallbackSent: !!data.fallbackMessage,
          fallbackReason: "AI call failed - no response from AI",
        })
        
        // Send fallback message on error
        if (data.fallbackMessage) {
          await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "text", text: data.fallbackMessage }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: data.fallbackMessage })
        }
        
      return { success: false, error: errorMessage }
      }
    }
    
    case "aiChat": {
      const data = node.data as AiChatNodeData
      const nodeLabel = data.label || "AI Chat"
      const inputSource = data.inputSource || "previous"
      const inputVariable = data.inputVariable || "user_input"
      const waitTime = data.waitTime || 5
      const contextMessageCount = data.contextMessageCount || 10
      const stopConditions = data.stopConditions || []
      
      // Get or initialize chat state from variables
      const chatState = variables.__ai_chat_state as {
        turnCount: number
        startTime: number
        conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
      } | undefined
      
      const isNewChat = !chatState
      const isWaiting = !!variables.__ai_chat_waiting
      const currentState = chatState || {
        turnCount: 0,
        startTime: Date.now(),
        conversationHistory: []
      }
      
      // Detailed logging for AI Chat started
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_started", {
        nodeLabel,
        inputSource,
        inputVariable,
        isNewChat,
        isWaiting,
        turnCount: currentState.turnCount,
        historyLength: currentState.conversationHistory.length,
        provider: data.provider,
        model: data.model,
        systemPrompt: (data.systemPrompt || "").slice(0, 200),
        waitTime,
        contextMessageCount,
        stopConditionsCount: stopConditions.length,
        stopConditionTypes: stopConditions.map(c => c.type),
        variableKeys: Object.keys(variables),
        hasUserInput: !!variables[inputVariable],
        userInputPreview: variables[inputVariable] ? String(variables[inputVariable]).slice(0, 100) : "(none)",
      })
      
      let userInput: string
      
      // Handle fresh input mode - need to ask for input first
      if (inputSource === "fresh" && isNewChat && !isWaiting) {
        const promptMessage = data.promptMessage || "How can I help you?"
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_asking_fresh_input", {
          nodeLabel,
          promptMessage,
        })
        
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          { type: "text", text: promptMessage }
        )
        await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: promptMessage })
        
        // Save state to wait for input
        await getSupabaseAdmin()
          .from("conversation_state")
          .upsert({
            contact_id: ctx.contactId,
            user_id: ctx.userId,
            flow_id: ctx.flowId,
            current_node_id: node.id,
            awaiting_input: true,
            awaiting_input_type: "aiChat",
            variables: {
              ...ctx.variables,
              __ai_chat_waiting: true,
              __ai_chat_state: currentState,
            },
            last_activity: new Date().toISOString(),
          }, { onConflict: "contact_id" })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_awaiting_fresh_input", {
          nodeLabel,
          promptMessage,
          savedState: true,
        })
        
        return { success: true, waitingForInput: true }
      }
      
      // Get user input from the configured variable
      userInput = String(variables[inputVariable] || "")
      
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_got_input", {
        nodeLabel,
        inputVariable,
        userInput: userInput.slice(0, 200),
        inputLength: userInput.length,
        source: inputSource,
        isWaiting,
      })
      
      if (!userInput) {
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_error", {
          nodeLabel,
          step: "get_input",
          error: `No user input available in variable: ${inputVariable}`,
          inputSource,
          inputVariable,
          isNewChat,
          isWaiting,
          variableKeys: Object.keys(variables),
        })
        return { success: false, error: `No user input in ${inputVariable}` }
      }
      
      // Add user message to history
      currentState.conversationHistory.push({ role: "user", content: userInput })
      currentState.turnCount++
      
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_added_to_history", {
        nodeLabel,
        turnCount: currentState.turnCount,
        historyLength: currentState.conversationHistory.length,
        lastMessages: currentState.conversationHistory.slice(-3).map(m => ({
          role: m.role,
          preview: m.content.slice(0, 50)
        })),
      })
      
      // Check stop conditions BEFORE responding
      let shouldStop = false
      let stopReason = ""
      
      for (const cond of stopConditions) {
        if (cond.type === "keyword" && cond.keywords?.length) {
          const lowerInput = userInput.toLowerCase()
          for (const kw of cond.keywords) {
            if (lowerInput.includes(kw.toLowerCase())) {
              shouldStop = true
              stopReason = `Keyword detected: "${kw}"`
              break
            }
          }
        } else if (cond.type === "maxTurns" && cond.maxTurns) {
          if (currentState.turnCount >= cond.maxTurns) {
            shouldStop = true
            stopReason = `Max turns reached: ${currentState.turnCount}/${cond.maxTurns}`
          }
        } else if (cond.type === "timeout" && cond.timeoutMinutes) {
          const elapsedMinutes = (Date.now() - currentState.startTime) / 60000
          if (elapsedMinutes >= cond.timeoutMinutes) {
            shouldStop = true
            stopReason = `Timeout: ${elapsedMinutes.toFixed(1)}/${cond.timeoutMinutes} minutes`
          }
        }
        if (shouldStop) break
      }
      
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_stop_check", {
        nodeLabel,
        shouldStop,
        stopReason: stopReason || "No stop condition met",
        turnCount: currentState.turnCount,
        elapsedMinutes: ((Date.now() - currentState.startTime) / 60000).toFixed(2),
      })
      
      // If should stop, send exit message and follow exit handle
      if (shouldStop) {
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_stopping", {
          nodeLabel,
          stopReason,
          turnCount: currentState.turnCount,
          conversationSummary: currentState.conversationHistory.map(m => `${m.role}: ${m.content.slice(0, 30)}...`),
        })
        
        // Send exit message if configured
        if (data.exitMessage) {
          await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "text", text: data.exitMessage }
          )
          await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: data.exitMessage })
        }
        
        // Clear chat state
        delete ctx.variables.__ai_chat_state
        delete ctx.variables.__ai_chat_waiting
        
        // Store summary if configured
        if (data.summaryVariable) {
          ctx.variables[data.summaryVariable] = currentState.conversationHistory
            .map(m => `${m.role}: ${m.content}`)
            .join("\n")
        }
        
        // Update conversation state to clear waiting
        await getSupabaseAdmin()
          .from("conversation_state")
          .update({
            awaiting_input: false,
            awaiting_input_type: null,
            variables: ctx.variables,
            last_activity: new Date().toISOString(),
          })
          .eq("contact_id", ctx.contactId)
        
        // Follow exit handle
        const exitEdge = edges.find(e => e.source === node.id && e.sourceHandle === "exit")
        if (exitEdge) {
          const exitNode = nodes.find(n => n.id === exitEdge.target)
          if (exitNode) {
            await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_following_exit", {
              nodeLabel,
              exitNodeId: exitNode.id,
              exitNodeType: exitNode.type,
            })
            return executeNode(exitNode, ctx, depth + 1)
          }
        }
        
        return { success: true }
      }
      
      // Build conversation context for AI
      const recentHistory = currentState.conversationHistory.slice(-contextMessageCount)
      
      // Check if we have AI decision stop condition
      const aiDecisionCond = stopConditions.find(c => c.type === "aiDecision")
      let systemPrompt = data.systemPrompt || "You are a helpful assistant."
      
      if (aiDecisionCond?.aiEndPrompt) {
        systemPrompt += `\n\nIMPORTANT: ${aiDecisionCond.aiEndPrompt} When you decide to end the conversation, include [END_CHAT] at the end of your response.`
      }
      
      // Build the user message with conversation history
      let userMessageForAi: string
      if (recentHistory.length === 1) {
        userMessageForAi = recentHistory[0].content
      } else {
        // Format conversation history for the AI
        userMessageForAi = "Conversation history:\n" + recentHistory.map(m => 
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
        ).join("\n") + "\n\nPlease respond to the user's latest message."
      }
      
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_calling_ai", {
        nodeLabel,
        provider: data.provider,
        model: data.model,
        turnCount: currentState.turnCount,
        historyLength: recentHistory.length,
        systemPrompt: systemPrompt.slice(0, 300),
        userMessagePreview: userMessageForAi.slice(0, 300),
        temperature: data.temperature || 0.7,
        maxTokens: data.maxTokens || 500,
      })
      
      try {
        const apiKeys = getApiKeysFromProfile(profile)
        
        const response = await generateAiResponse(
          data.provider,
          data.model,
          systemPrompt,
          userMessageForAi,
          apiKeys,
          data.temperature || 0.7,
          data.maxTokens || 500
        )
        
        let aiResponse = response.trim()
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_ai_raw_response", {
          nodeLabel,
          rawResponse: aiResponse.slice(0, 500),
          responseLength: aiResponse.length,
        })
        
        // Check if AI decided to end
        if (aiResponse.includes("[END_CHAT]")) {
          aiResponse = aiResponse.replace("[END_CHAT]", "").trim()
          shouldStop = true
          stopReason = "AI decided to end conversation"
        }
        
        // Add AI response to history
        currentState.conversationHistory.push({ role: "assistant", content: aiResponse })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_response", {
          nodeLabel,
          aiResponse: aiResponse.slice(0, 300),
          responseLength: aiResponse.length,
          shouldStop,
          stopReason: stopReason || undefined,
          totalTurns: currentState.turnCount,
        })
        
        // Send AI response to user
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          { type: "text", text: aiResponse }
        )
        await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: aiResponse })
        
        // If AI decided to end
        if (shouldStop) {
          await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_ai_ended", {
            nodeLabel,
            stopReason,
          })
          
          // Send exit message if configured
          if (data.exitMessage) {
            await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              contact.phone,
              { type: "text", text: data.exitMessage }
            )
            await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: data.exitMessage })
          }
          
          // Clear chat state
          delete ctx.variables.__ai_chat_state
          delete ctx.variables.__ai_chat_waiting
          
          // Store summary if configured
          if (data.summaryVariable) {
            ctx.variables[data.summaryVariable] = currentState.conversationHistory
              .map(m => `${m.role}: ${m.content}`)
              .join("\n")
          }
          
          // Update conversation state
          await getSupabaseAdmin()
            .from("conversation_state")
            .update({
              awaiting_input: false,
              awaiting_input_type: null,
              variables: ctx.variables,
              last_activity: new Date().toISOString(),
            })
            .eq("contact_id", ctx.contactId)
          
          // Follow exit handle
          const exitEdge = edges.find(e => e.source === node.id && e.sourceHandle === "exit")
          if (exitEdge) {
            const exitNode = nodes.find(n => n.id === exitEdge.target)
            if (exitNode) {
              return executeNode(exitNode, ctx, depth + 1)
            }
          }
          
          return { success: true }
        }
        
        // Save state and wait for next message
        await getSupabaseAdmin()
          .from("conversation_state")
          .upsert({
            contact_id: ctx.contactId,
            user_id: ctx.userId,
            flow_id: ctx.flowId,
            current_node_id: node.id,
            awaiting_input: true,
            awaiting_input_type: "aiChat",
            variables: {
              ...ctx.variables,
              __ai_chat_waiting: true,
              __ai_chat_state: currentState,
            },
            last_activity: new Date().toISOString(),
          }, { onConflict: "contact_id" })
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_waiting_next", {
          nodeLabel,
          turnCount: currentState.turnCount,
          waitTime,
          savedHistoryLength: currentState.conversationHistory.length,
        })
        
        return { success: true, waitingForInput: true }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "ai_chat_error", {
          nodeLabel,
          step: "ai_call",
          error: errorMessage,
          provider: data.provider,
          model: data.model,
        })
        
        return { success: false, error: errorMessage }
      }
    }
    
    case "transferToHuman": {
      const data = node.data as TransferToHumanNodeData
      
      // Log transfer to human
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "transfer_to_human", {
        priority: data.priority || "medium",
        notifyVia: data.notifyVia,
        agentNotes: data.agentNotes ? data.agentNotes.slice(0, 200) : null,
        addTags: data.addTags || [],
        contactName: contact.name || contact.phone,
      })
      
      // Send transfer message to user
      if (data.transferMessage) {
        const message = interpolate(data.transferMessage, variables)
        await sendWhatsAppMessage(
          profile.whatsapp_phone_id!,
          profile.whatsapp_token!,
          contact.phone,
          { type: "text", text: message }
        )
        await saveMessage(ctx.userId, ctx.contactId, ctx.flowId, "text", { text: message })
      }
      
      // Add tags to contact
      if (data.addTags && data.addTags.length > 0) {
        for (const tagName of data.addTags) {
          try {
            // Get or create tag
            let tagId: string | null = null
            const { data: existingTag } = await getSupabaseAdmin()
              .from("tags")
              .select("id")
              .eq("name", tagName)
              .eq("user_id", ctx.userId)
              .single()
            
            if (existingTag) {
              tagId = existingTag.id
            } else {
              const { data: newTag } = await getSupabaseAdmin()
                .from("tags")
                .insert({ name: tagName, user_id: ctx.userId })
                .select("id")
                .single()
              tagId = newTag?.id || null
            }
            
            if (tagId) {
              await getSupabaseAdmin()
                .from("contact_tags")
                .upsert({ contact_id: ctx.contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" })
            }
          } catch (error) {
            console.error("[v0] Error adding tag in transferToHuman:", error)
          }
        }
      }
      
      // Update conversation state to mark as transferred
      await getSupabaseAdmin()
        .from("conversation_state")
        .upsert({
          contact_id: ctx.contactId,
          user_id: ctx.userId,
          flow_id: ctx.flowId,
          current_node_id: node.id,
          awaiting_input: false,
          awaiting_input_type: "human_transfer",
          variables: {
            ...ctx.variables,
            __transferred_to_human: true,
            __transfer_priority: data.priority || "medium",
            __transfer_agent_notes: data.agentNotes,
            __transferred_at: new Date().toISOString(),
          },
          last_activity: new Date().toISOString(),
        }, { onConflict: "contact_id" })
      
      // Log the transfer event
      await logEvent(ctx.userId, ctx.contactId, ctx.flowId, node.id, "transferred_to_human", {
        priority: data.priority,
        agentNotes: data.agentNotes,
        notifyVia: data.notifyVia,
      })
      
      // Send notification to agent if configured
      if (data.notifyVia && (data.notificationPhone || data.notificationEmail)) {
        try {
          // WhatsApp notification
          if ((data.notifyVia === "whatsapp" || data.notifyVia === "both") && data.notificationPhone) {
            const notificationMessage = `🔔 *Human Assistance Required*\n\n` +
              `*Priority:* ${(data.priority || "medium").toUpperCase()}\n` +
              `*Contact:* ${contact.name || contact.phone}\n` +
              `*Phone:* ${contact.phone}\n` +
              (data.agentNotes ? `\n*Notes:* ${data.agentNotes}` : "")
            
            await sendWhatsAppMessage(
              profile.whatsapp_phone_id!,
              profile.whatsapp_token!,
              data.notificationPhone.replace(/[^0-9]/g, ""),
              { type: "text", text: notificationMessage }
            )
          }
          
          // Email notification would go here (requires email integration)
          // For now, just log it
          if ((data.notifyVia === "email" || data.notifyVia === "both") && data.notificationEmail) {
            console.log("[v0] Email notification not yet implemented, would send to:", data.notificationEmail)
          }
        } catch (error) {
          console.error("[v0] Error sending agent notification:", error)
        }
      }
      
      // Transfer stops the flow - human takes over
      return { success: true }
    }

    default:
      return { success: false, error: `Unknown node type: ${node.type}` }
  }
}

/**
 * EVENT-DRIVEN ENTRY POINT
 * 
 * This function handles incoming messages/interactions in a fully event-driven manner.
 * It does NOT rely on conversation state to determine what to do next.
 * Instead, it parses the payload from button/list interactions to route to the correct node.
 */
export async function handleEvent(
  userId: string,
  contact: Contact,
  profile: Profile,
  incomingMessage: WhatsAppIncomingMessage,
  allFlows: Flow[]
): Promise<ExecutionResult> {
  // Check if we're awaiting input from a message node with getUserData type
  const { data: convState, error: convStateError } = await getSupabaseAdmin()
    .from("conversation_state")
    .select("*")
    .eq("contact_id", contact.id)
    .single()

  console.log("[v0] Checking conversation state:", { 
    contactId: contact.id, 
    hasState: !!convState, 
    awaiting: convState?.awaiting_input,
    error: convStateError?.message 
  })

  if (convState?.awaiting_input && incomingMessage.type === "text") {
    console.log("[v0] Resuming from getUserData node:", convState.current_node_id)
    // We're waiting for user input - resume the flow
    const flow = allFlows.find(f => f.id === convState.flow_id)
    console.log("[v0] Found flow for resumption:", { flowId: convState.flow_id, found: !!flow })
    
    if (flow) {
      const nodes = flow.published_nodes || flow.nodes
      const edges = flow.published_edges || flow.edges
      const currentNode = nodes.find((n: FlowNode) => n.id === convState.current_node_id)
      
      console.log("[v0] Looking for node:", { 
        nodeId: convState.current_node_id, 
        found: !!currentNode, 
        nodeType: currentNode?.type,
        nodeCount: nodes?.length 
      })
      
    // Handle aiTrigger node resumption
      if (currentNode?.type === "aiTrigger") {
        const userInputValue = incomingMessage.text?.body || ""
        console.log("[v0] HANDLE_EVENT aiTrigger: Resuming with user input", {
          nodeId: currentNode.id,
          userInput: userInputValue,
          flowId: flow.id,
          flowName: flow.name,
          convStateVariables: Object.keys(convState.variables || {}),
        })
        
        // Update variables with user input
        const variables = { 
          ...(convState.variables || {}), 
          user_input: userInputValue,
          __ai_trigger_waiting: currentNode.id  // Keep the flag so executor knows to process
        }
        
        console.log("[v0] HANDLE_EVENT aiTrigger: Created variables", {
          user_input: userInputValue,
          __ai_trigger_waiting: currentNode.id,
          allVarKeys: Object.keys(variables),
        })
        
        // Create context and re-execute the aiTrigger node
        const ctx: ExecutionContext = {
          userId,
          contactId: contact.id,
          contact,
          flowId: flow.id,
          flow: { ...flow, nodes, edges } as Flow,
          variables,
          currentNodeId: currentNode.id,
          incomingMessage,
          profile,
        }
        
        console.log("[v0] HANDLE_EVENT aiTrigger: Calling executeNode")
        const result = await executeNode(currentNode, ctx)
        console.log("[v0] HANDLE_EVENT aiTrigger: executeNode returned", {
          success: result.success,
          error: result.error,
          waitingForInput: result.waitingForInput,
          awaitingInput: result.awaitingInput,
        })
        
        if (!result.waitingForInput && !result.awaitingInput) {
          await logEvent(userId, contact.id, flow.id, null, "flow_completed", {
            flowName: flow.name,
          })
        }
        
        return result
      }
      
      // Handle aiChat node resumption
      if (currentNode?.type === "aiChat") {
        const userInputValue = incomingMessage.text?.body || ""
        console.log("[v0] HANDLE_EVENT aiChat: Resuming with user input", {
          nodeId: currentNode.id,
          userInput: userInputValue.slice(0, 100),
          flowId: flow.id,
          flowName: flow.name,
          chatState: convState.variables?.__ai_chat_state ? "exists" : "missing",
          isWaiting: convState.variables?.__ai_chat_waiting,
        })
        
        // Update variables with user input - preserve chat state
        const variables = { 
          ...(convState.variables || {}), 
          user_input: userInputValue,
        }
        
        console.log("[v0] HANDLE_EVENT aiChat: Created variables", {
          user_input: userInputValue.slice(0, 50),
          __ai_chat_waiting: variables.__ai_chat_waiting,
          __ai_chat_state: variables.__ai_chat_state ? "present" : "missing",
          allVarKeys: Object.keys(variables),
        })
        
        // Create context and re-execute the aiChat node
        const ctx: ExecutionContext = {
          userId,
          contactId: contact.id,
          contact,
          flowId: flow.id,
          flow: { ...flow, nodes, edges } as Flow,
          variables,
          currentNodeId: currentNode.id,
          incomingMessage,
          profile,
        }
        
        console.log("[v0] HANDLE_EVENT aiChat: Calling executeNode")
        const result = await executeNode(currentNode, ctx)
        console.log("[v0] HANDLE_EVENT aiChat: executeNode returned", {
          success: result.success,
          error: result.error,
          waitingForInput: result.waitingForInput,
          awaitingInput: result.awaitingInput,
        })
        
        if (!result.waitingForInput && !result.awaitingInput) {
          await logEvent(userId, contact.id, flow.id, null, "flow_completed", {
            flowName: flow.name,
          })
        }
        
        return result
      }
      
      // Handle message node with getUserData type
      const isGetUserDataNode = currentNode?.type === "message" &&
      (currentNode.data as MessageNodeData).messageType === "getUserData"
      
      if (currentNode && isGetUserDataNode) {
        const nodeData = currentNode.data as MessageNodeData
        const userInputValue = incomingMessage.text?.body || ""
        const inputType = nodeData.inputType || "any"
        const variableName = nodeData.variableName || "user_input"
        
        // Validate input
        let isValid = true
        if (inputType === "number" && !/^\d+$/.test(userInputValue)) {
          isValid = false
        } else if (inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInputValue)) {
          isValid = false
        } else if (inputType === "phone" && !/^[\d\s+\-()]+$/.test(userInputValue)) {
          isValid = false
        } else if (nodeData.validationRegex) {
          try {
            const regex = new RegExp(nodeData.validationRegex)
            if (!regex.test(userInputValue)) {
              isValid = false
            }
          } catch {
            // Invalid regex, skip validation
          }
        }
        
        if (!isValid) {
          // Send error message and wait again
          const errorMsg = nodeData.errorMessage || "Invalid input. Please try again."
          await sendWhatsAppMessage(
            profile.whatsapp_phone_id!,
            profile.whatsapp_token!,
            contact.phone,
            { type: "text", text: errorMsg }
          )
          await saveMessage(userId, contact.id, convState.flow_id, "text", { text: errorMsg })
          
          await logEvent(userId, contact.id, convState.flow_id, currentNode.id, "input_validation_failed", {
            variableName,
            inputValue: userInputValue.slice(0, 50),
            inputType,
          })
          
          return { success: true, awaitingInput: true }
        }
        
        // Input is valid - save to variable and continue
        const previousValue = convState.variables?.[variableName]
        const variables = { ...(convState.variables || {}), [variableName]: userInputValue }
        
        console.log("[v0] User input saved:", { 
          variableName, 
          value: userInputValue,
          allVariables: variables 
        })
        
        // Log user input received
        await logEvent(userId, contact.id, convState.flow_id, currentNode.id, "user_input_received", {
          variableName,
          userInput: userInputValue,
          inputType,
        })
        
        // Log variable change
        await logEvent(userId, contact.id, convState.flow_id, currentNode.id, "variable_changed", {
          variableName,
          previousValue: previousValue !== undefined ? String(previousValue).slice(0, 100) : null,
          newValue: userInputValue.slice(0, 100),
        })
        
        // Clear awaiting state and update variables
        const { error: updateError } = await getSupabaseAdmin()
          .from("conversation_state")
          .update({ 
            awaiting_input: false, 
            awaiting_input_type: null,
            variables: variables,
            last_activity: new Date().toISOString(),
          })
          .eq("contact_id", contact.id)
        
        if (updateError) {
          console.error("[v0] Error updating conversation state:", updateError)
        }
        
        // Continue to next node
        const ctx: ExecutionContext = {
          userId,
          contactId: contact.id,
          contact,
          flowId: flow.id,
          flow: { ...flow, nodes, edges } as Flow,
          variables,
          currentNodeId: currentNode.id,
          incomingMessage,
          profile,
        }
        
        // For getUserData with auto-skip enabled, use the "response" handle
        // Otherwise, use the default connection
        const currentNodeData = currentNode.data as MessageNodeData
        let nextNode: FlowNode | undefined
        
        if (currentNodeData.autoSkipEnabled && currentNodeData.timeout && currentNodeData.timeout >= 10) {
          // Find the edge connected to the "response" handle
          const responseEdge = edges.find(e => e.source === currentNode.id && e.sourceHandle === "response")
          if (responseEdge) {
            nextNode = nodes.find(n => n.id === responseEdge.target)
          }
        }
        
        // Fallback to default connection
        if (!nextNode) {
          nextNode = findNextNode(nodes, edges, currentNode.id)
        }
        
        if (nextNode) {
          const result = await executeNode(nextNode, ctx)
          if (!result.awaitingInput) {
            await logEvent(userId, contact.id, flow.id, null, "flow_completed", {
              flowName: flow.name,
            })
          }
          return result
        }
        
        await logEvent(userId, contact.id, flow.id, null, "flow_completed", {
          flowName: flow.name,
        })
        return { success: true }
      }
    }
  }

  // Build initial variables
  const variables: Record<string, unknown> = {
    contact_name: contact.name || "User",
    contact_phone: contact.phone,
    __last_message_id: incomingMessage.id,  // Store for typing indicator
  }

  // Extract user input and determine routing
  let targetFlowId: string | null = null
  let targetNodeId: string | null = null
  let buttonId: string | null = null

  if (incomingMessage.type === "text") {
    // Text message - route based on keywords
    variables.user_input = incomingMessage.text?.body || ""
    const userText = (incomingMessage.text?.body || "").toLowerCase()

    // Find matching flow by keyword
    for (const flow of allFlows) {
      if (flow.trigger_keywords && flow.trigger_keywords.length > 0) {
        for (const keyword of flow.trigger_keywords) {
          if (userText.includes(keyword.toLowerCase())) {
            targetFlowId = flow.id
            break
          }
        }
        if (targetFlowId) break
      }
    }

    // Fallback to first flow without keywords
    if (!targetFlowId) {
      const defaultFlow = allFlows.find(
        (f) => !f.trigger_keywords || f.trigger_keywords.length === 0
      )
      if (defaultFlow) {
        targetFlowId = defaultFlow.id
      }
    }
  } else if (incomingMessage.type === "interactive") {
    // Interactive reply - parse payload for routing
    let payloadStr = ""

    if (incomingMessage.interactive?.type === "button_reply") {
      payloadStr = incomingMessage.interactive.button_reply?.id || ""
      variables.user_input = incomingMessage.interactive.button_reply?.id || ""
      variables.user_input_text = incomingMessage.interactive.button_reply?.title || ""
    } else if (incomingMessage.interactive?.type === "list_reply") {
      payloadStr = incomingMessage.interactive.list_reply?.id || ""
      variables.user_input = incomingMessage.interactive.list_reply?.id || ""
      variables.user_input_text = incomingMessage.interactive.list_reply?.title || ""
    }

    // Parse the payload to get routing info
    const payload = parsePayload(payloadStr)
    if (payload && payload.action === "goto_node") {
      targetFlowId = payload.flow_id || null
      targetNodeId = payload.node_id || null
      buttonId = payload.data?.button_id as string || null
      
      // Store button_id in variables
      if (buttonId) {
        variables.button_id = buttonId
      }
    }
  }

  // If no flow found, return error
  if (!targetFlowId) {
    return { success: false, error: "No matching flow found" }
  }

  // Find the flow
  const flow = allFlows.find((f) => f.id === targetFlowId)
  if (!flow) {
    return { success: false, error: "Flow not found" }
  }

  // Use published version if available
  const nodes = flow.published_nodes || flow.nodes
  const edges = flow.published_edges || flow.edges

  // Find starting node
  let startNode: FlowNode | null = null

  if (targetNodeId) {
    // Direct node targeting from payload
    startNode = nodes.find((n: FlowNode) => n.id === targetNodeId) || null
  }

  if (!startNode) {
    // Start from beginning
    startNode = nodes.find((n: FlowNode) => n.type === "start") || null
  }

  if (!startNode) {
    return { success: false, error: "No start node found in flow" }
  }

  // Create execution context
  const ctx: ExecutionContext = {
    userId,
    contactId: contact.id,
    contact,
    flowId: flow.id,
    flow: { ...flow, nodes, edges } as Flow,
    variables,
    currentNodeId: "",
    incomingMessage,
    profile,
  }

  await logEvent(userId, contact.id, flow.id, null, "flow_started", {
    flowName: flow.name,
    targetNodeId,
    buttonId,
  })

  // Execute the flow
  const result = await executeNode(startNode, ctx)

  if (!result.awaitingInput) {
    await logEvent(userId, contact.id, flow.id, null, "flow_completed", {
      flowName: flow.name,
    })
  }

  return result
}

/**
 * Legacy entry point - wraps handleEvent for backwards compatibility
 */
export async function executeFlow(
  userId: string,
  contact: Contact,
  flow: Flow,
  profile: Profile,
  incomingMessage?: WhatsAppIncomingMessage,
  _existingState?: {
    currentNodeId: string | null
    variables: Record<string, unknown>
    awaitingInputType: string | null
  }
): Promise<ExecutionResult> {
  if (!incomingMessage) {
    // Direct flow execution (e.g., from trigger)
    const nodes = flow.published_nodes || flow.nodes
    const edges = flow.published_edges || flow.edges
    const startNode = nodes.find((n: FlowNode) => n.type === "start")

    if (!startNode) {
      return { success: false, error: "No start node found" }
    }

    const ctx: ExecutionContext = {
      userId,
      contactId: contact.id,
      contact,
      flowId: flow.id,
      flow: { ...flow, nodes, edges } as Flow,
      variables: {
        contact_name: contact.name || "User",
        contact_phone: contact.phone,
      },
      currentNodeId: "",
      profile,
    }

    return executeNode(startNode, ctx)
  }

  // Use the event-driven handler
  return handleEvent(userId, contact, profile, incomingMessage, [flow])
}
