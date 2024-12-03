'use client'

import { useMemo, memo, ReactElement } from 'react'
import { Treemap } from 'recharts'
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { Props as ContentProps } from 'recharts/types/component/DefaultLegendContent'
import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@v1/ui/chart"
import type { Coin } from '@/types/coins'
import { cn } from '@v1/ui/cn'
interface CoinTreemapProps {
  coins: Coin[]
}

interface TreemapData {
  name: string
  symbol: string
  size: number
  value: number
  percentChange: number
  volume24h: number
}

interface CustomContentProps {
  x: number
  y: number
  width: number
  height: number
  name: string
  percentChange: number
}

const CustomContent = memo(function CustomContent({
    x,
    y,
    width,
    height,
    name,
    percentChange = 0,
  }: CustomContentProps) {
    if (!width || !height) return null

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        className={cn(`transition-colors duration-200`, percentChange > 0 ? 'fill-green-500/20 hover:fill-green-500/40' : 'fill-red-500/20 hover:fill-red-500/40')}
        stroke="hsl(var(--border))"
        strokeWidth={1}
      />
      {width > 50 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          fill="white"
          fontSize={10}
          stroke="none"
          className="select-none pointer-events-none font-mono"
        >
          <tspan x={x + width / 2} dy="-0.5em" fontWeight="bold">
            {name}
          </tspan>
          <tspan x={x + width / 2} dy="1.3em" className="opacity-50">
            {percentChange > 0 ? '+' : ''}
            {percentChange.toFixed(2)}%
          </tspan>
        </text>
      )}
    </g>
  )
})

export function CoinTreemap({ coins }: CoinTreemapProps) {
    const data = useMemo(() => {
        return coins.map((coin): TreemapData => ({
          name: coin.name,
          symbol: coin.symbol,
          size: coin.quote.USD.market_cap,
          value: coin.quote.USD.market_cap,
          percentChange: coin.quote.USD.percent_change_24h,
          volume24h: coin.quote.USD.volume_24h
        }))
      }, [coins])
  
    const chartConfig = {
      positive: {
        theme: {
          light: 'rgba(34, 197, 94, 0.2)',
          dark: 'rgba(34, 197, 94, 0.2)'
        }
      },
      negative: {
        theme: {
          light: 'rgba(239, 68, 68, 0.2)',
          dark: 'rgba(239, 68, 68, 0.2)'
        }
      }
    }
  
    return (
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle className="font-medium font-mono">Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ChartContainer config={chartConfig}>
              <Treemap
                data={data}
                dataKey="size"
                aspectRatio={1}
                stroke="hsl(var(--border))"
                content={
                    ((props: ContentProps) => <CustomContent {...(props as CustomContentProps)} />) as unknown as ReactElement
                  }
              >
              <ChartTooltip
                content={({ active, payload }) => (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    nameKey="name"
                    formatter={(value: ValueType, name: NameType, item: { payload?: TreemapData }) => [
                      <span key="name" className="font-semibold">{item.payload?.name} ({item.payload?.symbol})</span>,
                      <span key="market-cap">Market Cap: ${(value as number).toLocaleString()}</span>,
                      <span key="volume">Volume 24h: ${item.payload?.volume24h?.toLocaleString()}</span>,
                      <span key="change" className={cn(
                        item.payload?.percentChange && item.payload.percentChange > 0 ? 'text-green-500' : 'text-red-500'
                      )}>
                        Change: {item.payload?.percentChange && item.payload.percentChange > 0 ? '+' : ''}{item.payload?.percentChange?.toFixed(2)}%
                      </span>
                    ]}
                    className="text-sm font-mono border-none shadow-none bg-background backdrop-blur-xl p-3"
                  />
                )}
              />
              </Treemap>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    )
  }