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
 *
 * SAFETY:
 *   If no DATABASE_URL is configured, this module exports a stub Prisma client
 *   that throws clear developer errors instead of crashing the application.
 */

// NOTE: We avoid importing PoolConfig from "pg" directly because
// @prisma/adapter-pg bundles its own @types/pg which can conflict.
// Instead we use a plain object and cast when passing to PrismaPg.

// ─── Conditional imports - only load heavy modules if DB is configured ───────

let PrismaClient: typeof import("../generated/prisma/client").PrismaClient
let PrismaPg: typeof import("@prisma/adapter-pg").PrismaPg

// ─── Check if database is configured ─────────────────────────────────────────

function getDatabaseUrl(): string | null {
  const url =
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim()
  return url || null
}

const DATABASE_URL = getDatabaseUrl()
const IS_DATABASE_CONFIGURED = !!DATABASE_URL

// ─── connection string resolution ───────────────────────────────────────────

function getRawUrl(): string {
  if (!DATABASE_URL) {
    throw new Error(
      "[Prisma] Database not configured. Set POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL environment variable."
    )
  }
  return DATABASE_URL
}

// ─── build PoolConfig without connectionString (bypasses SSL override bug) ──

function buildPoolConfig(): Record<string, unknown> {
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

// ─── Types ───────────────────────────────────────────────────────────────────

type PrismaClientType = import("../generated/prisma/client").PrismaClient

// ─── Check if Prisma client is generated ─────────────────────────────────────

let PRISMA_CLIENT_AVAILABLE = false
try {
  require.resolve("../generated/prisma/client")
  PRISMA_CLIENT_AVAILABLE = true
} catch {
  // Prisma client not generated yet - this is expected before first `prisma generate`
  console.warn(
    "[Prisma] Generated client not found. Run 'npx prisma generate' to create it."
  )
}

// ─── Lazy-load singleton ─────────────────────────────────────────────────────

function createPrismaClient(): PrismaClientType {
  if (!PRISMA_CLIENT_AVAILABLE) {
    throw new Error(
      "[Prisma] Generated client not found. Run 'npx prisma generate' first."
    )
  }

  // Lazy load modules only when creating the client
  if (!PrismaClient) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prismaModule = require("../generated/prisma/client")
    PrismaClient = prismaModule.PrismaClient
  }
  if (!PrismaPg) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adapterModule = require("@prisma/adapter-pg")
    PrismaPg = adapterModule.PrismaPg
  }

  return new PrismaClient({
    adapter: new PrismaPg(buildPoolConfig() as ConstructorParameters<typeof PrismaPg>[0]),
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClientType | undefined }

// Only create prisma client if database is configured and client is available
function getPrismaClient(): PrismaClientType {
  if (!IS_DATABASE_CONFIGURED || !PRISMA_CLIENT_AVAILABLE) {
    // Return a proxy that throws helpful errors when database is not configured
    return new Proxy({} as PrismaClientType, {
      get(_target, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return undefined // Allow awaiting to work without error
        }
        if (typeof prop === "string" && !prop.startsWith("_")) {
          const errorMsg = !IS_DATABASE_CONFIGURED
              ? `[Prisma] Database not configured. Set DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL environment variable.`
              : `[Prisma] Generated client not found. Run 'npx prisma generate' first.`
          return new Proxy(() => {}, {
            get() {
              throw new Error(`${errorMsg} Cannot access prisma.${prop}.`)
            },
            apply() {
              throw new Error(`${errorMsg} Cannot call prisma.${prop}().`)
            },
          })
        }
        return undefined
      },
    })
  }
  return globalForPrisma.prisma ?? createPrismaClient()
}

export const prisma: PrismaClientType = getPrismaClient()

if (process.env.NODE_ENV !== "production" && IS_DATABASE_CONFIGURED) {
  globalForPrisma.prisma = prisma
}

// ─── Helper to check if database is ready ────────────────────────────────────

export function isDatabaseConfigured(): boolean {
  return IS_DATABASE_CONFIGURED && PRISMA_CLIENT_AVAILABLE
}

/**
 * Safe wrapper for database operations.
 * Returns null instead of throwing if the database is not configured.
 */
export async function withDatabase<T>(
  operation: () => Promise<T>
): Promise<T | null> {
  if (!IS_DATABASE_CONFIGURED) {
    console.warn(
      "[Prisma] Database operation skipped: no database URL configured. " +
      "Set DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL to enable database features."
    )
    return null
  }
  return operation()
}
