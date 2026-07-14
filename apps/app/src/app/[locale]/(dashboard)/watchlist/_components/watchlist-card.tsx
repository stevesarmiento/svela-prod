'use client'

import { Card, CardContent } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import NumberFlow from '@/components/number-flow'
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
  IconEllipsis,
  IconPencilTipCropCircle,
  IconTrashFill,
  IconTriangleFill,
} from "symbols-react"
import { AvatarCircles } from "@v1/ui/token-stacks"
import { WatchlistAggregateChart } from "@/components/charts/watchlist-aggregate-chart"
import {
  getWatchlistAggregateRangeEndMs,
  useCoinGeckoWatchlistAggregateChartIsolated,
} from "@/hooks/use-coingecko-watchlist-aggregate-chart-isolated"
import { getTokenLogoURL } from "@/lib/logo-overrides"

// Loading shine CSS
const loadingShineStyle = `
  .ck-qr-shine {
    position: absolute;
    top: 0;
    left: 0;
    width: 500%;
    height: 500%;
    background: linear-gradient(135deg, oklch(1 0 0 / 0) 0%, oklch(1 0 0 / 0.1) 50%, oklch(1 0 0 / 0) 100%);
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
  isLoading?: boolean
  itemCount?: number
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
  isLoading = false,
  itemCount,
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
  const coinsCount = itemCount ?? coins.length

  // Calculate aggregate stats
  const stats = useMemo(() => {
    if (!coins.length) {
      return {
        positiveCount: 0,
        negativeCount: 0,
      }
    }

    const positiveCount = coins.filter(coin => coin.quote.USD.percent_change_24h > 0).length
    const negativeCount = coins.filter(coin => coin.quote.USD.percent_change_24h < 0).length

    return {
      positiveCount,
      negativeCount,
    }
  }, [coins])

  // Create avatar data for coin logos
  const avatarData = useMemo(() => {
    return coins
      .slice(0, 4)
      .map((coin) => {
        const logoUrl = getTokenLogoURL(coin.symbol, coin.image)
        if (!logoUrl) return null
        return {
          imageUrl: logoUrl,
          profileUrl: `/watchlists/${coin.id}`,
        }
      })
      .filter((item): item is { imageUrl: string; profileUrl: string } => item !== null)
  }, [coins])

  const rangeEndTimeMs = useMemo(() => getWatchlistAggregateRangeEndMs('1d'), [])
  const {
    aggregateData,
    isLoading: isChartLoading,
    isFetching: isChartFetching,
    isPlaceholderData: isChartPlaceholder,
    isChangeUnavailable,
  } = useCoinGeckoWatchlistAggregateChartIsolated({
    coins,
    timeScale: '1d',
    rangeEndTimeMs,
  })

  const isChartReady =
    !isChangeUnavailable &&
    !isChartPlaceholder &&
    aggregateData.length > 0
  const isChartPending =
    coinsCount > 0 &&
    !isChangeUnavailable &&
    !isChartReady &&
    (isChartLoading || isChartFetching || isChartPlaceholder)

  const latestAggregateChange = useMemo(() => {
    if (!isChartReady) return null
    return aggregateData[aggregateData.length - 1]?.value ?? null
  }, [aggregateData, isChartReady])

  const isAggregatePositive = (latestAggregateChange ?? 0) >= 0

  // Get color theme for this group
  const colorTheme = COLOR_THEMES[displayColor as keyof typeof COLOR_THEMES] || COLOR_THEMES.default

  const shouldShowLoadingState = coinsCount > 0 && (isLoading || isChartPending)

  return (
    <Card 
      className={cn(
        "relative w-full min-h-[200px] mx-auto hover:shadow-lg shadow-md transition-[box-shadow,transform] duration-[var(--duration-micro)] ease-[var(--ease-out-cubic)] cursor-pointer overflow-hidden rounded-[20px] group active:scale-[0.98]",
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
      {shouldShowLoadingState && (
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
            <button
              type="button"
              className="flex items-center gap-3 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-lg"
              onClick={() => {
                if (!onSelect) return
                if (!isPersistedWatchlistGroup(group)) return
                onSelect(group)
              }}
            >
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm flex items-center justify-center">
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
                    <IconTriangleFill
                      aria-hidden
                      className="size-2 shrink-0 fill-green-500"
                    />
                    <span className="text-white font-berkeley-mono">
                      {isLoading ? "—" : stats.positiveCount}
                    </span>
                    <span className="text-white/50">up</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconTriangleFill
                      aria-hidden
                      className="size-2 shrink-0 fill-red-500 rotate-180"
                    />
                    <span className="text-white font-berkeley-mono">
                      {isLoading ? "—" : stats.negativeCount}
                    </span>
                    <span className="text-white/50">down</span>
                  </div>
                </div>
              </div>
            </button>

            {/* Actions menu */}
            {isPersistedWatchlistGroup(group) && (onEdit || onDelete) ? (
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
                    {onEdit ? (
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdit(group)
                        }}
                        className="flex items-center gap-2 h-8 px-2 text-sm rounded-lg hover:bg-zinc-800 focus:bg-zinc-800"
                      >
                        <IconPencilTipCropCircle className="h-3.5 w-3.5 fill-muted-foreground group-hover:fill-foreground" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                    ) : null}
                    {onEdit && onDelete ? <DropdownMenuSeparator className="my-2 bg-zinc-800" /> : null}
                    {onDelete ? (
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation()
                          onDelete(group)
                        }}
                        className="flex items-center gap-2 h-8 px-2 text-sm rounded-lg hover:bg-red-500/10 focus:bg-red-500/10"
                      >
                        <IconTrashFill className="h-3.5 w-3.5 fill-red-400 group-hover:fill-red-400" />
                        <span className="text-red-400 hover:text-red-400">Delete</span>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>

          {/* Chart or Empty State */}
          <div className="w-full">
            {shouldShowLoadingState ? (
              <div className="flex items-center justify-center h-full relative">
                <div className="h-[70px]" />
              </div>
            ) : coinsCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-white/60 mx-auto">
                  <span>To add tokens to this watchlist </span>
                  <div className="flex items-center gap-1">
                    <span>press </span>
                    <Kbd className=" bg-white/10 border !border-white/20 rounded-md text-white/80">Shift</Kbd>
                    <span>+</span>
                    <Kbd className=" bg-white/10 border !border-white/20 rounded-md text-white/80">A</Kbd>
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
                {isChartReady ? (
                  <WatchlistAggregateChart
                    data={aggregateData}
                    isPositive={isAggregatePositive}
                    width={0}
                    height={70}
                  />
                ) : (
                  <div className="h-[70px]" />
                )}
              </div>

            )}
          </div>
          
          {/* Performance indicators - Only show if there are coins */}
          {coinsCount > 0 && (
            <div className="flex items-end justify-between text-xs mt-4">            
              {/* Avatar circles */}
              {avatarData.length > 0 && (
                <div className="flex items-center gap-2">
                  <AvatarCircles
                    avatarUrls={avatarData}
                    numPeople={coinsCount > 4 ? coinsCount - 4 : 0}
                    className=""
                  />
                </div>
              )}
              
              <div className="flex items-center gap-2 mr-2">
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold font-berkeley-mono",
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
                  isAggregatePositive ? "opacity-100" : "opacity-100"
                )}>
                  {latestAggregateChange === null ? (
                    <span>—</span>
                  ) : (
                    <>
                      <span>{isAggregatePositive ? "+" : "-"}</span>
                      <NumberFlow
                        value={Math.abs(latestAggregateChange)}
                        format={{ 
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }}
                        suffix="%"
                        transformTiming={{ duration: 400, easing: 'ease-out' }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 
