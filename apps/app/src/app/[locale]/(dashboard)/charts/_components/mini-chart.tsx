'use client'

import { useMemo } from 'react'
import { LineChart, Line, YAxis } from 'recharts'
import type { HistoricalData } from '@/types/coins'

interface MiniChartProps {
  historical?: HistoricalData
  currentPrice: number
  className?: string
}

export function MiniChart({ historical, currentPrice, className = "w-[120px] h-[40px]" }: MiniChartProps) {
  const chartData = useMemo(() => {
    // Add console.log to debug
    console.log('MiniChart historical data:', historical);
    console.log('MiniChart current price:', currentPrice);

    if (!historical?.data?.quotes?.length) {
      // Fallback data
      const fallbackData = Array.from({ length: 30 }, (_, i) => ({
        time: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
        price: currentPrice * (0.95 + Math.random() * 0.1)
      }));
      
      fallbackData.push({
        time: Date.now(),
        price: currentPrice
      });
  
      console.log('Using fallback data:', fallbackData);
      return fallbackData;
    }
    
    // Transform historical data
    const historicalPoints = historical.data.quotes.map(quote => ({
      time: new Date(quote.timestamp).getTime(),
      price: quote.quote.USD.price
    }));
  
    // Add current price point
    const currentTime = Date.now();
    const lastHistoricalTime = historicalPoints[historicalPoints.length - 1]?.time;
    
    if (!lastHistoricalTime || currentTime > lastHistoricalTime) {
      historicalPoints.push({
        time: currentTime,
        price: currentPrice
      });
    }
  
    const sortedData = historicalPoints.sort((a, b) => a.time - b.time);
    console.log('Using historical data:', sortedData);
    return sortedData;
  }, [historical, currentPrice]);

  const isPositive = (chartData[chartData.length - 1]?.price ?? 0) >= (chartData[0]?.price ?? 0)

  return (
    <div className={className}>
      <LineChart data={chartData} width={100} height={40}>
        <YAxis 
          domain={['dataMin', 'dataMax']}
          hide={true}
        />
        <Line
          type="monotone"
          dataKey="price"
          dot={false}
          strokeWidth={1.5}
          stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
        />
      </LineChart>
    </div>
  )
}