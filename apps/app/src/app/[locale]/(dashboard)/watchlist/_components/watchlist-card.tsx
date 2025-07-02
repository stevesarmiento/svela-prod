'use client'

import { Card, CardContent } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import Image from "next/image"
import NumberFlow from '@number-flow/react'
import { LineChart, Line, YAxis } from 'recharts'
import { useMemo } from 'react'
import { Button } from "@v1/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@v1/ui/dropdown-menu"
import { 
  Edit, 
  Trash2, 
  List, 
  TrendingUp, 
  TrendingDown, 
  MoreHorizontal 
} from "lucide-react"

interface WatchlistGroup {
  _id: string
  name: string
  slug: string
  description?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

interface WatchlistCoin {
  id: number
  name: string
  symbol: string
  quote: {
    USD: {
      price: number
      percent_change_24h: number
      market_cap: number
      volume_24h: number
    }
  }
}

interface WatchlistCardProps {
  group: WatchlistGroup
  coins: WatchlistCoin[]
  onEdit?: (group: WatchlistGroup) => void
  onDelete?: (group: WatchlistGroup) => void
  onSelect?: (group: WatchlistGroup) => void
}

export function WatchlistCard({ 
  group, 
  coins = [],
  onEdit,
  onDelete,
  onSelect
}: WatchlistCardProps) {
  // Calculate aggregate stats
  const stats = useMemo(() => {
    if (!coins.length) {
      return {
        totalValue: 0,
        averageChange: 0,
        positiveCount: 0,
        negativeCount: 0,
        topPerformer: null,
        worstPerformer: null
      }
    }

    const totalValue = coins.reduce((sum, coin) => sum + coin.quote.USD.market_cap, 0)
    const averageChange = coins.reduce((sum, coin) => sum + coin.quote.USD.percent_change_24h, 0) / coins.length
    const positiveCount = coins.filter(coin => coin.quote.USD.percent_change_24h > 0).length
    const negativeCount = coins.filter(coin => coin.quote.USD.percent_change_24h < 0).length
    
    const sortedByChange = [...coins].sort((a, b) => b.quote.USD.percent_change_24h - a.quote.USD.percent_change_24h)
    const topPerformer = sortedByChange[0]
    const worstPerformer = sortedByChange[sortedByChange.length - 1]

    return {
      totalValue,
      averageChange,
      positiveCount,
      negativeCount,
      topPerformer,
      worstPerformer
    }
  }, [coins])

  // Generate chart data for the sparkline
  const chartData = useMemo(() => {
    if (!coins.length) {
      return Array.from({ length: 20 }, (_, i) => ({
        time: Date.now() - (20 - i) * 60 * 60 * 1000,
        value: 0
      }));
    }
    
    // Use average price change as a simple trend indicator
    // In a real implementation, you'd want historical data
    const baseValue = 100;
    return Array.from({ length: 20 }, (_, i) => ({
      time: Date.now() - (20 - i) * 60 * 60 * 1000,
      value: baseValue + (stats.averageChange * (i / 20))
    }));
  }, [coins, stats.averageChange])

  const isPositive = stats.averageChange >= 0

  return (
    <Card className="relative w-[320px] bg-gradient-to-b from-zinc-800/50 hover:from-zinc-800/80 to-zinc-800/20 hover:to-zinc-800/50 h-auto mx-auto hover:shadow-lg shadow-md transition-colors duration-200 ease-in-out cursor-pointer overflow-hidden rounded-[20px] border-zinc-800/50 group">
      <div
        className="absolute inset-0 z-0 size-full opacity-40 dark:opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,250,250,0.1)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
      <div
        className={`absolute bottom-0 left-0 h-[100%] w-screen bg-gradient-to-t from-zinc-900 via-zinc-900/0 to-zinc-900 dark:from-primary-950/0 dark:via-primary-950 dark:to-primary-950`}
      />
      
      <CardContent className="p-4 relative">
        {/* Blurred background with watchlist icon */}
        <div className="absolute top-0 left-0 w-24 h-24 -translate-x-2 -translate-y-2 z-0">
          <div className="w-full h-full flex items-center justify-center">
            <List className="w-16 h-16 text-zinc-600 blur-[60px] opacity-20" />
          </div>
        </div>
        
        {/* Main content */}
        <div className="relative z-10">
          {/* Header with watchlist info and actions */}
          <div className="flex items-start justify-between mb-3">
            <div 
              className="flex items-center gap-3 flex-1 cursor-pointer"
              onClick={() => onSelect?.(group)}
            >
              <div className="w-10 h-10 rounded-full bg-zinc-700/50 flex items-center justify-center">
                <List className="w-5 h-5 text-zinc-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{group.name}</h3>
                {group.description && (
                  <p className="text-sm text-muted-foreground truncate mt-[-2px]">
                    {group.description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions menu */}
            {!group.isDefault && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-zinc-700/20"
                    >
                      <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(group)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete?.(group)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Coins</div>
              <div className="text-2xl font-mono font-semibold">
                {coins.length}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Avg Change 24h</div>
              <div className={cn(
                "flex items-center gap-1 text-lg font-medium",
                isPositive ? "text-emerald-500" : "text-rose-500"
              )}>
                {isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <NumberFlow
                  value={Math.abs(stats.averageChange)}
                  format={{ 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }}
                  suffix="%"
                  transformTiming={{ duration: 400, easing: 'ease-out' }}
                />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="w-full h-12 mb-4">
            <LineChart data={chartData} width={288} height={48}>
              <YAxis domain={['dataMin', 'dataMax']} hide={true} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={2}
                stroke={isPositive ? "hsl(var(--success, 22 163 74))" : "hsl(var(--destructive, 239 68 68))"}
              />
            </LineChart>
          </div>
          
          {/* Performance indicators */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-muted-foreground">{stats.positiveCount} up</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-muted-foreground">{stats.negativeCount} down</span>
              </div>
            </div>
            
            {stats.topPerformer && (
              <div className="flex items-center gap-1">
                <Image
                  src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${stats.topPerformer.id}.png`}
                  alt={stats.topPerformer.name}
                  className="w-4 h-4 rounded-full"
                  width={16}
                  height={16}
                />
                <span className="text-green-500 font-mono">
                  +{stats.topPerformer.quote.USD.percent_change_24h.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 