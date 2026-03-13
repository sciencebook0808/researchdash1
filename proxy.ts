/**
 * proxy.ts — Next.js 16 Proxy (replaces middleware.ts)
 * ──────────────────────────────────────────────────────
 * In Next.js 16, middleware.ts is DEPRECATED and renamed to proxy.ts.
 * The exported function must also be named `proxy` (not `middleware`).
 *
 * Clerk v7 (@clerk/nextjs ^7.0.4) — clerkMiddleware API is unchanged.
 * Public routes: sign-in, sign-up, access-denied, and ALL /api/* routes
 * (agents must never be blocked by auth).
 *
 * Clerk Docs (March 2026):
 *   - Next.js ≤15 → middleware.ts
 *   - Next.js 16+ → proxy.ts
 *   - The matcher pattern below is the official Clerk v7 recommended matcher
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-denied(.*)",
  // All API routes are public — agents must never be blocked
  "/api(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  // API routes and public pages — always allow through
  if (isPublicRoute(req)) return NextResponse.next()

  // For all UI pages require a Clerk session
  const { userId, redirectToSignIn } = await auth()

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url })
  }

  // Role enforcement happens in the AuthGuard React component (needs DB access).
  // Proxy only checks authentication; role checks run at layout level.
  return NextResponse.next()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
