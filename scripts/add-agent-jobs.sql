-- ============================================================
-- Migration: Background Agent Jobs + Chat File Attachments
-- Run against your CockroachDB instance
-- ============================================================

-- 1. AgentJob — tracks a running/completed agent run
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS "AgentJob" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionId"    TEXT         NOT NULL,
  "status"       "JobStatus"  NOT NULL DEFAULT 'RUNNING',
  "finalContent" TEXT,
  "error"        TEXT,
  "provider"     TEXT         NOT NULL DEFAULT 'gemini',
  "modelId"      TEXT         NOT NULL DEFAULT 'gemini-2.5-flash',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentJob_sessionId_idx" ON "AgentJob" ("sessionId");
CREATE INDEX IF NOT EXISTS "AgentJob_status_idx"    ON "AgentJob" ("status");
CREATE INDEX IF NOT EXISTS "AgentJob_updatedAt_idx" ON "AgentJob" ("updatedAt");

-- 2. AgentJobEvent — one row per checkpointed SSE event
CREATE TABLE IF NOT EXISTS "AgentJobEvent" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "jobId"     TEXT         NOT NULL,
  "sequence"  INT4         NOT NULL,
  "eventType" TEXT         NOT NULL,
  "data"      JSONB        NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentJobEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentJobEvent_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "AgentJob"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentJobEvent_jobId_idx"     ON "AgentJobEvent" ("jobId");
CREATE INDEX IF NOT EXISTS "AgentJobEvent_jobId_seq_idx" ON "AgentJobEvent" ("jobId", "sequence");

-- 3. ChatAttachment — uploaded files linked to a chat session
CREATE TABLE IF NOT EXISTS "ChatAttachment" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionId" TEXT         NOT NULL,
  "messageId" TEXT,
  "name"      TEXT         NOT NULL,
  "mimeType"  TEXT         NOT NULL,
  "size"      INT4         NOT NULL DEFAULT 0,
  "url"       TEXT         NOT NULL,
  "content"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatAttachment_sessionId_idx" ON "ChatAttachment" ("sessionId");
