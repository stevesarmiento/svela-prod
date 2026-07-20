import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { ScreenerPageView } from "./_components/screener-page-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return createMetadata({
    title: "Screener",
    pathname: "/screener",
    locale,
  });
}

export default function ScreenerPage() {
  return <ScreenerPageView />;
}
