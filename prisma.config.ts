/**
 * prisma.config.ts
 * ----------------
 * Prisma ORM v7 — CLI configuration (migrations, db push, generate).
 *
 * The `datasource.url` here is used by Prisma CLI commands only.
 * Runtime queries use lib/prisma.ts which parses the URL and passes
 * a pg.PoolConfig directly to PrismaPg (bypassing the SSL override bug).
 *
 * For Supabase:
 *   DATABASE_URL     → use the "Direct connection" URL (port 5432, no pooler)
 *   POSTGRES_PRISMA_URL → Supavisor pooled URL (port 6543, for runtime)
 *
 * For migrations use the DIRECT URL — Supavisor transaction mode doesn't
 * support DDL statements.
 */
import { defineConfig } from "prisma/config"

// For migrations: prefer DATABASE_URL (direct), fall back to pooled URL
const migrationUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  // Fallback placeholder to allow prisma generate to succeed without a real DB
  "postgresql://placeholder:placeholder@localhost:5432/placeholder"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
})
