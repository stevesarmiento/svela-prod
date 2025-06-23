import { Chat } from "@/components/chat/chat";

export const metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return (
    <div className="fixed inset-0 top-16 bottom-16">
      <Chat />
    </div>
  );
}