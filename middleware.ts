import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublicRoute = createRouteMatcher([
  "/access-denied",
  "/api/users(.*)",
])

const isApiRoute = createRouteMatcher(["/api(.*)"])

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes
  if (isPublicRoute(req)) return NextResponse.next()

  const { userId } = await auth()

  // Not signed in → redirect to Clerk sign-in
  if (!userId && !isApiRoute(req)) {
    const { redirectToSignIn } = await auth()
    return redirectToSignIn({ returnBackUrl: req.url })
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
