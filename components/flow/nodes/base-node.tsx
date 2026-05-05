"use client"

import type { ReactNode } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { FlowNodeData } from "@/lib/types"
import { useFlowStore } from "@/lib/stores/flow-store"

interface BaseNodeProps extends NodeProps<FlowNodeData> {
  icon: ReactNode
  iconBg: string
  children?: ReactNode
  showSourceHandle?: boolean
  showTargetHandle?: boolean
  sourceHandles?: Array<{ id: string; label?: string }>
}

export function BaseNode({
  id,
  data,
  selected,
  icon,
  iconBg,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
  sourceHandles,
}: BaseNodeProps) {
  const setSelectedNodeId = useFlowStore((state) => state.setSelectedNodeId)

  // Calculate handle positions - spread evenly across bottom
  const getHandleLeftPosition = (index: number, total: number): string => {
    if (total === 1) return "50%"
    const padding = 12 // percentage from edges
    const availableWidth = 100 - (padding * 2)
    const position = padding + (availableWidth * index / (total - 1))
    return `${position}%`
  }

  const hasMultipleHandles = sourceHandles && sourceHandles.length > 0

  return (
    <div
      className={cn(
        "min-w-[200px] max-w-[280px] rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "ring-2 ring-primary shadow-md" : "hover:shadow-md"
      )}
      onClick={() => setSelectedNodeId(id)}
    >
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />
      )}

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded", iconBg)}>
          {icon}
        </div>
        <span className="font-medium text-sm">{data.label}</span>
      </div>

      {children && <div className="p-3 text-xs text-muted-foreground max-h-[200px] overflow-hidden">{children}</div>}

      {/* Single default handle when no custom handles */}
      {showSourceHandle && !hasMultipleHandles && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}

      {/* Multiple handles with labels for buttons/list items */}
      {hasMultipleHandles && (
        <div className="relative border-t bg-muted/30 px-2 py-3 pb-5">
          {/* Labels row */}
          <div className="flex justify-around gap-1 mb-2">
            {sourceHandles.map((handle, index) => (
              <span
                key={`label-${handle.id}`}
                className="text-[10px] text-muted-foreground truncate text-center flex-1 max-w-[70px]"
              >
                {handle.label || `Option ${index + 1}`}
              </span>
            ))}
          </div>
          {/* Handles positioned absolutely at the bottom */}
          {sourceHandles.map((handle, index) => (
            <Handle
              key={handle.id}
              type="source"
              position={Position.Bottom}
              id={handle.id}
              className="!h-3 !w-3 !border-2 !border-background !bg-primary hover:!bg-primary/80"
              style={{
                left: getHandleLeftPosition(index, sourceHandles.length),
                bottom: "-6px",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
