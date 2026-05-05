"use client"

import type { NodeProps } from "@xyflow/react"
import { MessageCircle, History, MessageSquare, Timer, StopCircle, Brain } from "lucide-react"
import { BaseNode } from "./base-node"
import type { AiChatNodeData } from "@/lib/types"
import { AI_PROVIDERS } from "@/lib/types"

export function AiChatNode(props: NodeProps) {
  const data = props.data as unknown as AiChatNodeData
  const { 
    provider, 
    model, 
    inputSource = "previous",
    promptMessage,
    systemPrompt,
    waitTime = 5,
    contextMessageCount = 10,
    stopConditions = [],
  } = data
  
  const modelInfo = AI_PROVIDERS[provider]?.models.find((m: { id: string }) => m.id === model)

  // Exit handle for when chat ends
  const sourceHandles = [
    { id: "exit", label: "Exit" },
  ]

  // Get stop condition summary
  const getStopSummary = () => {
    const parts: string[] = []
    for (const cond of stopConditions) {
      if (cond.type === "keyword" && cond.keywords?.length) {
        parts.push(`Keywords: ${cond.keywords.slice(0, 2).join(", ")}${cond.keywords.length > 2 ? "..." : ""}`)
      } else if (cond.type === "maxTurns" && cond.maxTurns) {
        parts.push(`${cond.maxTurns} turns`)
      } else if (cond.type === "timeout" && cond.timeoutMinutes) {
        parts.push(`${cond.timeoutMinutes}m timeout`)
      } else if (cond.type === "aiDecision") {
        parts.push("AI decides")
      }
    }
    return parts.length > 0 ? parts.join(", ") : "No stop conditions"
  }

  return (
    <BaseNode
      {...(props as Parameters<typeof BaseNode>[0])}
      icon={<MessageCircle className="h-3.5 w-3.5 text-purple-700" />}
      iconBg="bg-purple-100"
      sourceHandles={sourceHandles}
    >
      <div className="space-y-2 text-xs">
        {/* Provider & Model Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 font-medium">
            <Brain className="h-3 w-3" />
            AI Chat
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {modelInfo?.name || model || "No model"}
          </span>
        </div>

        {/* Input Source Indicator */}
        {inputSource === "previous" ? (
          <div className="rounded-md bg-gray-50/50 p-2 border border-gray-200">
            <div className="flex items-center gap-1 text-[10px] text-gray-600 font-medium">
              <History className="h-3 w-3" />
              <span>USES PREVIOUS INPUT</span>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-blue-50/50 p-2 border border-blue-100">
            <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
              <MessageSquare className="h-3 w-3" />
              <span>ASKS FRESH INPUT</span>
            </div>
            {promptMessage && (
              <p className="text-[10px] text-blue-700 line-clamp-1 mt-1">
                &quot;{promptMessage}&quot;
              </p>
            )}
          </div>
        )}

        {/* System Prompt Preview */}
        {systemPrompt && (
          <div className="rounded-md bg-purple-50/50 p-2 border border-purple-100">
            <div className="flex items-center gap-1 text-[10px] text-purple-500 font-medium">
              <Brain className="h-3 w-3" />
              <span>SYSTEM PROMPT</span>
            </div>
            <p className="text-[10px] text-purple-700 line-clamp-2 mt-1 break-words">
              {systemPrompt.length > 100 ? systemPrompt.slice(0, 100) + "..." : systemPrompt}
            </p>
          </div>
        )}

        {/* Wait Time & Context */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-600">
            <Timer className="h-3 w-3" />
            <span>{waitTime}s wait</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
            <MessageCircle className="h-3 w-3" />
            <span>{contextMessageCount} msgs context</span>
          </div>
        </div>

        {/* Stop Conditions */}
        <div className="rounded-md bg-red-50/50 p-2 border border-red-100">
          <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
            <StopCircle className="h-3 w-3" />
            <span>STOP WHEN</span>
          </div>
          <p className="text-[10px] text-red-700 mt-1 truncate">
            {getStopSummary()}
          </p>
        </div>

        {/* No configuration warning */}
        {!provider && (
          <div className="rounded-md bg-amber-50/50 p-2 border border-amber-100 text-[10px] text-amber-600">
            No AI provider configured
          </div>
        )}
      </div>
    </BaseNode>
  )
}
