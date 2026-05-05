"use client"

import type { NodeProps } from "@xyflow/react"
import { Play } from "lucide-react"
import { BaseNode } from "./base-node"
import type { StartNodeData } from "@/lib/types"

export function StartNode(props: NodeProps<StartNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Play className="h-3.5 w-3.5 text-emerald-700" />}
      iconBg="bg-emerald-100"
      showTargetHandle={false}
    >
      <span className="text-emerald-600">Flow entry point</span>
    </BaseNode>
  )
}
