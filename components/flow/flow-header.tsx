"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Save,
  Play,
  Settings,
  MoreHorizontal,
  Trash2,
  Copy,
  Rocket,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useFlowStore } from "@/lib/stores/flow-store"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface FlowHeaderProps {
  onOpenSimulator: () => void
}

export function FlowHeader({ onOpenSimulator }: FlowHeaderProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)

  const {
    flowId,
    flowName,
    flowDescription,
    isActive,
    triggerKeywords,
    nodes,
    edges,
    variables,
    isDirty,
    hasUnpublishedChanges,
    publishedAt,
    setFlowName,
    setFlowDescription,
    setIsActive,
    setTriggerKeywords,
    markClean,
    publish,
  } = useFlowStore()

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save flows",
          variant: "destructive",
        })
        return
      }

      const flowData = {
        user_id: user.id,
        name: flowName,
        description: flowDescription,
        nodes,
        edges,
        variables,
        is_active: isActive,
        trigger_keywords: triggerKeywords,
      }

      if (flowId) {
        const { error } = await supabase
          .from("flows")
          .update(flowData)
          .eq("id", flowId)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("flows")
          .insert(flowData)
          .select()
          .single()

        if (error) throw error

        if (data) {
          router.replace(`/dashboard/flows/${data.id}`)
        }
      }

      markClean()
      toast({
        title: "Saved",
        description: "Draft saved successfully",
      })
    } catch (error) {
      console.error("Save error:", error)
      toast({
        title: "Error",
        description: "Failed to save flow",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!flowId) {
      toast({
        title: "Save First",
        description: "Please save your flow before publishing",
        variant: "destructive",
      })
      return
    }

    setIsPublishing(true)
    try {
      const supabase = createClient()

      // First save current changes
      const { error: saveError } = await supabase
        .from("flows")
        .update({
          name: flowName,
          description: flowDescription,
          nodes,
          edges,
          variables,
          is_active: isActive,
          trigger_keywords: triggerKeywords,
          // Copy current nodes/edges to published
          published_nodes: nodes,
          published_edges: edges,
          published_at: new Date().toISOString(),
        })
        .eq("id", flowId)

      if (saveError) throw saveError

      publish()
      markClean()
      setShowPublishConfirm(false)

      toast({
        title: "Published",
        description: "Your flow is now live and will be used for new conversations",
      })
    } catch (error) {
      console.error("Publish error:", error)
      toast({
        title: "Error",
        description: "Failed to publish flow",
        variant: "destructive",
      })
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/flows")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-8 w-[200px] border-none bg-transparent text-lg font-medium focus-visible:ring-0"
            />
            {isActive && (
              <Badge variant="default" className="bg-emerald-500">
                Active
              </Badge>
            )}
            {isDirty && (
              <Badge variant="secondary" className="text-muted-foreground">
                Unsaved
              </Badge>
            )}
            {hasUnpublishedChanges && publishedAt && (
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                <AlertCircle className="mr-1 h-3 w-3" />
                Unpublished
              </Badge>
            )}
            {!publishedAt && flowId && (
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                Draft
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenSimulator}>
            <Play className="mr-2 h-4 w-4" />
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowPublishConfirm(true)}
            disabled={isPublishing || !flowId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Rocket className="mr-2 h-4 w-4" />
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Publish Confirmation */}
      <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Flow?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing will make this version of the flow live. All new conversations
              will use this published version. Your current draft will be saved automatically.
              {publishedAt && (
                <p className="mt-2 text-sm">
                  Last published: {new Date(publishedAt).toLocaleString()}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePublish}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Publish Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flow Settings</DialogTitle>
            <DialogDescription>
              Configure your flow settings and triggers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Flow Name</Label>
              <Input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
                placeholder="Describe what this flow does..."
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Enable this flow to receive messages
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="space-y-2">
              <Label>Trigger Keywords</Label>
              <Textarea
                value={triggerKeywords.join(", ")}
                onChange={(e) =>
                  setTriggerKeywords(
                    e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="hello, hi, start (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Keywords that trigger this flow. Leave empty to match all messages.
              </p>
            </div>
            {publishedAt && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm font-medium">Publishing Info</p>
                <p className="text-xs text-muted-foreground">
                  Last published: {new Date(publishedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
