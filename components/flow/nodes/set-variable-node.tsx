"use client"

import type { NodeProps } from "@xyflow/react"
import { Variable, Plus, Trash2, Edit3, PlusCircle, MinusCircle } from "lucide-react"
import { BaseNode } from "./base-node"
import type { SetVariableNodeData } from "@/lib/types"

export function SetVariableNode(props: NodeProps) {
  const data = props.data as SetVariableNodeData
  const { action, variableName, value, isNewVariable, valueType } = data

  const actionConfig = {
    set: { label: "Set", icon: Edit3, color: "text-blue-600", bg: "bg-blue-50" },
    clear: { label: "Clear", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
    append: { label: "Append", icon: Plus, color: "text-green-600", bg: "bg-green-50" },
    increment: { label: "Increment", icon: PlusCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
    decrement: { label: "Decrement", icon: MinusCircle, color: "text-orange-600", bg: "bg-orange-50" },
  }

  const config = actionConfig[action || "set"]
  const ActionIcon = config.icon

  return (
    <BaseNode
      {...props}
      icon={<Variable className="h-3.5 w-3.5 text-violet-700" />}
      iconBg="bg-violet-100"
    >
      <div className="space-y-2 text-xs">
        {/* Action badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.color}`}>
            <ActionIcon className="h-3 w-3" />
            {config.label}
          </span>
          {isNewVariable && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600">
              <Plus className="h-3 w-3" />
              New
            </span>
          )}
        </div>

        {/* Variable name */}
        {variableName ? (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Variable:</span>
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
              {variableName}
            </code>
          </div>
        ) : (
          <span className="text-muted-foreground italic">No variable selected</span>
        )}

        {/* Value preview (for set/append actions) */}
        {(action === "set" || action === "append") && value && (
          <div className="flex items-start gap-1.5">
            <span className="text-muted-foreground shrink-0">Value:</span>
            <span className="text-foreground line-clamp-2 break-all">
              {value.length > 50 ? value.slice(0, 50) + "..." : value}
            </span>
          </div>
        )}

        {/* Value for increment/decrement */}
        {(action === "increment" || action === "decrement") && value && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">By:</span>
            <span className={config.color}>{value}</span>
          </div>
        )}

        {/* Type hint */}
        {valueType && valueType !== "string" && (
          <span className="text-[10px] text-muted-foreground">
            Type: {valueType}
          </span>
        )}
      </div>
    </BaseNode>
  )
}
