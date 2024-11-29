import { SideNav } from "@/components/navigation/side-nav";
import { SidebarProvider } from "@v1/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex w-screen">
        <div className="flex-shrink-0">
          <SideNav />
        </div>
        <div className="flex flex-grow flex-col w-full">
          <main className="flex flex-grow w-full">
            {children}
          </main>
        </div>
      </div>      
    </SidebarProvider>

  );
}