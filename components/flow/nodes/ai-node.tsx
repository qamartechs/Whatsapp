"use client"

import type { NodeProps } from "@xyflow/react"
import { Sparkles, MessageSquare, Variable, Send, AlertCircle } from "lucide-react"
import { BaseNode } from "./base-node"
import type { AiNodeData } from "@/lib/types"
import { AI_PROVIDERS } from "@/lib/types"

export function AiNode(props: NodeProps) {
  const data = props.data as unknown as AiNodeData
  const { provider, model, systemPrompt, userPromptTemplate, responseVariable, temperature, maxTokens, fallbackMessage } = data
  const providerName = AI_PROVIDERS[provider]?.name || provider
  const modelInfo = AI_PROVIDERS[provider]?.models.find((m: { id: string }) => m.id === model)

  return (
    <BaseNode
      {...(props as Parameters<typeof BaseNode>[0])}
      icon={<Sparkles className="h-3.5 w-3.5 text-violet-700" />}
      iconBg="bg-violet-100"
    >
      <div className="space-y-2 text-xs">
        {/* Provider & Model Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-violet-700 font-medium">
            <Sparkles className="h-3 w-3" />
            {providerName}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {modelInfo?.name || model}
          </span>
        </div>

        {/* System Prompt Preview */}
        {systemPrompt && (
          <div className="rounded-md bg-violet-50/50 p-2 border border-violet-100">
            <p className="text-[10px] text-violet-500 mb-0.5 font-medium">SYSTEM PROMPT</p>
            <p className="text-muted-foreground line-clamp-2">{systemPrompt}</p>
          </div>
        )}

        {/* User Prompt Template */}
        {userPromptTemplate && (
          <div className="flex items-start gap-1.5">
            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-muted-foreground line-clamp-1">
              Input: <code className="bg-muted px-1 rounded">{userPromptTemplate}</code>
            </p>
          </div>
        )}

        {/* Response Variable - Highlighted */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Send className="h-3 w-3 text-emerald-600" />
            <span className="text-emerald-600 font-medium">Auto-sends response</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Variable className="h-3 w-3 text-violet-600" />
          <span className="text-muted-foreground">Save to:</span>
          <code className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700 font-medium">
            {responseVariable || "ai_response"}
          </code>
        </div>

        {/* Settings preview */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Temp: {temperature || 0.7}</span>
          <span>•</span>
          <span>Max: {maxTokens || 500} tokens</span>
        </div>

        {/* Fallback message if set */}
        {fallbackMessage && (
          <div className="flex items-start gap-1.5 rounded-md bg-amber-50/50 p-1.5 border border-amber-100">
            <AlertCircle className="h-3 w-3 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-[10px] text-amber-700 line-clamp-1">
              Fallback: {fallbackMessage}
            </p>
          </div>
        )}
      </div>
    </BaseNode>
  )
}
