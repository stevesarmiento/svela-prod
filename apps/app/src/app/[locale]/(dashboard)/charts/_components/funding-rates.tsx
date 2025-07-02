'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import type { CoinMarketData } from '@/types/coins'
import { cn } from "@v1/ui/cn"

interface FundingRatesProps {
  coins: CoinMarketData[]
}

export function FundingRates({ coins }: FundingRatesProps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Funding Rates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {coins.map((coin) => (
              <div 
                key={coin.id} 
                className="flex flex-col items-center p-3 rounded-lg border bg-card text-card-foreground shadow-sm"
              >
                <span className="text-sm font-medium">{coin.symbol}</span>
                <span className={cn(
                  "text-lg font-mono",
                  {
                    'text-emerald-500': coin.fundingRate && coin.fundingRate > 0,
                    'text-rose-500': coin.fundingRate && coin.fundingRate < 0,
                    'text-muted-foreground': !coin.fundingRate
                  }
                )}>
                  {coin.fundingRate !== null && coin.fundingRate !== undefined
                    ? `${(coin.fundingRate * 100).toFixed(4)}%` 
                    : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }