import { Metadata } from "next";
import { StandardWalletDemo } from "./_components/wallet-connector";

export const metadata: Metadata = {
  title: "Portfolio - Svela",
  description: "Your cryptocurrency portfolio overview and analytics",
};

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground">
            Track your cryptocurrency investments and performance
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="rounded-lg border bg-card text-card-foreground p-6">
          <h2 className="text-lg font-semibold mb-2">Portfolio Overview</h2>
          <p className="text-muted-foreground">
            Your portfolio dashboard is coming soon. This will include:
          </p>
          <ul className="mt-4 space-y-2 text-muted-foreground">
            <li>• Total portfolio value and performance</li>
            <li>• Asset allocation breakdown</li>
            <li>• Profit/loss tracking</li>
            <li>• Historical performance charts</li>
            <li>• Transaction history</li>
            <li>• Portfolio analytics and insights</li>
          </ul>
        </div>

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
