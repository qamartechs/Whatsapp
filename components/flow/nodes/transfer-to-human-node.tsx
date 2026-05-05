"use client"

import type { NodeProps } from "@xyflow/react"
import { UserRoundCog, MessageSquare, Bell, Tag, AlertTriangle } from "lucide-react"
import { BaseNode } from "./base-node"
import type { TransferToHumanNodeData } from "@/lib/types"

export function TransferToHumanNode(props: NodeProps) {
  const data = props.data as unknown as TransferToHumanNodeData
  const { 
    transferMessage,
    notifyVia,
    priority = "medium",
    addTags = [],
    agentNotes
  } = data

  const priorityColors = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  }

  return (
    <BaseNode
      {...(props as Parameters<typeof BaseNode>[0])}
      icon={<UserRoundCog className="h-3.5 w-3.5 text-amber-700" />}
      iconBg="bg-amber-100"
    >
      <div className="space-y-2 text-xs">
        {/* Header Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-medium">
            <UserRoundCog className="h-3 w-3" />
            Transfer to Human
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[priority]}`}>
            {priority.toUpperCase()}
          </span>
        </div>

        {/* Transfer Message */}
        {transferMessage && (
          <div className="flex items-start gap-1.5">
            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-muted-foreground line-clamp-2">{transferMessage}</p>
          </div>
        )}

        {/* Notification Method */}
        {notifyVia && (
          <div className="flex items-center gap-1.5">
            <Bell className="h-3 w-3 text-amber-600" />
            <span className="text-muted-foreground">
              Notify via {notifyVia === "both" ? "WhatsApp & Email" : notifyVia}
            </span>
          </div>
        )}

        {/* Tags */}
        {addTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-purple-600 shrink-0" />
            {addTags.slice(0, 3).map((tag, i) => (
              <span 
                key={i}
                className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700"
              >
                {tag}
              </span>
            ))}
            {addTags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{addTags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Agent Notes */}
        {agentNotes && (
          <div className="rounded-md bg-slate-50/50 p-1.5 border border-slate-100">
            <p className="text-[10px] text-slate-500 mb-0.5 font-medium">AGENT NOTES</p>
            <p className="text-muted-foreground line-clamp-2 text-[10px]">{agentNotes}</p>
          </div>
        )}

        {/* Warning if no message */}
        {!transferMessage && (
          <div className="flex items-start gap-1.5 rounded-md bg-amber-50/50 p-1.5 border border-amber-100">
            <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-[10px] text-amber-700">No transfer message set</p>
          </div>
        )}
      </div>
    </BaseNode>
  )
}
