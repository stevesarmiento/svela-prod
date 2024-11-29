import { SideNav } from "@/components/navigation/side-nav";
import { TopNav } from "@/components/navigation/top-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <div className="flex-shrink-0">
        <SideNav />
      </div>
      <div className="flex flex-col w-full">
        <TopNav />
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}