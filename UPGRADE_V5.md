# Prausdit Research Lab — v5 Upgrade Notes

## What Changed in v5

### ⚠️ OpenClaw Finding
OpenClaw is NOT an embeddable Next.js agent framework — it is a standalone desktop
multi-channel messaging gateway application. Installing any `openclaw` npm package
is also actively dangerous: as of March 2026, a fake package `@openclaw-ai/openclawai`
on npm deploys GhostLoader RAT malware.

**The correct solution for embedded agentic AI in Next.js is the Vercel AI SDK.**

---

## New Architecture: Vercel AI SDK Agent

### New packages added
| Package | Purpose |
|---|---|
| `ai` ^4.3.x | Vercel AI SDK core — `streamText`, `tool`, `stepCountIs` |
| `@ai-sdk/google` ^1.2.x | Gemini provider adapter |
| `@ai-sdk/openai` ^1.3.x | OpenRouter adapter (OpenAI-compatible) |
| `zod` ^3.23.x | Type-safe tool parameter schemas |

### New files
| File | Purpose |
|---|---|
| `lib/agent-tools.ts` | 12 tool definitions with Zod schemas + Prisma execution |
| `lib/agent-engine.ts` | Agent runner using `streamText` with `stopWhen: stepCountIs(15)` |
| `app/api/agent/route.ts` | New streaming POST endpoint replacing `/api/chat` |

### Modified files
| File | Change |
|---|---|
| `package.json` | Added 4 new packages, bumped version to 0.5.0 |
| `components/chatbot/chatbot-widget.tsx` | Fully rebuilt with agentic UI + step indicators |
| `app/api/chat/route.ts` | Kept as fallback — unchanged |

---

## Agent Capabilities

### Tools (12 total)
```
search_internal_docs   → Search docs, experiments, datasets, notes, roadmap
read_document          → Read a documentation page by slug
create_document        → Create a documentation page in the DB
update_document        → Update an existing doc
create_note            → Create a research note
create_roadmap_step    → Add a roadmap step with tasks
update_roadmap_step    → Update status/progress of a step
create_experiment      → Create an ML experiment record
update_experiment      → Update experiment status/results
create_dataset         → Register a new dataset
update_dataset         → Update dataset preprocessing status
crawl_web              → Fetch and parse a public HTTPS URL
```

### Security constraints
- No shell/terminal access
- No local filesystem access outside the Prisma DB
- Web crawling restricted to HTTPS + blocks private IP ranges
- Max 15 agent steps per turn (prevents infinite loops)
- Max 2 web crawls per turn recommended via system prompt

### Reasoning loop (per Vercel AI SDK)
```
1. User sends message
2. streamText sends to model with tools attached
3. Model decides: generate text OR call a tool
4. If tool call: execute → result appended → new LLM step
5. Repeat until: final text response OR stepCountIs(15)
6. SSE stream delivers text chunks + step events to UI
```

### SSE event format
```json
{ "type": "status",      "text": "💭 Planning next step…",       "step": 2 }
{ "type": "tool_call",   "tool": "search_internal_docs", "text": "🔍 Searching knowledge base", "args": {...} }
{ "type": "tool_result", "tool": "search_internal_docs", "text": "✓ search_internal_docs completed", "result": {...} }
{ "type": "text",        "text": "Based on my research…" }
{ "type": "done" }
{ "type": "error",       "text": "…" }
```

---

## Setup Steps

```bash
npm install        # Install new packages (ai, @ai-sdk/google, @ai-sdk/openai, zod)
npx prisma db push # No schema changes in v5 — AISettings already added in v4
npm run dev
```

The agent uses API keys already configured in Settings → Manage API.
If no DB keys exist it falls back to GOOGLE_API_KEY / OPENROUTER_API_KEY env vars.
