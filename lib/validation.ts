/**
 * Request validation and sanitization utilities
 * Provides safe parsing and validation of API request bodies
 */

export interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Validates and sanitizes request body for flow creation
 */
export function validateFlowPayload(body: unknown): ValidationResult<{
  name: string
  description?: string | null
  nodes?: unknown[]
  edges?: unknown[]
  variables?: Record<string, unknown>
  trigger_keywords?: string[]
}> {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Request body must be an object" }
  }

  const obj = body as Record<string, unknown>
  const name = obj.name

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { success: false, error: "Flow name is required and must be a non-empty string" }
  }

  if (typeof name !== "string" || name.length > 255) {
    return { success: false, error: "Flow name must be less than 255 characters" }
  }

  return {
    success: true,
    data: {
      name: name.trim(),
      description: obj.description ? String(obj.description).trim() : null,
      nodes: Array.isArray(obj.nodes) ? obj.nodes : undefined,
      edges: Array.isArray(obj.edges) ? obj.edges : undefined,
      variables: typeof obj.variables === "object" && obj.variables !== null ? obj.variables as Record<string, unknown> : undefined,
      trigger_keywords: Array.isArray(obj.trigger_keywords) ? obj.trigger_keywords.filter(k => typeof k === "string") : undefined,
    },
  }
}

/**
 * Validates and sanitizes request body for contact creation
 */
export function validateContactPayload(body: unknown): ValidationResult<{
  phone: string
  name?: string | null
  metadata?: Record<string, unknown>
  tags?: string[]
}> {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Request body must be an object" }
  }

  const obj = body as Record<string, unknown>
  const phone = obj.phone

  if (!phone || typeof phone !== "string") {
    return { success: false, error: "Phone number is required and must be a string" }
  }

  // Validate phone format (basic E.164 validation)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/
  const cleanPhone = String(phone).replace(/[^\d+]/g, "")

  if (!phoneRegex.test(cleanPhone)) {
    return { success: false, error: "Invalid phone number format" }
  }

  return {
    success: true,
    data: {
      phone: cleanPhone,
      name: obj.name ? String(obj.name).trim() : null,
      metadata: typeof obj.metadata === "object" && obj.metadata !== null ? obj.metadata as Record<string, unknown> : undefined,
      tags: Array.isArray(obj.tags) ? obj.tags.filter(t => typeof t === "string") : undefined,
    },
  }
}

/**
 * Validates and sanitizes request body for send message
 */
export function validateSendMessagePayload(body: unknown): ValidationResult<{
  contactId: string
  message: Record<string, unknown>
  replyToMessageId?: string
}> {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Request body must be an object" }
  }

  const obj = body as Record<string, unknown>
  const contactId = obj.contactId
  const message = obj.message
  const replyToMessageId = obj.replyToMessageId

  if (!contactId || typeof contactId !== "string") {
    return { success: false, error: "Contact ID is required and must be a string" }
  }

  if (!message || typeof message !== "object") {
    return { success: false, error: "Message is required and must be an object" }
  }

  return {
    success: true,
    data: {
      contactId: String(contactId).trim(),
      message: message as Record<string, unknown>,
      replyToMessageId: replyToMessageId ? String(replyToMessageId).trim() : undefined,
    },
  }
}

/**
 * Validates and sanitizes request body for settings update
 */
export function validateSettingsPayload(body: unknown): ValidationResult<{
  name?: string
  whatsapp_phone_id?: string
  whatsapp_token?: string
  whatsapp_verify_token?: string
  default_ai_provider?: string
  default_ai_model?: string
}> {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Request body must be an object" }
  }

  const obj = body as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (obj.name !== undefined) {
    if (typeof obj.name !== "string") {
      return { success: false, error: "Name must be a string" }
    }
    result.name = String(obj.name).trim()
  }

  if (obj.whatsapp_phone_id !== undefined) {
    if (typeof obj.whatsapp_phone_id !== "string") {
      return { success: false, error: "WhatsApp phone ID must be a string" }
    }
    result.whatsapp_phone_id = String(obj.whatsapp_phone_id).trim()
  }

  if (obj.whatsapp_token !== undefined) {
    if (typeof obj.whatsapp_token !== "string") {
      return { success: false, error: "WhatsApp token must be a string" }
    }
    result.whatsapp_token = String(obj.whatsapp_token).trim()
  }

  if (obj.whatsapp_verify_token !== undefined) {
    if (typeof obj.whatsapp_verify_token !== "string") {
      return { success: false, error: "WhatsApp verify token must be a string" }
    }
    result.whatsapp_verify_token = String(obj.whatsapp_verify_token).trim()
  }

  if (obj.default_ai_provider !== undefined) {
    if (typeof obj.default_ai_provider !== "string") {
      return { success: false, error: "Default AI provider must be a string" }
    }
    result.default_ai_provider = String(obj.default_ai_provider).trim()
  }

  if (obj.default_ai_model !== undefined) {
    if (typeof obj.default_ai_model !== "string") {
      return { success: false, error: "Default AI model must be a string" }
    }
    result.default_ai_model = String(obj.default_ai_model).trim()
  }

  return {
    success: true,
    data: result as {
      name?: string
      whatsapp_phone_id?: string
      whatsapp_token?: string
      whatsapp_verify_token?: string
      default_ai_provider?: string
      default_ai_model?: string
    },
  }
}

/**
 * Safe JSON parsing with error handling
 */
export async function safeParseJSON<T = unknown>(
  request: Request
): Promise<ValidationResult<T>> {
  try {
    const text = await request.text()

    if (!text) {
      return { success: false, error: "Request body is empty" }
    }

    const data = JSON.parse(text)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: "Invalid JSON in request body" }
  }
}

/**
 * Helper to safely extract and validate UUID
 */
export function validateUUID(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { success: false, error: "UUID must be a string" }
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (!uuidRegex.test(value)) {
    return { success: false, error: "Invalid UUID format" }
  }

  return { success: true, data: value }
}
