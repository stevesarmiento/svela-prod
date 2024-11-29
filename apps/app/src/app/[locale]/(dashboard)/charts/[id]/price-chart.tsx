'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis,
  CartesianGrid
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@v1/ui/chart"
import type { CoinMarketData } from '@/types/coins'

interface PriceChartProps {
  data: CoinMarketData['quote']['USD'];
  historical: CoinMarketData['historical'];
}

export function PriceChart({ data, historical }: PriceChartProps) {
  const { theme } = useTheme()

  // Updated logging to match the data structure
  console.log('PriceChart Raw Props:', {
    data: JSON.stringify(data, null, 2),
    historical: JSON.stringify(historical, null, 2),
    hasHistorical: !!historical,
    hasQuotes: historical?.data?.quotes?.length,
    quotesStructure: historical?.data?.quotes ? typeof historical.data.quotes : 'undefined'
  });

  const chartConfig = {
    price: {
      theme: {
        light: 'hsl(var(--primary))',
        dark: 'hsl(var(--primary))'
      },
      label: 'Price'
    }
  }

  const chartData = useMemo(() => {
    if (!historical?.data?.quotes?.length) {
      console.warn('No historical data available, using fallback data');
      const fallbackData = Array.from({ length: 30 }, (_, i) => ({
        time: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
        price: data.price * (0.95 + Math.random() * 0.1)
      }));
      
      fallbackData.push({
        time: Date.now(),
        price: data.price
      });
  
      return fallbackData;
    }
    
    const historicalPoints = historical.data.quotes.map(quote => ({
      time: new Date(quote.timestamp).getTime(),
      price: quote.quote.USD.price
    }));
  
    const currentTime = Date.now();
    const lastHistoricalTime = historicalPoints[historicalPoints.length - 1]?.time;
    
    if (!lastHistoricalTime || currentTime > lastHistoricalTime) {
      historicalPoints.push({
        time: currentTime,
        price: data.price
      });
    }
  
    return historicalPoints.sort((a, b) => a.time - b.time);
  }, [historical, data.price]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Chart (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ChartContainer config={chartConfig}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(time) => {
                  const date = new Date(time)
                  return date.toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric' 
                  })
                }}
                scale="time"
              />
              <YAxis 
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const [item] = payload
                  return (
                    <ChartTooltipContent
                      active={active}
                      payload={payload}
                      labelFormatter={(label) => {
                        if (!payload?.[0]) return '';
                        return new Date(payload[0].payload.time).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        });
                      }}
                      formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Price']}
                    />
                  )
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price"
                name="price"
                dot={false}
                strokeWidth={2}
                stroke={theme === 'dark' ? '#fff' : '#fff'} // Example theme-based stroke color
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}