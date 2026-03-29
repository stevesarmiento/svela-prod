'use client'

import { Button } from "@v1/ui/button"

export interface PortfolioEmptyStateProps {
  onAddWallet?: () => void
}

export function PortfolioEmptyState({ onAddWallet }: PortfolioEmptyStateProps) {
  return (
    <div className="py-6 border border-dashed border-border rounded-lg">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="text-center">
          <h3 className="font-medium text-balance">No wallets tracked yet</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Add a Solana wallet address to generate a portfolio card and track its top tokens.
          </p>
          {onAddWallet ? (
            <Button variant="outline" size="sm" onClick={onAddWallet} className="mt-2">
              Add wallet
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

