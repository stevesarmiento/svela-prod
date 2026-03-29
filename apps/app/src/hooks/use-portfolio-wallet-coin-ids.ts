import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

export function usePortfolioWalletCoinIds(walletId?: string) {
  const enabled = Boolean(walletId && walletId.length > 0)
  const data = useQuery(
    api.portfolio.getMyPortfolioWalletCoinIds,
    enabled && walletId ? { walletId: walletId as Id<"portfolioWallets"> } : "skip",
  ) as Array<string> | undefined

  return {
    coinIds: data ?? [],
    isLoading: data === undefined,
    error: null as Error | null,
  }
}

