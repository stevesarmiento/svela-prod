"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import { IconGoogleLogo } from "symbols-react";
import { SolanaWalletStep } from "@/components/solana-wallet-step";
import { SolanaLogo } from "@/components/solana-logo";
import {
  isAccountAlreadyExistsError,
  isAccountNotFoundError,
  resolveClerkErrorMessage,
} from "@/lib/sign-in/clerk-errors";
import { getRedirectUrlComplete } from "@/lib/sign-in/redirect-url";
import { listSolanaWalletOptions } from "@/lib/sign-in/solana-wallets";
import { DURATION_UI_S, EASE_OUT_CUBIC, motionDuration } from "@/lib/motion-tokens";

type AuthMethod = "google" | "solana";
type LoginView = "providers" | "solana_wallets";

export function LoginMethods() {
  const shouldReduceMotion = useReducedMotion();
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
  const [view, setView] = useState<LoginView>("providers");

  const redirectUrlComplete = useMemo(() => getRedirectUrlComplete(searchParams), [searchParams]);
  const walletOptions = useMemo(() => listSolanaWalletOptions(), [view]);
  const durationUi = motionDuration(shouldReduceMotion, DURATION_UI_S);

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

  function handleOpenSolanaStep() {
    if (isSolanaDisabled) return;
    setError(null);
    setView("solana_wallets");
  }

  function handleBackToProviders() {
    if (activeMethod === "solana") return;
    setError(null);
    setView("providers");
  }

  const isBusy = activeMethod !== null;
  const isGoogleDisabled = !isLoaded || !signIn || isBusy;
  const isSolanaDisabled = !isLoaded || !signIn || !signUp || !setActive || isBusy;

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait" initial={false}>
        {view === "providers" ? (
          <motion.div
            key="providers"
            initial={shouldReduceMotion ? false : { opacity: 0, x: -16 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    x: -16,
                    transition: { duration: durationUi, ease: EASE_OUT_CUBIC },
                  }
            }
            transition={{ duration: durationUi, ease: EASE_OUT_CUBIC }}
            className="space-y-3"
          >
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
              onClick={handleOpenSolanaStep}
              variant="default"
              className={cn("w-full text-sm", isBusy && activeMethod !== "solana" && "opacity-60")}
              disabled={isSolanaDisabled}
              startIcon={<SolanaLogo width={16} height={16} className="opacity-40" />}
            >
              Connect with Solana
            </Button>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="solana_wallets"
            initial={shouldReduceMotion ? false : { opacity: 0, x: 16 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    x: 16,
                    transition: { duration: durationUi, ease: EASE_OUT_CUBIC },
                  }
            }
            transition={{ duration: durationUi, ease: EASE_OUT_CUBIC }}
          >
            <SolanaWalletStep
              walletOptions={walletOptions}
              isBusy={activeMethod === "solana"}
              error={error}
              onBack={handleBackToProviders}
              onPickWallet={(walletName) => void startSolana(walletName)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" />
    </div>
  );
}
