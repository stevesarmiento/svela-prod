'use client'

import { Button } from '@v1/ui/button'

/**
 * Wallet integration is temporarily disabled while we upgrade dependencies.
 * This component intentionally avoids importing any Solana/connector SDKs.
 */
export function StandardWalletDemo() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <div className="space-y-3">
        <div className="text-sm font-semibold">Wallet connector unavailable</div>
        <p className="text-sm text-muted-foreground">
          Connecting a Solana wallet is temporarily disabled while we upgrade the Solana
          integration.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled aria-disabled>
            Connect wallet
          </Button>
        </div>
      </div>
    </div>
  )
}

