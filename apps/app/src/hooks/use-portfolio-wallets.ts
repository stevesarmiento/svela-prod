import { useAction, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { useCallback, useState } from "react"

export function usePreviewPortfolioWalletCandidates() {
  const preview = useAction(api.portfolio.previewMyPortfolioWalletCandidates)
  const [isPending, setIsPending] = useState(false)
  const [data, setData] = useState<{
    candidates: Array<{ mint: string; coingeckoId: string }>
    unresolvedCount: number
  } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const runPreview = useCallback(
    async (address: string) => {
      setError(null)
      setIsPending(true)
      try {
        const result = await preview({ walletAddress: address })
        setData(result)
        return result
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [preview],
  )

  return {
    preview: runPreview,
    isPending,
    data,
    error,
  }
}

export function useCreatePortfolioWalletFromSelection() {
  const create = useMutation(api.portfolio.upsertMyPortfolioWalletSelection)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createWallet = useCallback(
    async (input: {
      address: string
      name?: string
      selected: Array<{ mint: string; coingeckoId: string }>
    }) => {
      setError(null)
      setIsPending(true)
      try {
        return await create(input)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [create],
  )

  return {
    createWallet,
    isPending,
    error,
  }
}

export function useDeletePortfolioWallet() {
  const del = useMutation(api.portfolio.deleteMyPortfolioWallet)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteWallet = useCallback(
    async (walletId: string) => {
      setError(null)
      setIsPending(true)
      try {
        await del({ walletId: walletId as Id<"portfolioWallets"> })
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [del],
  )

  return { deleteWallet, isPending, error }
}

