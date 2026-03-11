"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  MessageSquare, X, Send, Bot, User, Loader2, Trash2,
  Sparkles, ChevronDown, Code, FileText, Zap, Maximize2, Minimize2,
} from "lucide-react"
import { DocContent } from "@/components/docs/doc-content"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  loading?: boolean
}

const SUGGESTIONS = [
  { icon: Code, text: "How does Protroit Agent work offline?" },
  { icon: FileText, text: "Explain SLM orchestration and intent detection" },
  { icon: Zap, text: "Best models for on-device inference?" },
  { icon: Sparkles, text: "Generate a ProtroitOS agent architecture plan" },
]

export function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
      }
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        loading: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput("")
      setIsStreaming(true)
      abortRef.current = new AbortController()

      try {
        const history = messages
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }))

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), history }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) throw new Error("API error")

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No stream")

        let accumulated = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.text) {
                  accumulated += parsed.text
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: accumulated, loading: false }
                        : m
                    )
                  )
                }
                if (parsed.error) throw new Error(parsed.error)
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content:
                    "Sorry, I encountered an error. Please check your **GOOGLE_API_KEY** environment variable is set correctly.",
                  loading: false,
                }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, isStreaming]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Panel sizing: expanded = near-fullscreen, normal = 400×600
  const panelClass = expanded
    ? "fixed inset-4 sm:inset-6 z-50 rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
    : "fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-[400px] h-[min(600px,calc(100vh-8rem))] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-slide-in-right"

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        className={cn(
          "fixed bottom-6 right-4 sm:right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          open
            ? "bg-zinc-800 border border-border scale-95"
            : "bg-amber-500 hover:bg-amber-400 amber-glow scale-100 hover:scale-105"
        )}
      >
        {open ? (
          <ChevronDown className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-black" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={panelClass}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">PyCode-SLM Assistant</p>
              <div className="flex items-center gap-1.5">
                <span className="status-dot completed" style={{ width: 6, height: 6 }} />
                <span className="text-[11px] text-muted-foreground">Gemini 2.5 Flash</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={expanded ? "Minimize" : "Expand"}
              >
                {expanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => { setOpen(false); setExpanded(false) }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-amber-400" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground">
                    PyCode-SLM Lab Assistant
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Ask about ML, fine-tuning, datasets, or architecture
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Suggestions
                  </p>
                  {SUGGESTIONS.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      onClick={() => sendMessage(text)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-muted/50 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-left"
                    >
                      <Icon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-[12px] text-foreground">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2.5",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2.5 text-[13px]",
                      msg.role === "user"
                        ? "bg-amber-500 text-black rounded-br-sm"
                        : "bg-muted border border-border rounded-bl-sm"
                    )}
                  >
                    {msg.loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground text-[12px]">Thinking…</span>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <div className="prose-dark text-[13px] [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_pre]:text-[11px]">
                        <DocContent content={msg.content} />
                      </div>
                    ) : (
                      <span className="leading-relaxed">{msg.content}</span>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-3.5 h-3.5 text-zinc-300" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-border p-3 flex-shrink-0">
            <div className="flex items-end gap-2 bg-muted rounded-xl px-3 py-2 border border-border focus-within:border-amber-500/40">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about LoRA, datasets, training…"
                rows={1}
                className="flex-1 bg-transparent text-foreground text-[13px] outline-none resize-none placeholder:text-muted-foreground min-h-[20px] max-h-[100px]"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "p-1.5 rounded-lg transition-all flex-shrink-0",
                  input.trim() && !isStreaming
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "text-muted-foreground"
                )}
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  )
}
