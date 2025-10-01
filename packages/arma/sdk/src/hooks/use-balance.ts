'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import { useArmaClient } from '../core/arma-client-provider'
import { releaseRpcConnection } from '../core/rpc-manager'
import { 
  ArmaError,
  ArmaErrorCode,
  defaultRetryManager,
  createNetworkError,
  type ArmaErrorContext
} from '../core/error-handler'
import { 
  address,
  type Address, 
} from '@solana/kit'
import { queryKeys } from '../utils/query-keys'

export interface UseBalanceOptions {
  address?: string | Address
  mint?: Address
  refreshInterval?: number
  enabled?: boolean
  onUpdate?: (balance: bigint) => void
}

export interface UseBalanceReturn {
  balance: bigint | null
  balanceSOL: number
  formattedBalance: string
  address: string | null
  isLoading: boolean
  error: ArmaError | null
  refetch: () => void
  refresh: () => void
  clear: () => void
}

export function useBalance(options: UseBalanceOptions = {}): UseBalanceReturn {
  const { wallet, network, config } = useArmaClient()
  const queryClient = useQueryClient()
  
  const {
    address: optionsAddress,
    refreshInterval = 30000,
    enabled = true,
    onUpdate,
  } = options

  const targetAddress = optionsAddress || wallet.address
  
  useEffect(() => {
    return () => {
      releaseRpcConnection(network.rpcUrl)
    }
  }, [network.rpcUrl])

  const query = useQuery<bigint, ArmaError>({
    networkMode: "offlineFirst", // 🚀 BETTER UX: Work with cached data when offline
    queryKey: queryKeys.balance(targetAddress || undefined, network.rpcUrl),
    queryFn: async ({ signal }): Promise<bigint> => {
      const context: ArmaErrorContext = {
        operation: 'getBalance',
        address: targetAddress || 'none',
        timestamp: Date.now(),
        rpcUrl: network.rpcUrl
      }

      if (!targetAddress) {
        throw new ArmaError(
          'No address provided and no wallet connected',
          ArmaErrorCode.WALLET_NOT_CONNECTED,
          context
        )
      }

      return await defaultRetryManager.executeWithRetry(async () => {
        try {
          let addressObj: Address
          try {
            addressObj = address(targetAddress)
          } catch (error) {
            throw new ArmaError(
              `Invalid address format: ${targetAddress}`,
              ArmaErrorCode.INVALID_ADDRESS,
              context,
              error as Error
            )
          }
          
          const { transport, commitment } = config as any
          const result = await transport.request(
            { method: 'getBalance', params: [addressObj, { commitment: commitment ?? 'confirmed' }] },
            { signal }
          )
          const raw = (result as any).value
          const balance = typeof raw === 'bigint' ? raw : BigInt(raw ?? 0)
          
          if (onUpdate) {
            onUpdate(balance)
          }
          
          return balance
          
        } catch (error) {
          if (error instanceof ArmaError) {
            throw error
          }
          
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          if (errorMessage.includes('Invalid param') || errorMessage.includes('Invalid address')) {
            throw new ArmaError(
              `Invalid address: ${targetAddress}`,
              ArmaErrorCode.INVALID_ADDRESS,
              context,
              error as Error
            )
          }
          
          if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            throw new ArmaError(
              'Rate limit exceeded while fetching balance',
              ArmaErrorCode.RATE_LIMITED,
              context,
              error as Error
            )
          }
          
          if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            throw createNetworkError(
              'Network error while fetching balance',
              context,
              error as Error
            )
          }
          
          throw createNetworkError(
            `Failed to fetch balance: ${errorMessage}`,
            context,
            error as Error
          )
        }
      }, context)
    },
    enabled: enabled && !!targetAddress,
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
    notifyOnChangeProps: ['data', 'error', 'isLoading'],
  })

  const balance = query.data ?? null
  const balanceSOL = balance ? Number(balance) / 1e9 : 0
  const formattedBalance = balance ? `${balanceSOL.toFixed(4)} SOL` : '0 SOL'

  const refresh = useCallback(() => {
    query.refetch()
  }, [query])

  const clear = useCallback(() => {
    const key = queryKeys.balance(targetAddress || undefined, network.rpcUrl)
    // Cancel any in-flight fetches for this key, then remove cached data
    queryClient.cancelQueries({ queryKey: key, exact: true }).finally(() => {
      queryClient.removeQueries({ queryKey: key, exact: true })
    })
  }, [network.rpcUrl, queryClient, targetAddress])

  return {
    balance,
    balanceSOL,
    formattedBalance,
    address: targetAddress,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
    refresh,
    clear,
  }
}