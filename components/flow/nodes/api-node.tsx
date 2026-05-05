"use client"

import type { NodeProps } from "@xyflow/react"
import { Globe } from "lucide-react"
import { BaseNode } from "./base-node"
import type { ApiNodeData } from "@/lib/types"

export function ApiNode(props: NodeProps<ApiNodeData>) {
  const { url, method, responseVariable } = props.data

  return (
    <BaseNode
      {...props}
      icon={<Globe className="h-3.5 w-3.5 text-cyan-700" />}
      iconBg="bg-cyan-100"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="rounded bg-cyan-100 px-1 py-0.5 font-mono text-cyan-700">
            {method}
          </span>
        </div>
        <p className="truncate font-mono">{url || "No URL set"}</p>
        <p className="text-cyan-600">Save to: {responseVariable}</p>
      </div>
    </BaseNode>
  )
}
