import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ChatbotWidget } from "@/components/chatbot/chatbot-widget"
import { AuthGuard } from "@/components/auth/auth-guard"

/**
 * (dashboard) group layout
 * Wraps all protected UI pages with AuthGuard + sidebar + header.
 * API routes, sign-in, sign-up, and access-denied are NOT in this group.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-grid">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header />
          <main 
            id="main-content" 
            className="flex-1 overflow-y-auto"
            role="main"
            aria-label="Main content"
          >
            <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
      <ChatbotWidget />
    </AuthGuard>
  )
}
