/**
 * lib/prisma.ts
 * Prisma ORM v7 singleton for Next.js 16 + Turbopack + any PostgreSQL provider.
 *
 * KEY FIX: Uses static top-level imports instead of dynamic require().
 * Turbopack statically traces ALL require() calls at bundle time, even those
 * inside try/catch, and fails the build if the path cannot be resolved.
 * Static imports are resolved correctly because prisma generate always runs
 * before next build in the build script.
 *
 * SSL is driven by the sslmode param in DATABASE_URL:
 *   sslmode=disable     -> no SSL (local / Docker)
 *   sslmode=require     -> SSL, no cert check (NeonDB, Nile, Supabase, Railway...)
 *   sslmode=verify-full -> SSL + full cert verification
 *   (absent)            -> SSL without cert check (safe default for cloud DBs)
 *
 * URL priority: DATABASE_URL -> POSTGRES_URL -> POSTGRES_PRISMA_URL
 */

// Static imports resolved at Turbopack bundle-analysis time.
// The build script runs `prisma generate` before `next build`, so these always exist.
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

export type PrismaClientType = InstanceType<typeof PrismaClient>

// ─── URL resolution ───────────────────────────────────────────────────────────

function getDatabaseUrl(): string | null {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    null
  )
}

const DATABASE_URL = getDatabaseUrl()
const IS_DATABASE_CONFIGURED = !!DATABASE_URL

// ─── SSL from sslmode URL param ───────────────────────────────────────────────

function buildSslConfig(
  sslmode: string | null
): false | { rejectUnauthorized: boolean } | undefined {
  switch (sslmode) {
    case "disable":
      return false
    case "allow":
    case "prefer":
    case "require":
      return { rejectUnauthorized: false }
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true }
    default:
      return { rejectUnauthorized: false }
  }
}

// ─── pg pool config parsed from URL ──────────────────────────────────────────

function buildPoolConfig(): ConstructorParameters<typeof PrismaPg>[0] {
  if (!DATABASE_URL) {
    throw new Error(
      "[Prisma] No database URL. Set DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL."
    )
  }

  let parsed: URL
  try {
    parsed = new URL(DATABASE_URL)
  } catch {
    throw new Error(
      "[Prisma] DATABASE_URL is not a valid URL. " +
        "Expected format: postgresql://user:password@host:5432/dbname?sslmode=require"
    )
  }

  const ssl = buildSslConfig(parsed.searchParams.get("sslmode"))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    host:     parsed.hostname,
    port:     parsed.port ? Number(parsed.port) : 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    max:      1,                  // 1 connection per serverless invocation
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis:       30_000,
  }

  if (ssl !== undefined) config.ssl = ssl

  return config
}

// ─── Stub when no DB configured ──────────────────────────────────────────────

function createStubClient(): PrismaClientType {
  const msg =
    "[Prisma] No database URL configured. " +
    "Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL)."

  return new Proxy({} as PrismaClientType, {
    get(_t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined
      if (typeof prop === "string" && !prop.startsWith("_")) {
        return new Proxy(() => {}, {
          get()   { throw new Error(msg + " Cannot access prisma." + prop + ".") },
          apply() { throw new Error(msg + " Cannot call prisma." + prop + "().") },
        })
      }
      return undefined
    },
  })
}

// ─── Client factory ───────────────────────────────────────────────────────────

function createPrismaClient(): PrismaClientType {
  if (process.env.NODE_ENV === "development") {
    const cfg = buildPoolConfig() as Record<string, unknown>
    console.log("[Prisma] Connecting to:", { ...cfg, password: "****" })
  }
  return new PrismaClient({
    adapter: new PrismaPg(buildPoolConfig()),
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  })
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined
}

function getPrismaClient(): PrismaClientType {
  if (!IS_DATABASE_CONFIGURED) return createStubClient()
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient()
  return globalForPrisma.prisma
}

export const prisma: PrismaClientType = getPrismaClient()

// Cache on globalThis in dev to survive hot-reloads without exhausting connections
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isDatabaseConfigured(): boolean {
  return IS_DATABASE_CONFIGURED
}

export async function withDatabase<T>(
  operation: () => Promise<T>
): Promise<T | null> {
  if (!IS_DATABASE_CONFIGURED) {
    console.warn("[Prisma] DB operation skipped — DATABASE_URL not configured.")
    return null
  }
  return operation()
}
