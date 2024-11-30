import { useEffect } from 'react'
import { useCompletion } from 'ai/react'
import { Separator } from "@v1/ui/separator"
import { Card, CardContent } from "@v1/ui/card"
import { Skeleton } from "@v1/ui/skeleton"

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
  const { complete, completion, isLoading, error } = useCompletion({
    api: '/api/analyze',
    onError: (error) => {
      console.error('Analysis error:', error)
      toast({
        title: "Analysis Error",
        description: "Failed to generate analysis. Please try again.",
        variant: "destructive",
      })
    },
    onFinish: (result) => {
      console.log('Analysis complete:', result)
    }
  })

  useEffect(() => {
    if (!tokenData?.quote?.USD) {
      console.log('No token data available')
      return
    }

    async function analyzeToken() {
      try {
        console.log('Sending analysis request for:', tokenData.name)
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
        console.log('Analysis payload:', payload)
        
        const result = await complete(JSON.stringify(payload))
        console.log('Analysis result:', result)
      } catch (error) {
        console.error('Analysis request failed:', error)
      }
    }

    analyzeToken()
  }, [complete, tokenData])

  useEffect(() => {
    const controller = new AbortController()
    
    async function testAPI() {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: tokenData.name,
            quote: {
              USD: {
                price: tokenData.quote.USD.price,
                percent_change_24h: tokenData.quote.USD.percent_change_24h,
                market_cap: tokenData.quote.USD.market_cap,
                volume_24h: tokenData.quote.USD.volume_24h,
              }
            }
          }),
          signal: controller.signal
        })
        
        console.log('API test response:', {
          status: response.status,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        })
      } catch (error) {
        console.error('API test failed:', error)
      }
    }

    testAPI()
    return () => controller.abort()
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

  const sections = completion?.split('\n\n\n') ?? [];
  const strengths = sections.find(s => s.includes('Strengths:'))?.trim();
  const challenges = sections.find(s => s.includes('Challenges:'))?.trim();
  const outlook = sections.find(s => s.includes('Market outlook:'))?.trim();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Market Overview</h2>
        <p className="text-muted-foreground leading-7">
          {tokenData.name}'s total market cap is ${tokenData.quote.USD.market_cap.toLocaleString()}, 
          with a 24h trading volume of ${tokenData.quote.USD.volume_24h.toLocaleString()}.
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