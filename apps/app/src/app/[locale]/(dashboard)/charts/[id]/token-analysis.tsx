'use client'

import { useEffect, useState } from 'react'
import { Separator } from "@v1/ui/separator"
import { generateAnalysis } from "./action"
import { Card, CardContent } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"

interface TokenAnalysisProps {
  tokenData: any
}

export function TokenAnalysis({ tokenData }: TokenAnalysisProps) {
  const [analysis, setAnalysis] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const response = await generateAnalysis(tokenData)
        
        if (!response?.body) {
          throw new Error('No response body')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let done = false
        let analysisText = ''

        while (!done) {
          const { value, done: doneReading } = await reader.read()
          done = doneReading
          const chunk = decoder.decode(value)
          analysisText += chunk
          setAnalysis(analysisText)
        }
      } catch (error) {
        console.error('Failed to generate analysis:', error)
        setAnalysis('Failed to generate analysis. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAnalysis()
  }, [tokenData])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  const [strengths, challenges, outlook] = analysis.split('\n\n')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Market Overview</h2>
        <p className="text-muted-foreground leading-7">
          {tokenData.name}'s total market cap is ${tokenData.market_data.market_cap.usd.toLocaleString()}, 
          with a 24h trading volume of ${tokenData.market_data.total_volume.usd.toLocaleString()}.
        </p>
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4">Analysis</h2>
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-4">
          {strengths && (
            <div>
              <h3 className="text-base font-medium">Strengths</h3>
              <p className="text-muted-foreground">{strengths.replace('Strengths:', '').trim()}</p>
            </div>
          )}
          
          {challenges && (
            <div>
              <h3 className="text-base font-medium">Challenges</h3>
              <p className="text-muted-foreground">{challenges.replace('Challenges:', '').trim()}</p>
            </div>
          )}
          
          {outlook && (
            <div>
              <h3 className="text-base font-medium">Market Outlook</h3>
              <p className="text-muted-foreground">{outlook.replace('Market outlook:', '').trim()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}