/**
 * prisma.config.ts
 * ----------------
 * Prisma ORM v7.5 — CLI configuration (migrations, db push, generate).
 *
 * The `datasource.url` here is used by Prisma CLI commands only.
 * Runtime queries use lib/prisma.ts which parses the URL and passes
 * a pg.PoolConfig directly to PrismaPg (bypassing the SSL override bug).
 *
 * Connection priority: DATABASE_URL → POSTGRES_PRISMA_URL → POSTGRES_URL
 * If no URL is found, a placeholder is used to allow prisma generate to succeed.
 */
import "dotenv/config"
import { defineConfig } from "prisma/config"

// For migrations: prefer DATABASE_URL (direct), fall back to pooled URL
// Use placeholder if no real URL is available (allows prisma generate to work)
const migrationUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
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
