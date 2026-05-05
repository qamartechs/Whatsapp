"use client"

import type { NodeProps } from "@xyflow/react"
import { 
  MessageSquare, 
  Image, 
  Video, 
  FileText, 
  LayoutGrid, 
  Keyboard, 
  Clock,
  Film,
  Paperclip,
  CreditCard,
  MousePointerClick,
} from "lucide-react"
import { BaseNode } from "./base-node"
import type { MessageNodeData, MessageType } from "@/lib/types"

const messageTypeConfig: Record<Exclude<MessageType, "list">, { icon: React.ReactNode; label: string; color: string }> = {
  text: { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Text", color: "text-blue-700 bg-blue-100" },
  image: { icon: <Image className="h-3.5 w-3.5" />, label: "Image", color: "text-green-700 bg-green-100" },
  button: { icon: <MousePointerClick className="h-3.5 w-3.5" />, label: "Button", color: "text-purple-700 bg-purple-100" },
  card: { icon: <CreditCard className="h-3.5 w-3.5" />, label: "Card", color: "text-pink-700 bg-pink-100" },
  carousel: { icon: <LayoutGrid className="h-3.5 w-3.5" />, label: "Carousel", color: "text-orange-700 bg-orange-100" },
  getUserData: { icon: <Keyboard className="h-3.5 w-3.5" />, label: "Get User Data", color: "text-emerald-700 bg-emerald-100" },
  video: { icon: <Video className="h-3.5 w-3.5" />, label: "Video", color: "text-red-700 bg-red-100" },
  gif: { icon: <Film className="h-3.5 w-3.5" />, label: "GIF", color: "text-pink-700 bg-pink-100" },
  typing: { icon: <Clock className="h-3.5 w-3.5" />, label: "Typing", color: "text-gray-700 bg-gray-100" },
  file: { icon: <Paperclip className="h-3.5 w-3.5" />, label: "File", color: "text-amber-700 bg-amber-100" },
}

export function MessageNode(props: NodeProps) {
  const data = props.data as MessageNodeData
  const messageType = data.messageType || "text"
  // List type is handled by the separate ListNode
  const config = messageType === "list" 
    ? messageTypeConfig.text 
    : messageTypeConfig[messageType as Exclude<MessageType, "list">]
  const iconColorClass = config.color.split(" ")[0]
  const iconBgClass = config.color.split(" ")[1]

  // Determine source handles for interactive messages (button, card, list, getUserData with timeout)
  const getSourceHandles = () => {
    if (messageType === "button" && data.buttons) {
      // Only quick reply buttons get handles
      return data.buttons
        .filter(btn => btn.type === "reply")
        .map(btn => ({ id: btn.id, label: btn.text }))
    }
    if (messageType === "card" && data.cardButtons) {
      return data.cardButtons
        .filter(btn => btn.type === "reply")
        .map(btn => ({ id: btn.id, label: btn.text }))
    }
    // getUserData with auto-skip enabled gets response and timeout handles
    if (messageType === "getUserData" && data.autoSkipEnabled && data.timeout && data.timeout >= 10) {
      const val = data.timeoutValue || data.timeout
      const unit = data.timeoutUnit || "seconds"
      const unitShort = unit === "hours" ? "h" : unit === "minutes" ? "m" : "s"
      return [
        { id: "response", label: "Response" },
        { id: "timeout", label: `Skip (${val}${unitShort})` },
      ]
    }
    return []
  }

  const renderContent = () => {
    switch (messageType) {
      case "text":
        return (
          <div className="space-y-1">
            {data.header && (
              <p className="text-xs font-medium line-clamp-1">{data.header}</p>
            )}
            <p className="line-clamp-2 text-sm">{data.text || "No message set"}</p>
            {data.footer && (
              <p className="text-[10px] text-muted-foreground italic line-clamp-1">{data.footer}</p>
            )}
          </div>
        )

      case "image":
        return (
          <div className="space-y-1.5">
            {data.mediaUrl ? (
              <div className="relative h-14 w-full overflow-hidden rounded border bg-muted">
                <img
                  src={data.mediaUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-14 rounded border bg-muted">
                <Image className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            {data.caption && (
              <p className="text-xs text-muted-foreground line-clamp-1">{data.caption}</p>
            )}
          </div>
        )

      case "button":
        return (
          <div className="space-y-1.5">
            {data.header && (
              <p className="text-xs font-medium line-clamp-1">{data.header}</p>
            )}
            <p className="text-sm line-clamp-1">{data.text || "Button message"}</p>
            <div className="flex flex-wrap gap-1">
              {(data.buttons || []).slice(0, 3).map((btn) => (
                <span
                  key={btn.id}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    btn.type === "reply" ? "bg-purple-100 text-purple-700" :
                    btn.type === "url" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}
                >
                  {btn.type === "url" && "🔗 "}
                  {btn.type === "phone" && "📞 "}
                  {btn.text}
                </span>
              ))}
            </div>
            {data.footer && (
              <p className="text-[10px] text-muted-foreground italic">{data.footer}</p>
            )}
          </div>
        )

      case "card":
        return (
          <div className="space-y-1.5">
            {data.cardImageUrl ? (
              <div className="relative h-12 w-full overflow-hidden rounded border bg-muted">
                <img src={data.cardImageUrl} alt="Card" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-12 rounded border bg-muted">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            {data.text && <p className="text-xs line-clamp-1">{data.text}</p>}
            <div className="flex flex-wrap gap-1">
              {(data.cardButtons || []).slice(0, 3).map((btn) => (
                <span
                  key={btn.id}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    btn.type === "reply" ? "bg-pink-100 text-pink-700" :
                    btn.type === "url" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}
                >
                  {btn.type === "url" && "🔗 "}
                  {btn.type === "phone" && "📞 "}
                  {btn.text}
                </span>
              ))}
            </div>
            {data.footer && (
              <p className="text-[10px] text-muted-foreground italic">{data.footer}</p>
            )}
          </div>
        )

      case "carousel":
        return (
          <div className="space-y-1.5">
            <div className="flex gap-1 overflow-hidden">
              {(data.carouselCards || []).slice(0, 3).map((card, i) => (
                <div key={i} className="h-10 w-10 shrink-0 rounded border bg-muted overflow-hidden">
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <LayoutGrid className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {(data.carouselCards?.length || 0) > 3 && (
                <div className="h-10 w-10 shrink-0 rounded border bg-muted flex items-center justify-center">
                  <span className="text-[9px] text-muted-foreground">+{(data.carouselCards?.length || 0) - 3}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {data.carouselCards?.length || 0} cards
            </p>
          </div>
        )

      case "getUserData":
        return (
          <div className="space-y-1">
            {data.prompt && (
              <p className="text-xs line-clamp-1 text-muted-foreground">"{data.prompt}"</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                {data.inputType || "any"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                → {data.variableName || "variable"}
              </span>
              {data.autoSkipEnabled && data.timeout && data.timeout >= 10 && (() => {
                const val = data.timeoutValue || data.timeout
                const unit = data.timeoutUnit || "seconds"
                const unitShort = unit === "hours" ? "h" : unit === "minutes" ? "m" : "s"
                return (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                    skip {val}{unitShort}
                  </span>
                )
              })()}
            </div>
          </div>
        )

      case "video":
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center h-12 rounded border bg-muted">
              <Video className="h-4 w-4 text-muted-foreground" />
            </div>
            {data.fileName && <p className="text-xs text-muted-foreground line-clamp-1">{data.fileName}</p>}
            {data.caption && <p className="text-xs line-clamp-1">{data.caption}</p>}
          </div>
        )

      case "gif":
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center h-12 rounded border bg-muted">
              <Film className="h-4 w-4 text-muted-foreground" />
            </div>
            {data.caption && <p className="text-xs line-clamp-1">{data.caption}</p>}
          </div>
        )

      case "typing":
        return (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse delay-75" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse delay-150" />
            </div>
            <span className="text-xs text-muted-foreground">
              {data.typingDuration || 3}s
            </span>
          </div>
        )

      case "file":
        return (
          <div className="flex items-center gap-2 p-2 rounded border bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs truncate">{data.fileName || "document.pdf"}</p>
              {data.caption && (
                <p className="text-[10px] text-muted-foreground truncate">{data.caption}</p>
              )}
            </div>
          </div>
        )

      default:
        return <p className="text-xs text-muted-foreground">Configure message</p>
    }
  }

  const sourceHandles = getSourceHandles()

  return (
    <BaseNode
      {...props}
      icon={<span className={iconColorClass}>{config.icon}</span>}
      iconBg={iconBgClass}
      sourceHandles={sourceHandles.length > 0 ? sourceHandles : undefined}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${config.color}`}>
            {config.label}
          </span>
        </div>
        {renderContent()}
      </div>
    </BaseNode>
  )
}
