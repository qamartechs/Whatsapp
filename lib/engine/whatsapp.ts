import type { WhatsAppInteractive } from "@/lib/types"

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"

interface SendMessagePayload {
  type: "text" | "image" | "video" | "audio" | "document" | "interactive" | "template"
  text?: string
  mediaUrl?: string
  caption?: string
  interactive?: WhatsAppInteractive
  context?: {
    message_id: string
  }
}

interface WhatsAppApiResponse {
  messaging_product: string
  contacts?: Array<{ input: string; wa_id: string }>
  messages?: Array<{ id: string }>
  error?: {
    message: string
    type: string
    code: number
  }
}

/**
 * Sends a message via WhatsApp Cloud API
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  payload: SendMessagePayload
): Promise<WhatsAppApiResponse | null> {
  if (!phoneNumberId || !accessToken) {
    console.warn("[WhatsApp] Missing credentials, skipping send")
    return null
  }

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  // Build the message body
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: payload.type,
  }

  // Add context for reply messages
  if (payload.context?.message_id) {
    body.context = {
      message_id: payload.context.message_id,
    }
  }

  switch (payload.type) {
    case "text":
      body.text = { body: payload.text }
      break

    case "image":
      body.image = { 
        link: payload.mediaUrl,
        caption: payload.caption,
      }
      break

    case "video":
      body.video = {
        link: payload.mediaUrl,
        caption: payload.caption,
      }
      break

    case "audio":
      body.audio = {
        link: payload.mediaUrl,
      }
      break

    case "document":
      body.document = {
        link: payload.mediaUrl,
        caption: payload.caption,
      }
      break

    case "interactive":
      body.interactive = payload.interactive
      break
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("[WhatsApp] Send error:", data)
      throw new Error(data.error?.message || "Failed to send message")
    }

    return data as WhatsAppApiResponse
  } catch (error) {
    console.error("[WhatsApp] Error sending message:", error)
    throw error
  }
}

/**
 * Marks a message as read
 */
export async function markMessageAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  if (!phoneNumberId || !accessToken) return

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    })
  } catch (error) {
    console.error("[WhatsApp] Error marking message as read:", error)
  }
}

/**
 * Downloads media from WhatsApp
 */
export async function getMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  const url = `${WHATSAPP_API_URL}/${mediaId}`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = await response.json()
    return data.url || null
  } catch (error) {
    console.error("[WhatsApp] Error getting media URL:", error)
    return null
  }
}

/**
 * Sends a typing indicator to WhatsApp user
 * The typing indicator appears for 25 seconds or until a message is sent
 * Requires a message_id to respond to
 */
export async function sendTypingIndicator(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  if (!phoneNumberId || !accessToken || !messageId) {
    console.warn("[WhatsApp] Missing params for typing indicator")
    return false
  }

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text"
        }
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      console.error("[WhatsApp] Typing indicator error:", data)
      return false
    }

    return true
  } catch (error) {
    console.error("[WhatsApp] Error sending typing indicator:", error)
    return false
  }
}

/**
 * Uploads media directly to WhatsApp's servers
 * This is required for audio formats that WhatsApp needs to process
 */
export async function uploadMediaToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  fileBlob: Blob,
  mimeType: string
): Promise<string | null> {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/media`

  // Get file extension from mime type
  const extension = mimeType.split("/")[1]?.split(";")[0] || "bin"
  const filename = `media.${extension}`
  
  console.log("[v0] uploadMediaToWhatsApp - url:", url, "mimeType:", mimeType, "filename:", filename, "blobSize:", fileBlob.size)

  // WhatsApp requires specific content type handling
  const formData = new FormData()
  formData.append("messaging_product", "whatsapp")
  formData.append("file", fileBlob, filename)
  formData.append("type", mimeType)

  try {
    console.log("[v0] Sending upload request to WhatsApp...")
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    })

    const data = await response.json()
    console.log("[v0] WhatsApp upload response - status:", response.status, "data:", JSON.stringify(data))

    if (!response.ok) {
      console.error("[WhatsApp] Media upload error:", data)
      throw new Error(data.error?.message || "Failed to upload media")
    }

    return data.id || null
  } catch (error) {
    console.error("[WhatsApp] Error uploading media:", error)
    throw error
  }
}

/**
 * Sends a message using a media ID (for uploaded media)
 */
export async function sendWhatsAppMediaById(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  mediaId: string,
  mediaType: "audio" | "video" | "image" | "document",
  caption?: string,
  isVoiceMessage?: boolean
): Promise<WhatsAppApiResponse | null> {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: mediaType,
    [mediaType]: {
      id: mediaId,
      ...(caption && mediaType !== "audio" ? { caption } : {}),
      // For audio messages, set voice: true to send as voice message (with profile pic and voice icon)
      ...(mediaType === "audio" && isVoiceMessage ? { voice: true } : {}),
    },
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("[WhatsApp] Send media by ID error:", data)
      throw new Error(data.error?.message || "Failed to send media")
    }

    return data as WhatsAppApiResponse
  } catch (error) {
    console.error("[WhatsApp] Error sending media by ID:", error)
    throw error
  }
}

/**
 * Sends an audio message using a public URL
 * WhatsApp will download and transcode the audio
 */
export async function sendWhatsAppAudioByUrl(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  audioUrl: string
): Promise<WhatsAppApiResponse | null> {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: "audio",
    audio: {
      link: audioUrl,
    },
  }

  console.log("[v0] Sending audio by URL:", audioUrl)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    console.log("[v0] WhatsApp audio by URL response:", response.status, JSON.stringify(data))

    if (!response.ok) {
      console.error("[WhatsApp] Send audio by URL error:", data)
      throw new Error(data.error?.message || "Failed to send audio")
    }

    return data as WhatsAppApiResponse
  } catch (error) {
    console.error("[WhatsApp] Error sending audio by URL:", error)
    throw error
  }
}

/**
 * Fetches WhatsApp profile picture URL for a phone number
 */
export async function getWhatsAppProfilePicture(
  phoneNumberId: string,
  accessToken: string,
  waId: string
): Promise<string | null> {
  // WhatsApp Cloud API doesn't directly expose profile pictures
  // The profile picture is available through the contacts endpoint
  // but requires specific permissions
  const url = `${WHATSAPP_API_URL}/${waId}/profile_picture`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.data?.url || null
  } catch (error) {
    console.error("[WhatsApp] Error getting profile picture:", error)
    return null
  }
}
