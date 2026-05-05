"use client"

import { useState, useRef, useEffect } from "react"
import { X, Send, RotateCcw, Smartphone, Check, CheckCheck, Image as ImageIcon, ExternalLink, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useFlowStore } from "@/lib/stores/flow-store"
import type {
  FlowNode,
  MessageNodeData,
  ListNodeData,
  AiNodeData,
  FlowCallNodeData,
  ChatMessage,
} from "@/lib/types"
import type { Edge } from "@xyflow/react"

interface SimulatorProps {
  onClose: () => void
}

/**
 * EVENT-DRIVEN SIMULATOR
 * 
 * This simulator mirrors the production event-driven architecture:
 * - Each button/list interaction stores its source node ID in the message
 * - Clicking ANY button (past or present) triggers the correct node execution
 * - No reliance on "current step" - all routing is payload-based
 */
export function Simulator({ onClose }: SimulatorProps) {
  const { nodes, edges, flowId } = useFlowStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [variables, setVariables] = useState<Record<string, unknown>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [showList, setShowList] = useState<ChatMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Ref to track getUserData waiting state synchronously
  const waitingForInputRef = useRef<{
    waiting: boolean
    nodeId: string
    variableName: string
    inputType: string
    errorMessage: string
    autoSkipEnabled?: boolean
    timeout?: number
  } | null>(null)
  
  // Ref to track auto-skip timer
  const autoSkipTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const reset = () => {
    setMessages([])
    setVariables({})
    setShowList(null)
    waitingForInputRef.current = null
    // Clear any pending auto-skip timer
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current)
      autoSkipTimerRef.current = null
    }
  }

  /**
   * Finds the target node for a button/list item click
   */
  const findTargetNode = (sourceNodeId: string, handleId: string): FlowNode | null => {
    // Look for edge with exact handle match
    const edge = edges.find(
      (e) => e.source === sourceNodeId && e.sourceHandle === handleId
    )
    if (edge) {
      return nodes.find((n) => n.id === edge.target) || null
    }
    
    // Fallback: any edge from this node
    const fallbackEdge = edges.find((e) => e.source === sourceNodeId)
    if (fallbackEdge) {
      return nodes.find((n) => n.id === fallbackEdge.target) || null
    }
    
    return null
  }

  const findNextNode = (sourceNodeId: string, handleId?: string): FlowNode | null => {
    if (handleId) {
      const edge = edges.find(
        (e) => e.source === sourceNodeId && e.sourceHandle === handleId
      )
      if (edge) {
        return nodes.find((n) => n.id === edge.target) || null
      }
    }
    
    const edge = edges.find((e) => e.source === sourceNodeId)
    if (edge) {
      return nodes.find((n) => n.id === edge.target) || null
    }
    return null
  }

  const addBotMessage = (
    content: string,
    options?: {
      buttons?: ChatMessage["buttons"]
      list?: ChatMessage["list"]
      cards?: ChatMessage["cards"]
      mediaUrl?: string
      mediaType?: "image" | "video" | "document" | "audio"
      footer?: string
      sourceNodeId?: string  // Track which node sent this message
    }
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: "bot",
        content,
        ...options,
        timestamp: new Date(),
        status: "delivered",
      },
    ])
  }

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        type: "user",
        content,
        timestamp: new Date(),
      },
    ])
  }

  const interpolateText = (text: string): string => {
    if (!text) return ""
    let result = text
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), String(value))
    })
    return result
  }

  /**
   * Execute a specific node - this is the core of event-driven execution
   * Can be called from any interaction, not just sequential flow
   */
  const executeNode = async (node: FlowNode, depth: number = 0): Promise<void> => {
    if (depth > 50) {
      addBotMessage("[Error: Max execution depth exceeded]")
      return
    }

    // Small delay for natural feel
    await new Promise((r) => setTimeout(r, 300))

    switch (node.type) {
      case "start": {
        const next = findNextNode(node.id)
        if (next) await executeNode(next, depth + 1)
        break
      }

      case "message": {
        const data = node.data as MessageNodeData
        const messageType = data.messageType || "text"
        const text = data.text ? interpolateText(data.text) : ""
        const header = data.header ? interpolateText(data.header) : undefined
        const footer = data.footer ? interpolateText(data.footer) : undefined
        
        switch (messageType) {
          case "text": {
            let content = ""
            if (header) content += `*${header}*\n`
            content += text
            if (footer) content += `\n_${footer}_`
            addBotMessage(content, { sourceNodeId: node.id })
            break
          }
          
          case "image":
          case "video":
          case "gif":
          case "file": {
            const caption = data.caption ? interpolateText(data.caption) : undefined
            addBotMessage(caption || data.fileName || "Media", {
              mediaUrl: data.mediaUrl,
              mediaType: messageType === "gif" ? "image" : messageType as "image" | "video" | "document",
              sourceNodeId: node.id,
            })
            break
          }
          
          case "button": {
            // Only quick reply buttons are interactive
            const replyButtons = (data.buttons || []).filter(btn => btn.type === "reply")
            const urlButtons = (data.buttons || []).filter(btn => btn.type === "url")
            const phoneButtons = (data.buttons || []).filter(btn => btn.type === "phone")
            
            let content = ""
            if (header) content += `*${header}*\n`
            content += text
            
            // Add URL/phone links as text
            if (urlButtons.length > 0 || phoneButtons.length > 0) {
              content += "\n\n"
              for (const btn of urlButtons) {
                content += `${btn.text}: ${btn.payload}\n`
              }
              for (const btn of phoneButtons) {
                content += `${btn.text}: ${btn.payload}\n`
              }
            }
            
            if (replyButtons.length > 0) {
              addBotMessage(content, {
                footer,
                sourceNodeId: node.id,
                buttons: replyButtons.map((btn) => ({
                  id: btn.id,
                  text: btn.text,
                  payload: JSON.stringify({
                    action: "goto_node",
                    source_node_id: node.id,
                    button_id: btn.id,
                  }),
                })),
              })
              // Don't continue - wait for button click (non-linear)
              return
            } else {
              addBotMessage(content, { footer, sourceNodeId: node.id })
            }
            break
          }
          
          case "list": {
            const sections = (data.listSections || []).map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
                payload: JSON.stringify({
                  action: "goto_node",
                  source_node_id: node.id,
                  row_id: row.id,
                }),
              })),
            }))
            
            if (sections.length > 0 && sections.some(s => s.rows.length > 0)) {
              let content = ""
              if (header) content += `*${header}*\n`
              content += text
              
              addBotMessage(content, {
                footer,
                sourceNodeId: node.id,
                list: {
                  buttonText: data.listButtonText || "Select",
                  sections,
                },
              })
              // Don't continue - wait for list selection (non-linear)
              return
            } else {
              addBotMessage(text || "List message", { sourceNodeId: node.id })
            }
            break
          }
          
          case "card": {
            const replyButtons = (data.cardButtons || []).filter(btn => btn.type === "reply")
            const urlButtons = (data.cardButtons || []).filter(btn => btn.type === "url")
            const phoneButtons = (data.cardButtons || []).filter(btn => btn.type === "phone")
            
            let bodyText = text || ""
            if (urlButtons.length > 0 || phoneButtons.length > 0) {
              bodyText += "\n\n"
              for (const btn of urlButtons) {
                bodyText += `${btn.text}: ${btn.payload}\n`
              }
              for (const btn of phoneButtons) {
                bodyText += `${btn.text}: ${btn.payload}\n`
              }
            }
            
            if (replyButtons.length > 0) {
              addBotMessage(bodyText || "Card", {
                footer,
                sourceNodeId: node.id,
                cards: [{
                  title: header,
                  description: bodyText,
                  imageUrl: data.cardImageUrl,
                  buttons: replyButtons.map((btn) => ({
                    id: btn.id,
                    text: btn.text,
                    payload: JSON.stringify({
                      action: "goto_node",
                      source_node_id: node.id,
                      button_id: btn.id,
                    }),
                  })),
                }],
              })
              // Don't continue - wait for button click (non-linear)
              return
            } else {
              addBotMessage(bodyText || "Card", {
                mediaUrl: data.cardImageUrl,
                mediaType: data.cardImageUrl ? "image" : undefined,
                sourceNodeId: node.id,
              })
            }
            break
          }
          
          case "carousel": {
            // Send each card as a separate message
            for (const card of data.carouselCards || []) {
              const title = card.title ? interpolateText(card.title) : ""
              const description = card.description ? interpolateText(card.description) : ""
              let content = `*${title}*`
              if (description) content += `\n${description}`
              
              addBotMessage(content, {
                mediaUrl: card.imageUrl,
                mediaType: card.imageUrl ? "image" : undefined,
                sourceNodeId: node.id,
              })
              await new Promise((r) => setTimeout(r, 200))
            }
            break
          }
          
          case "getUserData": {
            const prompt = data.prompt ? interpolateText(data.prompt) : ""
            if (prompt) {
              addBotMessage(prompt, { sourceNodeId: node.id })
            }
            
            // Clear any existing auto-skip timer
            if (autoSkipTimerRef.current) {
              clearTimeout(autoSkipTimerRef.current)
              autoSkipTimerRef.current = null
            }
            
            // Set ref immediately for synchronous access in handleSend
            waitingForInputRef.current = {
              waiting: true,
              nodeId: node.id,
              variableName: data.variableName || "user_input",
              inputType: data.inputType || "any",
              errorMessage: data.errorMessage || "Invalid input. Please try again.",
              autoSkipEnabled: data.autoSkipEnabled,
              timeout: data.autoSkipEnabled ? data.timeout : undefined,
            }
            
            // Also update state for UI (but this is async)
            setVariables(prev => ({
              ...prev,
              __waiting_for_input: true,
              __current_node_id: node.id,
            }))
            
            // Start auto-skip timer if enabled (minimum 10 seconds)
            if (data.autoSkipEnabled && data.timeout && data.timeout >= 10) {
              const timeoutMs = data.timeout * 1000
              const currentNodeId = node.id
              
              autoSkipTimerRef.current = setTimeout(async () => {
                // Check if still waiting for this node's input
                if (waitingForInputRef.current?.waiting && 
                    waitingForInputRef.current?.nodeId === currentNodeId) {
                  
                  // Clear waiting state
                  waitingForInputRef.current = null
                  autoSkipTimerRef.current = null
                  
                  // Show skip message
                  addBotMessage("[Auto-skipped due to timeout]", { sourceNodeId: currentNodeId })
                  
                  // Clear variables
                  setVariables(prev => {
                    const newVars = { ...prev }
                    delete newVars.__waiting_for_input
                    delete newVars.__current_node_id
                    return newVars
                  })
                  
                  // Find and execute the timeout/skip node
                  const skipEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === "timeout")
                  if (skipEdge) {
                    const skipNode = nodes.find(n => n.id === skipEdge.target)
                    if (skipNode) {
                      await executeNode(skipNode)
                    }
                  }
                }
              }, timeoutMs)
            }
            
            return
          }
          
          case "typing": {
            // Show typing indicator
            addBotMessage("typing...", { sourceNodeId: node.id })
            await new Promise(r => setTimeout(r, (data.typingDuration || 3) * 1000))
            // Remove typing message
            setMessages(prev => prev.filter(m => m.content !== "typing..."))
            break
          }
          
          default:
            addBotMessage(text || "[Unknown message type]", { sourceNodeId: node.id })
        }

        // Continue to next node for non-interactive message types
        if (!["button", "card", "getUserData"].includes(messageType)) {
          const next = findNextNode(node.id)
          if (next) await executeNode(next, depth + 1)
        }
        break
      }

      case "list": {
        const data = node.data as ListNodeData
        const bodyText = interpolateText(data.bodyText)
        const footer = data.footer ? interpolateText(data.footer) : undefined

        addBotMessage(bodyText, {
          footer,
          sourceNodeId: node.id,
          list: {
            buttonText: data.buttonText,
            sections: data.sections.map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
                // Store source node ID for event-driven routing
                payload: JSON.stringify({
                  action: "goto_node",
                  source_node_id: node.id,
                  row_id: row.id,
                }),
              })),
            })),
          },
        })
        // Don't continue - wait for list selection
        break
      }

      case "condition": {
        const data = node.data as any
        let matched = false

        for (const cond of data.conditions || []) {
          const actualValue = String(variables[cond.variable] || "")
          let conditionMet = false

          switch (cond.operator) {
            case "equals":
              conditionMet = actualValue.toLowerCase() === cond.value.toLowerCase()
              break
            case "contains":
              conditionMet = actualValue.toLowerCase().includes(cond.value.toLowerCase())
              break
            case "startsWith":
              conditionMet = actualValue.toLowerCase().startsWith(cond.value.toLowerCase())
              break
            case "endsWith":
              conditionMet = actualValue.toLowerCase().endsWith(cond.value.toLowerCase())
              break
            case "greaterThan":
              conditionMet = Number(actualValue) > Number(cond.value)
              break
            case "lessThan":
              conditionMet = Number(actualValue) < Number(cond.value)
              break
          }

          if (conditionMet) {
            matched = true
            const next = findNextNode(node.id, cond.id)
            if (next) await executeNode(next, depth + 1)
            break
          }
        }

        if (!matched) {
          const defaultNext = findNextNode(node.id, "default")
          if (defaultNext) await executeNode(defaultNext, depth + 1)
        }
        break
      }

      case "api": {
        const data = node.data as any
        addBotMessage(`[API Call: ${data.method} ${interpolateText(data.url)}]`)
        
        // Mock API response
        setVariables((prev) => ({
          ...prev,
          [data.responseVariable]: { success: true, data: "mock_response" },
        }))

        const next = findNextNode(node.id)
        if (next) await executeNode(next, depth + 1)
        break
      }

      case "delay": {
        const data = node.data as any
        addBotMessage(`[Delay: ${data.duration} ${data.unit}]`)

        const next = findNextNode(node.id)
        if (next) await executeNode(next, depth + 1)
        break
      }

      case "ai": {
        const data = node.data as AiNodeData
        const mockResponse = `[AI Response from ${data.provider}/${data.model}]`
        
        setVariables((prev) => ({
          ...prev,
          [data.responseVariable]: mockResponse,
        }))

        addBotMessage(mockResponse, { sourceNodeId: node.id })

        const next = findNextNode(node.id)
        if (next) await executeNode(next, depth + 1)
        break
      }

      case "flow": {
        const data = node.data as FlowCallNodeData
        addBotMessage(`[Flow Call: ${data.targetFlowId || "Current"} -> ${data.targetNodeId || "Start"}]`)

        // In simulator, we can only jump within current flow
        if (data.targetFlowId === "_current" && data.targetNodeId) {
          const targetNode = nodes.find((n) => n.id === data.targetNodeId)
          if (targetNode) {
            await executeNode(targetNode, depth + 1)
          }
        } else {
          const next = findNextNode(node.id)
          if (next) await executeNode(next, depth + 1)
        }
        break
      }
    }
  }

  /**
   * Handle button click - EVENT DRIVEN
   * The button payload contains all info needed to route to the correct node
   */
  const handleButtonClick = async (button: { id: string; text: string; payload?: string }, sourceNodeId?: string) => {
    addUserMessage(button.text)
    
    // Update variables with button info
    setVariables((prev) => ({
      ...prev,
      user_input: button.id,
      user_input_text: button.text,
      button_id: button.id,
    }))

    setIsProcessing(true)

    // Find the target node from the edge
    const nodeId = sourceNodeId
    if (nodeId) {
      const targetNode = findTargetNode(nodeId, button.id)
      if (targetNode) {
        await executeNode(targetNode)
      }
    }

    setIsProcessing(false)
  }

  /**
   * Handle list item selection - EVENT DRIVEN
   */
  const handleListSelect = async (row: { id: string; title: string; payload?: string }, sourceNodeId?: string) => {
    setShowList(null)
    addUserMessage(row.title)

    setVariables((prev) => ({
      ...prev,
      user_input: row.id,
      user_input_text: row.title,
    }))

    setIsProcessing(true)

    if (sourceNodeId) {
      const targetNode = findTargetNode(sourceNodeId, row.id)
      if (targetNode) {
        await executeNode(targetNode)
      }
    }

    setIsProcessing(false)
  }

  /**
   * Handle text input - resumes getUserData flow or starts from beginning
   */
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return

    const userText = input.trim()
    setInput("")
    addUserMessage(userText)

    setIsProcessing(true)

    // Check if we're waiting for input from a getUserData node (using ref for sync access)
    const waitingInfo = waitingForInputRef.current
    if (waitingInfo?.waiting) {
      const currentNode = nodes.find(n => n.id === waitingInfo.nodeId)
      if (currentNode) {
        const { variableName, inputType, errorMessage, autoSkipEnabled, timeout } = waitingInfo
        
        // Validate input
        let isValid = true
        if (inputType === "number" && !/^\d+$/.test(userText)) {
          isValid = false
        } else if (inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userText)) {
          isValid = false
        } else if (inputType === "phone" && !/^[\d\s+\-()]+$/.test(userText)) {
          isValid = false
        }
        
        if (!isValid) {
          // Show error message and wait again
          addBotMessage(errorMessage, { sourceNodeId: currentNode.id })
          setIsProcessing(false)
          return
        }
        
        // Clear waiting state and cancel auto-skip timer
        waitingForInputRef.current = null
        if (autoSkipTimerRef.current) {
          clearTimeout(autoSkipTimerRef.current)
          autoSkipTimerRef.current = null
        }
        
        // Save the user input to the variable
        setVariables(prev => {
          const newVars = { ...prev }
          newVars[variableName] = userText
          delete newVars.__waiting_for_input
          delete newVars.__current_node_id
          return newVars
        })
        
        // Find and execute the next node
        // If auto-skip is enabled, use the "response" handle
        let nextNode: FlowNode | undefined
        if (autoSkipEnabled && timeout && timeout >= 10) {
          const responseEdge = edges.find(e => e.source === currentNode.id && e.sourceHandle === "response")
          if (responseEdge) {
            nextNode = nodes.find(n => n.id === responseEdge.target)
          }
        }
        // Fallback to default connection
        if (!nextNode) {
          nextNode = findNextNode(currentNode.id)
        }
        
        if (nextNode) {
          await executeNode(nextNode)
        }
        
        setIsProcessing(false)
        return
      }
    }

    // Normal flow - start from beginning
    setVariables((prev) => ({
      ...prev,
      user_input: userText,
    }))

    // Start from the beginning of the flow
    const startNode = nodes.find((n) => n.type === "start")
    if (startNode) {
      await executeNode(startNode)
    }

    setIsProcessing(false)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="flex h-full flex-col bg-[#0b141a]">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#202c33] px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884]">
          <Smartphone className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-white">Flow Simulator</p>
          <p className="text-xs text-[#8696a0]">Test your flow</p>
        </div>
        <Button variant="ghost" size="icon" onClick={reset} className="text-[#aebac1] hover:text-white hover:bg-[#374045]">
          <RotateCcw className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-[#aebac1] hover:text-white hover:bg-[#374045]">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Chat Background */}
      <div 
        className="flex-1 overflow-hidden"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='pattern' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 0L40 20L20 40L0 20Z' fill='%23182229' opacity='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='%230b141a'/%3E%3Crect width='100%25' height='100%25' fill='url(%23pattern)'/%3E%3C/svg%3E")`,
        }}
      >
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="flex flex-col gap-1 p-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-lg bg-[#182229] px-4 py-3 text-sm text-[#8696a0]">
                  Send a message to start testing your flow
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.type === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 shadow-sm",
                    msg.type === "user"
                      ? "bg-[#005c4b] text-white rounded-br-sm"
                      : "bg-[#202c33] text-[#e9edef] rounded-bl-sm"
                  )}
                >
                  {/* Media */}
                  {msg.mediaUrl && msg.mediaType === "image" && (
                    <div className="mb-2 overflow-hidden rounded-lg">
                      <img src={msg.mediaUrl} alt="" className="max-w-full" />
                    </div>
                  )}

                  {/* Cards with image and buttons */}
                  {msg.cards && msg.cards.map((card, idx) => (
                    <div key={idx} className="space-y-2">
                      {card.imageUrl && (
                        <div className="overflow-hidden rounded-lg">
                          <img src={card.imageUrl} alt="" className="max-w-full" />
                        </div>
                      )}
                      {card.title && <p className="font-medium">{card.title}</p>}
                      {card.description && <p className="text-sm opacity-80">{card.description}</p>}
                      {card.buttons && card.buttons.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {card.buttons.map((btn) => (
                            <Button
                              key={btn.id}
                              variant="outline"
                              size="sm"
                              className="w-full justify-center border-[#00a884] bg-transparent text-[#00a884] hover:bg-[#00a884]/10"
                              onClick={() => handleButtonClick(btn, msg.sourceNodeId)}
                              disabled={isProcessing}
                            >
                              {btn.text}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Text content */}
                  {msg.content && !msg.cards && (
                    <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                  )}

                  {/* Footer */}
                  {msg.footer && (
                    <p className="mt-1 text-xs text-[#8696a0]">{msg.footer}</p>
                  )}

                  {/* Buttons */}
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {msg.buttons.map((btn) => {
                        const btnType = (btn as { type?: string }).type || "reply"
                        return (
                          <Button
                            key={btn.id}
                            variant="outline"
                            size="sm"
                            className="w-full justify-center border-[#00a884] bg-transparent text-[#00a884] hover:bg-[#00a884]/10"
                            onClick={() => {
                              if (btnType === "url" && btn.payload) {
                                window.open(btn.payload, "_blank", "noopener,noreferrer")
                              } else if (btnType === "phone" && btn.payload) {
                                window.open(`tel:${btn.payload}`, "_self")
                              } else {
                                handleButtonClick(btn, msg.sourceNodeId)
                              }
                            }}
                            disabled={isProcessing && btnType === "reply"}
                          >
                            {btnType === "url" && <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                            {btnType === "phone" && <Phone className="mr-1.5 h-3.5 w-3.5" />}
                            {btn.text}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                  
                  {/* CTA URL Button */}
                  {msg.ctaUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full justify-center border-[#00a884] bg-transparent text-[#00a884] hover:bg-[#00a884]/10"
                      onClick={() => window.open(msg.ctaUrl!.url, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {msg.ctaUrl.text}
                    </Button>
                  )}

                  {/* List button */}
                  {msg.list && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full justify-center border-[#00a884] bg-transparent text-[#00a884] hover:bg-[#00a884]/10"
                      onClick={() => setShowList(msg)}
                      disabled={isProcessing}
                    >
                      {msg.list.buttonText}
                    </Button>
                  )}

                  {/* Timestamp and status */}
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-[#8696a0]">{formatTime(msg.timestamp)}</span>
                    {msg.type === "user" && (
                      <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[#202c33] px-4 py-3 rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* List Modal */}
      {showList && showList.list && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowList(null)}>
          <div className="w-full rounded-t-2xl bg-[#202c33] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">{showList.list.buttonText}</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowList(null)} className="text-[#8696a0]">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {showList.list.sections.map((section, sIdx) => (
                <div key={sIdx} className="mb-4">
                  {section.title && (
                    <p className="mb-2 text-xs font-medium uppercase text-[#00a884]">{section.title}</p>
                  )}
                  {section.rows.map((row) => (
                    <button
                      key={row.id}
                      className="w-full rounded-lg p-3 text-left hover:bg-[#374045] transition-colors"
                      onClick={() => handleListSelect(row, showList.sourceNodeId)}
                      disabled={isProcessing}
                    >
                      <p className="font-medium text-white">{row.title}</p>
                      {row.description && (
                        <p className="text-sm text-[#8696a0]">{row.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 bg-[#202c33] px-4 py-3">
        <div className="flex-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="border-0 bg-[#2a3942] text-white placeholder:text-[#8696a0] focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isProcessing}
          />
        </div>
        <Button
          size="icon"
          className="bg-[#00a884] hover:bg-[#00a884]/90"
          onClick={handleSend}
          disabled={isProcessing || !input.trim()}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
