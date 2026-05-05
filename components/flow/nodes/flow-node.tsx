"use client"

import type { NodeProps } from "@xyflow/react"
import { Workflow } from "lucide-react"
import { BaseNode } from "./base-node"
import type { FlowCallNodeData } from "@/lib/types"

export function FlowNode(props: NodeProps) {
  const data = props.data as FlowCallNodeData
  const { targetFlowId, targetNodeId, passVariables } = data

  return (
    <BaseNode
      {...props}
      icon={<Workflow className="h-3.5 w-3.5 text-teal-700" />}
      iconBg="bg-teal-100"
    >
      <div className="space-y-1">
        <p className="text-sm line-clamp-1">
          {targetFlowId ? `Flow: ${targetFlowId.slice(0, 8)}...` : "No flow selected"}
        </p>
        {targetNodeId && (
          <p className="text-xs text-muted-foreground">
            Jump to: {targetNodeId.slice(0, 12)}...
          </p>
        )}
        <div className="flex gap-1">
          {passVariables && (
            <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-700">
              Pass vars
            </span>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
