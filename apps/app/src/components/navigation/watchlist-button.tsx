"use client";

import { useWatchlist } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { IconShiftFill, IconStar, IconStarFill, IconStarSlashFill } from "symbols-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { Button } from "@v1/ui/button";
import { toast } from "@v1/ui/use-toast";
import { matchesShortcut, getShortcutsForComponent } from "@/lib/keyboard-shortcuts";
import { useLatest } from "@/hooks/use-latest";
import { Effect } from "effect";
import { useEffectScoped } from "@/lib/effect/react";

interface WatchlistButtonProps {
  coinId: string | number;
  coinName?: string;
}

export function WatchlistButton({ coinId, coinName }: WatchlistButtonProps) {
  const { 
    selectedGroupCoins, 
    addToSelectedGroup, 
    removeFromSelectedGroup, 
    isInitialized,
    selectedGroup 
  } = useWatchlist();
  const shouldReduceMotion = useReducedMotion();

  // Keep coinId as string since Convex and context expect string IDs (CoinGecko format)
  const coinIdString = typeof coinId === 'number' ? coinId.toString() : coinId;
  const isInWatchlist = isInitialized && selectedGroupCoins.includes(coinIdString);
  const [showSlash, setShowSlash] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Get the watchlist shortcut from centralized config
  const watchlistShortcuts = getShortcutsForComponent('WatchlistButton');
  const toggleShortcut = watchlistShortcuts.find(s => s.handler === 'toggleWatchlist');

  useEffectScoped(
    () =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => Effect.void)

        if (isInWatchlist || !showSlash) return

        yield* Effect.sleep("900 millis")
        yield* Effect.sync(() => setShowSlash(false))
      }),
    [isInWatchlist, showSlash],
  )

  const toggleWatchlist = useCallback(async () => {
    if (isToggling || !selectedGroup) return;
    
    setIsToggling(true);
    
    try {
      if (isInWatchlist) {
        setShowSlash(true);
        await removeFromSelectedGroup(coinIdString);
        toast({
          title: "Removed",
          description: `${coinName || 'Coin'} removed from ${selectedGroup.name}`,
        });
      } else {
        await addToSelectedGroup(coinIdString);
        toast({
          title: "Added",
          description: `${coinName || 'Coin'} added to ${selectedGroup.name}`,
        });
      }
    } catch (error) {
      console.error('Watchlist toggle error:', error);
      toast({
        title: "Error",
        description: isInWatchlist ? "Failed to remove from watchlist" : "Failed to add to watchlist",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  }, [
    isToggling,
    selectedGroup,
    isInWatchlist,
    coinIdString,
    coinName,
    addToSelectedGroup,
    removeFromSelectedGroup,
  ]);

  const toggleWatchlistRef = useLatest(toggleWatchlist);
  const toggleShortcutRef = useLatest(toggleShortcut);

  // Keyboard shortcut handler (stable subscription, latest handler via refs)
  useEffectScoped(
    () =>
      Effect.gen(function* () {
        const handleKeyDown = (event: KeyboardEvent) => {
          // Ignore if typing in an input
          if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return
          }

          const shortcut = toggleShortcutRef.current
          if (shortcut && matchesShortcut(event, shortcut)) {
            event.preventDefault()
            void toggleWatchlistRef.current()
          }
        }

        document.addEventListener('keydown', handleKeyDown)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            document.removeEventListener('keydown', handleKeyDown)
          }),
        )

        yield* Effect.never
      }),
    [],
  )

  const handleButtonClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await toggleWatchlist();
  };

  // Don't show button if no group is selected
  if (!selectedGroup) {
    return null;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleButtonClick}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!isInitialized || isToggling}
          className="z-10 rounded-lg p-1 size-7"
        >
          <AnimatePresence mode="wait">
            {!isInitialized ? (
              <m.div
                key="loading"
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0.8 }}
                transition={shouldReduceMotion ? { duration: 0 } : undefined}
              >
                <IconStar className="h-4 w-4 fill-gray-500 dark:fill-zinc-400" />
              </m.div>
            ) : showSlash ? (
              <m.div
                key="slash"
                initial={shouldReduceMotion ? false : { rotate: -20, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                exit={shouldReduceMotion ? undefined : {
                  rotate: 0,
                  scale: 1.1,
                  opacity: 1,
                  transition: { duration: 0.1 },
                }}
                transition={shouldReduceMotion ? { duration: 0 } : {
                    type: "spring",
                    stiffness: 280,
                    damping: 18,
                    mass: 0.3,
                }}
              >
                <IconStarSlashFill className="h-4 w-4 fill-gray-500 dark:fill-zinc-400" />
              </m.div>
            ) : isInWatchlist ? (
              <m.div
                key="filled"
                initial={shouldReduceMotion ? false : { scale: 1, rotate: 10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={shouldReduceMotion ? undefined : { scale: 1.1, rotate: -20 }}
                transition={shouldReduceMotion ? { duration: 0 } : undefined}
              >
                <IconStarFill className="h-4 w-4 fill-yellow-500" />
              </m.div>
            ) : (
              <m.div
                key="star"
                initial={shouldReduceMotion ? false : { scale: 1, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={shouldReduceMotion ? undefined : { scale: 1.1, rotate: 20 }}
                transition={shouldReduceMotion ? { duration: 0 } : undefined}
              >
                <IconStarFill className="h-4 w-4 fill-gray-500 dark:fill-zinc-400" />
              </m.div>
            )}
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10} className="bg-white/95 dark:bg-zinc-900 p-2 py-1 rounded-lg flex items-center gap-2 opacity-100 border border-gray-200 dark:border-zinc-800">
        <p className="text-gray-900 dark:text-white text-xs">
          {isInWatchlist ? `Remove from ${selectedGroup.name}` : `Add to ${selectedGroup.name}`}
        </p>
        {toggleShortcut && (
          <>
          <kbd
            className="flex items-center justify-center rounded-sm bg-gray-100 dark:bg-zinc-700 size-5 text-xs font-berkeley-mono text-gray-700 dark:text-zinc-300 uppercase"
            aria-label="Shift"
          >
            <IconShiftFill className="size-3 fill-current" aria-hidden="true" />
            <span className="sr-only">Shift</span>
          </kbd>
          <span className="text-gray-500 dark:text-zinc-400 text-xs">+</span>
          <kbd className="flex items-center justify-center rounded-sm bg-gray-100 dark:bg-zinc-700 size-5 text-xs font-berkeley-mono text-gray-700 dark:text-zinc-300 uppercase">
            W
          </kbd>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
