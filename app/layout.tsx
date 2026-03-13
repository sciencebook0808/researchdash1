import type { Metadata, Viewport } from "next"
import { DM_Sans, Space_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import "./globals.css"

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
})

const spaceMono = Space_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-mono",
  weight: ["400", "700"],
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
  ],
}

export const metadata: Metadata = {
  title: {
    default: "Prausdit Research Lab",
    template: "%s | Prausdit Research Lab",
  },
  description: "AI Agent Research Environment — Building Protroit Agent & ProtroitOS",
  keywords: ["AI", "research", "SLM", "agent", "machine learning", "ProtroitOS"],
  authors: [{ name: "Prausdit Team" }],
  creator: "Prausdit",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://prausdit.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Prausdit Research Lab",
    title: "Prausdit Research Lab",
    description: "AI Agent Research Environment — Building Protroit Agent & ProtroitOS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prausdit Research Lab",
    description: "AI Agent Research Environment — Building Protroit Agent & ProtroitOS",
  },
  robots: {
    index: true,
    follow: true,
  },
}

/**
 * Root layout — minimal shell.
 * Authentication UI (sidebar, header, AuthGuard) lives in (dashboard)/layout.tsx.
 * Public pages (sign-in, sign-up, access-denied) have their own layout in (public)/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      afterSignOutUrl="/sign-in"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#f59e0b",
          colorBackground: "#0a0a0a",
          colorInputBackground: "#171717",
          colorInputText: "#ededed",
          borderRadius: "0.375rem",
        },
        elements: {
          formButtonPrimary: "bg-amber-500 hover:bg-amber-400 text-black",
          card: "bg-card border border-border",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton: "border-border bg-muted hover:bg-accent",
          formFieldInput: "bg-input border-border text-foreground",
          footerActionLink: "text-amber-400 hover:text-amber-300",
        },
      }}
    >
      <html lang="en" className={`dark ${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
        <body className="bg-background text-foreground antialiased font-sans min-h-screen">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
