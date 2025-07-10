"use client";

import {
  CrossmintProvider,
  CrossmintWalletProvider,
} from "@crossmint/client-sdk-react-ui";

interface CrossmintProvidersProps {
  children: React.ReactNode;
}

export function CrossmintProviders({ children }: CrossmintProvidersProps) {
  const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY;

  // Don't render if no API key is configured
  if (!apiKey) {
    console.warn("NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY is not configured. Wallet features will be disabled.");
    return <>{children}</>;
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintWalletProvider>
        {children}
      </CrossmintWalletProvider>
    </CrossmintProvider>
  );
} 