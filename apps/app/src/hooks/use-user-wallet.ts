"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@v1/convex/hooks";
import { toast } from "sonner";

interface UserWallet {
  address: string;
  chain: string;
  provider: string;
  crossmintWalletId?: string;
  createdAt: number;
  lastUsed: number;
}

interface WalletState {
  wallet: UserWallet | null;
  status: "loading" | "loaded" | "not-found" | "error";
  isCreating: boolean;
}

export function useUserWallet() {
  const { user } = useAuth();
  const [walletState, setWalletState] = useState<WalletState>({
    wallet: null,
    status: "loading",
    isCreating: false,
  });

  // Query existing wallet from our database
  const existingWallet = useQuery(
    api.wallets.getPrimaryWallet,
    user?.id ? { clerkId: user.id } : "skip"
  );

  // Mutation to store wallet in our database
  const storeWallet = useMutation(api.wallets.storeWallet);
  const updateLastUsed = useMutation(api.wallets.updateWalletLastUsed);

  // Create wallet using Crossmint API
  const createWallet = async () => {
    if (!user?.id) {
      toast.error("Please sign in to create a wallet");
      return null;
    }

    setWalletState(prev => ({ ...prev, isCreating: true }));

    try {
      // Call your API route to create wallet via Crossmint
      const response = await fetch("/api/wallet/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email,
          chain: "ethereum", // or your preferred chain
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create wallet");
      }

      const { wallet } = await response.json();

      // Store wallet association in our database
      await storeWallet({
        clerkId: user.id,
        walletAddress: wallet.address,
        chain: wallet.chain,
        crossmintWalletId: wallet.id,
      });

      const userWallet: UserWallet = {
        address: wallet.address,
        chain: wallet.chain,
        provider: "crossmint",
        crossmintWalletId: wallet.id,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      setWalletState({
        wallet: userWallet,
        status: "loaded",
        isCreating: false,
      });

      toast.success("Wallet created successfully!");
      return userWallet;
    } catch (error) {
      console.error("Failed to create wallet:", error);
      toast.error("Failed to create wallet");
      setWalletState(prev => ({ ...prev, isCreating: false }));
      return null;
    }
  };

  // Update wallet state when data changes
  useEffect(() => {
    if (!user) {
      setWalletState({
        wallet: null,
        status: "loading",
        isCreating: false,
      });
      return;
    }

    if (existingWallet === undefined) {
      // Still loading
      setWalletState(prev => ({ ...prev, status: "loading" }));
    } else if (existingWallet === null) {
      // No wallet found
      setWalletState(prev => ({ ...prev, status: "not-found" }));
    } else {
      // Wallet found
      const userWallet: UserWallet = {
        address: existingWallet.walletAddress,
        chain: existingWallet.chain,
        provider: existingWallet.walletProvider,
        crossmintWalletId: existingWallet.crossmintWalletId,
        createdAt: existingWallet.createdAt,
        lastUsed: existingWallet.lastUsed,
      };

      setWalletState({
        wallet: userWallet,
        status: "loaded",
        isCreating: false,
      });

      // Update last used timestamp
      updateLastUsed({ walletAddress: existingWallet.walletAddress });
    }
  }, [existingWallet, user, updateLastUsed]);

  return {
    ...walletState,
    createWallet,
    user,
  };
} 