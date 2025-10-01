'use client'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useArmaClient } from '../core/arma-provider'
import { getSharedRpc, releaseRpcConnection } from '../core/rpc-manager'
import { type Address, type Lamports } from '@solana/kit'

function normalizeAddress(input: string | Address): string {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.length < 32) {
      throw new Error(`Invalid address format: ${input}`)
    }
    return trimmed
  }

  if (input && typeof input === 'object') {
    const candidateViaBase58 =
      // @ts-ignore - best-effort detection for PublicKey-like objects
      typeof (input as any).toBase58 === 'function' ? (input as any).toBase58() : undefined
    if (candidateViaBase58 && typeof candidateViaBase58 === 'string') {
      const trimmed = candidateViaBase58.trim()
      if (trimmed.length >= 32) return trimmed
    }

    // Common Address-like patterns: toString that yields base58, or an `address` string field
    const candidateViaToString = typeof (input as any).toString === 'function' ? (input as any).toString() : undefined
    if (candidateViaToString && typeof candidateViaToString === 'string' && candidateViaToString !== '[object Object]') {
      const trimmed = candidateViaToString.trim()
      if (trimmed.length >= 32) return trimmed
    }

    const candidateViaProp = typeof (input as any).address === 'string' ? (input as any).address : undefined
    if (candidateViaProp && typeof candidateViaProp === 'string') {
      const trimmed = candidateViaProp.trim()
      if (trimmed.length >= 32) return trimmed
    }
  }

  throw new Error(`Invalid address format: ${String(input)}`)
}

export interface AirdropResult {
  signature: string
  amount: Lamports
}

export interface UseAirdropReturn {
  requestAirdrop: (address: string | Address, amount?: Lamports) => Promise<AirdropResult>
  isLoading: boolean
  error: Error | null
  data: AirdropResult | null
  reset: () => void
  addressInput: string
  amountInput: string
  setAddressInput: (value: string) => void
  setAmountInput: (value: string) => void
  handleAddressInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleAmountInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (event?: { preventDefault?: () => void }) => Promise<AirdropResult | undefined>
  airdropFromInputs: () => Promise<AirdropResult | undefined>
}

export function useAirdrop(
  initialAddressInput: string = '',
  initialAmountInput: string = '1'
): UseAirdropReturn {
  const { wallet, cluster } = useArmaClient()
  
  const [addressInput, setAddressInput] = useState(initialAddressInput || wallet.selectedAccount || '')
  const [amountInput, setAmountInput] = useState(initialAmountInput)
  
  useEffect(() => {
    if (!addressInput && wallet.selectedAccount) {
      setAddressInput(wallet.selectedAccount)
    }
  }, [wallet.selectedAccount, addressInput])

  useEffect(() => {
    return () => {
      releaseRpcConnection(cluster.rpcUrl)
    }
  }, [cluster.rpcUrl])

  const mutation = useMutation({
    mutationKey: ['airdrop'],
    mutationFn: async ({ address, amount = BigInt(1000000000) as Lamports }: { 
      address: string | Address; 
      amount?: Lamports 
    }): Promise<AirdropResult> => {
      try {
        const normalizedAddress = normalizeAddress(address)
        
        if (cluster.cluster === 'mainnet-beta') {
          throw new Error('Airdrops are not available on mainnet')
        }
        
        const rpcEndpoints = [
          cluster.rpcUrl,
          'https://rpc.ankr.com/solana_devnet',
          'https://solana-devnet.g.alchemy.com/v2/demo',
          'https://api.testnet.solana.com'
        ]
        
        const retryAirdrop = async (maxRetries = 8, initialDelay = 1000): Promise<string> => {
          let lastError: any = null
          
          for (let i = 0; i < maxRetries; i++) {
            const rpcUrl = rpcEndpoints[i % rpcEndpoints.length]
            if (!rpcUrl) continue
            const currentRpc = getSharedRpc(rpcUrl) as any // Cast to any for airdrop method access
            
            try {
              
              if (i > 0) {
                const jitter = Math.random() * 500
                const delay = Math.min(initialDelay * Math.pow(1.3, i), 8000) + jitter
                await new Promise(resolve => setTimeout(resolve, delay))
              }
              
              const adjustedAmount = i > 3 ? (amount / BigInt(2)) as Lamports : amount
              
              const signature = await currentRpc.requestAirdrop(normalizedAddress, adjustedAmount).send()
              return signature
              
            } catch (error: any) {
              lastError = error
              const errorMsg = error?.message || error?.toString() || 'Unknown error'
              
              if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Too Many Requests')) {
                continue
              } else if (errorMsg.includes('airdrop') && (errorMsg.includes('limit') || errorMsg.includes('exceeded'))) {
                continue
              } else if (errorMsg.includes('Invalid account') || errorMsg.includes('account not found')) {
                continue
              } else if (errorMsg.includes('timeout') || errorMsg.includes('network')) {
                continue
              } else {
              }
            }
          }
          
          const errorMsg = lastError?.message || 'Unknown error'
          if (errorMsg.includes('rate') || errorMsg.includes('429')) {
            throw new Error(`Rate limited on all endpoints. Please wait a few minutes and try again, or use the manual faucet at https://faucet.solana.com`)
          } else if (errorMsg.includes('limit')) {
            throw new Error(`Daily airdrop limits reached. Please use the manual faucet at https://faucet.solana.com`)
          } else {
            throw new Error(`All airdrop attempts failed. Try the manual faucet at https://faucet.solana.com`)
          }
        }
        
        const signature = await retryAirdrop()
        
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        return {
          signature,
          amount
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        throw error
      }
    },
  })

  const requestAirdrop = (address: string | Address, amount?: Lamports) => {
    const normalizedAddress = normalizeAddress(address)
    return mutation.mutateAsync({ address: normalizedAddress, amount })
  }

  const handleAddressInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAddressInput(event.target.value)
  }, [])
  
  const handleAmountInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAmountInput(event.target.value)
  }, [])
  
  const airdropFromInputs = useCallback(async () => {
    if (!addressInput) {
      throw new Error('Address is required for airdrop')
    }
    
    try {
      const amountInLamports = amountInput ? 
        BigInt(Math.floor(parseFloat(amountInput) * 1_000_000_000)) as Lamports :
        BigInt(1_000_000_000) as Lamports
      
      return await mutation.mutateAsync({
        address: normalizeAddress(addressInput),
        amount: amountInLamports,
      })
    } catch (error) {
      console.error('Failed to parse amount or request airdrop:', error)
      throw error
    }
  }, [addressInput, amountInput, mutation.mutateAsync])
  
  const handleSubmit = useCallback(async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.()
    return addressInput ? airdropFromInputs() : undefined
  }, [addressInput, airdropFromInputs])

  return {
    requestAirdrop,
    isLoading: mutation.isPending,
    error: mutation.error,
    data: mutation.data || null,
    reset: mutation.reset,
    addressInput,
    amountInput,
    setAddressInput,
    setAmountInput,
    handleAddressInputChange,
    handleAmountInputChange,
    handleSubmit,
    airdropFromInputs,
  }
}