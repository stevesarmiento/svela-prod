import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAlphaFeaturesEnabled } from "@/lib/feature-flags";
import { PortfolioClient } from "./_components/portfolio-client";
import { preloadQuery } from "convex/nextjs";
import { getAuthToken } from "@/lib/auth";
import { api } from "../../../../../convex/_generated/api";

export const metadata: Metadata = {
  title: "Portfolio - Svela",
  description: "Your cryptocurrency portfolio overview and analytics",
};

export default async function PortfolioPage() {
  if (!isAlphaFeaturesEnabled()) {
    notFound();
  }

  const token = await getAuthToken();
  const preloadedWallets = await preloadQuery(
    api.portfolio.listMyPortfolioWallets,
    {},
    { token },
  );

  return <PortfolioClient preloadedWallets={preloadedWallets} />;
}
