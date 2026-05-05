"use client"

import type { NodeProps } from "@xyflow/react"
import { Sparkles, History, MessageSquare, Variable, Workflow } from "lucide-react"
import { BaseNode } from "./base-node"
import type { AiTriggerNodeData } from "@/lib/types"
import { AI_PROVIDERS } from "@/lib/types"

export function AiTriggerNode(props: NodeProps) {
  const data = props.data as unknown as AiTriggerNodeData
  const { 
    provider, 
    model, 
    inputSource = "previous",
    inputVariable,
    promptMessage,
    targetFlows = [],
  } = data
  
  const modelInfo = AI_PROVIDERS[provider]?.models.find((m: { id: string }) => m.id === model)

  // Only "No Match" handle needed - matched flows are triggered directly by the executor
  const sourceHandles = [
    { id: "no_match", label: "No Match" },
  ]

  return (
    <BaseNode
      {...(props as Parameters<typeof BaseNode>[0])}
      icon={<Sparkles className="h-3.5 w-3.5 text-indigo-700" />}
      iconBg="bg-indigo-100"
      sourceHandles={sourceHandles}
    >
      <div className="space-y-2 text-xs">
        {/* Provider & Model Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 font-medium">
            <Sparkles className="h-3 w-3" />
            AI Router
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
            {inputVariable && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                <Variable className="h-3 w-3" />
                <span>Stores in: {inputVariable}</span>
              </div>
            )}
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
            {inputVariable && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-500">
                <Variable className="h-3 w-3" />
                <span>Stores in: {inputVariable}</span>
              </div>
            )}
          </div>
        )}

        {/* Target Flows */}
        {targetFlows.length > 0 && (
          <div className="rounded-md bg-indigo-50/50 p-2 border border-indigo-100">
            <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-medium mb-1">
              <Workflow className="h-3 w-3" />
              <span>ROUTES TO {targetFlows.length} FLOW{targetFlows.length !== 1 ? "S" : ""}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {targetFlows.slice(0, 4).map(tf => (
                <span 
                  key={tf.flowId}
                  className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700"
                >
                  {tf.flowName || tf.flowId.slice(0, 8)}
                </span>
              ))}
              {targetFlows.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{targetFlows.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* No configuration warning */}
        {targetFlows.length === 0 && (
          <div className="rounded-md bg-amber-50/50 p-2 border border-amber-100 text-[10px] text-amber-600">
            No target flows configured
          </div>
        )}
      </div>
    </BaseNode>
  )
}
