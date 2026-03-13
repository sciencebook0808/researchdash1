import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
}

export const metadata: Metadata = {
  title: "Prausdit Research Lab",
  description: "AI Agent Research Environment — Building Protroit Agent & ProtroitOS",
}

/**
 * Root layout — minimal shell.
 * Authentication UI (sidebar, header, AuthGuard) lives in (dashboard)/layout.tsx.
 * Public pages (sign-in, sign-up, access-denied) have their own layout in (public)/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="en" className="dark">
        <body className="bg-background text-foreground antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
