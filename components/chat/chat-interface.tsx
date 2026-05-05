"use client"

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react"
import {
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  Search,
  Check,
  CheckCheck,
  Clock,
  X,
  Mic,
  Trash2,
  Image as ImageIcon,
  FileText,
  StopCircle,
  ExternalLink,
  Reply,
  CheckSquare,
  Square,
  List,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { AudioPlayer } from "./audio-player"
import type { Contact, Message, ChatMessage } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

// Common emojis for quick access
const COMMON_EMOJIS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊",
  "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘",
  "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
  "🎉", "🎊", "🎁", "🎈", "✨", "🌟", "💫", "⭐",
]

interface ChatInterfaceProps {
  contact: Contact
  onClose?: () => void
  onDeleteChat?: () => void
}

// Helper to convert whatsapp-media: URLs to API URLs
function getMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith("whatsapp-media:")) {
    const mediaId = url.replace("whatsapp-media:", "")
    return `/api/whatsapp/media/${mediaId}`
  }
  return url
}

export function ChatInterface({ contact, onClose, onDeleteChat }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [showList, setShowList] = useState<ChatMessage | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState("")
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  // Scroll to bottom when new messages arrive (only if already at bottom)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      })
    }
  }, [])

  // Track scroll position to show/hide scroll button and reset unread count
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom)
      
      // Reset unread count when user scrolls to bottom
      if (isNearBottom) {
        setUnreadCount(0)
      }
    }
  }, [])

  // Track if initial scroll has been done
  const hasInitialScrolled = useRef(false)
  
  // Scroll to bottom immediately when chat loads - multiple attempts to ensure it works
  useLayoutEffect(() => {
    if (!isLoading && messages.length > 0 && scrollRef.current && !hasInitialScrolled.current) {
      const scrollElement = scrollRef.current
      
      // Immediate scroll
      scrollElement.scrollTop = scrollElement.scrollHeight
      
      // Also schedule scrolls after renders to catch any layout shifts
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight
      })
      
      // Final scroll after a short delay to catch any lazy-loaded content
      setTimeout(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }, 50)
      
      hasInitialScrolled.current = true
    }
  }, [isLoading, messages.length])
  
  // Reset initial scroll flag when contact changes
  useEffect(() => {
    hasInitialScrolled.current = false
    // Also immediately scroll when contact changes
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [contact.id])

  // Scroll to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150
      if (isNearBottom) {
        scrollToBottom()
      }
    }
  }, [messages, scrollToBottom])

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("messages")
        .select(`
          *,
          reply_to:reply_to_message_id(id, content, direction)
        `)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: true })

      if (!error && data) {
        const chatMessages: ChatMessage[] = data.map((msg: Message & { reply_to?: { id: string; content: Record<string, unknown>; direction: string } }) => 
          convertMessageToChatMessage(msg, msg.reply_to)
        )
        setMessages(chatMessages)
        
        // Reset unread count on initial load
        setUnreadCount(0)
        setShowScrollButton(false)
      }
      
      setIsLoading(false)
    }

    fetchMessages()

    // Set up real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${contact.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        async (payload) => {
          const msg = payload.new as Message
          
          // Fetch reply context if exists
          let replyToData: { id: string; content: Record<string, unknown>; direction: string } | undefined
          if (msg.reply_to_message_id) {
            const supabaseClient = createClient()
            const { data: replyMsg } = await supabaseClient
              .from("messages")
              .select("id, content, direction")
              .eq("id", msg.reply_to_message_id)
              .single()
            if (replyMsg) {
              replyToData = replyMsg as { id: string; content: Record<string, unknown>; direction: string }
            }
          }
          
          const newMessage = convertMessageToChatMessage(msg, replyToData)
          // Only add if not already present (avoid duplicates from optimistic updates)
          setMessages((prev) => {
            const exists = prev.some(m => m.id === msg.id || m.id === `temp_${msg.id}`)
            if (exists) return prev
            // Also check if there's a temp message with matching content that we should replace
            const tempIndex = prev.findIndex(m => 
              m.id.startsWith("temp_") && 
              m.content === newMessage.content &&
              m.type === newMessage.type
            )
            if (tempIndex !== -1) {
              // Replace temp message with real one
              const updated = [...prev]
              updated[tempIndex] = newMessage
              return updated
            }
            return [...prev, newMessage]
          })
          
          // If this is an inbound message and user is scrolled up, increment unread count
          if (msg.direction === "inbound" && scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
            if (!isNearBottom) {
              setUnreadCount(prev => prev + 1)
              setShowScrollButton(true)
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id
                ? { ...m, status: msg.status as ChatMessage["status"] }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [contact.id])

  const convertMessageToChatMessage = (
    msg: Message, 
    replyToData?: { id: string; content: Record<string, unknown>; direction: string }
  ): ChatMessage => {
    const content = msg.content as unknown as Record<string, unknown>
    
    // Extract text content
    let textContent = ""
    if (typeof content.text === "string") {
      textContent = content.text
    } else if (content.interactive) {
      const interactive = content.interactive as Record<string, unknown>
      // Handle button reply (user clicked a button)
      if (interactive.button_reply) {
        const buttonReply = interactive.button_reply as Record<string, unknown>
        textContent = (buttonReply.title as string) || (buttonReply.id as string) || "Button clicked"
      }
      // Handle list reply (user selected from list)
      else if (interactive.list_reply) {
        const listReply = interactive.list_reply as Record<string, unknown>
        textContent = (listReply.title as string) || (listReply.id as string) || "Option selected"
      }
      // Handle outgoing interactive message body
      else if (typeof interactive.body === "object") {
        textContent = (interactive.body as Record<string, unknown>)?.text as string || ""
      }
    } else if (content.button) {
      // Handle button payload format
      const button = content.button as Record<string, unknown>
      textContent = (button.text as string) || (button.payload as string) || "Button clicked"
    } else if (content.bodyText) {
      textContent = content.bodyText as string
    } else if (content.title) {
      textContent = content.title as string
      if (content.description) {
        textContent += `\n${content.description}`
      }
    } else if (content.caption) {
      textContent = content.caption as string
    }

    // Extract buttons
    let buttons: ChatMessage["buttons"] = undefined
    let ctaUrl: ChatMessage["ctaUrl"] = undefined
    
    if (content.buttons && Array.isArray(content.buttons)) {
      buttons = (content.buttons as Array<{ id: string; text: string; type?: string }>).map((b) => ({
        id: b.id,
        text: b.text,
        payload: b.id,
        type: (b.type as "reply" | "url" | "phone") || "reply",
      }))
    } else if (content.interactive) {
      const interactive = content.interactive as Record<string, unknown>
      const action = interactive.action as Record<string, unknown> | undefined
      
      // Check for CTA URL button
      if (action?.name === "cta_url" && action?.parameters) {
        const params = action.parameters as Record<string, unknown>
        ctaUrl = {
          text: (params.display_text as string) || "Open",
          url: params.url as string,
        }
      } else if (action?.buttons && Array.isArray(action.buttons)) {
        buttons = (action.buttons as Array<{ reply: { id: string; title: string } }>).map((b) => ({
          id: b.reply.id,
          text: b.reply.title,
          payload: b.reply.id,
        }))
      }
    }
    
    // Check for stored CTA URL button info
    if (content.buttonType === "cta_url" && content.url) {
      ctaUrl = {
        text: (content.buttonText as string) || "Open",
        url: content.url as string,
      }
    }

    // Extract list
    let list: ChatMessage["list"] = undefined
    if (content.sections && Array.isArray(content.sections)) {
      list = {
        buttonText: (content.buttonText as string) || "View Options",
        sections: content.sections as NonNullable<ChatMessage["list"]>["sections"],
      }
    } else if (content.interactive) {
      const interactive = content.interactive as Record<string, unknown>
      const action = interactive.action as Record<string, unknown> | undefined
      if (action?.sections && Array.isArray(action.sections)) {
        list = {
          buttonText: (action.button as string) || "View Options",
          sections: action.sections as NonNullable<ChatMessage["list"]>["sections"],
        }
      }
    }

    // Extract cards
    let cards: ChatMessage["cards"] = undefined
    if (content.cards && Array.isArray(content.cards)) {
      cards = content.cards as ChatMessage["cards"]
    }

    // Extract media
    let mediaUrl: string | undefined = undefined
    let mediaType: ChatMessage["mediaType"] = undefined
    if (content.imageUrl) {
      mediaUrl = content.imageUrl as string
      mediaType = "image"
    } else if (content.mediaUrl) {
      mediaUrl = content.mediaUrl as string
      mediaType = content.mediaType as ChatMessage["mediaType"]
    } else if (content.audio) {
      // Incoming audio from WhatsApp webhook - has id property
      const audio = content.audio as { id?: string; mime_type?: string }
      if (audio.id) {
        // Store the media ID for lazy loading
        mediaUrl = `whatsapp-media:${audio.id}`
        mediaType = "audio"
      }
    } else if (content.whatsappMediaId && content.mediaType === "audio") {
      // Outgoing audio we sent
      mediaUrl = `whatsapp-media:${content.whatsappMediaId}`
      mediaType = "audio"
    } else if (content.image) {
      // Incoming image from WhatsApp webhook
      const image = content.image as { id?: string }
      if (image.id) {
        mediaUrl = `whatsapp-media:${image.id}`
        mediaType = "image"
      }
    } else if (content.video) {
      // Incoming video from WhatsApp webhook
      const video = content.video as { id?: string }
      if (video.id) {
        mediaUrl = `whatsapp-media:${video.id}`
        mediaType = "video"
      }
    } else if (content.document) {
      // Incoming document from WhatsApp webhook
      const document = content.document as { id?: string }
      if (document.id) {
        mediaUrl = `whatsapp-media:${document.id}`
        mediaType = "document"
      }
    }

    // Extract footer
    let footer: string | undefined = undefined
    if (content.footer) {
      if (typeof content.footer === "string") {
        footer = content.footer
      } else if (typeof content.footer === "object" && (content.footer as Record<string, unknown>).text) {
        footer = (content.footer as Record<string, unknown>).text as string
      }
    }

    // Extract source node ID for event-driven routing
    const sourceNodeId = content.nodeId as string | undefined

    // Extract reply context
    let replyTo: ChatMessage["replyTo"] = undefined
    if (replyToData) {
      const replyContent = replyToData.content
      let replyText = ""
      if (typeof replyContent.text === "string") {
        replyText = replyContent.text
      } else if (replyContent.caption) {
        replyText = replyContent.caption as string
      } else if (replyContent.bodyText) {
        replyText = replyContent.bodyText as string
      } else {
        replyText = "[Media]"
      }
      replyTo = {
        id: replyToData.id,
        content: replyText,
        type: replyToData.direction === "inbound" ? "bot" : "user",
      }
    }

    // CORRECT: inbound = from contact TO us (show on LEFT), outbound = from us TO contact (show on RIGHT)
    // type: "user" renders on RIGHT (our messages), type: "bot" renders on LEFT (contact's messages)
    return {
      id: msg.id,
      whatsappMessageId: msg.whatsapp_message_id || undefined,
      type: msg.direction === "inbound" ? "bot" : "user", // inbound = received = LEFT, outbound = sent = RIGHT
      content: textContent,
      mediaUrl,
      mediaType,
      buttons,
      ctaUrl,
      list,
      cards,
      footer,
      timestamp: new Date(msg.created_at),
      status: msg.status as ChatMessage["status"],
      sourceNodeId,
      replyTo,
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isSending) return

    const messageText = input.trim()
    const replyToMessage = replyingTo
    setInput("")
    setReplyingTo(null)
    setIsSending(true)

    // Optimistically add message (on right side - outbound)
    const tempId = `temp_${Date.now()}`
    const optimisticMessage: ChatMessage = {
      id: tempId,
      type: "user", // user = outbound = right side
      content: messageText,
      timestamp: new Date(),
      status: "sending",
      replyTo: replyToMessage ? {
        id: replyToMessage.id,
        content: replyToMessage.content || "",
        type: replyToMessage.type,
      } : undefined,
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      // Send via WhatsApp API - use WhatsApp message ID for reply context
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          message: { type: "text", text: messageText },
          replyToMessageId: replyToMessage?.whatsappMessageId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to send message")
      }

      const result = await response.json()

      // Update optimistic message with real data including whatsappMessageId
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { 
                ...m, 
                id: result.messageId || tempId, 
                whatsappMessageId: result.whatsappMessageId,
                status: "sent" as const 
              }
            : m
        )
      )
    } catch (error) {
      console.error("Send error:", error)
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Could not send message",
        variant: "destructive",
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        )
      )
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setShowAttachMenu(false)
    setIsSending(true)

    // Determine media type
    let mediaType: "image" | "video" | "audio" | "document" = "document"
    if (file.type.startsWith("image/")) mediaType = "image"
    else if (file.type.startsWith("video/")) mediaType = "video"
    else if (file.type.startsWith("audio/")) mediaType = "audio"

    // Optimistically add message
    const tempId = `temp_${Date.now()}`
    const tempUrl = URL.createObjectURL(file)
    const optimisticMessage: ChatMessage = {
      id: tempId,
      type: "user",
      content: file.name,
      mediaUrl: tempUrl,
      mediaType,
      timestamp: new Date(),
      status: "sending",
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      // Upload file to blob storage
      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file")
      }

      const { url } = await uploadResponse.json()

      // Send via WhatsApp API
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          message: {
            type: mediaType,
            mediaUrl: url,
            caption: "",
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send media")
      }

      const result = await response.json()

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: result.messageId || tempId, mediaUrl: url, status: "sent" as const }
            : m
        )
      )
    } catch (error) {
      console.error("Upload error:", error)
      toast({
        title: "Failed to send",
        description: "Could not upload file",
        variant: "destructive",
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        )
      )
    } finally {
      setIsSending(false)
      URL.revokeObjectURL(tempUrl)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const startRecording = async () => {
    try {
      // WhatsApp requires MONO audio for OGG files
      // Request mono audio from the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,        // Mono (required by WhatsApp)
          sampleRate: 48000,      // Standard for Opus
          echoCancellation: true,
          noiseSuppression: true,
        } 
      })
      
      // WhatsApp supports: OGG (opus, mono only), AAC, AMR, MP3, M4A
      // Try formats in order of WhatsApp preference
      let mimeType = "audio/webm;codecs=opus" // Fallback
      const preferredFormats = [
        "audio/ogg;codecs=opus",  // Best for WhatsApp (requires mono)
        "audio/mp4",              // AAC in MP4 container
        "audio/webm;codecs=opus", // WebM with Opus (will be converted server-side)
        "audio/webm",             // Plain WebM
      ]
      
      for (const format of preferredFormats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format
          console.log("[v0] Using audio format:", format)
          break
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks first
        stream.getTracks().forEach(track => track.stop())
        
        // Check if recording was cancelled (empty chunks)
        if (audioChunksRef.current.length === 0) {
          return
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType.split(";")[0] })
        
        // Send the audio
        await sendAudioMessage(audioBlob)
      }

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      setRecordingTime(0)

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (error) {
      console.error("Recording error:", error)
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record voice messages",
        variant: "destructive",
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      audioChunksRef.current = []
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }

  const sendAudioMessage = async (audioBlob: Blob) => {
    if (audioBlob.size === 0) return

    setIsSending(true)
    const tempId = `temp_${Date.now()}`
    const tempUrl = URL.createObjectURL(audioBlob)

    const optimisticMessage: ChatMessage = {
      id: tempId,
      type: "user",
      content: "Voice message",
      mediaUrl: tempUrl,
      mediaType: "audio",
      timestamp: new Date(),
      status: "sending",
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      // Audio is uploaded to Vercel Blob and sent via URL to WhatsApp
      // WhatsApp downloads and transcodes on their end - no client-side conversion needed!
      const mimeType = audioBlob.type.split(";")[0]
      const extension = mimeType.includes("ogg") ? "ogg" : 
                       mimeType.includes("mp4") ? "m4a" : 
                       mimeType.includes("webm") ? "webm" : "audio"
      
      console.log("[v0] Sending audio - type:", audioBlob.type, "size:", audioBlob.size)
      
      const formData = new FormData()
      formData.append("file", audioBlob, `voice-message.${extension}`)
      formData.append("contactId", contact.id)
      formData.append("mediaType", "audio")
      formData.append("isVoice", "true")

      const response = await fetch("/api/whatsapp/upload-media", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        console.error("[v0] WhatsApp media upload error:", response.status, errorData)
        throw new Error(errorData.error || `Failed to send voice message (${response.status})`)
      }

      const result = await response.json()

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: result.messageId || tempId, status: "sent" as const }
            : m
        )
      )
    } catch (error) {
      console.error("[v0] Voice send error:", error)
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Could not send voice message",
        variant: "destructive",
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        )
      )
    } finally {
      setIsSending(false)
      URL.revokeObjectURL(tempUrl)
    }
  }

  const handleDeleteChat = async () => {
    try {
      const supabase = createClient()
      
      // Delete all messages for this contact
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("contact_id", contact.id)

      if (error) throw error

      setMessages([])
      setShowDeleteDialog(false)
      toast({
        title: "Chat cleared",
        description: "All messages have been deleted",
      })
      onDeleteChat?.()
    } catch (error) {
      console.error("Delete error:", error)
      toast({
        title: "Failed to delete",
        description: "Could not delete messages",
        variant: "destructive",
      })
    }
  }

  // Toggle message selection
  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  // Delete selected messages
  const handleDeleteSelected = async () => {
    if (selectedMessages.size === 0) return
    
    try {
      const supabase = createClient()
      const idsToDelete = Array.from(selectedMessages)
      
      const { error } = await supabase
        .from("messages")
        .delete()
        .in("id", idsToDelete)

      if (error) throw error

      setMessages(prev => prev.filter(m => !selectedMessages.has(m.id)))
      setSelectedMessages(new Set())
      setIsSelectMode(false)
      setShowDeleteSelectedDialog(false)
      toast({
        title: "Messages deleted",
        description: `${idsToDelete.length} message${idsToDelete.length > 1 ? "s" : ""} deleted`,
      })
    } catch (error) {
      console.error("Delete selected error:", error)
      toast({
        title: "Failed to delete",
        description: "Could not delete selected messages",
        variant: "destructive",
      })
    }
  }

  // Delete single message
  const handleDeleteSingleMessage = async (messageId: string) => {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)

      if (error) throw error

      setMessages(prev => prev.filter(m => m.id !== messageId))
      toast({
        title: "Message deleted",
      })
    } catch (error) {
      console.error("Delete message error:", error)
      toast({
        title: "Failed to delete",
        description: "Could not delete message",
        variant: "destructive",
      })
    }
  }

  // Cancel selection mode
  const cancelSelectMode = () => {
    setIsSelectMode(false)
    setSelectedMessages(new Set())
  }

  const handleEmojiSelect = (emoji: string) => {
    setInput(prev => prev + emoji)
    setShowEmojiPicker(false)
    inputRef.current?.focus()
  }

  const handleButtonClick = async (button: { id: string; text: string; payload?: string }, sourceNodeId?: string) => {
    setIsSending(true)
    
    const tempId = `temp_${Date.now()}`
    const optimisticMessage: ChatMessage = {
      id: tempId,
      type: "user",
      content: button.text,
      timestamp: new Date(),
      status: "sent",
    }
    setMessages((prev) => [...prev, optimisticMessage])
    
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      await supabase.from("messages").insert({
        user_id: user.id,
        contact_id: contact.id,
        direction: "outbound",
        message_type: "interactive",
        content: {
          type: "interactive",
          interactive: {
            type: "button_reply",
            button_reply: { id: button.id, title: button.text },
          },
        },
        status: "sent",
      })
    } catch (error) {
      console.error("Button click error:", error)
    } finally {
      setIsSending(false)
    }
  }

  const handleListSelect = async (row: { id: string; title: string; description?: string }, sourceNodeId?: string) => {
    setShowList(null)
    setIsSending(true)
    
    const tempId = `temp_${Date.now()}`
    const optimisticMessage: ChatMessage = {
      id: tempId,
      type: "user",
      content: row.title,
      timestamp: new Date(),
      status: "sent",
    }
    setMessages((prev) => [...prev, optimisticMessage])
    
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      await supabase.from("messages").insert({
        user_id: user.id,
        contact_id: contact.id,
        direction: "outbound",
        message_type: "interactive",
        content: {
          type: "interactive",
          interactive: {
            type: "list_reply",
            list_reply: { id: row.id, title: row.title, description: row.description },
          },
        },
        status: "sent",
      })
    } catch (error) {
      console.error("List select error:", error)
    } finally {
      setIsSending(false)
    }
  }

  const getStatusIcon = (status?: ChatMessage["status"]) => {
    switch (status) {
      case "sending":
        return <Clock className="h-3 w-3 text-[#8696a0]" />
      case "sent":
        return <Check className="h-3 w-3 text-[#8696a0]" />
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-[#8696a0]" />
      case "read":
        return <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
      case "failed":
        return <span className="text-[10px] text-red-400">Failed</span>
      default:
        return null
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Filter messages based on search query
  const filteredMessages = messageSearchQuery
    ? messages.filter(msg => 
        msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())
      )
    : messages

  // Timeline is now just messages (no events)
  type TimelineItem = { type: "message"; data: ChatMessage; timestamp: Date }

  const timeline: TimelineItem[] = filteredMessages
    .map(msg => ({
      type: "message" as const,
      data: msg,
      timestamp: msg.timestamp,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())


  return (
    <div className="flex h-full flex-col bg-stone-50">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white border-b border-stone-200 px-4 py-3 shadow-sm">
        <Avatar className="h-10 w-10 ring-2 ring-stone-100">
          <AvatarImage src="" />
          <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-medium">
            {contact.name?.charAt(0).toUpperCase() || contact.phone.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800 truncate">{contact.name || contact.phone}</p>
          <p className="text-xs text-stone-500">{contact.phone}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors">
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors",
              showMessageSearch && "bg-stone-100 text-stone-700"
            )}
            onClick={() => {
              setShowMessageSearch(!showMessageSearch)
              setMessageSearchQuery("")
            }}
          >
            <Search className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border-stone-200 shadow-lg">
              <DropdownMenuItem className="hover:bg-stone-50 focus:bg-stone-50 text-stone-700">
                Contact info
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="hover:bg-stone-50 focus:bg-stone-50 text-stone-700"
                onClick={() => setIsSelectMode(true)}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Select messages
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-stone-200" />
              <DropdownMenuItem 
                className="text-red-500 hover:bg-red-50 focus:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Selection Mode Header */}
      {isSelectMode && (
        <div className="flex items-center gap-3 bg-emerald-50 px-4 py-2.5 border-b border-emerald-200 animate-in slide-in-from-top-2 duration-200">
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelSelectMode}
            className="h-8 w-8 text-stone-500 hover:text-stone-700 hover:bg-emerald-100"
          >
            <X className="h-5 w-5" />
          </Button>
          <span className="flex-1 font-medium text-stone-700">
            {selectedMessages.size} selected
          </span>
          {selectedMessages.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteSelectedDialog(true)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      )}

      {/* Message Search Bar */}
      {showMessageSearch && !isSelectMode && (
        <div className="flex items-center gap-2 bg-white px-4 py-2 border-b border-stone-200 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-stone-400" />
          <Input
            value={messageSearchQuery}
            onChange={(e) => setMessageSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-stone-100 border-none text-stone-800 placeholder:text-stone-400 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-lg"
            autoFocus
          />
          {messageSearchQuery && (
            <span className="text-xs text-stone-500 font-medium">
              {filteredMessages.length} of {messages.length}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            onClick={() => {
              setShowMessageSearch(false)
              setMessageSearchQuery("")
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Messages Container with scroll button */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto scroll-smooth"
          style={{
            backgroundColor: "#e5ddd5",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c8c8c8' fill-opacity='0.15'%3E%3Cpath d='M10 10h2v2h-2zM20 10h2v2h-2zM30 10h2v2h-2zM40 10h2v2h-2zM50 10h2v2h-2zM15 15h2v2h-2zM25 15h2v2h-2zM35 15h2v2h-2zM45 15h2v2h-2zM10 20h2v2h-2zM20 20h2v2h-2zM30 20h2v2h-2zM40 20h2v2h-2zM50 20h2v2h-2zM15 25h2v2h-2zM25 25h2v2h-2zM35 25h2v2h-2zM45 25h2v2h-2zM10 30h2v2h-2zM20 30h2v2h-2zM30 30h2v2h-2zM40 30h2v2h-2zM50 30h2v2h-2zM15 35h2v2h-2zM25 35h2v2h-2zM35 35h2v2h-2zM45 35h2v2h-2zM10 40h2v2h-2zM20 40h2v2h-2zM30 40h2v2h-2zM40 40h2v2h-2zM50 40h2v2h-2zM15 45h2v2h-2zM25 45h2v2h-2zM35 45h2v2h-2zM45 45h2v2h-2zM10 50h2v2h-2zM20 50h2v2h-2zM30 50h2v2h-2zM40 50h2v2h-2zM50 50h2v2h-2z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
        <div className="flex flex-col gap-2 p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          )}

          {!isLoading && timeline.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-white shadow-sm border border-stone-200 px-6 py-4 text-sm text-stone-500">
                {messageSearchQuery ? "No messages match your search" : "No messages yet. Start a conversation!"}
              </div>
            </div>
          )}

  {timeline.map((item) => {
  // Render message
  const msg = item.data
            const isSelected = selectedMessages.has(msg.id)
            return (
              <div 
                key={msg.id} 
                className={cn(
                  "group flex gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300", 
                  msg.type === "user" ? "justify-end" : "justify-start",
                  isSelected && "bg-emerald-50/50 -mx-2 px-2 py-1 rounded-lg"
                )}
              >
                {/* Selection checkbox */}
                {isSelectMode && (
                  <button
                    onClick={() => toggleMessageSelection(msg.id)}
                    className={cn(
                      "shrink-0 self-center p-1 rounded transition-colors",
                      msg.type === "user" ? "order-last" : "order-first"
                    )}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Square className="h-5 w-5 text-stone-400 hover:text-stone-600" />
                )}
                </button>
                )}
                
                {/* Message action buttons (reply, delete) - shown on hover */}
                {!isSelectMode && (
                  <div className={cn(
                    "shrink-0 self-center flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                    msg.type === "user" ? "order-first" : "order-last"
                  )}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                      onClick={() => setReplyingTo(msg)}
                    >
                      <Reply className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-400 hover:text-red-500 hover:bg-red-50"
                      onClick={() => handleDeleteSingleMessage(msg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Message container with buttons outside */}
                <div className={cn(
                  "max-w-[70%] overflow-hidden transition-all",
                  isSelected && "ring-2 ring-emerald-500 rounded-lg"
                )}>
                  {/* Main message bubble */}
                  <div
                    className={cn(
                      "rounded-lg px-3 py-1.5 shadow-sm relative",
                      msg.type === "user"
                        ? "bg-[#d9fdd3] text-stone-800 rounded-tr-none"
                        : "bg-white text-stone-800 rounded-tl-none",
                      // Remove bottom radius if has buttons/list
                      (msg.buttons?.length || msg.list || msg.ctaUrl || msg.cards?.some(c => c.buttons?.length)) && "rounded-b-none"
                    )}
                  >
                    {/* Reply Context - WhatsApp style */}
                    {msg.replyTo && (
                      <div 
                        className={cn(
                          "mb-1.5 rounded-md border-l-4 px-2 py-1.5",
                          msg.type === "user" 
                            ? "bg-[#d1f4cc]" 
                            : "bg-[#f5f6f6]",
                          msg.replyTo.type === "user" 
                            ? "border-[#06cf9c]" 
                            : "border-[#53bdeb]"
                        )}
                      >
                        <p className={cn(
                          "font-medium text-[13px]",
                          msg.replyTo.type === "user" ? "text-[#06cf9c]" : "text-[#53bdeb]"
                        )}>
                          {msg.replyTo.type === "user" ? "You" : contact.name || contact.phone}
                        </p>
                        <p className="line-clamp-2 text-[13px] text-stone-500">{msg.replyTo.content}</p>
                      </div>
                    )}

                    {/* Media */}
                    {msg.mediaUrl && msg.mediaType === "image" && (
                      <div className="-mx-3 -mt-1.5 mb-1.5 overflow-hidden">
                        <img src={getMediaUrl(msg.mediaUrl)} alt="" className="w-full" />
                      </div>
                    )}

                    {/* Audio - WhatsApp style */}
                    {msg.mediaUrl && msg.mediaType === "audio" && (
                      <AudioPlayer
                        src={msg.mediaUrl}
                        isOutgoing={msg.type === "user"}
                        avatarUrl={contact.avatar_url || undefined}
                        avatarFallback={contact.name?.charAt(0).toUpperCase() || contact.phone.charAt(0)}
                      />
                    )}

                    {msg.mediaUrl && msg.mediaType === "video" && (
                      <div className="-mx-3 -mt-1.5 mb-1.5 overflow-hidden">
                        <video controls className="w-full" src={getMediaUrl(msg.mediaUrl)} />
                      </div>
                    )}

                    {msg.mediaUrl && msg.mediaType === "document" && (
                      <a 
                        href={getMediaUrl(msg.mediaUrl) || "#"} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mb-1.5 flex items-center gap-2 rounded p-2 bg-stone-100/80 hover:bg-stone-200/80 transition-colors"
                      >
                        <FileText className="h-8 w-8 text-[#00a884]" />
                        <span className="text-sm text-stone-700">{msg.content || "Document"}</span>
                      </a>
                    )}

                    {/* Cards - image part inside bubble */}
                    {msg.cards && msg.cards.map((card, idx) => (
                      <div key={idx}>
                        {card.imageUrl && (
                          <div className="-mx-3 -mt-1.5 mb-1.5 overflow-hidden">
                            <img src={card.imageUrl} alt="" className="w-full" />
                          </div>
                        )}
                        {card.title && <p className="font-semibold text-sm">{card.title}</p>}
                        {card.description && <p className="text-sm text-stone-600">{card.description}</p>}
                      </div>
                    ))}

                    {/* Text content (only show if no cards and has content) */}
                    {msg.content && (!msg.cards || msg.cards.length === 0) && msg.mediaType !== "document" && (
                      <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                    )}

                    {/* Footer */}
                    {msg.footer && (
                      <p className="text-xs text-stone-500">{msg.footer}</p>
                    )}

                    {/* Timestamp and status */}
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      <span className="text-[11px] text-stone-500">{formatTime(msg.timestamp)}</span>
                      {msg.type === "user" && getStatusIcon(msg.status)}
                    </div>
                  </div>

                  {/* Buttons OUTSIDE the bubble */}
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div className={cn(
                      "rounded-b-lg shadow-sm overflow-hidden",
                      msg.type === "user" ? "bg-[#d9fdd3]" : "bg-white"
                    )}>
                      {msg.buttons.map((btn, idx) => (
                        <button
                          key={btn.id}
                          className={cn(
                            "w-full py-2 text-sm font-medium text-[#00a884] hover:bg-black/5 transition-colors",
                            idx > 0 && "border-t border-stone-200/60"
                          )}
                          onClick={() => {
                            if (btn.type === "url" && btn.payload) {
                              window.open(btn.payload, "_blank", "noopener,noreferrer")
                            } else if (btn.type === "phone" && btn.payload) {
                              window.open(`tel:${btn.payload}`, "_self")
                            } else {
                              handleButtonClick(btn, msg.sourceNodeId)
                            }
                          }}
                          disabled={isSending && btn.type === "reply"}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            {btn.type === "url" && <ExternalLink className="h-4 w-4" />}
                            {btn.type === "phone" && <Phone className="h-4 w-4" />}
                            {btn.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Card buttons OUTSIDE the bubble */}
                  {msg.cards && msg.cards.some(c => c.buttons?.length) && (
                    <div className={cn(
                      "rounded-b-lg shadow-sm overflow-hidden",
                      msg.type === "user" ? "bg-[#d9fdd3]" : "bg-white"
                    )}>
                      {msg.cards.flatMap((card, cardIdx) => 
                        card.buttons?.map((btn, btnIdx) => (
                          <button
                            key={`${cardIdx}-${btn.id}`}
                            className={cn(
                              "w-full py-2 text-sm font-medium text-[#00a884] hover:bg-black/5 transition-colors",
                              (cardIdx > 0 || btnIdx > 0) && "border-t border-stone-200/60"
                            )}
                            onClick={() => handleButtonClick(btn, msg.sourceNodeId)}
                            disabled={isSending}
                          >
                            {btn.text}
                          </button>
                        )) || []
                      )}
                    </div>
                  )}

                  {/* CTA URL Button OUTSIDE */}
                  {msg.ctaUrl && (
                    <div className={cn(
                      "rounded-b-lg shadow-sm overflow-hidden",
                      msg.type === "user" ? "bg-[#d9fdd3]" : "bg-white"
                    )}>
                      <button
                        className="w-full py-2 text-sm font-medium text-[#00a884] hover:bg-black/5 transition-colors"
                        onClick={() => window.open(msg.ctaUrl!.url, "_blank", "noopener,noreferrer")}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <ExternalLink className="h-4 w-4" />
                          {msg.ctaUrl.text}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* List button OUTSIDE */}
                  {msg.list && (
                    <div className={cn(
                      "rounded-b-lg shadow-sm overflow-hidden",
                      msg.type === "user" ? "bg-[#d9fdd3]" : "bg-white"
                    )}>
                      <button
                        className="w-full py-2 text-sm font-medium text-[#00a884] hover:bg-black/5 transition-colors"
                        onClick={() => setShowList(msg)}
                        disabled={isSending}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <List className="h-4 w-4" />
                          {msg.list.buttonText}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>

        {/* Scroll to bottom button - positioned outside scrollable area */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-white shadow-lg border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors z-20"
          >
            <ChevronDown className="h-5 w-5 text-stone-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-[#25d366] text-white text-xs font-medium flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Reply bar */}
      {replyingTo && (
        <div className="flex items-center gap-3 bg-stone-50 border-t border-stone-200 px-4 py-2 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-1 h-10 rounded-full bg-emerald-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-600">
              {replyingTo.type === "user" ? "You" : contact.name || contact.phone}
            </p>
            <p className="text-sm text-stone-600 truncate">{replyingTo.content}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReplyingTo(null)}
            className="h-8 w-8 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 bg-white border-t border-stone-200 px-4 py-3 shadow-sm">
        {/* Emoji picker */}
        <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors">
              <Smile className="h-6 w-6" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 bg-white border-stone-200 shadow-lg p-2" align="start">
            <div className="grid grid-cols-8 gap-1">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiSelect(emoji)}
                  className="rounded p-1.5 text-xl hover:bg-stone-100 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Attachment menu */}
        <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors">
              <Paperclip className="h-6 w-6" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 bg-white border-stone-200 shadow-lg p-2" align="start">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  fileInputRef.current?.setAttribute("accept", "image/*")
                  fileInputRef.current?.click()
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                  <ImageIcon className="h-5 w-5 text-purple-600" />
                </div>
                <span className="font-medium">Photos</span>
              </button>
              <button
                onClick={() => {
                  fileInputRef.current?.setAttribute("accept", "*/*")
                  fileInputRef.current?.click()
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <span className="font-medium">Document</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
        />

        {isRecording ? (
          // Recording UI
          <div className="flex flex-1 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={cancelRecording}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <X className="h-6 w-6" />
            </Button>
            <div className="flex-1 flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-red-600 font-medium">{formatRecordingTime(recordingTime)}</span>
            </div>
            <Button
              size="icon"
              onClick={stopRecording}
              className="bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          // Normal input UI
          <>
            <div className="flex-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type a message"
                className="rounded-xl border-stone-200 bg-stone-100 text-stone-800 placeholder:text-stone-400 focus-visible:ring-1 focus-visible:ring-emerald-500 transition-colors"
              />
            </div>
            {input.trim() ? (
              <Button
                size="icon"
                className="bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
                onClick={handleSend}
                disabled={isSending}
              >
                <Send className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
                onClick={startRecording}
                disabled={isSending}
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* List Modal */}
      {showList && showList.list && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-stone-200 p-4">
              <h3 className="font-semibold text-stone-800">Select an option</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowList(null)}
                className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {showList.list.sections.map((section, sIdx) => (
                <div key={sIdx}>
                  {section.title && (
                    <p className="px-3 py-2 text-xs font-semibold uppercase text-emerald-600 tracking-wide">
                      {section.title}
                    </p>
                  )}
                  {section.rows.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => handleListSelect(row, showList.sourceNodeId)}
                      className="w-full rounded-xl p-3 text-left hover:bg-stone-100 transition-colors"
                    >
                      <p className="font-medium text-stone-800">{row.title}</p>
                      {row.description && (
                        <p className="text-sm text-stone-500">{row.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white border-stone-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-800">Clear this chat?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-500">
              All messages in this chat will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              className="bg-red-500 hover:bg-red-600 transition-colors"
            >
              Clear chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Selected Messages Dialog */}
      <AlertDialog open={showDeleteSelectedDialog} onOpenChange={setShowDeleteSelectedDialog}>
        <AlertDialogContent className="bg-white border-stone-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-800">Delete {selectedMessages.size} message{selectedMessages.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-500">
              The selected messages will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-red-500 hover:bg-red-600 transition-colors"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
