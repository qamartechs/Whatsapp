"use client"

import type { NodeProps } from "@xyflow/react"
import { GitBranch } from "lucide-react"
import { BaseNode } from "./base-node"
import type { ConditionNodeData } from "@/lib/types"

export function ConditionNode(props: NodeProps<ConditionNodeData>) {
  const { conditions } = props.data

  const handles = [
    ...(conditions?.map((c) => ({ id: c.id, label: `${c.variable} ${c.operator} ${c.value}` })) || []),
    { id: "default", label: "Default" },
  ]

  return (
    <BaseNode
      {...props}
      icon={<GitBranch className="h-3.5 w-3.5 text-amber-700" />}
      iconBg="bg-amber-100"
      sourceHandles={handles}
    >
      <div className="space-y-1">
        <span className="text-amber-600">{conditions?.length || 0} condition(s)</span>
        {conditions?.slice(0, 2).map((c) => (
          <div key={c.id} className="truncate">
            {c.variable} {c.operator} {c.value || "..."}
          </div>
        ))}
      </div>
    </BaseNode>
  )
}
