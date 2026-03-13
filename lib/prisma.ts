/**
 * lib/prisma.ts — Prisma ORM v7.5 singleton for Vercel + PostgreSQL
 * ─────────────────────────────────────────────────────────────────
 * Compatible with: Neon, Supabase, AWS RDS, Azure PostgreSQL, Google Cloud SQL, Aiven
 *
 * SSL Configuration:
 *   Parse the URL manually → build pg.PoolConfig WITHOUT connectionString
 *   so our ssl config is the ONLY ssl source (avoids sslmode override issues).
 *
 * Import path: generated/prisma/client (Prisma v7+ requires explicit output in schema)
 * Connection priority: POSTGRES_PRISMA_URL → POSTGRES_URL → DATABASE_URL
 */

import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg }     from "@prisma/adapter-pg"
import type { PoolConfig } from "pg"

// ─── connection string resolution ───────────────────────────────────────────

function getRawUrl(): string {
  const url =
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL?.trim()        ||
    process.env.DATABASE_URL?.trim()

  if (!url) {
    throw new Error(
      "No DB URL found. Set POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL."
    )
  }
  return url
}

// ─── build PoolConfig without connectionString (bypasses SSL override bug) ──

function buildPoolConfig(): PoolConfig {
  const raw = getRawUrl()
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${raw.slice(0, 50)}…`)
  }

  return {
    host:     parsed.hostname,
    port:     parsed.port ? Number(parsed.port) : 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    // ssl object is the ONLY ssl source — no connectionString to override it
    ssl: { rejectUnauthorized: false },
    // 1 connection per serverless invocation — prevents pool exhaustion
    max: 1,
    // Match Prisma v6 defaults (per prisma.io/docs connection-pool guide)
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis:       300_000,
  }
}

// ─── singleton ───────────────────────────────────────────────────────────────

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(buildPoolConfig()),
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
