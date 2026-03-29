import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { PortfolioClient } from "./_components/portfolio-client";

export const metadata: Metadata = {
  title: "Portfolio - Svela",
  description: "Your cryptocurrency portfolio overview and analytics",
};

export default function PortfolioPage() {
  if (!isAlphaFeaturesEnabled()) {
    notFound();
  }

  return <PortfolioClient />;
}
