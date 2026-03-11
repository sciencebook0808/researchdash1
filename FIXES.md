# Complete Fix Log — researchdash1

## Root Cause Summary

All runtime failures share one root cause: **Prisma 7 TLS regression**.

Prisma 7 replaced its Rust query engine with `node-postgres` (`pg`). When you
pass `{ connectionString, ssl: {...} }` to `PrismaPg`, the connection-string
URL params (e.g. `?sslmode=require`) take **precedence and silently override**
the `ssl` object — so `rejectUnauthorized: false` is never applied.

This causes every DB call to fail with:
```
Error opening a TLS connection: self-signed certificate in certificate chain
```

**References:** prisma/prisma#28344, prisma/prisma#29060, prisma/prisma#27760

---

## Fix 1 — `lib/prisma.ts` (THE CRITICAL FIX)

**Problem:** Passing `{ connectionString, ssl: { rejectUnauthorized: false } }`
to `PrismaPg` doesn't work — connection string params override ssl object.

**Fix:** Parse the URL manually and pass a `pg.PoolConfig` **without** a
`connectionString`. This guarantees our SSL config is the only SSL source.

```typescript
// BEFORE (broken — ssl object is overridden by ?sslmode= in URL):
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // ← silently ignored!
})

// AFTER (correct — parse URL, pass PoolConfig directly):
const parsed = new URL(rawUrl)
const adapter = new PrismaPg({
  host:     parsed.hostname,
  port:     parseInt(parsed.port),
  user:     parsed.username,
  password: parsed.password,
  database: parsed.pathname.replace(/^\//, ""),
  ssl:      { rejectUnauthorized: false },  // ← actually applied
  max:      1,
})
```

---

## Fix 2 — `prisma/schema.prisma`

Prisma 7 removed `url` / `directUrl` from the `datasource` block.
Added correct `prisma-client` generator with required `output` path.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
datasource db {
  provider = "postgresql"
  // No url here — moved to prisma.config.ts
}
```

---

## Fix 3 — `prisma.config.ts`

Added `datasource.url = env("DATABASE_URL")` for Prisma CLI migrations.

---

## Fix 4 — `lib/api-auth.ts`

Super admin check now runs **BEFORE** any DB query. DB errors return 503,
not 500, so they are distinguishable from code errors.

---

## Fix 5 — `app/api/users/me/route.ts`

Super admin DB record is **always upserted** on login (not just read).
This ensures every DB-based role check in other APIs sees `"super_admin"`.
DB fallback still works when DB is unreachable.

---

## Fix 6 — `app/api/settings/route.ts`

Added super admin email check before DB role lookup.
Added DB error fallback (returns safe defaults instead of crashing).

---

## Fix 7 — `app/api/chat-sessions/route.ts`

Added `resolveUser()` helper that checks super admin email first,
then falls back to DB lookup. DB unavailability no longer blocks super admin.

---

## Fix 8 — `app/api/agent/workflow/route.ts`

Added super admin email check before DB role lookup.

---

## Fix 9 — All Prisma imports

Updated from `@prisma/client` to `../generated/prisma/client` per Prisma 7
requirement (generator output path is now required and explicit).

---

## Vercel Environment Variables (Required)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Direct connection (port 5432) — for migrations |
| `POSTGRES_PRISMA_URL` | ✅ (or DATABASE_URL) | Pooled URL (port 6543) — for runtime |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk auth |
| `CLERK_SECRET_KEY` | ✅ | Clerk auth |
| `SUPER_ADMIN_EMAIL` | ✅ | Super admin bypass |
| `GOOGLE_GEMINI_API_KEY` | recommended | AI features |

## Auth Flow

```
User makes request
  │
  ├─ Is Clerk session present?
  │   NO → 401
  │   YES → continue
  │
  ├─ Does email === SUPER_ADMIN_EMAIL? (no DB needed)
  │   YES → ✅ role = "super_admin"
  │        DB is updated to super_admin in background
  │   NO → continue
  │
  ├─ Look up user in database
  │   DB ERROR → 503 (not 500)
  │   NOT FOUND → auto-create with role="user" → 403 for writes
  │   FOUND → use DB role
  │
  └─ role ∈ {super_admin, admin, developer}?
      YES → ✅ allow write
      NO  → 403 Forbidden
```

## Route Protection

| Path | Protection | Who |
|---|---|---|
| `/api/*` | GET: none; POST/PATCH/DELETE: Clerk session + role | requireWriteAuth |
| `/dashboard`, `/crm`, `/admin`, etc. | Clerk + role via AuthGuard | Client component |
| `/sign-in`, `/sign-up`, `/access-denied` | Public | Middleware allowlist |
