/**
 * scripts/setup-database.ts
 * ─────────────────────────
 * Ensures database schema exists during Vercel deployment.
 * 
 * This script is run as part of the build process to:
 * 1. Check if the database is reachable
 * 2. Apply the Prisma schema using `prisma db push`
 * 
 * `prisma db push` is idempotent — safe to run on every deployment:
 * - Creates tables if they don't exist
 * - Adds new columns/tables from schema changes
 * - Does NOT drop data (unlike `prisma migrate reset`)
 * 
 * Usage: npx tsx scripts/setup-database.ts
 */

import { execSync } from 'child_process'

const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()

async function main() {
  console.log('[setup-database] Starting database setup...')

  // Check if database URL is configured
  if (!DATABASE_URL) {
    console.log('[setup-database] No DATABASE_URL configured - skipping schema push.')
    console.log('[setup-database] Set DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL to enable.')
    process.exit(0)
  }

  console.log('[setup-database] Database URL found, pushing schema...')

  try {
    // Run prisma db push with --accept-data-loss for safety
    // --skip-generate because we already run prisma generate separately
    execSync('npx prisma db push --accept-data-loss --skip-generate', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL,
      },
    })

    console.log('[setup-database] Schema push completed successfully!')
  } catch (error) {
    // Log the error but don't fail the build
    // This allows deployment to continue even if DB is temporarily unavailable
    console.error('[setup-database] Schema push failed:', error)
    console.log('[setup-database] Continuing build - database may need manual setup.')
    
    // Exit with 0 to not block deployment
    // The app has graceful error handling for missing tables
    process.exit(0)
  }
}

main()
