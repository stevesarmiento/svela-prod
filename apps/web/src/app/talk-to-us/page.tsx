import { CalEmbed } from "@/components/cal-embed";
import type { Metadata } from "next";
import { createWebPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...createWebPageMetadata({
    title: "Talk to us",
    pathname: "/talk-to-us",
    robots: { index: false, follow: false },
  }),
};

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full">
      <div className="mt-24 w-full">
        <CalEmbed calLink={process.env.NEXT_PUBLIC_CAL_LINK!} />
      </div>
    </div>
  );
}
