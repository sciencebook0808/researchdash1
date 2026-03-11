# Prausdit Research Lab — v6 Upgrade Guide
## OpenClaw-Compatible Agentic Research Platform

---

## What Changed in v6

### Architecture Upgrade

```
Previous (v5):                         v6 (OpenClaw-Compatible):
─────────────────────────────          ──────────────────────────────────────────
Chat UI                                Chat UI (Drawer + Full Workspace)
   ↓                                      ↓
/api/agent (basic)              →      /api/agent (enhanced reasoning loop)
   ↓                                      ↓
agent-engine.ts (12 tools)      →      agent-engine.ts (18 tools + workflows)
   ↓                                      ↓
Prisma / DB                            Tool Router → CRM APIs → Prisma / DB
                                          ↓
                                       /api/agent/workflow (autopilot triggers)
                                          ↓
                                       Knowledge Graph + RAG Search
```

### New Files
- `lib/agent-engine.ts` — Rewritten with OpenClaw-style reasoning loop, intent detection, workflow orchestration
- `lib/agent-tools.ts` — 18 tools (up from 12), including knowledge graph, benchmarking, dataset intelligence, research autopilot
- `app/api/agent/workflow/route.ts` — Programmatic workflow trigger API
- `app/api/search/route.ts` — Enhanced global search with auth
- `app/api/chat-sessions/` — Session-based shared chat history (from v6 session upgrade)
- `app/api/users/me/route.ts` — Current user profile endpoint

---

## Migration Steps

### 1. Run Database Migration

```bash
npx prisma db push
# or for production:
npx prisma migrate dev --name v6-chat-sessions
```

This adds the `ChatSession` and `ChatMessage` tables from the previous session upgrade.

### 2. Install Dependencies

```bash
npm install
# All dependencies remain the same — no new packages required
```

### 3. Verify Agent Route

No changes needed to `.env`. Same API keys work:
```env
GOOGLE_API_KEY=...           # or configure in Settings UI
OPENROUTER_API_KEY=...       # optional
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
DATABASE_URL=...
SUPER_ADMIN_EMAIL=...
```

---

## New Agentic Capabilities

### Tool Registry (18 tools)

| Tool | Category | Description |
|------|----------|-------------|
| `search_internal_docs` | RAG | Full-text search across all entities |
| `get_knowledge_graph` | RAG | Entity relationship map |
| `read_document` | Docs | Read full doc by slug |
| `create_document` | Docs | Create comprehensive documentation |
| `update_document` | Docs | Patch existing documentation |
| `create_note` | Notes | Save research note |
| `update_note` | Notes | Update research note |
| `create_roadmap_step` | Roadmap | Add roadmap phase + tasks |
| `update_roadmap_step` | Roadmap | Mark complete, update progress |
| `complete_roadmap_task` | Roadmap | Check off individual tasks |
| `create_experiment` | Experiments | Register ML experiment |
| `update_experiment` | Experiments | Record results, update status |
| `create_dataset` | Datasets | Register dataset with metadata |
| `update_dataset` | Datasets | Update preprocessing status |
| `analyze_dataset` | Datasets | Full dataset intelligence |
| `benchmark_model` | Benchmarks | Record scores + auto-generate report |
| `get_model_leaderboard` | Benchmarks | Ranked model comparison |
| `crawl_web` | Web | Fetch HTTPS pages (max 2/turn) |
| `run_research_autopilot` | Workflows | Full research planning workflow |

### Workflow Triggers (POST /api/agent/workflow)

Trigger autonomous workflows programmatically:

```json
POST /api/agent/workflow
{
  "workflow": "dataset_intelligence",
  "payload": { "datasetId": "clxxx..." },
  "provider": "gemini",
  "model": "gemini-2.5-flash"
}
```

Available workflows:
- `documentation_automation` — Auto-generate docs for any entity
- `roadmap_autopilot` — Update roadmap on completion events
- `experiment_planning` — Plan and create experiment suites
- `research_autopilot` — Full research pipeline for any topic
- `dataset_intelligence` — Deep dataset analysis + suggestions
- `model_benchmark` — Process benchmark scores + generate report

### Slash Commands (Chat Widget)

| Command | Action |
|---------|--------|
| `/document <topic>` | Auto-generate comprehensive documentation |
| `/experiment <topic>` | Plan and create ML experiments |
| `/dataset <name>` | Register and analyse a dataset |
| `/roadmap <milestone>` | Create roadmap steps with tasks |
| `/note <content>` | Save research note immediately |

### Research Autopilot Prompts

```
Start research for mobile-optimized SLM models
Research quantization techniques for edge deployment
Plan experiments for training a 300M parameter SLM
Analyse the instruction-tuning dataset
Benchmark model xyz and generate a report
The training pipeline is finished — update roadmap
```

---

## Security Model

The agent is sandboxed to CRM tools only:
- ❌ No shell/exec access
- ❌ No filesystem access outside Prisma
- ❌ No local/private IP web requests
- ✅ HTTPS-only web crawling (max 2 URLs/turn)
- ✅ All actions through typed Zod-validated tools
- ✅ Workflow triggers require developer role or higher

---

## Performance Tuning

### Agent Loop Limits
- Max tool steps: 20 (up from 15 in v5)
- History window: 14 messages (up from 12)
- Web crawl limit: 2 URLs/turn (enforced in system prompt)

### Database Query Optimization
- All search queries use `mode: "insensitive"` with indexed fields
- `take` limits on all findMany queries (max 10)
- Knowledge graph uses parallel Promise.all()
- Chat messages paginated at 50/page

### Caching Strategy
- Model settings cached per request (single `findFirst`)
- No in-memory state (stateless per request for free tier compatibility)

---

## OpenClaw Compatibility Notes

OpenClaw (npm package) is a **personal AI assistant CLI/daemon** designed to run
on your machine and connect to messaging platforms (WhatsApp, Telegram, etc.).

It is **not** an importable library for Next.js. The v6 upgrade implements the
**same architectural patterns** as OpenClaw natively:

| OpenClaw Concept | Prausdit v6 Implementation |
|-----------------|---------------------------|
| Agent Runtime | `lib/agent-engine.ts` (Vercel AI SDK streamText) |
| Tool Router | `lib/agent-tools.ts` (18 typed Zod tools) |
| Skills System | Workflow patterns in SYSTEM_PROMPT |
| Reasoning Loop | `stopWhen: stepCountIs(20)` |
| Session Management | `ChatSession` + `ChatMessage` DB tables |
| Knowledge Base | `search_internal_docs` + `get_knowledge_graph` |
| Webhook Triggers | `POST /api/agent/workflow` |

If you want to run OpenClaw as a standalone assistant alongside this CRM:
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

But for the CRM's agentic capabilities, everything is built-in.

---

v6.0.0 — Prausdit Research Lab Agentic Platform
