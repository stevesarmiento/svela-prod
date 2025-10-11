'use client'

import { formatLargeNumber } from "@v1/ui/format-numbers";
import { Button } from "@v1/ui/button"
import { X } from "lucide-react"
import Image from "next/image"
import { cn } from "@v1/ui/cn"
import { Skeleton } from "@v1/ui/skeleton"
import { Checkbox } from "@v1/ui/checkbox"
import { type ColumnDef } from '@tanstack/react-table'
import { motion, AnimatePresence } from "framer-motion"
import { Spinner } from "@v1/ui/spinner"
import type { CoinMarketData } from '@/types/coins'
import { InlinePriceChart } from "@/components/charts/inline-price-chart"

interface WatchlistColumnsProps {
  handleRemove: (coinId: number | string) => void;
  selectedCoins: Set<string>;
  onCoinSelect: (coinId: string, selected: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  totalCoins: number;
  removingCoins: Set<string>;
  hoveredRowId: string | null;
  hasSelectedCoins: boolean;
}

export function createWatchlistColumns({
  handleRemove,
  selectedCoins,
  onCoinSelect,
  onSelectAll,
  totalCoins,
  removingCoins,
  hoveredRowId,
  hasSelectedCoins
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
        const isHovered = hoveredRowId === row.id;
        
        return (
          <div className="relative w-full h-full flex items-center justify-start overflow-hidden ">
            {/* Checkbox - animate only when no selections exist */}
            {hasSelectedCoins ? (
              // Static checkbox when selections exist
              <div className="absolute left-0 z-10 px-1">
                <Checkbox
                  checked={selectedCoins.has(row.original.id.toString())}
                  onCheckedChange={(value) => onCoinSelect(row.original.id.toString(), !!value)}
                  aria-label="Select row"
                  className="mt-[6px] data-[state=checked]:mt-[2px]"
                />
              </div>
            ) : (
              // Animated checkbox when no selections exist - restructured to allow exit animations
              <AnimatePresence mode="wait">
                <motion.div
                  key={isHovered ? 'hovered' : 'normal'}
                  className="absolute left-0 z-10 px-1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ 
                    opacity: isHovered ? 1 : 0, 
                    x: isHovered ? 0 : -20 
                  }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    mass: 0.5,
                    duration: 0.2,
                  }}
                  style={{ 
                    pointerEvents: isHovered ? 'auto' : 'none'
                  }}
                >
                  {isHovered && (
                    <Checkbox
                      checked={selectedCoins.has(row.original.id.toString())}
                      onCheckedChange={(value) => onCoinSelect(row.original.id.toString(), !!value)}
                      aria-label="Select row"
                      className="mt-[6px] data-[state=checked]:mt-[2px]"
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
            
            {/* Token content - no link here, entire row will be linked */}
            {hasSelectedCoins ? (
              // Static position when selections exist
              <div className="translate-x-10 opacity-90 flex items-center gap-2">
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
                <div className="font-bold text-sm">
                  {row.original.quote.USD.price > 0 ? (
                    <span className="text-primary">{row.original.symbol.toUpperCase()}</span>
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
            ) : (
              // Animated content when no selections exist
              <motion.div
                className="flex items-center gap-2"
                animate={{ 
                  x: isHovered ? 40 : 0,
                  opacity: isHovered ? 0.9 : 1 
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                  mass: 0.5,
                  duration: 0.2,
                }}
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
                      <span className="text-zinc-950 dark:text-white">{row.original.symbol.toUpperCase()}</span>
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
            )}
          </div>
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
