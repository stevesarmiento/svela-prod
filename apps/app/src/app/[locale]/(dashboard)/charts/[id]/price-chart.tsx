'use client'

import { useMemo, useState } from 'react'
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
import NumberFlow from '@number-flow/react'
import type { CoinMarketData } from '@/types/coins'
import { motion } from 'framer-motion'

interface PriceChartProps {
  data: CoinMarketData['quote']['USD'];
  historical: CoinMarketData['historical'];
}

export function PriceChart({ data, historical }: PriceChartProps) {
  const [activePrice, setActivePrice] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // console.log('PriceChart Raw Props:', {
  //   data: JSON.stringify(data, null, 2),
  //   historical: JSON.stringify(historical, null, 2),
  //   hasHistorical: !!historical,
  //   hasQuotes: historical?.data?.quotes?.length,
  //   quotesStructure: historical?.data?.quotes ? typeof historical.data.quotes : 'undefined'
  // });

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

  const displayPrice = activePrice ?? data.price
  
  const calculatePercentageChange = useMemo(() => {
    const currentPrice = displayPrice;
    const oldestPrice = chartData[0]?.price;
    if (!oldestPrice) return 0;
    
    return ((currentPrice - oldestPrice) / oldestPrice) * 100;
  }, [displayPrice, chartData]);

  return (
    <Card>
      <CardHeader>
      <CardTitle className="flex flex-col items-left">
        <span className="text-2xl font-semibold font-mono">
          <NumberFlow
            value={displayPrice}
            format={{
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }}
            transformTiming={{ duration: 400, easing: 'ease-out' }}
            continuous={true}
          />
        </span>
        <div className={`text-lg ${calculatePercentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          <motion.span
            initial={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
            animate={{ rotate: calculatePercentageChange >= 0 ? 0 : 180 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
            className="inline-block mr-2"
            style={{ transformOrigin: 'center' }}
          >
            ▲
          </motion.span>
          <NumberFlow
            value={Math.abs(calculatePercentageChange)}
            format={{ 
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }}
            suffix="%"
            transformTiming={{ duration: 400, easing: 'ease-out' }}
            continuous={true}
          />
        </div>
      </CardTitle>
      </CardHeader>
      <CardContent>
        <div>
          <ChartContainer 
            config={chartConfig}
          >
            <LineChart 
              data={chartData}
              onMouseMove={(e) => {
                if (e.activePayload?.[0]) {
                  setActivePrice(e.activePayload[0].value as number);
                  setActiveIndex(e.activeTooltipIndex ?? null);
                }
              }}
              onMouseLeave={() => {
                setActivePrice(null);
                setActiveIndex(null);
              }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))"
                vertical={false}
                opacity={0.5}
              />
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
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                width={80}
                dx={-20}
                minTickGap={30}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <ChartTooltipContent
                      active={active}
                      payload={payload}
                      labelFormatter={() => {
                        if (!payload?.[0]) return '';
                        const date = new Date(payload[0].payload.time).toLocaleString(undefined, {
                          dateStyle: 'medium'
                        });
                        return <span className="text-muted-foreground text-xs">{date}</span>;
                      }}
                      formatter={(value) => [
                        <span key="value" className="font-semibold text-foreground">
                          ${Number(value).toLocaleString()}
                        </span>,
                      ]}
                      className="text-sm font-mono border-none shadow-none bg-background/5 backdrop-blur-xl p-3"
                    />
                  )
                }}
              />
              <YAxis 
                domain={[(dataMin: number) => dataMin * 0.90, (dataMax: number) => dataMax * 1.01]}
                axisLine={false}
                tickLine={false}
                hide={true}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                width={80}
              />
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="1" y2="0">
                    {chartData.map((_, index) => {
                      const offset = (index / (chartData.length - 1)) * 100;
                      const isActive = activeIndex !== null;
                      const isBeforeActive = index <= (activeIndex ?? chartData.length);
                      
                      if (isActive && index === activeIndex) {
                        return [
                          <stop 
                            key={`gradient-${index}-before`}
                            offset={`${offset - 0.1}%`}
                            stopColor="hsl(var(--primary))"
                            stopOpacity={1}
                          />,
                          <stop 
                            key={`gradient-${index}-after`}
                            offset={`${offset + 0.1}%`}
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.05}
                          />
                        ];
                      }
                      
                      return (
                        <stop 
                          key={`gradient-${index}`}
                          offset={`${offset}%`}
                          stopColor="hsl(var(--primary))"
                          stopOpacity={!isActive || isBeforeActive ? 1 : 0.05}
                        />
                      );
                    }).flat()}
                  </linearGradient>
                </defs>
              <Line 
                type="monotone" 
                dataKey="price"
                name="price"
                dot={false}
                strokeWidth={3}
                stroke="url(#priceGradient)"
                activeDot={{
                  r: 6,
                  fill: 'hsl(var(--primary))',
                  stroke: 'hsl(var(--background))',
                  strokeWidth: 4,
                  className: 'drop-shadow-md'
                }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}