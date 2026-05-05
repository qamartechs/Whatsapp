"use client"

import type { NodeProps } from "@xyflow/react"
import { List } from "lucide-react"
import { BaseNode } from "./base-node"
import type { ListNodeData } from "@/lib/types"

export function ListNode(props: NodeProps) {
  const data = props.data as ListNodeData
  const { bodyText, sections, footer, buttonText } = data
  const allRows = sections?.flatMap((s) => s.rows) || []

  return (
    <BaseNode
      {...props}
      icon={<List className="h-3.5 w-3.5 text-orange-700" />}
      iconBg="bg-orange-100"
      sourceHandles={allRows.map((row) => ({ id: row.id, label: row.title }))}
    >
      <div className="space-y-2">
        <p className="line-clamp-1 text-sm">{bodyText || "No text set"}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-orange-600">
            {sections?.length || 0} section(s), {allRows.length} item(s)
          </span>
          {buttonText && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
              {buttonText}
            </span>
          )}
        </div>
        {footer && (
          <p className="text-xs text-muted-foreground italic truncate">
            {footer}
          </p>
        )}
      </div>
    </BaseNode>
  )
}
