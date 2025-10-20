import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { SidebarProvider } from "@v1/ui/sidebar";
import { BottomNavProvider } from "@/components/navigation/bottom-nav-context"
import { RateLimitErrorBoundary } from "@/components/error-boundary/rate-limit-error-boundary"
import { LoadingStateManager } from "@/components/loading/loading-state-manager"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BottomNavProvider>
      <SidebarProvider defaultOpen>
        <div className="flex w-screen font-diatype">
          <div className="flex flex-grow flex-col max-w-7xl mx-auto">
            <TopNav />
            <main className="flex flex-grow w-full pb-20">
              <LoadingStateManager>
                <RateLimitErrorBoundary>
                  {children}
                </RateLimitErrorBoundary>
              </LoadingStateManager>
            </main>
            <BottomNav />
          </div>
        </div>      
      </SidebarProvider>
    </BottomNavProvider>
  );
}