"use client"

import { useState, useEffect } from "react"
import { X, Plus, Trash2, Upload, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useFlowStore } from "@/lib/stores/flow-store"
import { createClient } from "@/lib/supabase/client"
import type {
  FlowNode,
  MessageNodeData,
  ListNodeData,
  ConditionNodeData,
  ApiNodeData,
  DelayNodeData,
  AiNodeData,
  FlowCallNodeData,
  SetVariableNodeData,
  SetLabelNodeData,
  AiTriggerNodeData,
  AiChatNodeData,
  TransferToHumanNodeData,
  Flow,
  Label as LabelType,
} from "@/lib/types"
import { AI_PROVIDERS } from "@/lib/types"

export function NodePropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData, deleteNode, setSelectedNodeId } =
    useFlowStore()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">
        <p>Select a node to edit its properties</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-medium">{selectedNode.data.label}</h3>
          <p className="text-xs text-muted-foreground">{selectedNode.type}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedNodeId(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={selectedNode.data.label}
              onChange={(e) =>
                updateNodeData(selectedNode.id, { label: e.target.value })
              }
            />
          </div>

          <Separator />

          <NodeTypeProperties node={selectedNode} />

          {selectedNode.type !== "start" && (
            <>
              <Separator />
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  deleteNode(selectedNode.id)
                  setSelectedNodeId(null)
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Node
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NodeTypeProperties({ node }: { node: FlowNode }) {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)

  switch (node.type) {
    case "message":
      return <MessageProperties node={node} updateNodeData={updateNodeData} />
    case "list":
      return <ListProperties node={node} updateNodeData={updateNodeData} />
    case "condition":
      return <ConditionProperties node={node} updateNodeData={updateNodeData} />
    case "api":
      return <ApiProperties node={node} updateNodeData={updateNodeData} />
    case "delay":
      return <DelayProperties node={node} updateNodeData={updateNodeData} />
    case "ai":
      return <AiProperties node={node} updateNodeData={updateNodeData} />
  case "flow":
  return <FlowProperties node={node} updateNodeData={updateNodeData} />
  case "setVariable":
  return <SetVariableProperties node={node} updateNodeData={updateNodeData} />
  case "setLabel":
  return <SetLabelProperties node={node} updateNodeData={updateNodeData} />
    case "aiTrigger":
      return <AiTriggerProperties node={node} updateNodeData={updateNodeData} />
    case "aiChat":
      return <AiChatProperties node={node} updateNodeData={updateNodeData} />
    case "transferToHuman":
  return <TransferToHumanProperties node={node} updateNodeData={updateNodeData} />
  default:
  return null
  }
  }

function FileUploadField({
  value,
  onChange,
  onFileNameChange,
  accept,
  label,
}: {
  value: string
  onChange: (url: string) => void
  onFileNameChange?: (name: string) => void
  accept?: string
  label: string
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError(null)
    
    try {
      // Upload to Vercel Blob storage
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Upload failed")
      }

      const { url } = await response.json()
      onChange(url)
      onFileNameChange?.(file.name)
    } catch (error) {
      console.error("Upload failed:", error)
      setUploadError(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter URL or upload file..."
        />
        <div className="flex gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept={accept}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isUploading}
              onClick={() => {
                const input = document.querySelector(`input[accept="${accept}"]`) as HTMLInputElement
                input?.click()
              }}
            >
              <Upload className="mr-2 h-3 w-3" />
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </label>
        </div>
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
        {value && (value.startsWith("data:image") || value.startsWith("http")) && (
          <div className="relative h-20 w-full overflow-hidden rounded border bg-muted">
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function MessageProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<MessageNodeData>) => void
}) {
  const data = node.data as MessageNodeData
  const messageType = data.messageType || "text"
  const { variables } = useFlowStore()
  const [showNewVar, setShowNewVar] = useState(false)
  const [newVarName, setNewVarName] = useState("")

  // For user data variables
  const existingVars = Object.keys(variables || {})
  const commonVars = ["user_input", "user_name", "user_email", "user_phone", "user_choice"]
  const suggestedVars = [...new Set([...commonVars, ...existingVars])]

  const addNewVariable = () => {
    if (newVarName.trim()) {
      updateNodeData(node.id, { variableName: newVarName.trim() })
      setNewVarName("")
      setShowNewVar(false)
    }
  }

  // Card button handlers
  const addCardButton = () => {
    const newBtn = {
      id: `btn_${Date.now()}`,
      text: `Button ${(data.cardButtons?.length || 0) + 1}`,
      type: "reply" as const,
      payload: `button_${(data.cardButtons?.length || 0) + 1}`,
    }
    updateNodeData(node.id, { cardButtons: [...(data.cardButtons || []), newBtn] })
  }

  const removeCardButton = (id: string) => {
    updateNodeData(node.id, { cardButtons: data.cardButtons?.filter(b => b.id !== id) || [] })
  }

  const updateCardButton = (id: string, field: string, value: string) => {
    updateNodeData(node.id, {
      cardButtons: data.cardButtons?.map(b => b.id === id ? { ...b, [field]: value } : b),
    })
  }

  // Carousel card handlers
  const addCarouselCard = () => {
    const newCard = {
      id: `card_${Date.now()}`,
      title: `Card ${(data.carouselCards?.length || 0) + 1}`,
      description: "",
      buttons: [],
    }
    updateNodeData(node.id, { carouselCards: [...(data.carouselCards || []), newCard] })
  }

  const removeCarouselCard = (id: string) => {
    updateNodeData(node.id, { carouselCards: data.carouselCards?.filter(c => c.id !== id) || [] })
  }

  const updateCarouselCard = (id: string, field: string, value: unknown) => {
    updateNodeData(node.id, {
      carouselCards: data.carouselCards?.map(c => c.id === id ? { ...c, [field]: value } : c),
    })
  }

  return (
    <div className="space-y-4">
      {/* Message Type Selector */}
      <div className="space-y-2">
        <Label>Message Type</Label>
        <Select
          value={messageType}
          onValueChange={(value) => updateNodeData(node.id, { messageType: value as MessageNodeData["messageType"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="button">Button</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
            <SelectItem value="getUserData">Get User Data</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="gif">GIF</SelectItem>
            <SelectItem value="typing">Typing Indicator</SelectItem>
            <SelectItem value="file">File</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* TEXT MESSAGE */}
      {messageType === "text" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Header (optional)</Label>
              <span className="text-xs text-muted-foreground">{(data.header?.length || 0)}/60</span>
            </div>
            <Input
              value={data.header || ""}
              onChange={(e) => updateNodeData(node.id, { header: e.target.value.slice(0, 60) })}
              placeholder="Header text..."
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Message Text</Label>
              <span className="text-xs text-muted-foreground">{(data.text?.length || 0)}/4096</span>
            </div>
            <Textarea
              value={data.text || ""}
              onChange={(e) => updateNodeData(node.id, { text: e.target.value.slice(0, 4096) })}
              placeholder="Enter your message..."
              rows={4}
              maxLength={4096}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{variable}}"} to insert variables
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Footer (optional)</Label>
              <span className="text-xs text-muted-foreground">{(data.footer?.length || 0)}/60</span>
            </div>
            <Input
              value={data.footer || ""}
              onChange={(e) => updateNodeData(node.id, { footer: e.target.value.slice(0, 60) })}
              placeholder="Footer text..."
              maxLength={60}
            />
          </div>
        </div>
      )}

      {/* BUTTON MESSAGE */}
      {messageType === "button" && (() => {
        // Calculate button type counts for validation
        const replyCount = (data.buttons || []).filter(b => b.type === "reply").length
        const ctaCount = (data.buttons || []).filter(b => b.type === "url" || b.type === "phone").length
        const hasReply = replyCount > 0
        const hasCta = ctaCount > 0
        // WhatsApp rule: max 3 quick reply OR max 1 CTA, cannot mix
        const canAddReply = !hasCta && replyCount < 3
        const canAddCta = !hasReply && ctaCount < 1
        const canAddButton = canAddReply || canAddCta
        
        return (
        <div className="space-y-4">
          <div className="rounded-lg bg-purple-50 p-3 text-xs text-purple-800 border border-purple-200">
            <p className="font-medium mb-1">WhatsApp Button Rules:</p>
            <ul className="list-disc list-inside space-y-0.5 text-purple-700">
              <li><strong>Quick Reply</strong> - Up to 3 buttons, connects to nodes</li>
              <li><strong>URL/Phone</strong> - Only 1 CTA button allowed</li>
              <li className="text-red-600 font-medium">Cannot mix Quick Reply with URL/Phone</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Header (optional)</Label>
              <span className="text-xs text-muted-foreground">{(data.header?.length || 0)}/60</span>
            </div>
            <Input
              value={data.header || ""}
              onChange={(e) => updateNodeData(node.id, { header: e.target.value.slice(0, 60) })}
              placeholder="Header text..."
              maxLength={60}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Body Text</Label>
              <span className="text-xs text-muted-foreground">{(data.text?.length || 0)}/1024</span>
            </div>
            <Textarea
              value={data.text || ""}
              onChange={(e) => updateNodeData(node.id, { text: e.target.value.slice(0, 1024) })}
              placeholder="Message body..."
              rows={3}
              maxLength={1024}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Footer (optional)</Label>
              <span className="text-xs text-muted-foreground">{(data.footer?.length || 0)}/60</span>
            </div>
            <Input
              value={data.footer || ""}
              onChange={(e) => updateNodeData(node.id, { footer: e.target.value.slice(0, 60) })}
              placeholder="Footer text..."
              maxLength={60}
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Buttons {hasReply ? `(${replyCount}/3 Quick Reply)` : hasCta ? "(1/1 CTA)" : "(0)"}
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Default to reply if no buttons, or match existing type
                  const defaultType = hasCta ? "url" : "reply"
                  const newBtn = {
                    id: `btn_${Date.now()}`,
                    text: `Button ${(data.buttons?.length || 0) + 1}`,
                    type: defaultType as "reply" | "url" | "phone",
                    payload: defaultType === "reply" ? `button_${(data.buttons?.length || 0) + 1}` : "",
                  }
                  updateNodeData(node.id, { buttons: [...(data.buttons || []), newBtn] })
                }}
                disabled={!canAddButton}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            {!canAddButton && (data.buttons?.length || 0) > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                {hasCta ? "CTA buttons (URL/Phone) are limited to 1." : "Quick Reply buttons are limited to 3."}
              </p>
            )}
            
            {(data.buttons || []).map((btn, idx) => (
              <div key={btn.id} className="space-y-2 p-3 rounded-md border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Button {idx + 1}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => updateNodeData(node.id, { buttons: data.buttons?.filter(b => b.id !== btn.id) })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Button Text</Label>
                    <span className="text-[10px] text-muted-foreground">{btn.text.length}/20</span>
                  </div>
                  <Input
                    value={btn.text}
                    onChange={(e) => updateNodeData(node.id, {
                      buttons: data.buttons?.map(b => b.id === btn.id ? { ...b, text: e.target.value.slice(0, 20) } : b),
                    })}
                    placeholder="Button text"
                    className="h-8 text-sm"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Button Type</Label>
                  <Select
                    value={btn.type}
                    onValueChange={(val) => {
                      const newType = val as "reply" | "url" | "phone"
                      // When changing type, check if it would violate rules
                      const otherButtons = data.buttons?.filter(b => b.id !== btn.id) || []
                      const otherHasReply = otherButtons.some(b => b.type === "reply")
                      const otherHasCta = otherButtons.some(b => b.type === "url" || b.type === "phone")
                      
                      // Block mixing types
                      if (newType === "reply" && otherHasCta) return
                      if ((newType === "url" || newType === "phone") && otherHasReply) return
                      
                      updateNodeData(node.id, {
                        buttons: data.buttons?.map(b => b.id === btn.id ? { ...b, type: newType, payload: newType === "reply" ? btn.payload : "" } : b),
                      })
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply" disabled={hasCta && btn.type !== "reply"}>
                        Quick Reply (connects to node)
                      </SelectItem>
                      <SelectItem value="url" disabled={hasReply && btn.type !== "url" && btn.type !== "phone"}>
                        Open URL (opens website)
                      </SelectItem>
                      <SelectItem value="phone" disabled={hasReply && btn.type !== "url" && btn.type !== "phone"}>
                        Call Phone (makes call)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {btn.type !== "reply" && (
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {btn.type === "url" ? "Website URL" : "Phone Number"}
                    </Label>
                    <Input
                      value={btn.payload}
                      onChange={(e) => updateNodeData(node.id, {
                        buttons: data.buttons?.map(b => b.id === btn.id ? { ...b, payload: e.target.value } : b),
                      })}
                      placeholder={btn.type === "url" ? "https://example.com" : "+1234567890"}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {btn.type === "reply" && (
                  <p className="text-[10px] text-emerald-600">
                    Connect this button to a node on the canvas
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        )
      })()}

      {/* IMAGE MESSAGE */}
      {messageType === "image" && (
        <>
          <FileUploadField
            value={data.mediaUrl || ""}
            onChange={(url) => updateNodeData(node.id, { mediaUrl: url })}
            onFileNameChange={(name) => updateNodeData(node.id, { fileName: name })}
            accept="image/*"
            label="Image"
          />
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={data.caption || ""}
              onChange={(e) => updateNodeData(node.id, { caption: e.target.value })}
              placeholder="Image caption..."
              rows={2}
            />
          </div>
        </>
      )}

      {/* CARD MESSAGE (Image + Buttons) - Non-linear like button/list */}
      {messageType === "card" && (() => {
        // Calculate button type counts for validation (same as button message)
        const cardReplyCount = (data.cardButtons || []).filter(b => b.type === "reply").length
        const cardCtaCount = (data.cardButtons || []).filter(b => b.type === "url" || b.type === "phone").length
        const cardHasReply = cardReplyCount > 0
        const cardHasCta = cardCtaCount > 0
        const canAddCardReply = !cardHasCta && cardReplyCount < 3
        const canAddCardCta = !cardHasReply && cardCtaCount < 1
        const canAddCardButton = canAddCardReply || canAddCardCta
        
        return (
        <div className="space-y-4">
          <div className="rounded-lg bg-pink-50 p-3 text-xs text-pink-800 border border-pink-200">
            <p className="font-medium mb-1">WhatsApp Card Rules:</p>
            <ul className="list-disc list-inside space-y-0.5 text-pink-700">
              <li>Image header with text body and buttons</li>
              <li><strong>Quick Reply</strong> - Up to 3 buttons</li>
              <li><strong>URL/Phone</strong> - Only 1 CTA button</li>
              <li className="text-red-600 font-medium">Cannot mix Quick Reply with URL/Phone</li>
            </ul>
          </div>
          
          <FileUploadField
            value={data.cardImageUrl || ""}
            onChange={(url) => updateNodeData(node.id, { cardImageUrl: url })}
            accept="image/*"
            label="Card Image (Header)"
          />
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Body Text</Label>
              <span className="text-xs text-muted-foreground">{(data.text?.length || 0)}/1024</span>
            </div>
            <Textarea
              value={data.text || ""}
              onChange={(e) => updateNodeData(node.id, { text: e.target.value.slice(0, 1024) })}
              placeholder="Card description text..."
              rows={2}
              maxLength={1024}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Footer (optional)</Label>
              <span className="text-xs text-muted-foreground">{(data.footer?.length || 0)}/60</span>
            </div>
            <Input
              value={data.footer || ""}
              onChange={(e) => updateNodeData(node.id, { footer: e.target.value.slice(0, 60) })}
              placeholder="Footer text..."
              maxLength={60}
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Buttons {cardHasReply ? `(${cardReplyCount}/3 Quick Reply)` : cardHasCta ? "(1/1 CTA)" : "(0)"}
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const defaultType = cardHasCta ? "url" : "reply"
                  const newBtn = {
                    id: `btn_${Date.now()}`,
                    text: `Button ${(data.cardButtons?.length || 0) + 1}`,
                    type: defaultType as "reply" | "url" | "phone",
                    payload: defaultType === "reply" ? `button_${(data.cardButtons?.length || 0) + 1}` : "",
                  }
                  updateNodeData(node.id, { cardButtons: [...(data.cardButtons || []), newBtn] })
                }}
                disabled={!canAddCardButton}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            {!canAddCardButton && (data.cardButtons?.length || 0) > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                {cardHasCta ? "CTA buttons (URL/Phone) are limited to 1." : "Quick Reply buttons are limited to 3."}
              </p>
            )}
            
            {(data.cardButtons || []).map((btn, idx) => (
              <div key={btn.id} className="space-y-2 p-3 rounded-md border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Button {idx + 1}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeCardButton(btn.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Button Text</Label>
                    <span className="text-[10px] text-muted-foreground">{btn.text.length}/20</span>
                  </div>
                  <Input
                    value={btn.text}
                    onChange={(e) => updateCardButton(btn.id, "text", e.target.value.slice(0, 20))}
                    placeholder="Button text"
                    className="h-8 text-sm"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Button Type</Label>
                  <Select
                    value={btn.type}
                    onValueChange={(val) => {
                      const newType = val as "reply" | "url" | "phone"
                      const otherButtons = data.cardButtons?.filter(b => b.id !== btn.id) || []
                      const otherHasReply = otherButtons.some(b => b.type === "reply")
                      const otherHasCta = otherButtons.some(b => b.type === "url" || b.type === "phone")
                      
                      if (newType === "reply" && otherHasCta) return
                      if ((newType === "url" || newType === "phone") && otherHasReply) return
                      
                      updateCardButton(btn.id, "type", newType)
                      if (newType !== "reply") {
                        updateCardButton(btn.id, "payload", "")
                      }
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply" disabled={cardHasCta && btn.type !== "reply"}>
                        Quick Reply (connects to node)
                      </SelectItem>
                      <SelectItem value="url" disabled={cardHasReply && btn.type !== "url" && btn.type !== "phone"}>
                        Open URL (opens website)
                      </SelectItem>
                      <SelectItem value="phone" disabled={cardHasReply && btn.type !== "url" && btn.type !== "phone"}>
                        Call Phone (makes call)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {btn.type !== "reply" && (
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {btn.type === "url" ? "Website URL" : "Phone Number"}
                    </Label>
                    <Input
                      value={btn.payload}
                      onChange={(e) => updateCardButton(btn.id, "payload", e.target.value)}
                      placeholder={btn.type === "url" ? "https://example.com" : "+1234567890"}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {btn.type === "reply" && (
                  <p className="text-[10px] text-emerald-600">
                    Connect this button to a node on the canvas
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        )
      })()}

      {/* CAROUSEL MESSAGE */}
      {messageType === "carousel" && (
        <>
          <div className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800 border border-orange-200">
            <p className="font-medium mb-1">Carousel Info:</p>
            <ul className="list-disc list-inside space-y-0.5 text-orange-700">
              <li>Up to 10 cards, each with image + title + buttons</li>
              <li>All cards must have same button structure</li>
              <li>Requires WhatsApp template approval</li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cards ({data.carouselCards?.length || 0}/10)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addCarouselCard}
                disabled={(data.carouselCards?.length || 0) >= 10}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Card
              </Button>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {(data.carouselCards || []).map((card, idx) => (
                <AccordionItem key={card.id} value={card.id}>
                  <AccordionTrigger className="text-sm py-2">
                    <div className="flex items-center gap-2">
                      <span>Card {idx + 1}</span>
                      {card.title && <span className="text-muted-foreground">- {card.title}</span>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <FileUploadField
                      value={card.imageUrl || ""}
                      onChange={(url) => updateCarouselCard(card.id, "imageUrl", url)}
                      accept="image/*"
                      label="Card Image"
                    />
                    <div className="space-y-1">
                      <Label className="text-xs">Title</Label>
                      <Input
                        value={card.title}
                        onChange={(e) => updateCarouselCard(card.id, "title", e.target.value)}
                        placeholder="Card title"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={card.description || ""}
                        onChange={(e) => updateCarouselCard(card.id, "description", e.target.value)}
                        placeholder="Card description"
                        rows={2}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeCarouselCard(card.id)}
                      className="w-full"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Remove Card
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </>
      )}

      {/* GET USER DATA (merged from UserInput) */}
      {messageType === "getUserData" && (
        <>
          <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
            <p className="font-medium mb-1">How it works:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-emerald-700">
              <li>Bot sends the prompt message</li>
              <li>Bot waits for user reply</li>
              <li>Reply is validated and saved to variable</li>
              <li>Flow continues to the <strong>Response</strong> connection</li>
            </ol>
            <p className="mt-2 text-emerald-600 text-[10px]">
              Enable timeout to auto-skip if user doesn&apos;t respond.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Prompt Message</Label>
            <Textarea
              value={data.prompt || ""}
              onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
              placeholder="Please enter your name..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Save Response To</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowNewVar(!showNewVar)}
              >
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </div>
            
            {showNewVar && (
              <div className="flex gap-2">
                <Input
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
                  placeholder="variable_name"
                  className="flex-1"
                />
                <Button size="sm" onClick={addNewVariable}>Add</Button>
              </div>
            )}

            <Select
              value={data.variableName || ""}
              onValueChange={(val) => updateNodeData(node.id, { variableName: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select variable..." />
              </SelectTrigger>
              <SelectContent>
                {suggestedVars.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Expected Input Type</Label>
            <Select
              value={data.inputType || "any"}
              onValueChange={(val) => updateNodeData(node.id, { inputType: val as MessageNodeData["inputType"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Text</SelectItem>
                <SelectItem value="text">Text Only</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Validation Error Message</Label>
            <Input
              value={data.errorMessage || ""}
              onChange={(e) => updateNodeData(node.id, { errorMessage: e.target.value })}
              placeholder="Please enter a valid value"
            />
          </div>

          {/* Auto-skip / Timeout Settings */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoSkipEnabled"
                checked={data.autoSkipEnabled || false}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Enable with default 30 seconds
                    updateNodeData(node.id, { 
                      autoSkipEnabled: true,
                      timeoutValue: 30,
                      timeoutUnit: "seconds",
                      timeout: 30
                    })
                  } else {
                    // Disable and clear timeout
                    updateNodeData(node.id, { 
                      autoSkipEnabled: false,
                      timeoutValue: 0,
                      timeout: 0
                    })
                  }
                }}
              />
              <div>
                <Label htmlFor="autoSkipEnabled" className="cursor-pointer">Enable Auto-Skip</Label>
                <p className="text-[10px] text-muted-foreground">Automatically continue if user doesn&apos;t respond</p>
              </div>
            </div>
            
            {data.autoSkipEnabled && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">After:</Label>
                  <Input
                    type="number"
                    min={data.timeoutUnit === "seconds" ? 10 : 1}
                    max={data.timeoutUnit === "hours" ? 24 : data.timeoutUnit === "minutes" ? 1440 : 86400}
                    value={data.timeoutValue || 30}
                    onChange={(e) => {
                      let value = parseInt(e.target.value) || 10
                      const unit = data.timeoutUnit || "seconds"
                      // Enforce minimum 10 seconds
                      const multiplier = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1
                      const minValue = unit === "seconds" ? 10 : 1
                      if (value < minValue) value = minValue
                      updateNodeData(node.id, { 
                        timeoutValue: value,
                        timeout: value * multiplier 
                      })
                    }}
                    className="w-20 h-8"
                  />
                  <Select
                    value={data.timeoutUnit || "seconds"}
                    onValueChange={(unit) => {
                      let value = data.timeoutValue || 30
                      const multiplier = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1
                      // Ensure minimum 10 seconds total
                      if (unit === "seconds" && value < 10) value = 10
                      updateNodeData(node.id, { 
                        timeoutUnit: unit,
                        timeoutValue: value,
                        timeout: value * multiplier 
                      })
                    }}
                  >
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seconds">Seconds</SelectItem>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {(data.timeout || 0) < 10 && (
                  <p className="text-xs text-red-600">Minimum timeout is 10 seconds</p>
                )}
                
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                  <p className="font-medium mb-1">Auto-Skip Enabled</p>
                  <p className="text-amber-700">
                    Connect the <strong>&quot;Skip&quot;</strong> handle to the next node.
                    If no response is received within the timeout, flow continues via Skip.
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* VIDEO MESSAGE */}
      {messageType === "video" && (
        <>
          <FileUploadField
            value={data.mediaUrl || ""}
            onChange={(url) => updateNodeData(node.id, { mediaUrl: url })}
            onFileNameChange={(name) => updateNodeData(node.id, { fileName: name })}
            accept="video/*"
            label="Video File"
          />
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={data.caption || ""}
              onChange={(e) => updateNodeData(node.id, { caption: e.target.value })}
              placeholder="Video caption..."
              rows={2}
            />
          </div>
        </>
      )}

      {/* GIF MESSAGE */}
      {messageType === "gif" && (
        <>
          <FileUploadField
            value={data.mediaUrl || ""}
            onChange={(url) => updateNodeData(node.id, { mediaUrl: url })}
            onFileNameChange={(name) => updateNodeData(node.id, { fileName: name })}
            accept="image/gif"
            label="GIF File"
          />
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={data.caption || ""}
              onChange={(e) => updateNodeData(node.id, { caption: e.target.value })}
              placeholder="GIF caption..."
              rows={2}
            />
          </div>
        </>
      )}

      {/* TYPING INDICATOR */}
      {messageType === "typing" && (
        <>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 border border-gray-200">
            <p className="font-medium mb-1">Typing Indicator:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Shows "typing..." status in WhatsApp</li>
              <li>Works when responding to a user message</li>
              <li>Auto-dismisses when message is sent or after 25s</li>
              <li>Use to simulate natural typing delay</li>
            </ul>
          </div>
          <div className="space-y-2">
            <Label>Wait Duration (seconds)</Label>
            <Input
              type="number"
              min={1}
              max={25}
              value={data.typingDuration || 3}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 3
                updateNodeData(node.id, { typingDuration: Math.min(25, Math.max(1, val)) })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Bot will show typing, wait this duration, then continue to next node.
              Max 25 seconds (WhatsApp limit).
            </p>
          </div>
        </>
      )}

      {/* FILE MESSAGE */}
      {messageType === "file" && (
        <>
          <FileUploadField
            value={data.mediaUrl || ""}
            onChange={(url) => updateNodeData(node.id, { mediaUrl: url })}
            onFileNameChange={(name) => updateNodeData(node.id, { fileName: name })}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            label="Document"
          />
          <div className="space-y-2">
            <Label>File Name (shown to user)</Label>
            <Input
              value={data.fileName || ""}
              onChange={(e) => updateNodeData(node.id, { fileName: e.target.value })}
              placeholder="document.pdf"
            />
          </div>
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={data.caption || ""}
              onChange={(e) => updateNodeData(node.id, { caption: e.target.value })}
              placeholder="Here's the document you requested..."
              rows={2}
            />
          </div>
        </>
      )}
    </div>
  )
}

function ListProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<ListNodeData>) => void
}) {
  const data = node.data as ListNodeData

  const addSection = () => {
    const newSection = {
      title: `Section ${(data.sections?.length || 0) + 1}`,
      rows: [{ id: `row_${Date.now()}`, title: "Item 1", description: "" }],
    }
    updateNodeData(node.id, {
      sections: [...(data.sections || []), newSection],
    })
  }

  const addRow = (sectionIndex: number) => {
    const sections = [...(data.sections || [])]
    sections[sectionIndex].rows.push({
      id: `row_${Date.now()}`,
      title: `Item ${sections[sectionIndex].rows.length + 1}`,
      description: "",
    })
    updateNodeData(node.id, { sections })
  }

  const removeRow = (sectionIndex: number, rowIndex: number) => {
    const sections = [...(data.sections || [])]
    sections[sectionIndex].rows.splice(rowIndex, 1)
    updateNodeData(node.id, { sections })
  }

  const removeSection = (sectionIndex: number) => {
    const sections = [...(data.sections || [])]
    sections.splice(sectionIndex, 1)
    updateNodeData(node.id, { sections })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Header Text</Label>
        <Input
          value={data.headerText || ""}
          onChange={(e) => updateNodeData(node.id, { headerText: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Body Text</Label>
        <Textarea
          value={data.bodyText || ""}
          onChange={(e) => updateNodeData(node.id, { bodyText: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Footer (optional)</Label>
        <Input
          value={data.footer || ""}
          onChange={(e) => updateNodeData(node.id, { footer: e.target.value })}
          placeholder="Footer text..."
        />
      </div>
      <div className="space-y-2">
        <Label>Button Text</Label>
        <Input
          value={data.buttonText || ""}
          onChange={(e) => updateNodeData(node.id, { buttonText: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Sections</Label>
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="mr-1 h-3 w-3" />
            Add Section
          </Button>
        </div>
        {data.sections?.map((section, sIdx) => (
          <div key={sIdx} className="space-y-2 rounded border p-2">
            <div className="flex items-center justify-between">
              <Input
                placeholder="Section title"
                value={section.title}
                onChange={(e) => {
                  const sections = [...(data.sections || [])]
                  sections[sIdx].title = e.target.value
                  updateNodeData(node.id, { sections })
                }}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 ml-2"
                onClick={() => removeSection(sIdx)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {section.rows.map((row, rIdx) => (
              <div key={row.id} className="ml-2 space-y-1 border-l pl-2">
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="Item title"
                    value={row.title}
                    onChange={(e) => {
                      const sections = [...(data.sections || [])]
                      sections[sIdx].rows[rIdx].title = e.target.value
                      updateNodeData(node.id, { sections })
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRow(sIdx, rIdx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  placeholder="Description"
                  value={row.description || ""}
                  onChange={(e) => {
                    const sections = [...(data.sections || [])]
                    sections[sIdx].rows[rIdx].description = e.target.value
                    updateNodeData(node.id, { sections })
                  }}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => addRow(sIdx)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Item
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConditionProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<ConditionNodeData>) => void
}) {
  const data = node.data as ConditionNodeData

  const addCondition = () => {
    const newCond = {
      id: `cond_${Date.now()}`,
      type: "variable" as const,
      variable: "user_input",
      operator: "equals" as const,
      value: "",
    }
    updateNodeData(node.id, {
      conditions: [...(data.conditions || []), newCond],
    })
  }

  const removeCondition = (condId: string) => {
    updateNodeData(node.id, {
      conditions: data.conditions?.filter((c) => c.id !== condId) || [],
    })
  }

  const getOperatorsForType = (type: string) => {
    if (type === "tag") {
      return [
        { value: "hasTag", label: "Has Tag" },
        { value: "notHasTag", label: "Does Not Have Tag" },
      ]
    }
    if (type === "contact") {
      return [
        { value: "equals", label: "Equals" },
        { value: "contains", label: "Contains" },
        { value: "isEmpty", label: "Is Empty" },
        { value: "isNotEmpty", label: "Is Not Empty" },
      ]
    }
    // Variable type
    return [
      { value: "equals", label: "Equals" },
      { value: "contains", label: "Contains" },
      { value: "startsWith", label: "Starts With" },
      { value: "endsWith", label: "Ends With" },
      { value: "regex", label: "Regex" },
      { value: "greaterThan", label: "Greater Than" },
      { value: "lessThan", label: "Less Than" },
      { value: "isEmpty", label: "Is Empty" },
      { value: "isNotEmpty", label: "Is Not Empty" },
    ]
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Conditions</Label>
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
      {data.conditions?.map((cond, idx) => (
        <div key={cond.id} className="space-y-2 rounded border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Condition {idx + 1}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => removeCondition(cond.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Condition Type Selector */}
          <Select
            value={cond.type || "variable"}
            onValueChange={(value) => {
              const conditions = [...(data.conditions || [])]
              conditions[idx] = {
                ...conditions[idx],
                type: value as "variable" | "tag" | "contact",
                operator: value === "tag" ? "hasTag" : "equals",
                variable: value === "variable" ? (cond.variable || "user_input") : "",
                tag: value === "tag" ? "" : undefined,
                contactField: value === "contact" ? "name" : undefined,
              }
              updateNodeData(node.id, { conditions })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="variable">Variable</SelectItem>
              <SelectItem value="tag">Tag</SelectItem>
              <SelectItem value="contact">Contact Field</SelectItem>
            </SelectContent>
          </Select>

          {/* Variable Input - show for variable type */}
          {(cond.type === "variable" || !cond.type) && (
            <Input
              placeholder="Variable name"
              value={cond.variable}
              onChange={(e) => {
                const conditions = [...(data.conditions || [])]
                conditions[idx].variable = e.target.value
                updateNodeData(node.id, { conditions })
              }}
            />
          )}

          {/* Tag Input - show for tag type */}
          {cond.type === "tag" && (
            <Input
              placeholder="Tag name"
              value={cond.tag || ""}
              onChange={(e) => {
                const conditions = [...(data.conditions || [])]
                conditions[idx].tag = e.target.value
                updateNodeData(node.id, { conditions })
              }}
            />
          )}

          {/* Contact Field Selector - show for contact type */}
          {cond.type === "contact" && (
            <Select
              value={cond.contactField || "name"}
              onValueChange={(value) => {
                const conditions = [...(data.conditions || [])]
                conditions[idx].contactField = value as "name" | "phone" | "created_at" | "tags"
                updateNodeData(node.id, { conditions })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="created_at">Created At</SelectItem>
                <SelectItem value="tags">Tags (count)</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Operator Selector */}
          <Select
            value={cond.operator}
            onValueChange={(value) => {
              const conditions = [...(data.conditions || [])]
              conditions[idx].operator = value as ConditionNodeData["conditions"][0]["operator"]
              updateNodeData(node.id, { conditions })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getOperatorsForType(cond.type || "variable").map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value Input - hide for isEmpty/isNotEmpty/hasTag/notHasTag when tag is already specified */}
          {!["isEmpty", "isNotEmpty"].includes(cond.operator) && 
           !(cond.type === "tag" && ["hasTag", "notHasTag"].includes(cond.operator)) && (
            <Input
              placeholder="Value"
              value={cond.value}
              onChange={(e) => {
                const conditions = [...(data.conditions || [])]
                conditions[idx].value = e.target.value
                updateNodeData(node.id, { conditions })
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ApiProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<ApiNodeData>) => void
}) {
  const data = node.data as ApiNodeData

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Method</Label>
        <Select
          value={data.method}
          onValueChange={(value) =>
            updateNodeData(node.id, { method: value as ApiNodeData["method"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>URL</Label>
        <Input
          value={data.url || ""}
          onChange={(e) => updateNodeData(node.id, { url: e.target.value })}
          placeholder="https://api.example.com/..."
        />
      </div>
      {["POST", "PUT", "PATCH"].includes(data.method) && (
        <div className="space-y-2">
          <Label>Request Body (JSON)</Label>
          <Textarea
            value={data.body || ""}
            onChange={(e) => updateNodeData(node.id, { body: e.target.value })}
            placeholder='{"key": "value"}'
            rows={4}
            className="font-mono text-xs"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Response Variable</Label>
        <Input
          value={data.responseVariable || ""}
          onChange={(e) =>
            updateNodeData(node.id, { responseVariable: e.target.value })
          }
          placeholder="api_response"
        />
      </div>
    </div>
  )
}

function DelayProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<DelayNodeData>) => void
}) {
  const data = node.data as DelayNodeData

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Duration</Label>
        <Input
          type="number"
          min={1}
          value={data.duration || 1}
          onChange={(e) =>
            updateNodeData(node.id, { duration: parseInt(e.target.value) || 1 })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Unit</Label>
        <Select
          value={data.unit}
          onValueChange={(value) =>
            updateNodeData(node.id, { unit: value as DelayNodeData["unit"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">Seconds</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function AiProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<AiNodeData>) => void
}) {
  const data = node.data as AiNodeData
  const { variables } = useFlowStore()
  const existingVars = Object.keys(variables || {})

  return (
    <div className="space-y-4">
      {/* How it works info */}
      <div className="rounded-lg bg-violet-50 p-3 text-xs text-violet-800 border border-violet-200">
        <p className="font-medium mb-1">How AI Response Works:</p>
        <ol className="list-decimal list-inside space-y-1 text-violet-700">
          <li>Takes user prompt (can include variables)</li>
          <li>Sends to AI with system prompt context</li>
          <li>AI generates a response</li>
          <li><strong>Automatically sends response to user</strong></li>
          <li>Saves response to variable for later use</li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label>AI Provider</Label>
        <Select
          value={data.provider}
          onValueChange={(value) =>
            updateNodeData(node.id, {
              provider: value as AiNodeData["provider"],
              model: AI_PROVIDERS[value as keyof typeof AI_PROVIDERS].models[0].id,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
              <SelectItem key={key} value={key}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>Model</Label>
        <Select
          value={data.model}
          onValueChange={(value) => updateNodeData(node.id, { model: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS[data.provider]?.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={data.systemPrompt || ""}
          onChange={(e) =>
            updateNodeData(node.id, { systemPrompt: e.target.value })
          }
          placeholder="You are a helpful customer service assistant..."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Instructions that define how the AI should behave
        </p>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>User Prompt Template</Label>
        </div>
        <Textarea
          value={data.userPromptTemplate || ""}
          onChange={(e) =>
            updateNodeData(node.id, { userPromptTemplate: e.target.value })
          }
          placeholder="{{user_input}}"
          rows={2}
        />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Use variables to include dynamic data:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <code 
              className="bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/80"
              onClick={() => updateNodeData(node.id, { 
                userPromptTemplate: (data.userPromptTemplate || "") + "{{user_input}}" 
              })}
            >
              {"{{user_input}}"}
            </code>
            {existingVars.filter(v => v !== "user_input").slice(0, 3).map(v => (
              <code 
                key={v}
                className="bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/80"
                onClick={() => updateNodeData(node.id, { 
                  userPromptTemplate: (data.userPromptTemplate || "") + `{{${v}}}` 
                })}
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label>Save Response To Variable</Label>
        <Input
          value={data.responseVariable || ""}
          onChange={(e) =>
            updateNodeData(node.id, { responseVariable: e.target.value })
          }
          placeholder="ai_response"
        />
        <p className="text-xs text-muted-foreground">
          Access later using: <code className="bg-muted px-1 rounded">{`{{${data.responseVariable || "ai_response"}}}`}</code>
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label>Temperature</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={data.temperature || 0.7}
            onChange={(e) =>
              updateNodeData(node.id, { temperature: parseFloat(e.target.value) })
            }
          />
          <p className="text-[10px] text-muted-foreground">0 = precise, 2 = creative</p>
        </div>
        <div className="space-y-2">
          <Label>Max Tokens</Label>
          <Input
            type="number"
            min={1}
            max={4000}
            value={data.maxTokens || 500}
            onChange={(e) =>
              updateNodeData(node.id, { maxTokens: parseInt(e.target.value) })
            }
          />
          <p className="text-[10px] text-muted-foreground">Response length limit</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label>Fallback Message</Label>
        <Textarea
          value={data.fallbackMessage || ""}
          onChange={(e) =>
            updateNodeData(node.id, { fallbackMessage: e.target.value })
          }
          placeholder="Sorry, I couldn't process your request. Please try again later."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Message sent to user if AI generation fails (e.g., API error, rate limit)
        </p>
      </div>
    </div>
  )
}

function FlowProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<FlowCallNodeData>) => void
}) {
  const data = node.data as FlowCallNodeData
  const [flows, setFlows] = useState<Flow[]>([])
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const currentNodes = useFlowStore((state) => state.nodes)

  useEffect(() => {
    const fetchFlows = async () => {
      const supabase = createClient()
      const { data: flowsData } = await supabase
        .from("flows")
        .select("id, name, nodes")
        .order("name")

      if (flowsData) {
        setFlows(flowsData as Flow[])
        if (data.targetFlowId) {
          const found = flowsData.find((f) => f.id === data.targetFlowId)
          if (found) setSelectedFlow(found as Flow)
        }
      }
    }
    fetchFlows()
  }, [data.targetFlowId])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Target Flow</Label>
        <Select
          value={data.targetFlowId || ""}
          onValueChange={(value) => {
            updateNodeData(node.id, { targetFlowId: value, targetNodeId: "" })
            const found = flows.find((f) => f.id === value)
            setSelectedFlow(found || null)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a flow..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_current">Current Flow</SelectItem>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Jump to Node (optional)</Label>
        <Select
          value={data.targetNodeId || "_start"}
          onValueChange={(value) =>
            updateNodeData(node.id, { targetNodeId: value === "_start" ? "" : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Start from beginning" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_start">Start from beginning</SelectItem>
            {(data.targetFlowId === "_current" ? currentNodes : selectedFlow?.nodes || [])
              .filter((n: FlowNode) => n.type !== "start")
              .map((n: FlowNode) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.data.label} ({n.type})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Optionally jump directly to a specific node
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Pass Variables</Label>
          <p className="text-xs text-muted-foreground">
            Share current variables with target flow
          </p>
        </div>
        <Switch
          checked={data.passVariables}
          onCheckedChange={(checked) =>
            updateNodeData(node.id, { passVariables: checked })
          }
        />
      </div>
    </div>
  )
}

function SetVariableProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (id: string, data: Partial<SetVariableNodeData>) => void
}) {
  const data = node.data as SetVariableNodeData
  const [newVarName, setNewVarName] = useState("")
  const [existingVariables, setExistingVariables] = useState<string[]>([])

  // Common flow variables
  const commonVariables = [
    "user_input",
    "user_name",
    "user_phone",
    "ai_response",
    "api_response",
    "selected_option",
    "counter",
    "total",
    "status",
  ]

  // Merge common variables with any existing ones
  useEffect(() => {
    // In a real implementation, you might fetch used variables from the flow
    setExistingVariables(commonVariables)
  }, [])

  const handleCreateVariable = () => {
    if (!newVarName.trim()) return
    const varName = newVarName.trim().replace(/\s+/g, "_").toLowerCase()
    updateNodeData(node.id, { 
      variableName: varName, 
      isNewVariable: true 
    })
    setNewVarName("")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Action</Label>
        <Select
          value={data.action || "set"}
          onValueChange={(value) =>
            updateNodeData(node.id, { action: value as SetVariableNodeData["action"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="set">Set Value</SelectItem>
            <SelectItem value="clear">Clear Value</SelectItem>
            <SelectItem value="append">Append to Value</SelectItem>
            <SelectItem value="increment">Increment (numbers)</SelectItem>
            <SelectItem value="decrement">Decrement (numbers)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {data.action === "set" && "Set the variable to a specific value"}
          {data.action === "clear" && "Clear/reset the variable value"}
          {data.action === "append" && "Append text to the existing value"}
          {data.action === "increment" && "Add a number to the variable"}
          {data.action === "decrement" && "Subtract a number from the variable"}
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Select Variable</Label>
        <Select
          value={data.variableName || ""}
          onValueChange={(value) => {
            if (value === "__new__") {
              // Don't set anything, user will create new
              return
            }
            updateNodeData(node.id, { variableName: value, isNewVariable: false })
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a variable..." />
          </SelectTrigger>
          <SelectContent>
            {existingVariables.map((varName) => (
              <SelectItem key={varName} value={varName}>
                <code className="text-xs">{varName}</code>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Or create new variable</Label>
        <div className="flex gap-2">
          <Input
            value={newVarName}
            onChange={(e) => setNewVarName(e.target.value)}
            placeholder="new_variable_name"
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreateVariable()
              }
            }}
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCreateVariable}
            disabled={!newVarName.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {data.variableName && (
        <div className="p-2 rounded-md bg-muted/50">
          <span className="text-xs text-muted-foreground">Selected: </span>
          <code className="text-sm font-medium">{data.variableName}</code>
          {data.isNewVariable && (
            <span className="ml-2 text-xs text-amber-600">(new)</span>
          )}
        </div>
      )}

      {/* Value input - shown for set, append, increment, decrement */}
      {data.action !== "clear" && (
        <>
          <Separator />
          
          <div className="space-y-2">
            <Label>
              {data.action === "set" && "Value"}
              {data.action === "append" && "Text to Append"}
              {data.action === "increment" && "Increment By"}
              {data.action === "decrement" && "Decrement By"}
            </Label>
            <Textarea
              value={data.value || ""}
              onChange={(e) => updateNodeData(node.id, { value: e.target.value })}
              placeholder={
                data.action === "increment" || data.action === "decrement" 
                  ? "1" 
                  : "Enter value or use {{variable}} for interpolation"
              }
              rows={data.action === "increment" || data.action === "decrement" ? 1 : 3}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{variable_name}}"} to reference other variables
            </p>
          </div>

          {/* Value type hint */}
          <div className="space-y-2">
            <Label>Value Type</Label>
            <Select
              value={data.valueType || "string"}
              onValueChange={(value) =>
                updateNodeData(node.id, { valueType: value as SetVariableNodeData["valueType"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean (true/false)</SelectItem>
                <SelectItem value="json">JSON Object</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  )
}

// SetLabel properties panel
function SetLabelProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (nodeId: string, data: Partial<SetLabelNodeData>) => void
}) {
  const data = node.data as SetLabelNodeData
  const [labels, setLabels] = useState<LabelType[]>([])
  const [newLabelName, setNewLabelName] = useState(data.newLabelName || "")
  const [newLabelColor, setNewLabelColor] = useState(data.newLabelColor || "#6366f1")
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // Fetch existing labels
  useEffect(() => {
    const fetchLabels = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: labelsData } = await supabase
        .from("labels")
        .select("*")
        .eq("user_id", user.id)
        .order("name")

      if (labelsData) {
        setLabels(labelsData)
      }
    }
    fetchLabels()
  }, [])

  const toggleLabel = (labelId: string) => {
    const currentIds = data.labelIds || []
    const newIds = currentIds.includes(labelId)
      ? currentIds.filter(id => id !== labelId)
      : [...currentIds, labelId]
    updateNodeData(node.id, { labelIds: newIds })
  }

  const handleCreateNewLabel = async () => {
    if (!newLabelName.trim()) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: newLabel, error } = await supabase
      .from("labels")
      .insert({
        user_id: user.id,
        name: newLabelName.trim(),
        color: newLabelColor,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating label:", error)
      return
    }

    if (newLabel) {
      setLabels([...labels, newLabel])
      // Auto-select the new label
      const currentIds = data.labelIds || []
      updateNodeData(node.id, { 
        labelIds: [...currentIds, newLabel.id],
        newLabelName: undefined,
        newLabelColor: undefined,
      })
      setNewLabelName("")
      setIsCreatingNew(false)
    }
  }

  const colorOptions = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#14b8a6", // teal
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#6b7280", // gray
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Action</Label>
        <Select
          value={data.action || "add"}
          onValueChange={(value) =>
            updateNodeData(node.id, { action: value as SetLabelNodeData["action"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add Labels</SelectItem>
            <SelectItem value="remove">Remove Labels</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {data.action === "add" && "Add these labels to the contact"}
          {data.action === "remove" && "Remove these labels from the contact"}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Select Labels</Label>
        <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              No labels yet. Create one below.
            </p>
          ) : (
            labels.map((label) => (
              <div
                key={label.id}
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  (data.labelIds || []).includes(label.id)
                    ? "bg-primary/10 border border-primary"
                    : "hover:bg-muted border border-transparent"
                }`}
                onClick={() => toggleLabel(label.id)}
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-sm flex-1">{label.name}</span>
                {(data.labelIds || []).includes(label.id) && (
                  <span className="text-xs text-primary">Selected</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Create New Label</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCreatingNew(!isCreatingNew)}
          >
            {isCreatingNew ? "Cancel" : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {isCreatingNew && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-md">
            <div className="space-y-1">
              <Label className="text-xs">Label Name</Label>
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="e.g., VIP Customer"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      newLabelColor === color
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewLabelColor(color)}
                  />
                ))}
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleCreateNewLabel}
              disabled={!newLabelName.trim()}
              className="w-full"
            >
              Create Label
            </Button>
          </div>
        )}
      </div>

      {/* Preview selected labels */}
      {(data.labelIds?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Selected Labels Preview</Label>
          <div className="flex flex-wrap gap-1">
            {(data.labelIds || []).map((labelId) => {
              const label = labels.find(l => l.id === labelId)
              if (!label) return null
              return (
                <span
                  key={labelId}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                  <button
                    onClick={() => toggleLabel(labelId)}
                    className="hover:opacity-75"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// AI Trigger properties panel
function AiTriggerProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (nodeId: string, data: Partial<AiTriggerNodeData>) => void
}) {
  const data = node.data as AiTriggerNodeData
  const [newVariable, setNewVariable] = useState("")
  const [flows, setFlows] = useState<Flow[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const nodes = useFlowStore((state) => state.nodes)
  
  // Extract existing variables from all nodes
  const existingVariables = Array.from(
    new Set(
      nodes.flatMap((n) => {
        const nodeData = n.data as Record<string, unknown>
        const vars: string[] = []
        if (nodeData.variableName) vars.push(String(nodeData.variableName))
        if (nodeData.responseVariable) vars.push(String(nodeData.responseVariable))
        if (nodeData.inputVariable) vars.push(String(nodeData.inputVariable))
        return vars
      })
    )
  ).filter(Boolean)
  
  // Fetch available flows
  useEffect(() => {
    const fetchFlows = async () => {
      const supabase = createClient()
      const { data: flowsData } = await supabase
        .from("flows")
        .select("id, name, description")
        .order("name")
      
      if (flowsData) {
        setFlows(flowsData as Flow[])
      }
    }
    fetchFlows()
  }, [])
  
  const filteredFlows = flows.filter(flow => 
    flow.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  // Generate default description for a flow
  const getDefaultDescription = (flowName: string) => {
    return `Match this flow when user input:
- Directly mentions or asks about "${flowName}"
- Contains keywords related to "${flowName}"
- Appears to be "${flowName}" with spelling errors or typos
- Shows intent related to what "${flowName}" handles`
  }
  
  // Toggle flow selection
  const toggleFlow = (flow: Flow) => {
    const currentFlows = data.targetFlows || []
    const exists = currentFlows.find(f => f.flowId === flow.id)
    
    if (exists) {
      updateNodeData(node.id, {
        targetFlows: currentFlows.filter(f => f.flowId !== flow.id)
      })
    } else {
      updateNodeData(node.id, {
        targetFlows: [
          ...currentFlows,
          { flowId: flow.id, flowName: flow.name, description: getDefaultDescription(flow.name) }
        ]
      })
    }
  }
  
  // Update flow description
  const updateFlowDescription = (flowId: string, description: string) => {
    const currentFlows = data.targetFlows || []
    updateNodeData(node.id, {
      targetFlows: currentFlows.map(f => 
        f.flowId === flowId ? { ...f, description } : f
      )
    })
  }
  
  // Add new variable
  const addNewVariable = () => {
    if (newVariable && !existingVariables.includes(newVariable)) {
      updateNodeData(node.id, { inputVariable: newVariable })
      setNewVariable("")
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Provider Selection */}
      <div className="space-y-2">
        <Label>AI Provider</Label>
        <Select
          value={data.provider || ""}
          onValueChange={(value) =>
            updateNodeData(node.id, { 
              provider: value as AiTriggerNodeData["provider"],
              model: AI_PROVIDERS[value]?.models[0]?.id || ""
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select provider..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
              <SelectItem key={key} value={key}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {data.provider && (
        <div className="space-y-2">
          <Label>Model</Label>
          <Select
            value={data.model || ""}
            onValueChange={(value) => updateNodeData(node.id, { model: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS[data.provider]?.models.map((model: { id: string; name: string }) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      <Separator />
      
      {/* Input Source Toggle */}
      <div className="space-y-3">
        <Label>Input Source</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={data.inputSource === "previous" || !data.inputSource ? "default" : "outline"}
            size="sm"
            className="h-auto py-3 flex-col gap-1"
            onClick={() => updateNodeData(node.id, { inputSource: "previous" })}
          >
            <span className="font-medium">Previous Input</span>
            <span className="text-[10px] opacity-70 font-normal">Last user message</span>
          </Button>
          <Button
            type="button"
            variant={data.inputSource === "fresh" ? "default" : "outline"}
            size="sm"
            className="h-auto py-3 flex-col gap-1"
            onClick={() => updateNodeData(node.id, { inputSource: "fresh" })}
          >
            <span className="font-medium">Fresh Input</span>
            <span className="text-[10px] opacity-70 font-normal">Ask user for input</span>
          </Button>
        </div>
      </div>
      
      {/* Variable Selection */}
      <div className="space-y-2">
        <Label>Store Input in Variable</Label>
        <Select
          value={data.inputVariable || ""}
          onValueChange={(value) => updateNodeData(node.id, { inputVariable: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select or add variable..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user_input">user_input (default)</SelectItem>
            {existingVariables.filter(v => v !== "user_input").map((variable) => (
              <SelectItem key={variable} value={variable}>
                {variable}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Add new variable */}
        <div className="flex gap-2">
          <Input
            value={newVariable}
            onChange={(e) => setNewVariable(e.target.value.replace(/\s+/g, "_"))}
            placeholder="new_variable_name"
            className="flex-1"
          />
          <Button 
            type="button" 
            size="sm" 
            variant="outline"
            onClick={addNewVariable}
            disabled={!newVariable}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The user&apos;s input will be stored in this variable before sending to AI
        </p>
      </div>
      
      {/* Prompt Message - only show for fresh input */}
      {data.inputSource === "fresh" && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label>Prompt Message</Label>
            <Textarea
              value={data.promptMessage || ""}
              onChange={(e) => updateNodeData(node.id, { promptMessage: e.target.value })}
              placeholder="How can I help you today?"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Message to send asking user for input
            </p>
          </div>
        </>
      )}
      
      <Separator />
      
      {/* Target Flows Selection */}
      <div className="space-y-2">
        <Label>Target Flows to Route To</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Select flows that the AI can trigger based on user input
        </p>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search flows..."
          className="mb-2"
        />
        <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
          {filteredFlows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              No flows found
            </p>
          ) : (
            filteredFlows.map((flow) => {
              const isSelected = (data.targetFlows || []).find(f => f.flowId === flow.id)
              return (
                <div
                  key={flow.id}
                  className={`p-2 rounded-md cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-indigo-50 border border-indigo-200"
                      : "hover:bg-muted border border-transparent"
                  }`}
                  onClick={() => toggleFlow(flow)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{flow.name}</span>
                    {isSelected && (
                      <span className="text-xs text-indigo-600">Selected</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
      
      {/* Selected Flows with Descriptions */}
      {(data.targetFlows || []).length > 0 && (
        <div className="space-y-3">
          <Label>Flow Descriptions (for AI)</Label>
          <p className="text-xs text-muted-foreground">
            Describe when each flow should be triggered - the AI uses these descriptions to match user input
          </p>
          {(data.targetFlows || []).map((flow) => (
            <div key={flow.flowId} className="space-y-2 p-3 bg-muted/50 rounded-md border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{flow.flowName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => toggleFlow({ id: flow.flowId, name: flow.flowName } as Flow)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Textarea
                value={flow.description}
                onChange={(e) => updateFlowDescription(flow.flowId, e.target.value)}
                placeholder="e.g., Trigger when user asks about pricing, costs, or wants to know product prices"
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}
      
      <Separator />
      
      {/* Fallback Message */}
      <div className="space-y-2">
        <Label>No Match Message (Optional)</Label>
        <Textarea
          value={data.fallbackMessage || ""}
          onChange={(e) => updateNodeData(node.id, { fallbackMessage: e.target.value })}
          placeholder="I couldn't understand your request. Let me help you another way."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Message to send when no flow matches. Connect the &quot;No Match&quot; output to handle unmatched inputs.
        </p>
      </div>
      
      <Separator />
      
      {/* Advanced Settings */}
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger className="text-sm">Advanced Settings</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={data.temperature || 0.3}
                    onChange={(e) => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
                  />
                  <p className="text-[10px] text-muted-foreground">Lower = more consistent</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={data.maxTokens || 100}
                    onChange={(e) => updateNodeData(node.id, { maxTokens: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

// AI Chat properties panel
function AiChatProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (nodeId: string, data: Partial<AiChatNodeData>) => void
}) {
  const data = node.data as AiChatNodeData
  const [newKeyword, setNewKeyword] = useState("")

  // Add stop condition
  const addStopCondition = (type: "keyword" | "maxTurns" | "aiDecision" | "timeout") => {
    const newCondition = {
      id: `cond_${Date.now()}`,
      type,
      keywords: type === "keyword" ? [] : undefined,
      maxTurns: type === "maxTurns" ? 10 : undefined,
      timeoutMinutes: type === "timeout" ? 30 : undefined,
      aiEndPrompt: type === "aiDecision" ? "End the conversation when the user says goodbye, thanks you, or indicates they are done." : undefined,
    }
    updateNodeData(node.id, {
      stopConditions: [...(data.stopConditions || []), newCondition]
    })
  }

  // Remove stop condition
  const removeStopCondition = (condId: string) => {
    updateNodeData(node.id, {
      stopConditions: (data.stopConditions || []).filter(c => c.id !== condId)
    })
  }

  // Update stop condition
  const updateStopCondition = (condId: string, updates: Partial<AiChatNodeData["stopConditions"][0]>) => {
    updateNodeData(node.id, {
      stopConditions: (data.stopConditions || []).map(c => 
        c.id === condId ? { ...c, ...updates } : c
      )
    })
  }

  // Add keyword to a keyword condition
  const addKeyword = (condId: string, keyword: string) => {
    if (!keyword.trim()) return
    const cond = (data.stopConditions || []).find(c => c.id === condId)
    if (cond && cond.type === "keyword") {
      updateStopCondition(condId, {
        keywords: [...(cond.keywords || []), keyword.trim()]
      })
    }
    setNewKeyword("")
  }

  // Remove keyword from a keyword condition
  const removeKeyword = (condId: string, keyword: string) => {
    const cond = (data.stopConditions || []).find(c => c.id === condId)
    if (cond && cond.type === "keyword") {
      updateStopCondition(condId, {
        keywords: (cond.keywords || []).filter(k => k !== keyword)
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Provider Selection */}
      <div className="space-y-2">
        <Label>AI Provider</Label>
        <Select
          value={data.provider || ""}
          onValueChange={(value) =>
            updateNodeData(node.id, { 
              provider: value as AiChatNodeData["provider"],
              model: AI_PROVIDERS[value]?.models[0]?.id || ""
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select provider..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
              <SelectItem key={key} value={key}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {data.provider && (
        <div className="space-y-2">
          <Label>Model</Label>
          <Select
            value={data.model || ""}
            onValueChange={(value) => updateNodeData(node.id, { model: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS[data.provider]?.models.map((model: { id: string; name: string }) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      <Separator />
      
      {/* System Prompt */}
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={data.systemPrompt || ""}
          onChange={(e) => updateNodeData(node.id, { systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant..."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Define the AI&apos;s personality and behavior
        </p>
      </div>
      
      <Separator />
      
      {/* Input Source Toggle */}
      <div className="space-y-3">
        <Label>Input Source</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={data.inputSource === "previous" || !data.inputSource ? "default" : "outline"}
            size="sm"
            className="h-auto py-3 flex-col gap-1"
            onClick={() => updateNodeData(node.id, { inputSource: "previous" })}
          >
            <span className="font-medium">Previous Input</span>
            <span className="text-[10px] opacity-70 font-normal">Last user message</span>
          </Button>
          <Button
            type="button"
            variant={data.inputSource === "fresh" ? "default" : "outline"}
            size="sm"
            className="h-auto py-3 flex-col gap-1"
            onClick={() => updateNodeData(node.id, { inputSource: "fresh" })}
          >
            <span className="font-medium">Fresh Input</span>
            <span className="text-[10px] opacity-70 font-normal">Ask user for input</span>
          </Button>
        </div>
      </div>
      
      {/* Input Variable Selection */}
      <div className="space-y-2">
        <Label>Input Variable</Label>
        <Input
          value={data.inputVariable || "user_input"}
          onChange={(e) => updateNodeData(node.id, { inputVariable: e.target.value.replace(/\s+/g, "_") })}
          placeholder="user_input"
        />
        <p className="text-xs text-muted-foreground">
          Variable to read user input from (default: user_input)
        </p>
      </div>
      
      {/* Prompt Message - only show for fresh input */}
      {data.inputSource === "fresh" && (
        <div className="space-y-2">
          <Label>Prompt Message</Label>
          <Textarea
            value={data.promptMessage || ""}
            onChange={(e) => updateNodeData(node.id, { promptMessage: e.target.value })}
            placeholder="How can I help you today?"
            rows={2}
          />
        </div>
      )}
      
      <Separator />
      
      {/* Wait Time */}
      <div className="space-y-2">
        <Label>Wait Time (seconds)</Label>
        <Input
          type="number"
          min={1}
          max={60}
          value={data.waitTime || 5}
          onChange={(e) => updateNodeData(node.id, { waitTime: parseInt(e.target.value) || 5 })}
        />
        <p className="text-xs text-muted-foreground">
          Wait this long after each message before responding. If user sends another message, timer resets.
        </p>
      </div>
      
      {/* Context Message Count */}
      <div className="space-y-2">
        <Label>Context Messages</Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={data.contextMessageCount || 10}
          onChange={(e) => updateNodeData(node.id, { contextMessageCount: parseInt(e.target.value) || 10 })}
        />
        <p className="text-xs text-muted-foreground">
          Number of previous messages to include as context
        </p>
      </div>
      
      <Separator />
      
      {/* Stop Conditions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Stop Conditions</Label>
          <Select onValueChange={(value) => addStopCondition(value as "keyword" | "maxTurns" | "aiDecision" | "timeout")}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue placeholder="Add..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keywords</SelectItem>
              <SelectItem value="maxTurns">Max Turns</SelectItem>
              <SelectItem value="timeout">Timeout</SelectItem>
              <SelectItem value="aiDecision">AI Decides</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Define when the AI chat should end and follow the Exit handle
        </p>
        
        {(data.stopConditions || []).length === 0 && (
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-600 border border-amber-100">
            No stop conditions. Chat will continue indefinitely.
          </div>
        )}
        
        {(data.stopConditions || []).map((cond) => (
          <div key={cond.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize">{cond.type === "aiDecision" ? "AI Decides" : cond.type === "maxTurns" ? "Max Turns" : cond.type}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => removeStopCondition(cond.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            
            {cond.type === "keyword" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Add keyword..."
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addKeyword(cond.id, newKeyword)
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addKeyword(cond.id, newKeyword)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(cond.keywords || []).map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700"
                    >
                      {kw}
                      <button onClick={() => removeKeyword(cond.id, kw)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Chat ends when user message contains any of these keywords
                </p>
              </div>
            )}
            
            {cond.type === "maxTurns" && (
              <div className="space-y-1">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={cond.maxTurns || 10}
                  onChange={(e) => updateStopCondition(cond.id, { maxTurns: parseInt(e.target.value) || 10 })}
                />
                <p className="text-[10px] text-muted-foreground">
                  Chat ends after this many back-and-forth exchanges
                </p>
              </div>
            )}
            
            {cond.type === "timeout" && (
              <div className="space-y-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={cond.timeoutMinutes || 30}
                  onChange={(e) => updateStopCondition(cond.id, { timeoutMinutes: parseInt(e.target.value) || 30 })}
                />
                <p className="text-[10px] text-muted-foreground">
                  Chat ends after this many minutes total
                </p>
              </div>
            )}
            
            {cond.type === "aiDecision" && (
              <div className="space-y-1">
                <Textarea
                  value={cond.aiEndPrompt || ""}
                  onChange={(e) => updateStopCondition(cond.id, { aiEndPrompt: e.target.value })}
                  placeholder="Describe when AI should end the conversation..."
                  rows={2}
                />
                <p className="text-[10px] text-muted-foreground">
                  AI will include [END_CHAT] in response when it decides to end
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <Separator />
      
      {/* Exit Message */}
      <div className="space-y-2">
        <Label>Exit Message (Optional)</Label>
        <Textarea
          value={data.exitMessage || ""}
          onChange={(e) => updateNodeData(node.id, { exitMessage: e.target.value })}
          placeholder="Thank you for chatting! Is there anything else I can help with?"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Message to send when chat ends
        </p>
      </div>
      
      {/* Summary Variable */}
      <div className="space-y-2">
        <Label>Summary Variable (Optional)</Label>
        <Input
          value={data.summaryVariable || ""}
          onChange={(e) => updateNodeData(node.id, { summaryVariable: e.target.value.replace(/\s+/g, "_") })}
          placeholder="chat_summary"
        />
        <p className="text-xs text-muted-foreground">
          Store a summary of the conversation in this variable
        </p>
      </div>
      
      <Separator />
      
      {/* Advanced Settings */}
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger className="text-sm">Advanced Settings</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={data.temperature || 0.7}
                    onChange={(e) => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    min={1}
                    max={4000}
                    value={data.maxTokens || 500}
                    onChange={(e) => updateNodeData(node.id, { maxTokens: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

// Transfer to Human properties panel
function TransferToHumanProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode
  updateNodeData: (nodeId: string, data: Partial<TransferToHumanNodeData>) => void
}) {
  const data = node.data as TransferToHumanNodeData
  const [tagInput, setTagInput] = useState("")
  const nodes = useFlowStore((state) => state.nodes)
  
  // Extract existing variables from all nodes
  const existingVariables = Array.from(
    new Set(
      nodes.flatMap((n) => {
        const nodeData = n.data as Record<string, unknown>
        const vars: string[] = []
        if (nodeData.variableName) vars.push(String(nodeData.variableName))
        if (nodeData.responseVariable) vars.push(String(nodeData.responseVariable))
        return vars
      })
    )
  ).filter(Boolean)
  
  const addTag = () => {
    if (tagInput.trim()) {
      const currentTags = data.addTags || []
      if (!currentTags.includes(tagInput.trim())) {
        updateNodeData(node.id, { addTags: [...currentTags, tagInput.trim()] })
      }
      setTagInput("")
    }
  }
  
  const removeTag = (tag: string) => {
    const currentTags = data.addTags || []
    updateNodeData(node.id, { addTags: currentTags.filter(t => t !== tag) })
  }

  return (
    <div className="space-y-4">
      {/* Transfer Message */}
      <div className="space-y-2">
        <Label>Transfer Message</Label>
        <Textarea
          value={data.transferMessage || ""}
          onChange={(e) => updateNodeData(node.id, { transferMessage: e.target.value })}
          placeholder="Please hold while I transfer you to a human agent who can better assist you."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Message sent to user when transferring. Use {"{{variable}}"} for dynamic content.
        </p>
        {existingVariables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {existingVariables.slice(0, 5).map((v) => (
              <code
                key={v}
                className="cursor-pointer rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-primary hover:text-primary-foreground"
                onClick={() => updateNodeData(node.id, { 
                  transferMessage: (data.transferMessage || "") + `{{${v}}}` 
                })}
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        )}
      </div>
      
      <Separator />
      
      {/* Priority */}
      <div className="space-y-2">
        <Label>Priority Level</Label>
        <Select
          value={data.priority || "medium"}
          onValueChange={(value) => updateNodeData(node.id, { priority: value as TransferToHumanNodeData["priority"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low - Non-urgent</SelectItem>
            <SelectItem value="medium">Medium - Standard</SelectItem>
            <SelectItem value="high">High - Important</SelectItem>
            <SelectItem value="urgent">Urgent - Immediate attention</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Separator />
      
      {/* Notification Settings */}
      <div className="space-y-2">
        <Label>Notify Agent Via</Label>
        <Select
          value={data.notifyVia || "none"}
          onValueChange={(value) => updateNodeData(node.id, { notifyVia: value === "none" ? undefined : value as TransferToHumanNodeData["notifyVia"] })}
        >
          <SelectTrigger>
            <SelectValue placeholder="No notification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No notification</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="both">Both WhatsApp & Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {(data.notifyVia === "whatsapp" || data.notifyVia === "both") && (
        <div className="space-y-2">
          <Label>Agent WhatsApp Number</Label>
          <Input
            value={data.notificationPhone || ""}
            onChange={(e) => updateNodeData(node.id, { notificationPhone: e.target.value })}
            placeholder="+1234567890"
          />
        </div>
      )}
      
      {(data.notifyVia === "email" || data.notifyVia === "both") && (
        <div className="space-y-2">
          <Label>Agent Email</Label>
          <Input
            type="email"
            value={data.notificationEmail || ""}
            onChange={(e) => updateNodeData(node.id, { notificationEmail: e.target.value })}
            placeholder="agent@company.com"
          />
        </div>
      )}
      
      <Separator />
      
      {/* Tags */}
      <div className="space-y-2">
        <Label>Add Tags to Contact</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="e.g., needs-human-help"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addTag()
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(data.addTags || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(data.addTags || []).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:opacity-75">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      
      <Separator />
      
      {/* Agent Notes */}
      <div className="space-y-2">
        <Label>Notes for Agent</Label>
        <Textarea
          value={data.agentNotes || ""}
          onChange={(e) => updateNodeData(node.id, { agentNotes: e.target.value })}
          placeholder="Context or instructions for the human agent..."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Internal notes visible to agents when reviewing the conversation
        </p>
      </div>
    </div>
  )
}
