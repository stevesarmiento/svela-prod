import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@v1/ui/tooltip";

interface NavigationItemButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  /** Accessible name. */
  label: string;
  tooltipLabel: string;
  shortcut?: string;
  isActive: boolean;
  /** Sets `aria-current="page"`; falls back to `"true"` when only `isActive`. */
  isExactActive?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  /** Overlay rendered top-right of the icon (e.g. the token logo badge). */
  badge?: React.ReactNode;
}

/**
 * One dock tab: icon button + tooltip. Presentational — `NavigationItems`
 * wires routing/prefetch; static consumers (login preview) pass plain
 * handlers.
 */
export function NavigationItemButton({
  icon: Icon,
  label,
  tooltipLabel,
  shortcut,
  isActive,
  isExactActive = false,
  onClick,
  onMouseEnter,
  onFocus,
  badge,
}: NavigationItemButtonProps) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onFocus={onFocus}
          aria-label={label}
          aria-current={isExactActive ? "page" : isActive ? "true" : undefined}
          className={`group relative p-2 rounded-[13px] transition-colors duration-100 cursor-pointer active:scale-[0.98] hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus:[&_svg]:!text-white focus-visible:[&_svg]:!text-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-800 after:absolute after:-inset-1 after:content-[''] ${
            isActive
              ? "bg-black/10 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15"
              : ""
          }`}
        >
          <Icon
            className={`size-5 ${
              isActive
                ? "text-white"
                : "text-gray-500 group-hover:text-gray-700 dark:text-white/50 dark:group-hover:text-white/50"
            }`}
          />
          {badge ? (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 z-10">
              {badge}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={15}
        className="dark flex items-center gap-2 text-xs p-1 pl-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-sm"
      >
        <span className="text-xs text-gray-600 dark:text-zinc-400">
          {tooltipLabel}
        </span>
        {shortcut && (
          <kbd className="rounded-md bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-berkeley-mono text-gray-700 dark:text-zinc-300 uppercase">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
