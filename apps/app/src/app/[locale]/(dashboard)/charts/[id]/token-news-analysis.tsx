'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@v1/ui/skeleton'

interface TokenData {
  name: string
  symbol: string
}

interface TokenNewsAnalysisProps {
  tokenData: TokenData
  timeframe?: string
}

export function TokenNewsAnalysis({ tokenData, timeframe = '24h' }: TokenNewsAnalysisProps) {
  const [analysis, setAnalysis] = useState<string>('')
  const [citations, setCitations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAnalysis() {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch('/api/grok/token-news', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: tokenData.name,
            symbol: tokenData.symbol,
            timeframe 
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch analysis')
        }

        const data = await response.json()
        setAnalysis(data.analysis)
        setCitations(data.citations || [])
      } catch (err) {
        console.error('Analysis error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load analysis')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalysis()
  }, [tokenData.name, tokenData.symbol, timeframe])

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <div className="space-y-4">
          <div className="prose prose-invert max-w-none">
            {analysis.split('\n').map((line, index) => (
              <p key={index} className="my-2">{line}</p>
            ))}
          </div>
          
          {citations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Sources:</h4>
              <div className="space-y-1">
                {citations.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-blue-400 hover:text-blue-300 truncate"
                  >
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
} 