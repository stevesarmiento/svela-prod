"use client";

import { useWatchlist } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { IconStar, IconStarFill, IconStarSlashFill } from "symbols-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";
import { Button } from "@v1/ui/button";
import { toast } from "@v1/ui/use-toast";
import { matchesShortcut, getShortcutsForComponent } from "@/lib/keyboard-shortcuts";

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
  // Keep coinId as string since Convex and context expect string IDs (CoinGecko format)
  const coinIdString = typeof coinId === 'number' ? coinId.toString() : coinId;
  const isInWatchlist = isInitialized && selectedGroupCoins.includes(coinIdString);
  const [showSlash, setShowSlash] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Get the watchlist shortcut from centralized config
  const watchlistShortcuts = getShortcutsForComponent('WatchlistButton');
  const toggleShortcut = watchlistShortcuts.find(s => s.handler === 'toggleWatchlist');

  useEffect(() => {
    if (!isInWatchlist && showSlash) {
      const timeout = setTimeout(() => setShowSlash(false), 900);
      return () => clearTimeout(timeout);
    }
  }, [isInWatchlist, showSlash]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleClick = async () => {
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
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Check if this matches our toggle watchlist shortcut
      if (toggleShortcut && matchesShortcut(event, toggleShortcut)) {
        event.preventDefault();
        handleClick();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleShortcut, isInWatchlist, isToggling, coinIdString, coinName, addToSelectedGroup, removeFromSelectedGroup, setShowSlash, selectedGroup]);

  const handleButtonClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
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
  };

  // Don't show button if no group is selected
  if (!selectedGroup) {
    return null;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          onClick={handleButtonClick}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!isInitialized || isToggling}
          className="z-10 rounded-xl w-8 h-8 bg-zinc-800/40 hover:bg-zinc-900/50 ring-1 ring-zinc-800/80"
        >
          <AnimatePresence mode="wait">
            {!isInitialized ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.8 }}
              >
                <IconStar className="h-4 w-4 fill-zinc-400" />
              </motion.div>
            ) : showSlash ? (
              <motion.div
                key="slash"
                initial={{ rotate: -20, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                exit={{
                  rotate: 0,
                  scale: 1.1,
                  opacity: 1,
                  transition: { duration: 0.1 },
                }}
                transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 18,
                    mass: 0.3,
                }}
              >
                <IconStarSlashFill className="h-4 w-4 fill-zinc-400" />
              </motion.div>
            ) : isInWatchlist ? (
              <motion.div
                key="filled"
                initial={{ scale: 1, rotate: 10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 1.1, rotate: -20 }}
              >
                <IconStarFill className="h-4 w-4 fill-yellow-500" />
              </motion.div>
            ) : (
              <motion.div
                key="star"
                initial={{ scale: 1, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 1.1, rotate: 20 }}
              >
                <IconStarFill className="h-4 w-4 fill-zinc-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10} className="bg-zinc-900 p-2 py-1 rounded-lg flex items-center gap-2 opacity-100">
        <p className="text-white text-xs">
          {isInWatchlist ? `Remove from ${selectedGroup.name}` : `Add to ${selectedGroup.name}`}
        </p>
        {toggleShortcut && (
          <>
          <kbd className="rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
            shift
          </kbd>
          <span className="text-zinc-400 text-xs">+</span>
          <kbd className="rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs font-mono text-zinc-300 uppercase">
            W
          </kbd>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
