"use client"

import { useCallback, useRef } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { GitBranch } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useFlowStore } from "@/lib/stores/flow-store"
import { nodeTypes } from "./nodes"
import { NodePalette } from "./node-palette"
import type { NodeType, FlowNode } from "@/lib/types"

export function FlowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setSelectedNodeId,
    setNodes,
  } = useFlowStore()

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)

  const handleAddNode = useCallback(
    (type: NodeType) => {
      const position = reactFlowInstance.current?.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 3,
      }) || { x: 250, y: 150 }

      addNode(type, position)
    },
    [addNode]
  )

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  // Auto-arrange nodes in a hierarchical layout considering connection handle positions
  const autoArrangeNodes = useCallback(() => {
    if (nodes.length === 0) return

    // Different node types have different widths - be generous to avoid overlap
    const getNodeWidth = (nodeType: string): number => {
      switch (nodeType) {
        case "ai":
        case "aiResponse":
        case "aiTrigger":
          return 500 // AI nodes are widest
        case "list":
          return 420 // Interactive nodes with multiple options
        case "condition":
        case "setVariable":
        case "setLabel":
        case "httpRequest":
        case "callFlow":
        case "flow":
        case "api":
        case "transferToHuman":
          return 400 // Logic nodes with configuration
        case "message":
          return 350 // Message nodes can have media
        default:
          return 300 // Default for start, delay, etc.
      }
    }

    const NODE_HEIGHT = 220
    const HORIZONTAL_SPACING = 100  // Gap between nodes horizontally
    const VERTICAL_SPACING = 120    // Gap between levels vertically

    // Build adjacency list with handle information
    // Map: sourceNodeId -> array of { targetId, sourceHandle, handleIndex }
    type ChildInfo = { targetId: string; sourceHandle?: string; handleIndex: number }
    const childrenMap = new Map<string, ChildInfo[]>()
    const parentMap = new Map<string, string[]>()
    
    nodes.forEach(node => {
      childrenMap.set(node.id, [])
      parentMap.set(node.id, [])
    })

    // First pass: collect all unique source handles per node to establish ordering
    const nodeHandleOrder = new Map<string, string[]>()
    edges.forEach(edge => {
      if (edge.sourceHandle) {
        const handles = nodeHandleOrder.get(edge.source) || []
        if (!handles.includes(edge.sourceHandle)) {
          handles.push(edge.sourceHandle)
        }
        nodeHandleOrder.set(edge.source, handles)
      }
    })

    // Build the children map with handle index for ordering
    edges.forEach(edge => {
      // Determine handle index (position from left to right)
      const handles = nodeHandleOrder.get(edge.source) || []
      let handleIndex = 0
      if (edge.sourceHandle && handles.length > 0) {
        handleIndex = handles.indexOf(edge.sourceHandle)
        if (handleIndex === -1) handleIndex = handles.length
      }
      
      const children = childrenMap.get(edge.source) || []
      children.push({ targetId: edge.target, sourceHandle: edge.sourceHandle, handleIndex })
      childrenMap.set(edge.source, children)

      const parents = parentMap.get(edge.target) || []
      if (!parents.includes(edge.source)) {
        parents.push(edge.source)
      }
      parentMap.set(edge.target, parents)
    })

    // Find root nodes (no parents) - start nodes or unconnected nodes
    const rootNodes = nodes.filter(node => {
      const parents = parentMap.get(node.id) || []
      return parents.length === 0
    })

    // If no root nodes found, use the first node
    if (rootNodes.length === 0 && nodes.length > 0) {
      rootNodes.push(nodes[0])
    }

    // BFS to assign levels
    const nodeLevels = new Map<string, number>()
    const visited = new Set<string>()
    const queue: { nodeId: string; level: number }[] = []

    rootNodes.forEach(node => {
      queue.push({ nodeId: node.id, level: 0 })
    })

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()!
      
      if (visited.has(nodeId)) {
        // Update level if we found a longer path
        const existingLevel = nodeLevels.get(nodeId) || 0
        if (level > existingLevel) {
          nodeLevels.set(nodeId, level)
        }
        continue
      }

      visited.add(nodeId)
      nodeLevels.set(nodeId, level)

      const children = childrenMap.get(nodeId) || []
      children.forEach(child => {
        queue.push({ nodeId: child.targetId, level: level + 1 })
      })
    }

    // Handle unvisited nodes (disconnected)
    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        nodeLevels.set(node.id, 0)
      }
    })

    // Create a map of child ordering based on parent's handle positions
    // Map: childId -> { parentId, handleIndex }
    const childHandleInfo = new Map<string, { parentId: string; handleIndex: number }>()
    childrenMap.forEach((children, parentId) => {
      children.forEach(child => {
        // If child already has info, prefer the one with lower handle index (leftmost)
        const existing = childHandleInfo.get(child.targetId)
        if (!existing || child.handleIndex < existing.handleIndex) {
          childHandleInfo.set(child.targetId, { parentId, handleIndex: child.handleIndex })
        }
      })
    })

    // Group nodes by level
    const levelGroups = new Map<number, FlowNode[]>()
    nodes.forEach(node => {
      const level = nodeLevels.get(node.id) || 0
      const group = levelGroups.get(level) || []
      group.push(node)
      levelGroups.set(level, group)
    })

    // Sort nodes within each level based on their parent's handle order
    const sortedLevelGroups = new Map<number, FlowNode[]>()
    const maxLevel = Math.max(...Array.from(levelGroups.keys()))
    
    // Start with level 0 (roots)
    sortedLevelGroups.set(0, levelGroups.get(0) || [])
    
    // Process each subsequent level
    for (let level = 1; level <= maxLevel; level++) {
      const levelNodes = levelGroups.get(level) || []
      const prevLevelNodes = sortedLevelGroups.get(level - 1) || []
      
      // Create a map of parent position in prev level
      const parentPositionMap = new Map<string, number>()
      prevLevelNodes.forEach((node, idx) => {
        parentPositionMap.set(node.id, idx)
      })
      
      // Sort nodes by: 1) parent's position in previous level, 2) handle index
      levelNodes.sort((a, b) => {
        const aInfo = childHandleInfo.get(a.id)
        const bInfo = childHandleInfo.get(b.id)
        
        if (!aInfo && !bInfo) return 0
        if (!aInfo) return 1
        if (!bInfo) return -1
        
        // First, sort by parent's position in the previous level
        const aParentPos = parentPositionMap.get(aInfo.parentId) ?? 999
        const bParentPos = parentPositionMap.get(bInfo.parentId) ?? 999
        
        if (aParentPos !== bParentPos) {
          return aParentPos - bParentPos
        }
        
        // If same parent or same parent position, sort by handle index (left to right)
        return aInfo.handleIndex - bInfo.handleIndex
      })
      
      sortedLevelGroups.set(level, levelNodes)
    }

    // Calculate positions with variable widths
    const newNodes = nodes.map(node => {
      const level = nodeLevels.get(node.id) || 0
      const levelNodes = sortedLevelGroups.get(level) || []
      const indexInLevel = levelNodes.findIndex(n => n.id === node.id)
      
      // Calculate total width for this level using actual node widths
      let totalLevelWidth = 0
      levelNodes.forEach((n, i) => {
        totalLevelWidth += getNodeWidth(n.type || "message")
        if (i < levelNodes.length - 1) {
          totalLevelWidth += HORIZONTAL_SPACING
        }
      })
      
      // Calculate x position by summing widths of previous nodes
      let xPosition = -totalLevelWidth / 2
      for (let i = 0; i < indexInLevel; i++) {
        xPosition += getNodeWidth(levelNodes[i].type || "message") + HORIZONTAL_SPACING
      }

      return {
        ...node,
        position: {
          x: xPosition,
          y: level * (NODE_HEIGHT + VERTICAL_SPACING),
        },
      }
    })

    setNodes(newNodes)
    
    // Fit view after arranging - zoom out to show all nodes
    setTimeout(() => {
      reactFlowInstance.current?.fitView({ 
        padding: 0.15,
        minZoom: 0.1,
        maxZoom: 1,
        duration: 300
      })
    }, 50)
  }, [nodes, edges, setNodes])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
        }}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-muted/50"
        />
        <Panel position="top-right" className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={autoArrangeNodes}
                  className="bg-card shadow-sm"
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  Auto Arrange
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Arrange nodes in hierarchical layout</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Panel>
      </ReactFlow>
      <NodePalette onAddNode={handleAddNode} />
    </div>
  )
}
