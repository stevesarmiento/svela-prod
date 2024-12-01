'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useCompletion } from 'ai/react'
import { Skeleton } from "@v1/ui/skeleton"
import { toast } from "@v1/ui/use-toast"

interface TokenAnalysisProps {
  tokenData: {
    name: string
    quote: {
      USD: {
        price: number
        percent_change_24h: number
        market_cap: number
        volume_24h: number
      }
    }
  }
}

export function TokenAnalysis({ tokenData }: TokenAnalysisProps) {
  const analysisRequested = useRef(false)

  const { complete, completion, isLoading } = useCompletion({
    api: '/api/analyze',
    onError: (error) => {
      console.error('Analysis error:', error)
      toast({
        title: "Analysis Error",
        description: "Failed to generate analysis. Please try again.",
        variant: "destructive",
      })
    },
    onFinish: (completion) => {
      console.log('Analysis completed:', completion)
      analysisRequested.current = true
    }
  })

  useEffect(() => {
    if (!analysisRequested.current && tokenData?.quote?.USD && !isLoading) {
      analysisRequested.current = true
      
      // Send the data directly without nested prompt
      const payload = {
        name: tokenData.name,
        quote: {
          USD: {
            price: tokenData.quote.USD.price,
            percent_change_24h: tokenData.quote.USD.percent_change_24h,
            market_cap: tokenData.quote.USD.market_cap,
            volume_24h: tokenData.quote.USD.volume_24h,
          }
        }
      }
      
      complete(JSON.stringify(payload)).catch(error => {
        console.error('Failed to start analysis:', error)
        analysisRequested.current = false // Reset on error
      })
    }
  }, [tokenData, complete, isLoading])

  const { strengths, challenges, outlook } = useMemo(() => {
    if (!completion) return { strengths: '', challenges: '', outlook: '' }
    
    try {
      // First try to clean the response text
      const cleanedText = completion.trim()
      
      // Split by section headers
      const strengthsMatch = cleanedText.match(/Strengths:([\s\S]*?)(?=Challenges:|$)/i)
      const challengesMatch = cleanedText.match(/Challenges:([\s\S]*?)(?=Market outlook:|$)/i)
      const outlookMatch = cleanedText.match(/Market outlook:([\s\S]*?)$/i)
      
      return {
        strengths: strengthsMatch?.[1]?.trim() || '',
        challenges: challengesMatch?.[1]?.trim() || '',
        outlook: outlookMatch?.[1]?.trim() || ''
      }
    } catch (error) {
      console.error('Failed to parse analysis:', error)
      return { strengths: '', challenges: '', outlook: '' }
    }
  }, [completion])

  return (
    <div className="mt-4">
      <div>
        <div className="space-y-4">
          {isLoading ? (
            // Show loading state
            <>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : (
            // Show content when available
            <>
              <div>
                <p className="text-muted-foreground">{strengths}</p>
              </div>
              
              <div>
                <p className="text-muted-foreground">{challenges}</p>
              </div>
              
              <div>
                <p className="text-muted-foreground">{outlook}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}