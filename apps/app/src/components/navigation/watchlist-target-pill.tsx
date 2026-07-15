"use client";

import type { WatchlistGroup } from "@/app/[locale]/(dashboard)/watchlist/_components/watchlist-context";
import { WatchlistGroupIcon } from "@/components/watchlist-group-icon";
import { cn } from "@v1/ui/cn";

interface WatchlistTargetPillProps {
  selectedGroup: WatchlistGroup | null;
  /** True while the palette list is showing the watchlist picker. */
  active: boolean;
  /** Whether toggling the picker is available (watchlist-add mode + groups exist). */
  interactive: boolean;
  onToggle: () => void;
}

/**
 * Pill in the command-palette group heading showing which watchlist tokens
 * will be added to. Clicking it (or pressing Tab in the input) flips the
 * palette list between token results and the watchlist picker.
 */
export function WatchlistTargetPill({
  selectedGroup,
  active,
  interactive,
  onToggle,
}: WatchlistTargetPillProps) {
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onToggle}
      // Keep focus in the cmdk input so typing/arrows keep working after a click.
      onMouseDown={(event) => event.preventDefault()}
      aria-label="Switch watchlist to add tokens to"
      aria-pressed={active}
      className={cn(
        "inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white transition-colors",
        interactive && "cursor-pointer hover:bg-white/20",
        active && "bg-white/20",
      )}
    >
      {selectedGroup ? (
        <>
          <WatchlistGroupIcon
            icon={selectedGroup.icon}
            size={12}
            className="text-white/80"
          />
          <span className="truncate">{selectedGroup.name}</span>
        </>
      ) : (
        <span>Watchlist</span>
      )}
      {interactive && (
        <span className="ml-0.5 font-berkeley-mono text-[10px] leading-4 text-white/50">
          TAB
        </span>
      )}
    </button>
  );
}
