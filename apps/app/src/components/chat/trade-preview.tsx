'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useArmaClient, useSwap, useBalance } from '@arma/sdk'
import { Button } from '@v1/ui/button'
import { Card } from '@v1/ui/card'
import { Badge } from '@v1/ui/badge'
import { Input } from '@v1/ui/input'
import { Spinner } from '@v1/ui/spinner'
import { AlertTriangle, CheckCircle, ArrowUpDown } from 'lucide-react'
import type { TradeAction } from '@/types/enhanced-chat'
import { getTokenInfo } from '@/lib/token-mappings'

interface TradePreviewProps {
  tradeAction: TradeAction
  onExecute?: (signature: string) => void
  onCancel?: () => void
}

export function TradePreview({ tradeAction, onExecute, onCancel }: TradePreviewProps) {
  const { wallet } = useArmaClient()
  const { balance, isLoading: balanceLoading, refetch: refetchBalance } = useBalance({ 
    address: wallet.address || undefined 
  })
  
  // UI state - initialize from tradeAction but allow editing
  const [fromMint, setFromMint] = useState(tradeAction.inputToken || '')
  const [toMint, setToMint] = useState(tradeAction.outputToken || '')
  const [amount, setAmount] = useState(tradeAction.amount?.toString() || '')
  const [slippageBps, setSlippageBps] = useState((tradeAction.slippage || 0.5) * 100)
  const [swapResult, setSwapResult] = useState<{ signature: string; confirmed: boolean } | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const { isLoading, quotes, error, getQuotes, executeSwap } = useSwap({ 
    strategy: 'best-price' 
  })

  // Get token info
  const inputTokenInfo = useMemo(() => getTokenInfo(fromMint), [fromMint])
  const outputTokenInfo = useMemo(() => getTokenInfo(toMint), [toMint])
  
  // Format amount with proper decimals
  const formatAmount = (amount: bigint, decimals: number): string => {
    const divisor = 10 ** decimals
    return (Number(amount) / divisor).toFixed(Math.min(decimals, 6))
  }
  
  // Convert amount to lamports/tokens
  const amountInTokenUnits = useMemo(() => {
    if (!amount || !inputTokenInfo) return BigInt(0)
    const trimmed = amount.trim()
    if (!trimmed) return BigInt(0)
    const [ints, frac = ''] = trimmed.split('.')
    const fracPadded = (frac + '000000000').slice(0, inputTokenInfo.decimals)
    const multiplier = BigInt(10) ** BigInt(inputTokenInfo.decimals)
    return BigInt(ints || '0') * multiplier + BigInt(fracPadded || '0')
  }, [amount, inputTokenInfo])

  // Fetch initial quote when component mounts with valid trade data
  useEffect(() => {
    if (!wallet.connected || !fromMint || !toMint || amountInTokenUnits <= BigInt(0)) return
    
    console.log('🔄 Initial quote fetch for trade preview:', { fromMint: inputTokenInfo?.symbol, toMint: outputTokenInfo?.symbol, amount: amount })
    
    // Only fetch once on mount if we have valid trade data
    if (tradeAction.amount && tradeAction.inputToken && tradeAction.outputToken) {
      console.log('📡 Fetching initial quote...')
      void getQuotes({
        inputMint: fromMint as import('@solana/kit').Address,
        outputMint: toMint as import('@solana/kit').Address,
        amount: amountInTokenUnits as import('@solana/kit').Lamports,
        slippageBps,
      })
    }
  }, []) // Empty dependency array - only run once on mount

  // Manual quote refresh function
  const refreshQuotes = () => {
    if (!wallet.connected || !fromMint || !toMint || amountInTokenUnits <= BigInt(0)) return
    
    console.log('🔄 Manual quote refresh triggered')
    void getQuotes({
      inputMint: fromMint as import('@solana/kit').Address,
      outputMint: toMint as import('@solana/kit').Address,
      amount: amountInTokenUnits as import('@solana/kit').Lamports,
      slippageBps,
    })
  }

  const bestQuote = quotes?.[0]
  const estimatedOut = useMemo(() => {
    if (!bestQuote || !outputTokenInfo) return null
    return `${formatAmount(bestQuote.outputAmount, outputTokenInfo.decimals)} ${outputTokenInfo.symbol}`
  }, [bestQuote, outputTokenInfo])

  const handleExecute = async () => {
    if (!bestQuote) return
    
    setIsExecuting(true)
    setSwapResult(null)
    try {
      const result = await executeSwap(bestQuote)
      setSwapResult(result)
      onExecute?.(result.signature)
      setTimeout(() => { refetchBalance() }, 2000)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error?.code !== 'USER_CANCELLED') {
        console.error('Swap failed:', err)
      }
    } finally {
      setIsExecuting(false)
    }
  }

  const resetSwap = () => {
    setSwapResult(null)
  }

  if (!wallet.connected) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <div className="mb-2">🔒</div>
          <p>Connect your wallet to execute trades</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Trade Preview</h3>
        <Badge className="bg-blue-100 text-blue-800">
          {Math.round(tradeAction.confidence * 100)}% confident
        </Badge>
      </div>

      <AnimatePresence mode="wait">
        {!swapResult ? (
          <motion.div
            key="swap-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Balance Display */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Balance: {fromMint === 'So11111111111111111111111111111111111111112' 
                  ? (balanceLoading ? 'Loading…' : balance != null ? `${(Number(balance) / 1e9).toFixed(6)} SOL` : '—')
                  : '—'
                }
              </span>
              {(isLoading || isExecuting) && <Spinner size={16} />}
            </div>

            {/* From Token */}
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">You pay</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-right text-base border-none shadow-none p-0 w-24"
                    inputMode="decimal"
                  />
                  <span className="font-medium text-gray-900">
                    {inputTokenInfo?.symbol || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* Swap Arrow */}
            <div className="flex justify-center">
              <Button 
                type="button" 
                variant="outline" 
                size="icon" 
                onClick={() => { 
                  setFromMint(toMint); 
                  setToMint(fromMint); 
                }} 
                className="h-8 w-8"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>

            {/* To Token */}
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">You receive</div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-base font-medium text-gray-900">
                    {estimatedOut ? estimatedOut : '—'}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 w-6"
                    onClick={refreshQuotes}
                    disabled={!wallet.connected || isLoading}
                    aria-label="Refresh quotes"
                  >
                    <svg className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3.51 9a9 9 0 0114.13-3.36L23 10" />
                      <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14" />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            {/* Quote Details */}
            {bestQuote && (
              <div className="space-y-2 text-sm bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price impact:</span>
                  <span className={bestQuote.priceImpact < 0.01 ? 'text-green-600' : bestQuote.priceImpact < 0.05 ? 'text-yellow-600' : 'text-red-600'}>
                    {(bestQuote.priceImpact * 100).toFixed(2)}%
                    {bestQuote.priceImpact > 0.05 && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Slippage tolerance:</span>
                  <div className="flex items-center gap-2">
                    <Input
                      value={(slippageBps / 100).toString()}
                      onChange={e => {
                        const pct = Number(e.target.value)
                        if (Number.isFinite(pct) && pct >= 0) setSlippageBps(Math.round(pct * 100))
                      }}
                      className="h-6 w-12 text-right text-xs border-none shadow-none p-1"
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Route:</span>
                  <span className="text-xs text-gray-500">Via Jupiter</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-700">{error.message}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!bestQuote && amountInTokenUnits > BigInt(0) && (
                <Button
                  onClick={refreshQuotes}
                  disabled={!wallet.connected || isLoading}
                  className="flex-1"
                  variant="outline"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Spinner size={16} className="mr-2" /> 
                      Getting Quote...
                    </>
                  ) : (
                    'Get Quote'
                  )}
                </Button>
              )}
              {bestQuote && (
                <Button
                  onClick={handleExecute}
                  disabled={!bestQuote || isExecuting}
                  className="flex-1"
                  size="lg"
                >
                  {(isLoading || isExecuting) ? (
                    <>
                      <Spinner size={16} className="mr-2" /> 
                      Processing...
                    </>
                  ) : (
                    'Execute Swap'
                  )}
                </Button>
              )}
              <Button variant="outline" onClick={onCancel} size="lg">
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="swap-result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 p-6"
          >
            <motion.div 
              initial={{ scale: 0 }} 
              animate={{ scale: 1 }} 
              transition={{ delay: 0.2 }} 
              className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto"
            >
              <CheckCircle className="w-8 h-8 text-green-600" />
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Swap Successful!</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div><span className="font-medium">From:</span> {inputTokenInfo?.symbol}</div>
                <div><span className="font-medium">To:</span> {outputTokenInfo?.symbol}</div>
                <div>
                  <span className="font-medium">Signature:</span>
                  <code className="ml-1 text-xs bg-gray-100 px-2 py-1 rounded">
                    {swapResult.signature.slice(0, 8)}...{swapResult.signature.slice(-8)}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <span className="ml-1 text-green-600">
                    {swapResult.confirmed ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
            <Button onClick={resetSwap} variant="outline" className="w-full">
              Make Another Swap
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
