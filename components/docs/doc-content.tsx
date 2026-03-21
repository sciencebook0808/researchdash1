"use client"

/**
 * components/docs/doc-content.tsx
 *
 * Universal document content renderer.
 *
 * ─── Format detection ────────────────────────────────────────────────────────
 * TipTap (docs editor) stores HTML.      → sanitize with DOMPurify → render.
 * Agent / AI creates Markdown content.   → render via MarkdownRenderer.
 * Plain text (old notes, raw import).    → render via MarkdownRenderer (safe).
 *
 * This means ALL three paths use a visually consistent rendering pipeline:
 *   HTML  → DOMPurify → styled prose (matches MarkdownRenderer aesthetics)
 *   MD    → ReactMarkdown → same component tree as chat messages
 *   Plain → ReactMarkdown → same
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 * HTML path is sanitized with DOMPurify before rendering.
 * Only TipTap-safe tags + attributes are permitted.
 * javascript: URIs and event handlers are stripped.
 */

import DOMPurify from "isomorphic-dompurify"
import { MarkdownRenderer } from "@/components/chat/markdown-renderer"
import { isHtmlContent } from "@/lib/html-to-markdown"

// ─── DOMPurify config for TipTap HTML ────────────────────────────────────────

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del", "mark",
  "code", "pre", "kbd",
  "ul", "ol", "li",
  "blockquote",
  "a",
  "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "div", "span",
  "details", "summary",
  "sub", "sup",
]

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "class",
  "target", "rel",
  "width", "height",
  "colspan", "rowspan",
  "data-type", "data-id",        // TipTap extension attrs
]

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORCE_BODY:   true,
    ADD_ATTR:     ["target"],
    FORBID_ATTR:  ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
    FORBID_TAGS:  ["script", "style", "iframe", "object", "embed", "form"],
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocContentProps {
  content: string
  /** CSS class appended to the wrapper div */
  className?: string
}

export function DocContent({ content, className }: DocContentProps) {
  if (!content?.trim()) return null

  // ── Markdown / plain text path ──────────────────────────────────────────
  if (!isHtmlContent(content)) {
    return (
      <MarkdownRenderer
        content={content}
        className={className}
      />
    )
  }

  // ── HTML path (TipTap output) ────────────────────────────────────────────
  const clean = sanitize(content)

  return (
    <div
      className={`doc-html-content ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
