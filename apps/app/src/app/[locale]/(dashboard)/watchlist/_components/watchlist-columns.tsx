'use client'

import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import Image from "next/image"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Checkbox } from "@v1/ui/checkbox"
import { type ColumnDef } from '@tanstack/react-table'
import { motion } from "motion/react"
import { Spinner } from "@v1/ui/spinner"
import type { CoinMarketData } from '@/types/coins'
import { InlinePriceChart } from "@/components/charts/inline-price-chart"
import { DURATION_UI_S, EASE_IN_OUT_CUBIC, motionDuration } from "@/lib/motion-tokens"

interface WatchlistColumnsProps {
  handleRemove: (coinId: number | string) => void;
  selectedCoins: Set<string>;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  totalCoins: number;
  removingCoins: Set<string>;
  hasSelectedCoins: boolean;
  shouldReduceMotion?: boolean;
  onInlineChartError?: () => void;
}

export function createWatchlistColumns({
  handleRemove,
  selectedCoins,
  onCoinSelect,
  onSelectAll,
  totalCoins,
  removingCoins,
  hasSelectedCoins,
  shouldReduceMotion = false,
  onInlineChartError,
}: WatchlistColumnsProps): ColumnDef<CoinMarketData>[] {
  return [
    {
      id: 'select',
      header: () => (
        <div className={cn(
          "transition-opacity duration-200",
          hasSelectedCoins ? "opacity-100" : "opacity-0"
        )}>
          <Checkbox
            checked={selectedCoins.size === totalCoins && totalCoins > 0}
            onCheckedChange={onSelectAll}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => {
        const coinId = row.original.id.toString()
        const isRowSelected = selectedCoins.has(coinId)
        // When any rows are selected, lock the reveal state for all rows (selection mode).
        // Otherwise, reveal on hover (handled by Motion `whileHover` below).
        const isSelectionMode = hasSelectedCoins
        const transition = {
          type: "tween" as const,
          duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
          ease: EASE_IN_OUT_CUBIC,
        }
        const checkboxVariants = {
          rest: { opacity: 0, x: -20, pointerEvents: "none" as const },
          revealed: { opacity: 1, x: 0, pointerEvents: "auto" as const },
        } as const

        const contentVariants = {
          rest: { x: 0, opacity: 1 },
          revealed: { x: 40, opacity: 0.9 },
        } as const
        
        return (
          <motion.div
            className="relative w-full h-full flex items-center justify-start overflow-hidden"
            initial={false}
            animate={isSelectionMode ? "revealed" : "rest"}
            whileHover={isSelectionMode ? undefined : "revealed"}
          >
            {/* Checkbox - stable DOM to avoid "jump" on select/deselect */}
            <motion.div
              className="absolute left-0 z-10 px-1"
              variants={checkboxVariants}
              transition={transition}
            >
              <Checkbox
                checked={isRowSelected}
                tabIndex={isSelectionMode ? 0 : -1}
                onCheckedChange={(value) => onCoinSelect(coinId, !!value)}
                onClick={(e) => {
                  // Prevent Link navigation + prevent double-toggle with the parent first-cell click handler.
                  e.preventDefault()
                  e.stopPropagation()
                }}
                aria-label="Select row"
                className="mt-[6px] data-[state=checked]:mt-[2px]"
              />
            </motion.div>
            
            {/* Token content - no link here, entire row will be linked */}
            <motion.div
              className="flex items-center gap-2"
              variants={contentVariants}
              transition={transition}
            >
              <div className="relative">
                {row.original.quote.USD.price > 0 ? (
                  // Use CoinGecko image if available, otherwise fallback to letter
                  row.original.image ? (
                    <Image
                      src={row.original.image?.startsWith('http') || row.original.image?.startsWith('/') ? row.original.image : '/favicon.ico'}
                      alt={row.original.name}
                      className="w-[20px] h-[20px] rounded-full"
                      width={24}
                      height={24}
                      onError={(e) => {
                        // Fallback to letter-based avatar on image error
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="w-[20px] h-[20px] rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">${row.original.symbol.charAt(0).toUpperCase()}</div>`;
                        }
                      }}
                    />
                  ) : (
                    // Fallback for missing image
                    <div className="w-[20px] h-[20px] rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {row.original.symbol.charAt(0).toUpperCase()}
                    </div>
                  )
                ) : (
                  <Skeleton className="w-[20px] h-[20px] rounded-full" />
                )}
              </div>
              <div className="flex flex-row items-center gap-2">
                <div className="font-bold text-sm">
                  {row.original.quote.USD.price > 0 ? (
                    <span className={cn(
                      hasSelectedCoins ? "text-primary" : "text-zinc-950 dark:text-white",
                    )}>
                      {row.original.symbol.toUpperCase()}
                    </span>
                  ) : (
                    <Skeleton className="h-4 w-8 rounded" />
                  )}
                </div>
                <div className="">
                  {row.original.quote.USD.price > 0 ? (
                    <span className="text-muted-foreground font-diatype-mono text-xs">{row.original.name}</span>
                  ) : (
                    <Skeleton className="h-3 w-16 rounded" />
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'token-sort',
      accessorKey: 'name',
      header: () => (
        <div className="text-left flex items-center gap-1">
          Token
        </div>
      ),
      cell: () => null,
      enableSorting: true,
    },
    {
      id: 'price',
      accessorKey: 'quote.USD.price',
      header: () => (
        <div className="text-left flex items-center justify-end gap-1">
          Price
        </div>
      ),
      cell: ({ row }) => (
        <span className="font-diatype-mono text-xs">
          {row.original.quote.USD.price > 0 ? (
            `$${row.original.quote.USD.price.toLocaleString()}`
          ) : (
            <Skeleton className="h-4 w-16 rounded-full" />
          )}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'change24h',
      accessorKey: 'quote.USD.percent_change_24h',
      header: () => (
        <div className="text-left flex items-center justify-end gap-1">
          24h Change
        </div>
      ),
      cell: ({ row }) => (
        row.original.quote.USD.price > 0 ? (
          <span className={cn(
            "font-diatype-mono text-xs",
            row.original.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600'
          )}>
            {row.original.quote.USD.percent_change_24h.toFixed(2)}%
          </span>
        ) : (
          <Skeleton className="h-4 w-12 rounded-full" />
        )
      ),
      enableSorting: true,
    },
    {
      id: 'volume',
      accessorKey: 'quote.USD.volume_24h',
      header: () => (
        <div className="text-left flex items-center justify-end gap-1">
          Volume 24h
        </div>
      ),
      cell: ({ row }) => (
        <span className="font-diatype-mono text-xs">
          {row.original.quote.USD.price > 0 ? (
            `$${formatLargeNumber(row.original.quote.USD.volume_24h || 0)}`
          ) : (
            <Skeleton className="h-4 w-16 rounded-full" />
          )}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'chart',
      header: () => (
        <div className="text-center flex items-center justify-center gap-1">
          24h Chart
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          {row.original.quote.USD.price > 0 ? (
            <div 
              className="[mask-image:linear-gradient(to_right,transparent_0%,black_50%,black_100%)]"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 50%, black 100%)',
                maskImage: 'linear-gradient(to right, transparent 0%, black 50%, black 100%)'
              }}
            >
              <InlinePriceChart 
                coingeckoId={row.original.id}
                percentChange24h={row.original.quote.USD.percent_change_24h}
                symbol={row.original.symbol}
                initialData={row.original.quote.USD}
                onError={onInlineChartError}
              />
            </div>
          ) : (
            <Skeleton className="h-8 w-56 rounded-sm" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => (
        <div className="flex items-center justify-end gap-1">
          Action
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault(); // Prevent row link navigation
              e.stopPropagation();
              handleRemove(row.original.id);
            }}
            disabled={removingCoins.has(row.original.id.toString())}
            className="h-6 w-6 p-0 rounded-lg bg-transparent hover:bg-rose-500/10 transition-colors group"
            >
            {removingCoins.has(row.original.id.toString()) ? (
              <Spinner size={16} />
            ) : (
              <X className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
            )}
          </Button>
        </div>
      ),
    },
  ];
}
