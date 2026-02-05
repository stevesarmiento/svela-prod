import { Metadata } from "next";
import { StandardWalletDemo } from "./_components/wallet-connector";
import { notFound } from 'next/navigation';
import { isAlphaFeaturesEnabled } from '@/lib/feature-flags';

export const metadata: Metadata = {
  title: "Portfolio - Svela",
  description: "Your cryptocurrency portfolio overview and analytics",
};

export default function PortfolioPage() {
  if (!isAlphaFeaturesEnabled()) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6">
        <div className="rounded-lg border bg-card text-card-foreground p-6">
          <h2 className="text-lg font-semibold mb-4">Connect Your Wallet</h2>
          <p className="text-muted-foreground mb-6">
            Connect your Solana wallet to view and manage your cryptocurrency portfolio.
          </p>
          <StandardWalletDemo />
        </div>
      </div>
    </div>
  );
}
