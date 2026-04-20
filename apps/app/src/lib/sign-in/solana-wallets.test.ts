import { describe, expect, test } from "bun:test";
import { listSolanaWalletOptionsFromWallets } from "./solana-wallets";

describe("listSolanaWalletOptionsFromWallets", () => {
  test("detects Phantom wallets", () => {
    const wallets = [{ name: "Phantom", chains: ["solana:mainnet"], features: {} }];
    expect(listSolanaWalletOptionsFromWallets(wallets)).toEqual([
      { walletName: "Phantom", label: "Phantom", iconDataUrl: null },
    ]);
  });

  test("detects Solflare wallets from features", () => {
    const wallets = [{ name: "Solflare", features: { "solana:signAndSendTransaction": {} } }];
    expect(listSolanaWalletOptionsFromWallets(wallets)).toEqual([
      { walletName: "Solflare", label: "Solflare", iconDataUrl: null },
    ]);
  });

  test("detects Backpack wallets", () => {
    const wallets = [{ name: "Backpack", chains: ["solana:devnet"], icon: "data:image/png;base64,test" }];
    expect(listSolanaWalletOptionsFromWallets(wallets)).toEqual([
      { walletName: "Backpack", label: "Backpack", iconDataUrl: "data:image/png;base64,test" },
    ]);
  });

  test("deduplicates duplicate wallets", () => {
    const wallets = [
      { name: "Phantom", chains: ["solana:mainnet"] },
      { name: "Phantom", features: { "solana:signMessage": {} } },
    ];

    expect(listSolanaWalletOptionsFromWallets(wallets)).toEqual([
      { walletName: "Phantom", label: "Phantom", iconDataUrl: null },
    ]);
  });

  test("returns an empty list when no solana wallets exist", () => {
    const wallets = [{ name: "MetaMask", chains: ["eip155:1"], features: { "eip155:signMessage": {} } }];
    expect(listSolanaWalletOptionsFromWallets(wallets)).toEqual([]);
  });
});
