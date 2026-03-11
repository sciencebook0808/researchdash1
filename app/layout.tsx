import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ChatbotWidget } from "@/components/chatbot/chatbot-widget"

export const metadata: Metadata = {
  title: "Prausdit Research Lab",
  description: "AI Agent Research Environment — Building Protroit Agent & ProtroitOS",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <div className="flex h-screen overflow-hidden bg-grid">
          {/* Sidebar — desktop always visible, mobile drawer */}
          <Sidebar />

          {/* Main content area */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto">
              <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>

        {/* Floating AI Chatbot — overlays entire app */}
        <ChatbotWidget />
      </body>
    </html>
  )
}
