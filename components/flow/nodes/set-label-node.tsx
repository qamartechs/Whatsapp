"use client"

import type { NodeProps } from "@xyflow/react"
import { Tags, Plus, Minus } from "lucide-react"
import { BaseNode } from "./base-node"
import type { SetLabelNodeData } from "@/lib/types"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"

const fetcher = async () => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const { data } = await supabase
    .from("labels")
    .select("*")
    .eq("user_id", user.id)
    .order("name")
  
  return data || []
}

export function SetLabelNode(props: NodeProps) {
  const data = props.data as SetLabelNodeData
  const { action, labelIds, newLabelName, newLabelColor } = data
  
  const { data: labels = [] } = useSWR("labels", fetcher)

  const actionIcon = action === "add" ? (
    <Plus className="h-3 w-3 text-green-600" />
  ) : (
    <Minus className="h-3 w-3 text-red-600" />
  )

  const actionLabel = action === "add" ? "Add Labels" : "Remove Labels"
  const actionColor = action === "add" ? "text-green-600" : "text-red-600"

  // Get label names for selected IDs
  const selectedLabels = labels.filter(l => labelIds?.includes(l.id))

  return (
    <BaseNode
      {...props}
      icon={<Tags className="h-3.5 w-3.5 text-purple-700" />}
      iconBg="bg-purple-100"
    >
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          {actionIcon}
          <span className={actionColor}>{actionLabel}</span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {/* Show selected existing labels */}
          {selectedLabels.length > 0 && selectedLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white"
              style={{ backgroundColor: label.color || "#6366f1" }}
            >
              {label.name}
            </span>
          ))}
          
          {/* Show new label being created */}
          {newLabelName && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white border-2 border-dashed border-white/50"
              style={{ backgroundColor: newLabelColor || "#6366f1" }}
            >
              <Plus className="h-2.5 w-2.5" />
              {newLabelName}
            </span>
          )}
          
          {/* Show empty state */}
          {selectedLabels.length === 0 && !newLabelName && (
            <span className="text-muted-foreground italic">No labels selected</span>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
