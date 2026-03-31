'use client'

import React from 'react'
import { IconSparkles } from 'symbols-react'
import ReactMarkdown from 'react-markdown'

interface MarketData {
  name?: string
  current_price?: number
  price_change_percentage_24h?: number
  market_cap?: number
  total_volume?: number
}

interface TokenData {
  name?: string
  symbol?: string
}

interface AnalysisResultProps {
  isLoading: boolean
  result: string
  marketData?: MarketData
  tokenData?: TokenData | null
}

export function AnalysisResult({ isLoading, result, marketData, tokenData }: AnalysisResultProps) {
  const hasResult = result.trim().length > 0

  if (isLoading || hasResult) {
    return (
      <div className="relative min-h-[51vh]">
        <div className="space-y-8">
          <div className="prose prose-invert max-w-none">
            <h1 className="text-xl font-semibold mb-6 text-white">
              {marketData?.name || tokenData?.name || 'Token'} Market Overview
            </h1>

            {hasResult ? (
              isLoading ? (
                <div className="whitespace-pre-wrap text-zinc-400 leading-relaxed">
                  {result}
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold text-white mb-4 border-b border-zinc-700 pb-2">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold text-white mb-3 mt-6">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-medium text-zinc-200 mb-2 mt-4">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-zinc-400 mb-3 leading-relaxed">
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-white font-semibold">
                        {children}
                      </strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside mb-4 space-y-1">
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-zinc-400">
                        {children}
                      </li>
                    ),
                    em: ({ children }) => (
                      <em className="text-zinc-400 italic">
                        {children}
                      </em>
                    ),
                  }}
                >
                  {result}
                </ReactMarkdown>
              )
            ) : (
              <div className="text-zinc-400">
                Generating analysis…
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <IconSparkles className="w-12 h-12 mx-auto mb-4 fill-zinc-600" />
      <p className="text-zinc-400 text-lg">
        Click the analyze button to generate AI insights
      </p>
      <p className="text-zinc-500 text-sm mt-2">
        Our AI will analyze technical indicators, market trends, and provide actionable insights
      </p>
    </div>
  )
} 