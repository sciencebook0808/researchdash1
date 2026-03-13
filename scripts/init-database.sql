-- Prausdit Research Lab — Database Initialization
-- This script creates all required tables for the application
-- Run with: Execute this script in your database management tool or via Prisma

-- Users & Roles
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'developer', 'user');

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_clerkId_idx" ON "User"("clerkId");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Roadmap
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE IF NOT EXISTS "RoadmapStep" (
    "id" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT,
    "milestone" TEXT,
    "estimatedCompletion" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RoadmapStep_phase_idx" ON "RoadmapStep"("phase");
CREATE INDEX IF NOT EXISTS "RoadmapStep_status_idx" ON "RoadmapStep"("status");

CREATE TABLE IF NOT EXISTS "RoadmapTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "stepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoadmapTask_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "RoadmapStep"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RoadmapTask_stepId_idx" ON "RoadmapTask"("stepId");

-- Documentation
CREATE TYPE "DocProgress" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE IF NOT EXISTS "DocumentationPage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progress" "DocProgress" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentationPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentationPage_slug_key" ON "DocumentationPage"("slug");
CREATE INDEX IF NOT EXISTS "DocumentationPage_section_idx" ON "DocumentationPage"("section");
CREATE INDEX IF NOT EXISTS "DocumentationPage_slug_idx" ON "DocumentationPage"("slug");

CREATE TABLE IF NOT EXISTS "DocVersion" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "pageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DocVersion_pageId_idx" ON "DocVersion"("pageId");

-- Datasets
CREATE TYPE "DatasetType" AS ENUM ('CODE', 'TEXT', 'INSTRUCTION', 'QA', 'MIXED');
CREATE TYPE "PreprocStatus" AS ENUM ('RAW', 'CLEANING', 'CLEANED', 'FORMATTED', 'AUGMENTED', 'READY');

CREATE TABLE IF NOT EXISTS "Dataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "datasetType" "DatasetType" NOT NULL,
    "numSamples" INTEGER,
    "sizeBytes" BIGINT,
    "preprocessStatus" "PreprocStatus" NOT NULL DEFAULT 'RAW',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT,
    "license" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Dataset_datasetType_idx" ON "Dataset"("datasetType");
CREATE INDEX IF NOT EXISTS "Dataset_preprocessStatus_idx" ON "Dataset"("preprocessStatus");

-- Experiments
CREATE TYPE "ExperimentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS "Experiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseModel" TEXT NOT NULL,
    "datasetId" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "resultSummary" TEXT,
    "config" JSONB,
    "loraRank" INTEGER,
    "loraAlpha" INTEGER,
    "batchSize" INTEGER,
    "learningRate" DOUBLE PRECISION,
    "epochs" INTEGER,
    "evalLoss" DOUBLE PRECISION,
    "evalAccuracy" DOUBLE PRECISION,
    "bleuScore" DOUBLE PRECISION,
    "pass1Score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Experiment_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Experiment_status_idx" ON "Experiment"("status");
CREATE INDEX IF NOT EXISTS "Experiment_datasetId_idx" ON "Experiment"("datasetId");

CREATE TABLE IF NOT EXISTS "ExperimentLog" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "loss" DOUBLE PRECISION,
    "learningRate" DOUBLE PRECISION,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExperimentLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExperimentLog_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ExperimentLog_experimentId_idx" ON "ExperimentLog"("experimentId");

-- Model Versions
CREATE TYPE "QuantizationType" AS ENUM ('NONE', 'INT8', 'INT4', 'GPTQ', 'GGUF', 'AWQ');

CREATE TABLE IF NOT EXISTS "ModelVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "parameterCount" BIGINT,
    "experimentId" TEXT,
    "quantization" "QuantizationType",
    "deploymentFormat" TEXT,
    "bleuScore" DOUBLE PRECISION,
    "pass1Score" DOUBLE PRECISION,
    "humanEval" DOUBLE PRECISION,
    "mmluScore" DOUBLE PRECISION,
    "fileSizeBytes" BIGINT,
    "isDeployed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelVersion_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ModelVersion_version_idx" ON "ModelVersion"("version");
CREATE INDEX IF NOT EXISTS "ModelVersion_experimentId_idx" ON "ModelVersion"("experimentId");

-- AI Settings
CREATE TABLE IF NOT EXISTS "AISettings" (
    "id" TEXT NOT NULL,
    "defaultProvider" TEXT NOT NULL DEFAULT 'gemini',
    "geminiApiKey" TEXT,
    "geminiDefaultModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "openrouterApiKey" TEXT,
    "selectedOpenRouterModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AISettings_pkey" PRIMARY KEY ("id")
);

-- Notes
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Note_pinned_idx" ON "Note"("pinned");

-- Chat Sessions
CREATE TYPE "ChatVisibility" AS ENUM ('team', 'private');

CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT,
    "visibility" "ChatVisibility" NOT NULL DEFAULT 'team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatSession_creatorId_idx" ON "ChatSession"("creatorId");
CREATE INDEX IF NOT EXISTS "ChatSession_visibility_idx" ON "ChatSession"("visibility");
CREATE INDEX IF NOT EXISTS "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");
