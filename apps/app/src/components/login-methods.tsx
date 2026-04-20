"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import { IconGoogleLogo } from "symbols-react";
import { SolanaWalletPickerDialog } from "@/components/solana-wallet-picker-dialog";
import { SolanaLogo } from "@/components/solana-logo";
import {
  isAccountAlreadyExistsError,
  isAccountNotFoundError,
  resolveClerkErrorMessage,
} from "@/lib/sign-in/clerk-errors";
import { getRedirectUrlComplete } from "@/lib/sign-in/redirect-url";
import { listSolanaWalletOptions } from "@/lib/sign-in/solana-wallets";

type AuthMethod = "google" | "solana";

export function LoginMethods() {
  const searchParams = useSearchParams();
  const clerk = useClerk();
  const signInState = useSignIn();
  const signUpState = useSignUp();

  const isLoaded = signInState.isLoaded && signUpState.isLoaded;
  const signIn = signInState.signIn;
  const signUp = signUpState.signUp;
  const setActive = signInState.setActive;

  const [activeMethod, setActiveMethod] = useState<AuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSolanaPickerOpen, setIsSolanaPickerOpen] = useState(false);

  const redirectUrlComplete = useMemo(() => getRedirectUrlComplete(searchParams), [searchParams]);
  const walletOptions = useMemo(() => listSolanaWalletOptions(), [isSolanaPickerOpen]);

  async function startGoogle() {
    if (!isLoaded || !signIn || activeMethod) return;

    setError(null);
    setActiveMethod("google");

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete,
      });
    } catch (caught) {
      setError(resolveClerkErrorMessage(caught));
      setActiveMethod(null);
    }
  }

  async function finalizeSession(createdSessionId: string) {
    if (!setActive) return;

    await setActive({
      session: createdSessionId,
      redirectUrl: redirectUrlComplete,
    });
  }

  function openIncompleteSignUp() {
    setActiveMethod(null);
    setError(null);
    clerk.openSignUp({
      forceRedirectUrl: redirectUrlComplete,
      fallbackRedirectUrl: redirectUrlComplete,
      signInUrl: "/login",
    });
  }

  async function attemptSolanaSignIn(walletName: string) {
    if (!signIn) return null;

    const result = await signIn.authenticateWithSolana({ walletName });
    if (result.status === "complete" && result.createdSessionId) {
      await finalizeSession(result.createdSessionId);
      return true;
    }

    setError(`Solana sign-in incomplete (status: ${result.status}). Try Google instead.`);
    setActiveMethod(null);
    return false;
  }

  async function startSolana(walletName: string) {
    if (!isLoaded || !signIn || !signUp || !setActive || activeMethod) return;

    setError(null);
    setActiveMethod("solana");

    try {
      const signedIn = await attemptSolanaSignIn(walletName);
      if (signedIn !== null) return;
    } catch (caught) {
      if (isAccountNotFoundError(caught)) {
        try {
          const result = await signUp.authenticateWithSolana({ walletName });
          if (result.status === "complete" && result.createdSessionId) {
            await finalizeSession(result.createdSessionId);
            return;
          }

          if (result.status === "missing_requirements") {
            openIncompleteSignUp();
            return;
          }

          setError(`Solana sign-up incomplete (status: ${result.status}). Try Google instead.`);
          setActiveMethod(null);
          return;
        } catch (fallbackError) {
          if (isAccountAlreadyExistsError(fallbackError)) {
            try {
              const retriedSignIn = await attemptSolanaSignIn(walletName);
              if (retriedSignIn !== null) return;
            } catch (retryError) {
              setError(resolveClerkErrorMessage(retryError));
              setActiveMethod(null);
              return;
            }
          }

          setError(resolveClerkErrorMessage(fallbackError));
          setActiveMethod(null);
          return;
        }
      }

      setError(resolveClerkErrorMessage(caught));
      setActiveMethod(null);
    }
  }

  const isBusy = activeMethod !== null;
  const isGoogleDisabled = !isLoaded || !signIn || isBusy;
  const isSolanaDisabled = !isLoaded || !signIn || !signUp || !setActive || isBusy;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => void startGoogle()}
        variant="default"
        className={cn("w-full text-sm", isBusy && activeMethod !== "google" && "opacity-60")}
        disabled={isGoogleDisabled}
        startIcon={<IconGoogleLogo className="size-4 fill-black/40 dark:fill-white/40" />}
      >
        Connect with Google
      </Button>

      <Button
        type="button"
        onClick={() => setIsSolanaPickerOpen(true)}
        variant="default"
        className={cn("w-full text-sm", isBusy && activeMethod !== "solana" && "opacity-60")}
        disabled={isSolanaDisabled}
        startIcon={<SolanaLogo width={16} height={16} className="opacity-40" />}
      >
        Connect with Solana
      </Button>

      <SolanaWalletPickerDialog
        open={isSolanaPickerOpen}
        onOpenChange={setIsSolanaPickerOpen}
        walletOptions={walletOptions}
        isBusy={isBusy}
        onPickWallet={(walletName) => void startSolana(walletName)}
      />

      <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" />

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
