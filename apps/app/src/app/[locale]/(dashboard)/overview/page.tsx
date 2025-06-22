import { Chat } from "@/components/chat/chat";

export const metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-medium text-foreground mb-2">
            What&apos;s on your mind?
          </h1>
        </div>
        
        <Chat />
      </div>
    </div>
  );
}