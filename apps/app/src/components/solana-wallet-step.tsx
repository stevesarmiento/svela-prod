"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@v1/ui/button";
import type { SolanaWalletOption } from "@/lib/sign-in/solana-wallets";

export interface SolanaWalletStepProps {
  walletOptions: Array<SolanaWalletOption>;
  isBusy: boolean;
  error?: string | null;
  onBack: () => void;
  onPickWallet: (walletName: string) => void;
}

export function SolanaWalletStep({
  walletOptions,
  isBusy,
  error,
  onBack,
  onPickWallet,
}: SolanaWalletStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Back"
          onClick={onBack}
          disabled={isBusy}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
        >
          <ChevronLeft className="h-4 w-4 text-foreground/80" />
        </Button>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Choose a Solana wallet</div>
          <div className="text-sm text-muted-foreground">
            Pick the wallet you want to use for this sign in.
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {walletOptions.length > 0 ? (
          walletOptions.map((wallet) => (
            <Button
              key={wallet.walletName}
              type="button"
              variant="outline"
              className="w-full justify-start rounded-xl"
              disabled={isBusy}
              onClick={() => onPickWallet(wallet.walletName)}
            >
              <span className="flex items-center gap-2">
                {wallet.iconDataUrl ? (
                  <img alt="" src={wallet.iconDataUrl} className="size-4 rounded-sm" aria-hidden="true" />
                ) : null}
                <span>{wallet.label}</span>
              </span>
            </Button>
          ))
        ) : (
          <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            No Solana wallets detected in this browser.
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Don&apos;t have a wallet yet?{" "}
        <a
          href="https://solana.com/solana-wallets"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          Browse Solana wallets
        </a>
        .
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
