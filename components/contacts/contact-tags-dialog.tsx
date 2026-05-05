"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, X, Tag } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ContactTagsDialogProps {
  contactId: string | null
  contactName: string | null
  currentTags: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onTagsUpdated?: (tags: string[]) => void
}

const SUGGESTED_TAGS = [
  "VIP",
  "Lead",
  "Customer",
  "Support",
  "New",
  "Interested",
  "Follow-up",
  "Priority",
]

export function ContactTagsDialog({
  contactId,
  contactName,
  currentTags,
  open,
  onOpenChange,
  onTagsUpdated,
}: ContactTagsDialogProps) {
  const [tags, setTags] = useState<string[]>(currentTags || [])
  const [newTag, setNewTag] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    setTags(currentTags || [])
  }, [currentTags, open])

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
    }
    setNewTag("")
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const saveTags = async () => {
    if (!contactId) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ tags })
        .eq("id", contactId)

      if (error) throw error

      toast({
        title: "Tags updated",
        description: `Tags saved for ${contactName || "contact"}`,
      })

      onTagsUpdated?.(tags)
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving tags:", error)
      toast({
        title: "Error",
        description: "Failed to save tags",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const unusedSuggestedTags = SUGGESTED_TAGS.filter((t) => !tags.includes(t))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Manage Tags
          </DialogTitle>
          <DialogDescription>
            Add or remove tags for {contactName || "this contact"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Tags */}
          <div className="space-y-2">
            <Label>Current Tags</Label>
            <div className="flex flex-wrap gap-2 min-h-[40px] p-2 rounded-md border bg-muted/30">
              {tags.length === 0 ? (
                <span className="text-sm text-muted-foreground">No tags yet</span>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-sm text-emerald-700"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-emerald-900 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Add New Tag */}
          <div className="space-y-2">
            <Label>Add New Tag</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Enter tag name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTag(newTag)
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => addTag(newTag)}
                disabled={!newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Suggested Tags */}
          {unusedSuggestedTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Suggested Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {unusedSuggestedTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="rounded-full border border-dashed border-muted-foreground/30 px-2.5 py-1 text-xs text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={saveTags} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Tags"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
