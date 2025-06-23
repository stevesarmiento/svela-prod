import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { SidebarProvider } from "@v1/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex w-screen">
        <div className="flex flex-grow flex-col max-w-7xl mx-auto">
          <TopNav />
          <main className="flex flex-grow w-full pb-20">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>      
    </SidebarProvider>
  );
}