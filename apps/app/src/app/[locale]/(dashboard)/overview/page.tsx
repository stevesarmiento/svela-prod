import { Chat } from "@/components/chat/chat";

export const metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return (
    <div className="w-full flex items-center justify-center p-4">
      <div className="w-full">        
        <Chat />
      </div>
    </div>
  );
}