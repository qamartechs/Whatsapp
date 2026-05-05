"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { createClient } from "@/lib/supabase/client"
import {
  Play,
  CheckCircle,
  MessageSquare,
  MousePointerClick,
  List,
  GitBranch,
  Globe,
  Clock,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Workflow,
  ChevronDown,
  ChevronRight,
  Variable,
  Tag,
  MessageSquareText,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FlowEventRaw {
  id: string
  event_type: string
  node_id: string | null
  flow_id: string | null
  payload: Record<string, unknown>
  created_at: string
  flows: { name: string } | { name: string }[] | null
}

interface FlowEvent {
  id: string
  event_type: string
  node_id: string | null
  flow_id: string | null
  payload: Record<string, unknown>
  created_at: string
  flowName: string | null
}

interface FlowGroup {
  flowId: string
  flowName: string
  startTime: string
  endTime?: string
  status: "completed" | "in_progress" | "failed"
  events: FlowEvent[]
}

interface ContactLogsDialogProps {
  contactId: string | null
  contactName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const getEventIcon = (eventType: string) => {
  switch (eventType) {
    case "flow_started":
      return <Play className="h-3.5 w-3.5 text-emerald-500" />
    case "flow_completed":
      return <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
    case "node_executed":
      return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
    case "message_sent":
      return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
    case "button_sent":
    case "button_clicked":
      return <MousePointerClick className="h-3.5 w-3.5 text-amber-500" />
    case "list_sent":
    case "list_selected":
      return <List className="h-3.5 w-3.5 text-purple-500" />
    case "condition_evaluated":
    case "condition_default":
      return <GitBranch className="h-3.5 w-3.5 text-orange-500" />
    case "api_success":
      return <Globe className="h-3.5 w-3.5 text-green-500" />
    case "api_error":
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    case "delay_started":
    case "delay_completed":
      return <Clock className="h-3.5 w-3.5 text-gray-500" />
    case "ai_response":
      return <Sparkles className="h-3.5 w-3.5 text-violet-500" />
    case "ai_error":
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    case "flow_called":
      return <Workflow className="h-3.5 w-3.5 text-teal-500" />
    case "variable_saved":
    case "variable_changed":
      return <Variable className="h-3.5 w-3.5 text-emerald-500" />
    case "user_input_received":
      return <MessageSquareText className="h-3.5 w-3.5 text-emerald-500" />
    case "tags_updated":
      return <Tag className="h-3.5 w-3.5 text-indigo-500" />
    case "awaiting_input":
      return <MessageSquareText className="h-3.5 w-3.5 text-amber-500" />
    case "input_validation_failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />
    // AI Trigger events
    case "ai_trigger_started":
      return <Sparkles className="h-3.5 w-3.5 text-violet-500" />
    case "ai_trigger_prompt_sent":
      return <MessageSquare className="h-3.5 w-3.5 text-violet-500" />
    case "ai_trigger_awaiting_input":
      return <Clock className="h-3.5 w-3.5 text-amber-500" />
    case "ai_trigger_input_received":
    case "ai_trigger_using_last_input":
      return <MessageSquareText className="h-3.5 w-3.5 text-emerald-500" />
    case "ai_trigger_calling_ai":
      return <Sparkles className="h-3.5 w-3.5 text-blue-500" />
    case "ai_trigger_ai_response":
      return <Sparkles className="h-3.5 w-3.5 text-violet-600" />
    case "ai_trigger_routing":
      return <GitBranch className="h-3.5 w-3.5 text-violet-500" />
    case "ai_trigger_flow_triggered":
      return <Workflow className="h-3.5 w-3.5 text-emerald-500" />
    case "ai_trigger_no_match":
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
    case "ai_trigger_fallback_message":
      return <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
    case "ai_trigger_error":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />
    case "ai_trigger_decision":
      return <GitBranch className="h-3.5 w-3.5 text-violet-500" />
    default:
      return <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
  }
}

const formatEventType = (eventType: string) => {
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

const formatEventDetails = (event: FlowEvent) => {
  const { event_type, payload } = event
  
  switch (event_type) {
    case "node_executed":
      return (
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{payload.nodeLabel as string || payload.nodeType as string}</span>
          {" "}({payload.nodeType as string})
        </span>
      )
    
    case "message_sent":
      return (
        <span className="text-muted-foreground">
          Sent {String(payload.type)} message
          {payload.textPreview ? (
            <span className="italic ml-1">&quot;{String(payload.textPreview)}...&quot;</span>
          ) : null}
        </span>
      )
    
    case "user_input_received":
      return (
        <div className="space-y-1">
          <span className="text-emerald-600 font-medium">User replied</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Input:</span>
            <span className="bg-muted px-2 py-0.5 rounded text-foreground max-w-[250px] truncate">
              &quot;{String(payload.userInput)}&quot;
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Saved to: <code className="bg-emerald-100 text-emerald-700 px-1 rounded">{String(payload.variableName)}</code>
            {payload.inputType && payload.inputType !== "any" ? (
              <span className="ml-2">Type: {String(payload.inputType)}</span>
            ) : null}
          </div>
        </div>
      )
    
    case "variable_changed":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-xs font-medium">
              {String(payload.variableName)}
            </code>
            {payload.source ? (
              <span className="text-[10px] text-muted-foreground">
                (from {String(payload.source)})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {payload.previousValue !== null ? (
              <>
                <span className="text-red-500 line-through truncate max-w-[100px]">
                  {String(payload.previousValue)}
                </span>
                <span className="text-muted-foreground">→</span>
              </>
            ) : (
              <span className="text-muted-foreground italic">empty →</span>
            )}
            <span className="text-emerald-600 font-medium truncate max-w-[150px]">
              {String(payload.newValue)}
            </span>
          </div>
        </div>
      )
    
    case "variable_saved":
      return (
        <div className="flex items-center gap-2">
          <code className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-xs">
            {String(payload.variableName)}
          </code>
          <span className="text-muted-foreground">=</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">
            &quot;{String(payload.value)}&quot;
          </span>
        </div>
      )
    
    case "tags_updated":
      return (
        <div className="space-y-1">
          <span className="text-muted-foreground">
            {payload.action === "add" && "Added tags: "}
            {payload.action === "remove" && "Removed tags: "}
            {payload.action === "set" && "Set tags to: "}
          </span>
          <div className="flex flex-wrap gap-1">
            {(payload.tagsModified as string[] || []).map((tag, idx) => (
              <span
                key={idx}
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]",
                  payload.action === "remove"
                    ? "bg-red-100 text-red-700 line-through"
                    : "bg-indigo-100 text-indigo-700"
                )}
              >
                {tag}
              </span>
            ))}
          </div>
          {payload.newTags && Array.isArray(payload.newTags) ? (
            <div className="text-[10px] text-muted-foreground">
              Final tags: {(payload.newTags as string[]).join(", ") || "none"}
            </div>
          ) : null}
        </div>
      )
    
    case "condition_evaluated":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{payload.variable as string}</code>
            <span className="text-muted-foreground">{payload.operator as string}</span>
            <span className="font-medium">&quot;{payload.expectedValue as string}&quot;</span>
            <Badge variant={payload.result ? "default" : "secondary"} className="text-[10px] h-4">
              {payload.result ? "TRUE" : "FALSE"}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Actual value: &quot;{String(payload.actualValue)}&quot;
          </div>
        </div>
      )
    
    case "condition_default":
      return (
        <span className="text-muted-foreground">
          No conditions matched, using default branch
        </span>
      )
    
    case "awaiting_input":
      return (
        <div className="space-y-1">
          <span className="text-amber-600 font-medium">Waiting for user input</span>
          <div className="text-[10px] text-muted-foreground">
            Save to: <code className="bg-muted px-1 rounded">{payload.variableName as string}</code>
            {" "}| Type: {payload.inputType as string}
          </div>
        </div>
      )
    
    case "input_validation_failed":
      return (
        <div className="space-y-1">
          <span className="text-red-600">Input validation failed</span>
          <div className="text-[10px] text-muted-foreground">
            Value: &quot;{String(payload.inputValue)}&quot; | Expected: {String(payload.inputType)}
          </div>
        </div>
      )
    
    case "ai_response":
      return (
        <span className="text-muted-foreground">
          Generated response using <span className="font-medium">{payload.provider as string}/{payload.model as string}</span>
        </span>
      )
    
    case "ai_error":
      return (
        <div className="text-red-600 break-words">
          <span className="font-medium">AI Error:</span>{" "}
          <span className="text-sm">{String(payload.error).slice(0, 200)}{String(payload.error).length > 200 ? "..." : ""}</span>
        </div>
      )
    
    // AI Trigger events
    case "ai_trigger_started":
      return (
        <div className="space-y-1">
          <span className="text-violet-600 font-medium">{payload.nodeLabel as string || "AI Trigger"} started</span>
          <div className="text-xs text-muted-foreground">
            Provider: {payload.provider as string}/{payload.model as string}
            {payload.availableFlows && Array.isArray(payload.availableFlows) && (
              <span className="ml-2">| Flows: {(payload.availableFlows as Array<{name: string}>).map(f => f.name).join(", ")}</span>
            )}
          </div>
        </div>
      )
    
    case "ai_trigger_prompt_sent":
      return (
        <div className="space-y-1">
          <span className="text-violet-600">Sent prompt message</span>
          <div className="bg-muted px-2 py-1 rounded text-sm italic">
            &quot;{String(payload.promptMessage).slice(0, 100)}{String(payload.promptMessage).length > 100 ? "..." : ""}&quot;
          </div>
        </div>
      )
    
    case "ai_trigger_awaiting_input":
      return (
        <span className="text-amber-600 font-medium">Waiting for user input...</span>
      )
    
    case "ai_trigger_input_received":
      return (
        <div className="space-y-1">
          <span className="text-emerald-600 font-medium">User input received</span>
          <div className="bg-emerald-50 px-2 py-1 rounded text-sm">
            &quot;{String(payload.userInput).slice(0, 150)}{String(payload.userInput).length > 150 ? "..." : ""}&quot;
          </div>
        </div>
      )
    
    case "ai_trigger_using_last_input":
      return (
        <div className="space-y-1">
          <span className="text-emerald-600 font-medium">Using last user input</span>
          <div className="bg-gray-50 px-2 py-1 rounded text-sm border">
            &quot;{String(payload.userInput).slice(0, 150)}{String(payload.userInput).length > 150 ? "..." : ""}&quot;
          </div>
          <div className="text-[10px] text-muted-foreground">
            Source: previous message (no new prompt sent)
          </div>
        </div>
      )
    
    case "ai_trigger_calling_ai":
      return (
        <div className="space-y-1">
          <span className="text-blue-600">Calling AI for routing decision</span>
          <div className="text-xs text-muted-foreground">
            {payload.provider as string}/{payload.model as string}
            {payload.availableFlows && Array.isArray(payload.availableFlows) && (
              <span className="ml-2">| Available: {(payload.availableFlows as string[]).join(", ")}</span>
            )}
          </div>
        </div>
      )
    
    case "ai_trigger_ai_response":
      return (
        <div className="space-y-1">
          <span className="text-violet-600 font-medium">AI Decision</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {payload.parsedDecision as string}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Raw: &quot;{String(payload.rawResponse).slice(0, 80)}{String(payload.rawResponse).length > 80 ? "..." : ""}&quot;
          </div>
        </div>
      )
    
    case "ai_trigger_routing":
      return (
        <div className="space-y-1">
          <span className="text-violet-600">Routing decision: <span className="font-medium">{payload.decision as string}</span></span>
          {payload.matchedFlowName && (
            <div className="text-xs">
              Target flow: <span className="font-medium text-foreground">{payload.matchedFlowName as string}</span>
            </div>
          )}
          {payload.action && (
            <div className="text-xs text-muted-foreground">{payload.action as string}</div>
          )}
        </div>
      )
    
    case "ai_trigger_flow_triggered":
      return (
        <div className="space-y-1">
          <span className="text-emerald-600 font-medium">Flow triggered successfully</span>
          <div className="flex items-center gap-2">
            <Workflow className="h-3 w-3 text-emerald-500" />
            <span className="font-medium">{payload.targetFlowName as string}</span>
            <Badge variant="outline" className="text-[10px]">{payload.type as string}</Badge>
          </div>
        </div>
      )
    
    case "ai_trigger_no_match":
      return (
        <div className="space-y-1">
          <span className="text-amber-600 font-medium">No routing match</span>
          <div className="text-xs text-muted-foreground">
            Decision: &quot;{payload.decision as string}&quot;
          </div>
          <div className="text-xs text-muted-foreground">{payload.reason as string}</div>
        </div>
      )
    
    case "ai_trigger_fallback_message":
      return (
        <div className="space-y-1">
          <span className="text-amber-600">Sending fallback message</span>
          <div className="text-xs text-muted-foreground">{payload.reason as string}</div>
        </div>
      )
    
    case "ai_trigger_error":
      return (
        <div className="space-y-1">
          <span className="text-red-600 font-medium">AI Trigger Error</span>
          <div className="text-xs">Step: {payload.step as string}</div>
          <div className="text-xs text-red-600">{String(payload.error).slice(0, 150)}</div>
        </div>
      )
    
    case "ai_trigger_decision":
      return (
        <div className="space-y-1">
          <span className="text-violet-600 font-medium">AI Trigger Decision</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{payload.decision as string}</Badge>
          </div>
          {payload.userInput && (
            <div className="text-xs text-muted-foreground">
              User said: &quot;{String(payload.userInput).slice(0, 80)}...&quot;
            </div>
          )}
        </div>
      )
    
    case "api_success":
      return (
        <span className="text-muted-foreground">
          API call to <code className="bg-muted px-1 rounded text-xs">{(payload.url as string)?.slice(0, 30)}...</code>
          {" "}returned {payload.status as number}
        </span>
      )
    
    case "api_error":
      return (
        <div className="text-red-600 break-words">
          <span className="font-medium">API Error:</span>{" "}
          <span className="text-sm">{String(payload.error).slice(0, 200)}{String(payload.error).length > 200 ? "..." : ""}</span>
        </div>
      )
    
    case "flow_started":
      return (
        <span className="text-emerald-600 font-medium">
          Flow started
          {payload.targetNodeId ? <span className="text-muted-foreground ml-1">(targeting specific node)</span> : null}
        </span>
      )
    
    case "flow_completed":
      return (
        <span className="text-emerald-600 font-medium">Flow completed successfully</span>
      )
    
    default:
      // Generic payload display
      const entries = Object.entries(payload).filter(
        ([key]) => !["type", "action", "depth"].includes(key)
      )
      if (entries.length === 0) return null
      return (
        <div className="text-xs text-muted-foreground">
          {entries.slice(0, 3).map(([key, value]) => (
            <span key={key} className="mr-2">
              {key}: {typeof value === "object" ? JSON.stringify(value).slice(0, 30) : String(value).slice(0, 30)}
            </span>
          ))}
        </div>
      )
  }
}

export function ContactLogsDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: ContactLogsDialogProps) {
  const [flowGroups, setFlowGroups] = useState<FlowGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    if (open && contactId) {
      fetchEvents()
    }
  }, [open, contactId])

  const fetchEvents = async () => {
    if (!contactId) return

    setIsLoading(true)
    const supabase = createClient()

    // First, get the last 10 flow_started events to identify flows
    const { data: flowStarts, error: flowStartsError } = await supabase
      .from("events")
      .select("flow_id, created_at, flows (name)")
      .eq("contact_id", contactId)
      .eq("event_type", "flow_started")
      .order("created_at", { ascending: false })
      .limit(10)

    if (flowStartsError) {
      console.error("Error fetching flow starts:", flowStartsError)
      setFlowGroups([])
      setIsLoading(false)
      return
    }

    if (!flowStarts || flowStarts.length === 0) {
      setFlowGroups([])
      setIsLoading(false)
      return
    }

    // Get all events for these flows within their time ranges
    const groups: FlowGroup[] = []

    for (const flowStart of flowStarts) {
      const flowId = flowStart.flow_id
      if (!flowId) continue

      // Get the flow name
      let flowName = "Unknown Flow"
      if (flowStart.flows) {
        if (Array.isArray(flowStart.flows)) {
          flowName = flowStart.flows[0]?.name || "Unknown Flow"
        } else {
          flowName = (flowStart.flows as { name: string }).name
        }
      }

      // Get all events for this flow execution (from flow_started to flow_completed or next flow_started)
      const { data: flowEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("contact_id", contactId)
        .eq("flow_id", flowId)
        .gte("created_at", flowStart.created_at)
        .order("created_at", { ascending: true })
        .limit(100)

      if (eventsError) {
        console.error("Error fetching flow events:", eventsError)
        continue
      }

      if (!flowEvents || flowEvents.length === 0) continue

      // Find the end of this flow execution
      let endIndex = flowEvents.length
      for (let i = 0; i < flowEvents.length; i++) {
        if (flowEvents[i].event_type === "flow_completed") {
          endIndex = i + 1
          break
        }
      }

      const relevantEvents = flowEvents.slice(0, endIndex)
      const lastEvent = relevantEvents[relevantEvents.length - 1]
      const status = lastEvent?.event_type === "flow_completed" 
        ? "completed" 
        : relevantEvents.some(e => e.event_type.includes("error"))
          ? "failed"
          : "in_progress"

      groups.push({
        flowId,
        flowName,
        startTime: flowStart.created_at,
        endTime: lastEvent?.created_at,
        status,
        events: relevantEvents.map(e => ({
          id: e.id,
          event_type: e.event_type,
          node_id: e.node_id,
          flow_id: e.flow_id,
          payload: e.payload || {},
          created_at: e.created_at,
          flowName,
        })),
      })
    }

    setFlowGroups(groups)
    setExpandedGroups(new Set([0])) // Expand first group by default
    setIsLoading(false)
  }

  const toggleGroup = (idx: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  const formatDuration = (start: string, end?: string) => {
    if (!end) return "In progress"
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-muted-foreground" />
            Flow Logs - {contactName || "Contact"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Showing last 10 flow executions with all node details
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : flowGroups.length === 0 ? (
          <Empty>
            <EmptyTitle>No flow logs yet</EmptyTitle>
            <EmptyDescription>
              Flow execution logs will appear here when flows are triggered for this contact
            </EmptyDescription>
          </Empty>
        ) : (
          <ScrollArea className="h-[65vh] pr-4">
            <div className="space-y-3">
              {flowGroups.map((group, groupIdx) => (
                <Collapsible
                  key={groupIdx}
                  open={expandedGroups.has(groupIdx)}
                  onOpenChange={() => toggleGroup(groupIdx)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full">
                      <div className={cn(
                        "px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors",
                        group.status === "completed" && "bg-emerald-50/50",
                        group.status === "failed" && "bg-red-50/50",
                        group.status === "in_progress" && "bg-amber-50/50"
                      )}>
                        <div className="flex items-center gap-3">
                          {expandedGroups.has(groupIdx) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Workflow className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{group.flowName}</span>
                          <Badge
                            variant={
                              group.status === "completed" ? "default" :
                              group.status === "failed" ? "destructive" : "secondary"
                            }
                            className="text-[10px] h-5"
                          >
                            {group.status === "completed" ? "Completed" :
                             group.status === "failed" ? "Failed" : "In Progress"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {group.events.length} events
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDuration(group.startTime, group.endTime)}</span>
                          <span>{new Date(group.startTime).toLocaleString()}</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t divide-y">
                        {group.events.map((event, eventIdx) => (
                          <div
                            key={event.id}
                            className="px-4 py-2.5 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground w-4 text-right">
                                  {eventIdx + 1}
                                </span>
                                <div className="mt-0.5">{getEventIcon(event.event_type)}</div>
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium">
                                    {formatEventType(event.event_type)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(event.created_at).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs break-words">
                                  {formatEventDetails(event)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
