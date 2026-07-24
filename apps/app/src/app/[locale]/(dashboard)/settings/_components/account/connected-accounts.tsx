"use client";

import { useUser } from "@clerk/nextjs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@v1/ui/alert-dialog";
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { Globe, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatWalletAddress } from "@/lib/user-display";
import { getClerkErrorMessage } from "./clerk-errors";

export function ConnectedAccounts() {
  const { user } = useUser();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  if (!user) return null;

  const externalAccounts = user.externalAccounts;
  const wallets = user.web3Wallets;

  const verifiedExternal = externalAccounts.filter(
    (account) => account.verification?.status === "verified",
  );
  const verifiedWallets = wallets.filter(
    (wallet) => wallet.verification?.status === "verified",
  );

  // Lockout guard: never allow removing the user's last remaining way to
  // sign in (verified OAuth accounts + verified wallets + passkeys).
  const signInMethodCount =
    verifiedExternal.length + verifiedWallets.length + user.passkeys.length;

  const hasGoogle = externalAccounts.some(
    (account) => account.provider === "google",
  );

  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    try {
      const account = await user.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: window.location.href,
      });
      const redirectUrl = account.verification?.externalVerificationRedirectURL;
      if (redirectUrl) {
        window.location.href = redirectUrl.href;
        return;
      }
      await user.reload();
    } catch (error) {
      toast.error(
        getClerkErrorMessage(error, "Failed to connect Google account"),
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveExternal = async (accountId: string) => {
    const account = user.externalAccounts.find((a) => a.id === accountId);
    if (!account) return;
    setBusyId(accountId);
    try {
      await account.destroy();
      await user.reload();
      toast.success("Account disconnected");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to disconnect account"));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveWallet = async (walletId: string) => {
    const wallet = user.web3Wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setBusyId(walletId);
    try {
      await wallet.destroy();
      await user.reload();
      toast.success("Wallet disconnected");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to disconnect wallet"));
    } finally {
      setBusyId(null);
    }
  };

  const providerLabel = (provider: string) =>
    provider.charAt(0).toUpperCase() + provider.slice(1);

  const rows = [
    ...externalAccounts.map((account) => ({
      key: account.id,
      icon: <Globe className="h-4 w-4 text-primary/50" />,
      title: providerLabel(account.provider),
      subtitle: account.emailAddress || account.username || "",
      verified: account.verification?.status === "verified",
      onRemove: () => handleRemoveExternal(account.id),
      removeLabel: `Disconnect ${providerLabel(account.provider)}`,
    })),
    ...wallets.map((wallet) => ({
      key: wallet.id,
      icon: <Wallet className="h-4 w-4 text-primary/50" />,
      title:
        wallet.id === user.primaryWeb3Wallet?.id
          ? "Solana Wallet (Primary)"
          : "Solana Wallet",
      subtitle: formatWalletAddress(wallet.web3Wallet) ?? wallet.web3Wallet,
      verified: wallet.verification?.status === "verified",
      onRemove: () => handleRemoveWallet(wallet.id),
      removeLabel: "Disconnect wallet",
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="text-primary/40 text-xs text-pretty">
        Sign-in methods connected to your account. You must always keep at least
        one.
      </div>

      {rows.length > 0 ? (
        <div className="rounded-lg border border-primary/5 overflow-hidden">
          <div className="divide-y divide-primary/5">
            {rows.map((row) => {
              const isLastMethod = row.verified && signInMethodCount <= 1;
              const isBusy = busyId === row.key;

              return (
                <div
                  key={row.key}
                  className="p-3 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                      {row.icon}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-bold text-xs truncate">
                          {row.title}
                        </div>
                        <Badge
                          variant={row.verified ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          {row.verified ? "Connected" : "Pending"}
                        </Badge>
                      </div>
                      {row.subtitle ? (
                        <div className="font-berkeley-mono text-[10px] text-primary/30 truncate">
                          {row.subtitle}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={row.removeLabel}
                        disabled={isBusy || isLastMethod}
                        title={
                          isLastMethod
                            ? "You can't remove your only sign-in method"
                            : undefined
                        }
                        className="h-8 w-8 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>{row.removeLabel}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will no longer be able to sign in with this
                          method. You can reconnect it later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button variant="destructive" onClick={row.onRemove}>
                            Disconnect
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          No connected accounts.
        </div>
      )}

      {!hasGoogle ? (
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          disabled={isConnecting}
          onClick={handleConnectGoogle}
        >
          {isConnecting ? "Redirecting..." : "Connect Google account"}
        </Button>
      ) : null}
    </div>
  );
}
