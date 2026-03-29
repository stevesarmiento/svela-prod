'use client'

export function PortfolioEmptyState() {
  return (
    <div className="py-6 border border-dashed border-border rounded-lg">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="text-center">
          <h3 className="font-medium text-balance">No wallets tracked yet</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Add a Solana wallet address to generate a portfolio card and track its top tokens.
          </p>
        </div>
      </div>
    </div>
  )
}

