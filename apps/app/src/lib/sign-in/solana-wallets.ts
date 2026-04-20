"use client";

import { getWallets } from "@wallet-standard/app";

export interface SolanaWalletOption {
  walletName: string;
  label: string;
  iconDataUrl: string | null;
}

type WalletStandardWallet = {
  name?: unknown;
  icon?: unknown;
  chains?: unknown;
  features?: unknown;
};

export function listSolanaWalletOptionsFromWallets(wallets: unknown): Array<SolanaWalletOption> {
  if (!Array.isArray(wallets)) return [];

  const options: Array<SolanaWalletOption> = [];
  const seen = new Set<string>();

  for (const wallet of wallets) {
    if (!wallet || typeof wallet !== "object") continue;

    const record = wallet as WalletStandardWallet;
    const name = record.name;
    if (typeof name !== "string" || !name.trim()) continue;

    const chains = record.chains;
    const features = record.features;

    const hasSolanaChain =
      Array.isArray(chains) && chains.some((chain) => typeof chain === "string" && chain.startsWith("solana:"));
    const hasSolanaFeature =
      typeof features === "object" &&
      features !== null &&
      Object.keys(features).some((key) => key.startsWith("solana:"));

    if (!hasSolanaChain && !hasSolanaFeature) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    options.push({
      walletName: name,
      label: name,
      iconDataUrl: typeof record.icon === "string" ? record.icon : null,
    });
  }

  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

export function listSolanaWalletOptions(): Array<SolanaWalletOption> {
  if (typeof window === "undefined") return [];
  return listSolanaWalletOptionsFromWallets(getWallets().get() as unknown);
}
