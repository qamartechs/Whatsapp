import { create } from "zustand"
import {
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react"
import type { FlowNode, FlowNodeData, NodeType, Flow, MessageNodeData } from "@/lib/types"

interface FlowState {
  // Current flow
  flowId: string | null
  flowName: string
  flowDescription: string
  isActive: boolean
  triggerKeywords: string[]

  // React Flow state (draft)
  nodes: FlowNode[]
  edges: Edge[]

  // Published state
  publishedNodes: FlowNode[] | null
  publishedEdges: Edge[] | null
  publishedAt: string | null
  hasUnpublishedChanges: boolean

  // Flow variables
  variables: Record<string, unknown>

  // Selection
  selectedNodeId: string | null

  // Dirty state
  isDirty: boolean

  // Actions
  setFlow: (flow: Flow) => void
  resetFlow: () => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: OnNodesChange<FlowNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (type: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void
  deleteNode: (nodeId: string) => void
  setSelectedNodeId: (nodeId: string | null) => void
  setFlowName: (name: string) => void
  setFlowDescription: (description: string) => void
  setIsActive: (isActive: boolean) => void
  setTriggerKeywords: (keywords: string[]) => void
  setVariables: (variables: Record<string, unknown>) => void
  markClean: () => void
  publish: () => void
}

const getDefaultNodeData = (type: NodeType): FlowNodeData => {
  switch (type) {
    case "start":
      return { label: "Start", triggerKeywords: [] }
    case "message":
      return { 
        label: "Message", 
        messageType: "text",
        text: "Hello! How can I help you today?" 
      }
    case "button":
      return {
        label: "Buttons",
        text: "Please select an option:",
        footer: "",
        buttons: [
          { id: "btn_1", text: "Option 1", payload: "option_1" },
          { id: "btn_2", text: "Option 2", payload: "option_2" },
        ],
      }
    case "list":
      return {
        label: "List",
        headerText: "Menu",
        bodyText: "Please select from the following options:",
        footer: "",
        buttonText: "View Options",
        sections: [
          {
            title: "Section 1",
            rows: [
              { id: "row_1", title: "Item 1", description: "Description 1" },
              { id: "row_2", title: "Item 2", description: "Description 2" },
            ],
          },
        ],
      }
    case "card":
      return {
        label: "Cards",
        footer: "",
        cards: [
          {
            id: "card_1",
            title: "Card 1",
            description: "Description for card 1",
            imageUrl: "",
            buttons: [{ id: "card_btn_1", text: "Learn More", payload: "learn_more_1" }],
          },
        ],
      }
    case "condition":
      return {
        label: "Condition",
        conditions: [
          { id: "cond_1", variable: "user_input", operator: "equals", value: "" },
        ],
        defaultBranch: "default",
      }
    case "api":
      return {
        label: "API Call",
        url: "https://api.example.com/data",
        method: "GET",
        headers: { "Content-Type": "application/json" },
        responseVariable: "api_response",
        timeout: 30000,
      }
    case "delay":
      return {
        label: "Delay",
        duration: 1,
        unit: "seconds",
      }
    case "ai":
      return {
        label: "AI Response",
        provider: "openai",
        model: "gpt-4o-mini",
        systemPrompt: "You are a helpful assistant.",
        userPromptTemplate: "{{user_input}}",
        responseVariable: "ai_response",
        temperature: 0.7,
        maxTokens: 500,
      }
    case "flow":
      return {
        label: "Call Flow",
        targetFlowId: "",
        targetNodeId: "",
        passVariables: true,
        variableMapping: {},
      }

    case "setVariable":
      return {
        label: "Set Variable",
        action: "set",
        variableName: "",
        value: "",
        valueType: "string",
      }
    default:
      return { label: "Node" }
  }
}

const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

export const useFlowStore = create<FlowState>((set, get) => ({
  // Initial state
  flowId: null,
  flowName: "Untitled Flow",
  flowDescription: "",
  isActive: false,
  triggerKeywords: [],
  nodes: [],
  edges: [],
  publishedNodes: null,
  publishedEdges: null,
  publishedAt: null,
  hasUnpublishedChanges: false,
  variables: {},
  selectedNodeId: null,
  isDirty: false,

  // Actions
  setFlow: (flow) => {
    const hasUnpublishedChanges = flow.published_nodes 
      ? JSON.stringify(flow.nodes) !== JSON.stringify(flow.published_nodes) ||
        JSON.stringify(flow.edges) !== JSON.stringify(flow.published_edges)
      : true
    
    set({
      flowId: flow.id,
      flowName: flow.name,
      flowDescription: flow.description || "",
      isActive: flow.is_active,
      triggerKeywords: flow.trigger_keywords,
      nodes: flow.nodes,
      edges: flow.edges,
      publishedNodes: flow.published_nodes,
      publishedEdges: flow.published_edges,
      publishedAt: flow.published_at,
      hasUnpublishedChanges,
      variables: flow.variables,
      isDirty: false,
    })
  },

  resetFlow: () => {
    set({
      flowId: null,
      flowName: "Untitled Flow",
      flowDescription: "",
      isActive: false,
      triggerKeywords: [],
      nodes: [
        {
          id: "start_node",
          type: "start",
          position: { x: 250, y: 50 },
          data: { label: "Start", triggerKeywords: [] },
        },
      ],
      edges: [],
      publishedNodes: null,
      publishedEdges: null,
      publishedAt: null,
      hasUnpublishedChanges: true,
      variables: {},
      selectedNodeId: null,
      isDirty: false,
    })
  },

  setNodes: (nodes) => set({ nodes, isDirty: true, hasUnpublishedChanges: true }),
  setEdges: (edges) => set({ edges, isDirty: true, hasUnpublishedChanges: true }),

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: true,
        },
        get().edges
      ),
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  addNode: (type, position) => {
    const existingNodes = get().nodes
    
    // Count existing nodes of the same type to generate unique numbering
    const sameTypeNodes = existingNodes.filter(n => n.type === type)
    const nodeNumber = sameTypeNodes.length + 1
    
    // Get default data and append number to label
    const defaultData = getDefaultNodeData(type)
    const numberedLabel = `${defaultData.label} ${nodeNumber}`
    
    const newNode: FlowNode = {
      id: generateId(),
      type,
      position,
      data: { ...defaultData, label: numberedLabel },
    }
    set({
      nodes: [...existingNodes, newNode],
      selectedNodeId: newNode.id,
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  updateNodeData: (nodeId, data) => {
    const currentNode = get().nodes.find(n => n.id === nodeId)
    const currentData = currentNode?.data as MessageNodeData | undefined
    const newData = data as Partial<MessageNodeData>
    
    // Check if messageType is changing - we need to clean up old edges
    const isMessageTypeChanging = currentData?.messageType && newData.messageType && 
      currentData.messageType !== newData.messageType
    
    let updatedEdges = get().edges
    
    if (isMessageTypeChanging) {
      // When changing message type, remove all edges from this node that use specific source handles
      // (button IDs, list row IDs, etc.) since those handles no longer exist
      updatedEdges = get().edges.filter(edge => {
        if (edge.source !== nodeId) return true
        // Keep edges without sourceHandle (default connection)
        if (!edge.sourceHandle) return true
        // Keep special handles like "response" and "timeout" for getUserData
        if (edge.sourceHandle === "response" || edge.sourceHandle === "timeout") return true
        // Remove all other specific handles (button IDs, list row IDs)
        return false
      })
    }
    
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
      edges: updatedEdges,
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  deleteNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
      selectedNodeId:
        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      isDirty: true,
      hasUnpublishedChanges: true,
    })
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setFlowName: (name) => set({ flowName: name, isDirty: true }),
  setFlowDescription: (description) => set({ flowDescription: description, isDirty: true }),
  setIsActive: (isActive) => set({ isActive, isDirty: true }),
  setTriggerKeywords: (keywords) => set({ triggerKeywords: keywords, isDirty: true }),
  setVariables: (variables) => set({ variables, isDirty: true }),
  markClean: () => set({ isDirty: false }),
  
  publish: () => {
    const { nodes, edges } = get()
    set({
      publishedNodes: JSON.parse(JSON.stringify(nodes)),
      publishedEdges: JSON.parse(JSON.stringify(edges)),
      publishedAt: new Date().toISOString(),
      hasUnpublishedChanges: false,
    })
  },
}))
