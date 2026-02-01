'use client'

import { Card, CardContent } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import NumberFlow from '@number-flow/react'
import { useMemo } from 'react'
import { Button } from "@v1/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@v1/ui/dropdown-menu"
import { IconEllipsis, IconPencilTipCropCircle, IconTrashFill } from "symbols-react"
import { AvatarCircles } from "@v1/ui/token-stacks"
import { useCoinGeckoWatchlistAggregateChartIsolated } from "@/hooks/use-coingecko-watchlist-aggregate-chart-isolated"
import { WatchlistAggregateChart } from "@/components/charts/watchlist-aggregate-chart"

// Loading shine CSS
const loadingShineStyle = `
  .ck-qr-shine {
    position: absolute;
    top: 0;
    left: 0;
    width: 500%;
    height: 500%;
    background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
    animation: ck-qr-slide-diagonal 0.5s infinite;
    z-index: 1;
    pointer-events: none;
  }
  @keyframes ck-qr-slide-diagonal {
    0% { transform: translate(-100%, -100%); }
    100% { transform: translate(100%, 100%); }
  }
`;
import { WatchlistGroupIcon } from "@/components/watchlist-group-icon"
import { COLOR_THEMES } from "@/components/color-picker"
import { Kbd } from "@v1/ui/kbd"
import type { WatchlistGroup } from "./watchlist-context"

interface WatchlistGroupPreview {
  _id: string
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

type WatchlistCardGroup = WatchlistGroup | WatchlistGroupPreview

function isPersistedWatchlistGroup(group: WatchlistCardGroup): group is WatchlistGroup {
  return "userId" in group
}

interface CoinGeckoWatchlistCoin {
  id: string; // CoinGecko string ID
  name: string;
  symbol: string;
  slug: string;
  image: string; // CoinGecko image URL
  cmc_rank: number;
  circulating_supply: number;
  max_supply: number | null;
  quote: {
    USD: {
      price: number;
      volume_24h: number;
      market_cap: number;
      percent_change_24h: number;
      percent_change_1h?: number;
      percent_change_7d?: number;
      percent_change_30d?: number;
    };
  };
}

interface WatchlistCardProps {
  group: WatchlistCardGroup
  coins: CoinGeckoWatchlistCoin[]
  onEdit?: (group: WatchlistGroup) => void
  onDelete?: (group: WatchlistGroup) => void
  onSelect?: (group: WatchlistGroup) => void
  selected?: boolean
  nameOverride?: string
  iconOverride?: string
  colorOverride?: string
}

export function WatchlistCard({ 
  group, 
  coins = [],
  onEdit,
  onDelete,
  onSelect,
  selected = false,
  nameOverride,
  iconOverride,
  colorOverride
}: WatchlistCardProps) {
  // Use override values if provided, otherwise use group values
  const displayName = nameOverride ?? group.name
  const displayIcon = iconOverride ?? group.icon
  const displayColor = colorOverride ?? group.color

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

  const isPositive = stats.averageChange >= 0

  // Create avatar data for coin logos
  const avatarData = useMemo(() => {
    return coins.slice(0, 4).map((coin) => ({
      imageUrl: coin.image || '', // Use CoinGecko image URL
      profileUrl: `/charts/${coin.id}`,
    }))
  }, [coins])

  // Get aggregate chart data - using isolated CoinGecko API calls  
  const { aggregateData, isLoading: isChartLoading, performance } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins
  })

  // Get color theme for this group
  const colorTheme = COLOR_THEMES[displayColor as keyof typeof COLOR_THEMES] || COLOR_THEMES.default

  console.log('WatchlistCard chart data:', {
    groupName: group.name,
    coinsCount: coins.length,
    aggregateDataLength: aggregateData.length,
    isChartLoading,
    isPositive,
    sampleAggregateData: aggregateData.slice(0, 3)
  })

  return (
    <Card 
      className={cn(
        "relative w-full min-h-[200px] mx-auto hover:shadow-lg shadow-md transition-all duration-150 ease-in-out cursor-pointer overflow-hidden rounded-[20px] group active:scale-[0.98]",
        "hover:ring-4 dark:hover:ring-white/20 hover:ring-zinc-800/20 hover:ring-offset-4 hover:ring-offset-background",
        colorTheme.bg,
        colorTheme.border,
        selected && "ring-4 dark:ring-white/10 ring-zinc-800/10 ring-offset-4 ring-offset-background"
      )}
      onClick={() => {
        if (!onSelect) return
        if (!isPersistedWatchlistGroup(group)) return
        onSelect(group)
      }}
    >
      {/* Inject loading shine CSS only once per card */}
      <style>{loadingShineStyle}</style>
      {/* Loading shine overlay */}
      {isChartLoading && (
        <div className="ck-qr-shine" />
      )}
      <div
        className="absolute inset-0 z-0 size-full opacity-40 dark:opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='5' cy='5' r='1' fill='rgba(255,250,250,0.2)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
      
      <CardContent className="p-3 h-full relative">
        <div className="absolute top-0 left-0 w-24 h-24 -translate-x-2 -translate-y-2 z-0">
          <div className="w-full h-full flex items-center justify-center">
            <WatchlistGroupIcon 
              icon={displayIcon} 
              className="w-16 h-16 text-zinc-600 blur-[60px] opacity-20"
              size={64}
            />
          </div>
        </div>
        
        <div className="relative flex flex-col justify-between h-full z-10">
          {/* Header with watchlist info and actions */}
          <div className="flex items-start justify-between mb-3">
            <div 
              className="flex items-center gap-3 flex-1 cursor-pointer"
              onClick={() => {
                if (!onSelect) return
                if (!isPersistedWatchlistGroup(group)) return
                onSelect(group)
              }}
            >
              <div className="w-10 h-10 rounded-full bg-zinc-50/5 flex items-center justify-center">
                <WatchlistGroupIcon 
                  icon={displayIcon} 
                  className="text-zinc-300"
                  size={20}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="font-semibold text-white text-lg truncate">{displayName}</h3>
                <div className="flex text-[10px] flex-row items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span className="text-white font-diatype-mono">
                        {stats.positiveCount} 
                      </span>
                      <span className="text-white/50">up</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                      <span className="text-white font-diatype-mono">
                        {stats.negativeCount} 
                      </span>
                      <span className="text-white/50">down</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions menu */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Watchlist actions"
                      onClick={(event) => event.stopPropagation()}
                      className="h-7 w-7 p-0 rounded-lg bg-transparent hover:bg-white/5"
                    >
                      <IconEllipsis className="h-4 w-4 fill-white" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="end" 
                    sideOffset={-15}
                    className="w-[130px] p-2 rounded-xl bg-zinc-900 border-zinc-800"
                  >
                    <DropdownMenuItem 
                      onClick={() => {
                        if (!onEdit) return
                        if (!isPersistedWatchlistGroup(group)) return
                        onEdit(group)
                      }}
                      className="flex items-center gap-2 h-8 px-2 text-sm rounded-lg hover:bg-zinc-800 focus:bg-zinc-800"
                    >
                      <IconPencilTipCropCircle className="h-3.5 w-3.5 fill-muted-foreground group-hover:fill-foreground" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-2 bg-zinc-800" />
                    <DropdownMenuItem 
                      onClick={() => {
                        if (!onDelete) return
                        if (!isPersistedWatchlistGroup(group)) return
                        onDelete(group)
                      }}
                      className="flex items-center gap-2 h-8 px-2 text-sm rounded-lg hover:bg-red-500/10 focus:bg-red-500/10"
                    >
                      <IconTrashFill className="h-3.5 w-3.5 fill-red-400 group-hover:fill-red-400" />
                      <span className="text-red-400 hover:text-red-400">Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </div>

          {/* Chart or Empty State */}
          <div className="w-full">
            {coins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-md text-white/60 max-w-[180px] mx-auto">
                  To add tokens, press <Kbd className=" bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md text-white/80">Shift</Kbd> + <Kbd className=" bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md text-white/80">A</Kbd>
                </p>
              </div>
            ) : isChartLoading ? (
              <div className="flex items-center justify-center h-full relative">
                <div className="flex items-center gap-2 z-10 h-[70px]">
                  <span className="text-white/50 text-xs sr-only">
                    Cache: {performance.cacheHitRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            ) : (
              <div
              className="[mask-image:linear-gradient(to_right,transparent_0%,black_30%,black_100%)]"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 100%)'
              }}
              >
              <WatchlistAggregateChart
                data={aggregateData}
                isPositive={isPositive}
                width={0}
                height={70}
              />
              </div>

            )}
          </div>
          
          {/* Performance indicators - Only show if there are coins */}
          {coins.length > 0 && (
            <div className="flex items-end justify-between text-xs mt-4">            
              {/* Avatar circles */}
              {avatarData.length > 0 && (
                <div className="flex items-center gap-2">
                  <AvatarCircles
                    avatarUrls={avatarData}
                    numPeople={coins.length > 4 ? coins.length - 4 : 0}
                    className=""
                  />
                </div>
              )}
              
              <div className="flex items-center gap-2 mr-2">
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold font-diatype-mono",
                  // Use darker version of the theme color
                  displayColor === 'blue' ? "text-blue-300" :
                  displayColor === 'sky' ? "text-sky-300" :
                  displayColor === 'cyan' ? "text-cyan-300" :
                  displayColor === 'teal' ? "text-teal-300" :
                  displayColor === 'indigo' ? "text-indigo-300" :
                  displayColor === 'purple' ? "text-purple-300" :
                  displayColor === 'violet' ? "text-violet-300" :
                  displayColor === 'pink' ? "text-pink-300" :
                  displayColor === 'rose' ? "text-rose-300" :
                  displayColor === 'red' ? "text-red-300" :
                  displayColor === 'emerald' ? "text-emerald-300" :
                  displayColor === 'green' ? "text-green-300" :
                  displayColor === 'lime' ? "text-lime-300" :
                  displayColor === 'yellow' ? "text-yellow-300" :
                  displayColor === 'amber' ? "text-amber-300" :
                  displayColor === 'orange' ? "text-orange-300" :
                  displayColor === 'slate' ? "text-slate-300" :
                  "text-zinc-300", // default
                  isPositive ? "opacity-100" : "opacity-100"
                )}>
                  {isPositive ? "+" : "-"}
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
          )}
        </div>
      </CardContent>
    </Card>
  )
} 