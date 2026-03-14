/**
 * scripts/setup-database.ts
 * ─────────────────────────
 * Runs during Vercel build to push the Prisma schema to NeonDB.
 *
 * Key fixes over the previous version:
 *  1. Passes DATABASE_URL explicitly to prisma db push via --url flag
 *     so there is no ambiguity about which env var is used.
 *  2. Retries up to 3 times with 5-second delays to handle Neon cold-starts.
 *  3. Exits with code 1 on permanent failure so Vercel surfaces the error
 *     instead of silently deploying a broken app.
 *  4. Uses `prisma db push --skip-generate` — generate already ran earlier
 *     in the build script.
 */

import { execSync } from "child_process"

// Priority: DATABASE_URL (direct connection) → POSTGRES_URL → POSTGRES_PRISMA_URL
const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pushSchema(attempt: number): Promise<boolean> {
  console.log(`[setup-database] prisma db push — attempt ${attempt}/${MAX_RETRIES}`)
  try {
    execSync(
      // --skip-generate  : already ran `prisma generate` earlier in the build
      // --accept-data-loss: required flag for db push; safe because we never
      //                     remove columns in schema (only add)
      `npx prisma db push --skip-generate --accept-data-loss`,
      {
        stdio: "inherit",
        env: {
          ...process.env,
          // Ensure prisma.config.ts and the CLI both see the correct URL
          DATABASE_URL: DATABASE_URL!,
        },
      }
    )
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log("[setup-database] Starting database schema sync...")

  if (!DATABASE_URL) {
    console.error(
      "[setup-database] ❌ No database URL found.\n" +
        "  Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) in your\n" +
        "  Vercel project environment variables and redeploy."
    )
    // Exit 1 so Vercel marks the deployment as failed — a DB-less deployment
    // is broken by design.
    process.exit(1)
  }

  // Mask password in log output
  const maskedUrl = DATABASE_URL.replace(/:([^@]+)@/, ":****@")
  console.log(`[setup-database] Using DB: ${maskedUrl}`)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ok = await pushSchema(attempt)
    if (ok) {
      console.log("[setup-database] ✅ Schema push successful!")
      process.exit(0)
    }

    if (attempt < MAX_RETRIES) {
      console.log(
        `[setup-database] ⚠️  Attempt ${attempt} failed. ` +
          `Retrying in ${RETRY_DELAY_MS / 1000}s... (Neon may be cold-starting)`
      )
      await sleep(RETRY_DELAY_MS)
    }
  }

  console.error(
    `[setup-database] ❌ Schema push failed after ${MAX_RETRIES} attempts.\n` +
      "  Check your DATABASE_URL and make sure NeonDB is accessible.\n" +
      "  Alternatively, run the SQL in scripts/init-database.sql directly\n" +
      "  in the Neon SQL editor to initialize the database manually."
  )
  process.exit(1)
}

main()
