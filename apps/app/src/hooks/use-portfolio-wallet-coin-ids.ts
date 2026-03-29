import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

export function usePortfolioWalletCoinIds(walletId?: string) {
  const enabled = Boolean(walletId && walletId.length > 0)
  const data = useQuery(
    api.portfolio.getMyPortfolioWalletCoinIds,
    enabled && walletId ? { walletId: walletId as any } : "skip",
  ) as Array<string> | undefined

  return {
    coinIds: data ?? [],
    isLoading: data === undefined,
    error: null as Error | null,
  }
}

