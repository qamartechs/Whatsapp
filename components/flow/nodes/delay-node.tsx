"use client"

import type { NodeProps } from "@xyflow/react"
import { Clock } from "lucide-react"
import { BaseNode } from "./base-node"
import type { DelayNodeData } from "@/lib/types"

export function DelayNode(props: NodeProps<DelayNodeData>) {
  const { duration, unit } = props.data

  return (
    <BaseNode
      {...props}
      icon={<Clock className="h-3.5 w-3.5 text-slate-700" />}
      iconBg="bg-slate-100"
    >
      <span className="text-slate-600">
        Wait {duration} {unit}
      </span>
    </BaseNode>
  )
}
