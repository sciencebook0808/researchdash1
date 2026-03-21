/**
 * lib/agent-job.ts
 *
 * Utilities for the background agent job system.
 * Every agent invocation creates an AgentJob row; every SSE event is
 * checkpointed as an AgentJobEvent row so clients can reconnect and
 * replay the full event stream without data loss.
 */

import { prisma } from "./prisma"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentJobRecord {
  id:           string
  sessionId:    string
  status:       "RUNNING" | "COMPLETED" | "FAILED"
  finalContent: string | null
  error:        string | null
  provider:     string
  modelId:      string
  createdAt:    Date
  updatedAt:    Date
}

export interface AgentJobEventRecord {
  id:        string
  jobId:     string
  sequence:  number
  eventType: string
  data:      unknown
  createdAt: Date
}

// ─── Job CRUD ─────────────────────────────────────────────────────────────────

/**
 * Create a new AgentJob record.
 * Returns null if the DB is unavailable (non-fatal: streaming still works,
 * just without persistence / reconnection support).
 */
export async function createAgentJob(
  sessionId: string,
  provider: string,
  modelId: string
): Promise<AgentJobRecord | null> {
  try {
    const job = await prisma.agentJob.create({
      data: { sessionId, provider, modelId, status: "RUNNING" },
    })
    return job as AgentJobRecord
  } catch (err) {
    console.warn("[agent-job] Could not create job (DB unavailable?):", err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Append a single SSE event to the job's checkpoint log.
 * sequence must be monotonically increasing — callers manage their own counter.
 */
export async function appendJobEvent(
  jobId: string,
  sequence: number,
  eventType: string,
  data: unknown
): Promise<void> {
  try {
    await prisma.agentJobEvent.create({
      data: {
        jobId,
        sequence,
        eventType,
        data: data as Parameters<typeof prisma.agentJobEvent.create>[0]["data"]["data"],
      },
    })
  } catch (err) {
    // Non-fatal: checkpoint failure should not kill the live stream
    console.warn("[agent-job] appendJobEvent failed:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Update job status to COMPLETED or FAILED.
 * Also stores the final accumulated assistant content.
 */
export async function finalizeAgentJob(
  jobId: string,
  status: "COMPLETED" | "FAILED",
  finalContent?: string,
  error?: string
): Promise<void> {
  try {
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status,
        finalContent: finalContent ?? null,
        error:        error        ?? null,
        updatedAt:    new Date(),
      },
    })
  } catch (err) {
    console.warn("[agent-job] finalizeAgentJob failed:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Load a job and all its checkpointed events.
 * Used by the SSE reconnect endpoint.
 */
export async function getJobWithEvents(
  jobId: string,
  fromSequence = 0
): Promise<{ job: AgentJobRecord; events: AgentJobEventRecord[] } | null> {
  try {
    const [job, events] = await Promise.all([
      prisma.agentJob.findUnique({ where: { id: jobId } }),
      prisma.agentJobEvent.findMany({
        where: { jobId, sequence: { gte: fromSequence } },
        orderBy: { sequence: "asc" },
      }),
    ])
    if (!job) return null
    return { job: job as AgentJobRecord, events: events as AgentJobEventRecord[] }
  } catch (err) {
    console.warn("[agent-job] getJobWithEvents failed:", err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Poll for new events since `afterSequence`.
 * Returns new events AND the current job status.
 */
export async function pollNewEvents(
  jobId: string,
  afterSequence: number
): Promise<{ events: AgentJobEventRecord[]; status: "RUNNING" | "COMPLETED" | "FAILED" }> {
  try {
    const [events, job] = await Promise.all([
      prisma.agentJobEvent.findMany({
        where: { jobId, sequence: { gt: afterSequence } },
        orderBy: { sequence: "asc" },
      }),
      prisma.agentJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      }),
    ])
    return {
      events: events as AgentJobEventRecord[],
      status: (job?.status ?? "FAILED") as "RUNNING" | "COMPLETED" | "FAILED",
    }
  } catch {
    return { events: [], status: "FAILED" }
  }
}

/**
 * Get job status only (cheap DB read for polling fallback).
 */
export async function getJobStatus(
  jobId: string
): Promise<"RUNNING" | "COMPLETED" | "FAILED" | null> {
  try {
    const job = await prisma.agentJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    })
    return (job?.status ?? null) as "RUNNING" | "COMPLETED" | "FAILED" | null
  } catch {
    return null
  }
}
