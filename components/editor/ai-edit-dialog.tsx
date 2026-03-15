"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface AIEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedText: string
  onAccept: (newText: string, modelName: string) => void
  onCancel?: () => void
}

const AI_MODEL = "Gemini-2.5-Flash"

export function AIEditDialog({
  open,
  onOpenChange,
  selectedText,
  onAccept,
  onCancel,
}: AIEditDialogProps) {
  const [instruction, setInstruction] = useState("")
  const [suggestedText, setSuggestedText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!instruction.trim()) return
    
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selectedText,
          instruction: instruction.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate AI edit")
      }

      const data = await response.json()
      setSuggestedText(data.result || selectedText)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccept = () => {
    onAccept(suggestedText || selectedText, AI_MODEL)
    resetState()
  }

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
    resetState()
  }

  const resetState = () => {
    setInstruction("")
    setSuggestedText("")
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Edit with AI
          </DialogTitle>
          <DialogDescription>
            Describe how you want to modify the selected text. AI will suggest improvements.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original text preview */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Selected Text
            </label>
            <div className="p-3 rounded-lg bg-muted/50 border border-border text-[13px] max-h-24 overflow-y-auto">
              {selectedText.length > 200 ? `${selectedText.slice(0, 200)}...` : selectedText}
            </div>
          </div>

          {/* Instruction input */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Instructions
            </label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g., Make it more concise, Fix grammar, Improve clarity..."
              className="min-h-[80px] text-[13px]"
            />
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isLoading || !instruction.trim()}
            className="w-full"
            variant="outline"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Suggestion
              </>
            )}
          </Button>

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[13px]">
              {error}
            </div>
          )}

          {/* Suggested text */}
          {suggestedText && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  AI Suggestion
                </label>
                <span className="text-[10px] text-amber-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {AI_MODEL}
                </span>
              </div>
              <Textarea
                value={suggestedText}
                onChange={(e) => setSuggestedText(e.target.value)}
                className="min-h-[120px] text-[13px] border-amber-500/30"
              />
              <Button
                onClick={handleGenerate}
                variant="ghost"
                size="sm"
                className="text-[11px] text-muted-foreground"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleCancel}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!suggestedText}
            className="bg-amber-500 hover:bg-amber-400 text-black"
          >
            <Check className="w-4 h-4 mr-1" />
            Accept Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
