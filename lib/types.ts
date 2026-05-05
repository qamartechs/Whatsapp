import type { Node, Edge } from "@xyflow/react"

// Database types
export interface Profile {
  id: string
  name: string | null
  whatsapp_phone_id: string | null
  whatsapp_token: string | null
  whatsapp_verify_token: string | null
  default_ai_provider: string
  default_ai_model: string
  openai_api_key: string | null
  anthropic_api_key: string | null
  google_api_key: string | null
  deepseek_api_key: string | null
  created_at: string
  updated_at: string
}

export interface Flow {
  id: string
  user_id: string
  name: string
  description: string | null
  nodes: FlowNode[]
  edges: Edge[]
  published_nodes: FlowNode[] | null
  published_edges: Edge[] | null
  published_at: string | null
  variables: Record<string, unknown>
  is_active: boolean
  trigger_keywords: string[]
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  user_id: string
  phone: string
  name: string | null
  avatar_url: string | null
  metadata: Record<string, unknown>
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  user_id: string
  contact_id: string
  flow_id: string | null
  direction: "inbound" | "outbound"
  message_type: string
  content: MessageContent
  whatsapp_message_id: string | null
  status: string
  reply_to_message_id: string | null
  created_at: string
}

export interface ConversationState {
  id: string
  user_id: string
  contact_id: string
  flow_id: string | null
  current_node_id: string | null
  variables: Record<string, unknown>
  awaiting_input: boolean
  awaiting_input_type: string | null
  last_activity: string
  created_at: string
}

export interface Event {
  id: string
  user_id: string
  contact_id: string | null
  flow_id: string | null
  node_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Label {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

// Node types
export type NodeType =
  | "start"
  | "message"
  | "list"
  | "condition"
  | "api"
  | "delay"
  | "ai"
  | "flow"
  | "setVariable"
  | "setLabel"
  | "aiTrigger"
  | "aiChat"
  | "transferToHuman"

// Flow node data types
export interface BaseNodeData {
  label: string
}

export interface StartNodeData extends BaseNodeData {
  triggerKeywords?: string[]
}

// WhatsApp Character Limits:
// - Header (text): 60 chars
// - Body: 1024 chars (4096 for text-only messages)
// - Footer: 60 chars
// - Button text: 20 chars
// - Section title: 24 chars
// - List row title: 24 chars
// - List row description: 72 chars

export type MessageType = 
  | "text" 
  | "image" 
  | "button"
  | "card" 
  | "carousel" 
  | "getUserData" 
  | "video" 
  | "gif" 
  | "typing" 
  | "file"

export interface MessageButton {
  id: string
  text: string  // Max 20 chars
  type: "reply" | "url" | "phone"
  payload: string  // For reply: payload, for url: URL, for phone: number
}

export interface MessageNodeData extends BaseNodeData {
  messageType?: MessageType  // Defaults to "text" if not set
  
  // Common text fields with limits
  text?: string      // Body text - max 1024 chars for interactive, 4096 for text-only
  header?: string    // Header text - max 60 chars
  footer?: string    // Footer text - max 60 chars
  
  // Media fields (image, video, gif, file)
  mediaUrl?: string
  fileName?: string
  caption?: string   // Max 1024 chars
  
  // Button message fields (interactive buttons)
  buttons?: MessageButton[]  // Max 3 buttons
  
  // List message fields
  listButtonText?: string  // Max 20 chars
  listSections?: Array<{
    title: string  // Max 24 chars
    rows: Array<{
      id: string
      title: string       // Max 24 chars
      description?: string // Max 72 chars
    }>
  }>
  
  // Card fields (image with buttons - non-linear like button/list)
  cardImageUrl?: string
  cardButtons?: MessageButton[]  // Max 3 buttons
  
  // Carousel fields
  carouselCards?: Array<{
    id: string
    imageUrl?: string
    title: string       // Max 60 chars (header)
    description?: string // Max 1024 chars (body)
    buttons?: MessageButton[]  // Max 3 buttons per card
  }>
  
  // Get User Data fields (merged from UserInput)
  prompt?: string
  variableName?: string
  inputType?: "text" | "number" | "email" | "phone" | "any"
  validationRegex?: string
  errorMessage?: string
  autoSkipEnabled?: boolean  // Whether auto-skip is enabled (off by default)
  timeout?: number  // Always stored in seconds (minimum 10 when enabled)
  timeoutValue?: number  // User-facing value
  timeoutUnit?: "seconds" | "minutes" | "hours"  // User-selected unit
  timeoutAction?: "continue" | "retry" | "goto"
  timeoutNodeId?: string
  
  // Typing indicator
  typingDuration?: number  // Duration in seconds (max 25s per WhatsApp)
}

export interface ButtonNodeData extends BaseNodeData {
  text: string
  footer?: string
  buttons: Array<{
    id: string
    text: string
    payload: string
  }>
}

export interface ListNodeData extends BaseNodeData {
  headerText: string
  bodyText: string
  footer?: string
  buttonText: string
  sections: Array<{
    title: string
    rows: Array<{
      id: string
      title: string
      description?: string
    }>
  }>
}

export interface CardNodeData extends BaseNodeData {
  footer?: string
  cards: Array<{
    id: string
    imageUrl?: string
    fileName?: string
    title: string
    description?: string
    buttons: Array<{
      id: string
      text: string
      payload: string
    }>
  }>
}

export interface ConditionNodeData extends BaseNodeData {
  conditions: Array<{
    id: string
    type: "variable" | "tag" | "contact"  // Condition type
    variable: string                       // For variable conditions
    contactField?: "name" | "phone" | "created_at" | "tags"  // For contact conditions
    tag?: string                           // For tag conditions
    operator: "equals" | "contains" | "startsWith" | "endsWith" | "regex" | "greaterThan" | "lessThan" | "hasTag" | "notHasTag" | "isEmpty" | "isNotEmpty"
    value: string
  }>
  defaultBranch: string
}

export interface SetLabelNodeData extends BaseNodeData {
  action: "add" | "remove"          // add or remove labels
  labelIds: string[]                // Label IDs to add/remove
  newLabelName?: string             // Create new label with this name
  newLabelColor?: string            // Color for new label
}

export interface SetVariableNodeData extends BaseNodeData {
  action: "set" | "clear" | "append" | "increment" | "decrement"
  variableName: string              // Name of the variable to set/modify
  isNewVariable?: boolean           // Creating a new variable
  value?: string                    // Value to set (supports {{variable}} interpolation)
  valueType?: "string" | "number" | "boolean" | "json"  // Type hint for the value
}

export interface ApiNodeData extends BaseNodeData {
  url: string
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  headers: Record<string, string>
  body?: string
  responseVariable: string
  timeout?: number
}

export interface DelayNodeData extends BaseNodeData {
  duration: number
  unit: "seconds" | "minutes" | "hours" | "days"
}

export interface AiNodeData extends BaseNodeData {
  provider: "openai" | "google" | "anthropic" | "deepseek"
  model: string
  systemPrompt: string
  userPromptTemplate: string
  responseVariable: string
  temperature?: number
  maxTokens?: number
  fallbackMessage?: string
}

export interface FlowCallNodeData extends BaseNodeData {
  targetFlowId: string
  targetNodeId?: string
  passVariables: boolean
  variableMapping?: Record<string, string>
}

export interface AiTriggerNodeData extends BaseNodeData {
  // AI Provider settings
  provider: "openai" | "google" | "anthropic" | "deepseek"
  model: string
  temperature?: number
  maxTokens?: number
  
  // Input source toggle: "previous" uses last user message, "fresh" asks for new input
  inputSource: "previous" | "fresh"
  
  // Variable to store the input (both previous and fresh modes store input here)
  inputVariable: string
  
  // For fresh input mode: prompt message to send to user
  promptMessage?: string
  
  // Target flows that AI can route to
  // AI receives flow names + descriptions and returns the best matching flow name
  targetFlows: Array<{
    flowId: string
    flowName: string
    description: string  // Description to help AI understand when to trigger this flow
  }>
  
  // Fallback message if no match (optional) - shown before following "no_match" connection
  fallbackMessage?: string
}

export interface AiChatNodeData extends BaseNodeData {
  // AI Provider settings
  provider: "openai" | "google" | "anthropic" | "deepseek"
  model: string
  temperature?: number
  maxTokens?: number
  
  // System prompt for AI personality/behavior
  systemPrompt: string
  
  // Input source: "previous" uses last user message, "fresh" asks for new input
  inputSource: "previous" | "fresh"
  
  // Variable to read user input from (default: user_input)
  inputVariable?: string
  
  // For fresh input mode: prompt message to send to user
  promptMessage?: string
  
  // Wait time in seconds before responding (debounce)
  // If user sends another message during this time, timer resets
  waitTime: number
  
  // Context settings - how many previous messages to include
  contextMessageCount: number
  
  // Stop conditions - when to exit the chat loop
  stopConditions: Array<{
    id: string
    type: "keyword" | "maxTurns" | "aiDecision" | "timeout"
    // For keyword: list of keywords that trigger exit
    keywords?: string[]
    // For maxTurns: maximum number of back-and-forth exchanges
    maxTurns?: number
    // For timeout: total chat duration in minutes
    timeoutMinutes?: number
    // For aiDecision: prompt hint for AI to decide when to end
    aiEndPrompt?: string
  }>
  
  // Message to send when chat ends
  exitMessage?: string
  
  // Variable to store conversation summary (optional)
  summaryVariable?: string
}

export interface TransferToHumanNodeData extends BaseNodeData {
  // Message to send when transferring
  transferMessage?: string
  
  // Notification settings
  notifyVia?: "whatsapp" | "email" | "both"
  notificationPhone?: string
  notificationEmail?: string
  
  // Priority level
  priority?: "low" | "medium" | "high" | "urgent"
  
  // Add tags when transferring
  addTags?: string[]
  
  // Notes for human agent
  agentNotes?: string
}

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | ButtonNodeData
  | ListNodeData
  | CardNodeData
  | ConditionNodeData
  | ApiNodeData
  | DelayNodeData
  | AiNodeData
  | FlowCallNodeData
  | SetVariableNodeData
  | SetLabelNodeData
  | AiTriggerNodeData
  | AiChatNodeData
  | TransferToHumanNodeData

export type FlowNode = Node<FlowNodeData, NodeType>

// WhatsApp types
export interface WhatsAppWebhookMessage {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: "text" | "image" | "interactive" | "template"
  text?: { body: string }
  image?: { link: string; caption?: string }
  interactive?: WhatsAppInteractive
  template?: WhatsAppTemplate
}

export interface WhatsAppInteractive {
  type: "button" | "list" | "product" | "product_list"
  header?: {
    type: "text" | "image" | "video" | "document"
    text?: string
    image?: { link: string }
  }
  body: { text: string }
  footer?: { text: string }
  action: {
    button?: string
    buttons?: Array<{
      type: "reply"
      reply: { id: string; title: string }
    }>
    sections?: Array<{
      title: string
      rows: Array<{
        id: string
        title: string
        description?: string
      }>
    }>
  }
}

export interface WhatsAppTemplate {
  name: string
  language: { code: string }
  components?: Array<{
    type: "header" | "body" | "button"
    parameters?: Array<{
      type: "text" | "image" | "document"
      text?: string
      image?: { link: string }
    }>
  }>
}

export interface WhatsAppIncomingMessage {
  from: string
  id: string
  timestamp: string
  type: "text" | "image" | "video" | "audio" | "document" | "interactive" | "button"
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  video?: { id: string; mime_type: string; sha256: string; caption?: string }
  audio?: { id: string; mime_type: string; sha256: string }
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string }
  interactive?: {
    type: "button_reply" | "list_reply"
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  button?: { text: string; payload: string }
}

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account"
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: "whatsapp"
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: { name: string }
          wa_id: string
        }>
        messages?: WhatsAppIncomingMessage[]
        statuses?: Array<{
          id: string
          status: "sent" | "delivered" | "read" | "failed"
          timestamp: string
          recipient_id: string
        }>
      }
      field: string
    }>
  }>
}

// Message content types
export interface MessageContent {
  type: "text" | "image" | "interactive" | "template"
  text?: string
  imageUrl?: string
  interactive?: WhatsAppInteractive
  template?: WhatsAppTemplate
  raw?: unknown
}

// Execution context
export interface ExecutionContext {
  userId: string
  contactId: string
  contact: Contact
  flowId: string
  flow: Flow
  variables: Record<string, unknown>
  currentNodeId: string
  incomingMessage?: WhatsAppIncomingMessage
  profile: Profile
}

// AI Provider models - Updated May 2026
export const AI_PROVIDERS = {
  openai: {
    name: "OpenAI",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
  },
  google: {
    name: "Google Gemini",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    ],
  },
  anthropic: {
    name: "Anthropic Claude",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
    ],
  },
  deepseek: {
    name: "DeepSeek",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3 Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek R1 Reasoner" },
    ],
  },
} as const

export type AiProvider = keyof typeof AI_PROVIDERS

// Chat types for real-time messaging
export interface ChatMessage {
  id: string
  whatsappMessageId?: string  // WhatsApp message ID for replies
  type: "user" | "bot"
  content: string
  mediaUrl?: string
  mediaType?: "image" | "video" | "document" | "audio"
  buttons?: Array<{ id: string; text: string; payload?: string; type?: "reply" | "url" | "phone" }>
  ctaUrl?: { text: string; url: string }  // CTA URL button
  list?: {
    buttonText: string
    sections: Array<{
      title: string
      rows: Array<{ id: string; title: string; description?: string; payload?: string }>
    }>
  }
  cards?: Array<{
    id?: string
    imageUrl?: string
    title?: string
    description?: string
    buttons?: Array<{ id: string; text: string; payload?: string; type?: "reply" | "url" | "phone" }>
  }>
  footer?: string
  timestamp: Date
  status?: "sending" | "sent" | "delivered" | "read" | "failed"
  sourceNodeId?: string  // For event-driven routing
  replyTo?: {
    id: string
    content: string
    type: "user" | "bot"
  }
}
