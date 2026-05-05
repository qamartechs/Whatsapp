"use client"

import {
  Play,
  MessageSquare,
  MousePointerClick,
  List,
  LayoutGrid,
  GitBranch,
  Globe,
  Clock,
  Sparkles,
  Workflow,
  Variable,
  Tags,
  Route,
  MessageCircle,
  UserRoundCog,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { NodeType } from "@/lib/types"

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void
}

const nodeOptions: Array<{
  type: NodeType
  label: string
  description: string
  icon: React.ReactNode
  color: string
}> = [
  {
    type: "message",
    label: "Message",
    description: "Send text, media, buttons, lists, or cards",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-blue-600 hover:bg-blue-50",
  },
  {
    type: "list",
    label: "List (Legacy)",
    description: "Send a list menu (use Message node instead)",
    icon: <List className="h-4 w-4" />,
    color: "text-orange-600 hover:bg-orange-50",
  },
  {
    type: "condition",
    label: "Condition",
    description: "Branch based on conditions",
    icon: <GitBranch className="h-4 w-4" />,
    color: "text-amber-600 hover:bg-amber-50",
  },
  {
    type: "api",
    label: "API",
    description: "Make HTTP request",
    icon: <Globe className="h-4 w-4" />,
    color: "text-cyan-600 hover:bg-cyan-50",
  },
  {
    type: "delay",
    label: "Delay",
    description: "Wait before continuing",
    icon: <Clock className="h-4 w-4" />,
    color: "text-slate-600 hover:bg-slate-50",
  },
  {
    type: "ai",
    label: "AI",
    description: "Generate AI response",
    icon: <Sparkles className="h-4 w-4" />,
    color: "text-violet-600 hover:bg-violet-50",
  },
  {
    type: "flow",
    label: "Flow",
    description: "Call another flow or step",
    icon: <Workflow className="h-4 w-4" />,
    color: "text-teal-600 hover:bg-teal-50",
  },

  {
    type: "setVariable",
    label: "Set Variable",
    description: "Create or modify variables",
    icon: <Variable className="h-4 w-4" />,
    color: "text-violet-600 hover:bg-violet-50",
  },
  {
    type: "setLabel",
    label: "Set Label",
    description: "Add or remove contact labels",
    icon: <Tags className="h-4 w-4" />,
    color: "text-purple-600 hover:bg-purple-50",
  },
  {
    type: "aiTrigger",
    label: "AI Trigger",
    description: "AI-powered routing to different flows",
    icon: <Route className="h-4 w-4" />,
    color: "text-indigo-600 hover:bg-indigo-50",
  },
  {
    type: "aiChat",
    label: "AI Chat",
    description: "Conversational AI chat with wait/debounce",
    icon: <MessageCircle className="h-4 w-4" />,
    color: "text-purple-600 hover:bg-purple-50",
  },
  {
    type: "transferToHuman",
    label: "Transfer to Human",
    description: "Hand off conversation to human agent",
    icon: <UserRoundCog className="h-4 w-4" />,
    color: "text-amber-600 hover:bg-amber-50",
  },
]

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-1 rounded-lg border bg-card p-2 shadow-lg">
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Add Node
        </div>
        {nodeOptions.map((option) => (
          <Tooltip key={option.type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`justify-start gap-2 ${option.color}`}
                onClick={() => onAddNode(option.type)}
              >
                {option.icon}
                <span className="text-foreground">{option.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{option.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
