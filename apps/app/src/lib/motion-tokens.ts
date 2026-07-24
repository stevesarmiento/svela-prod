// Shared Motion tokens to keep UI animations consistent.
// Numeric durations mirror `packages/ui/src/globals.css` (--duration-* in ms).
// Inject `bottomNavChromeMotionStyle()` on the bottom-nav shell so CSS/Tailwind can read `var(--motion-nav-*)`.

import type { CSSProperties } from "react";

export const DURATION_UI_S = 0.2 as const;

// Enter/exit (ease-out)
export const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;

/** For CSS `transition-timing-function` / `ease`. */
export const EASE_OUT_CUBIC_CSS = `cubic-bezier(${EASE_OUT_CUBIC.join(", ")})` as const;

// On-screen movement (ease-in-out)
export const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;

export const NAV_CHROME_CSS = {
  duration: "--motion-nav-duration",
  easeOut: "--motion-nav-ease-out",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Bottom-nav command-search choreography (all values in ms).
//
// Open:  dock fades/scales out → dock width collapses ∥ search pill expands
//        into the freed space → popover rises in as the expand lands.
// Close: popover drops out → search collapses ∥ dock width returns → dock
//        fades back in. Close is intentionally snappier than open.
//
// Tweak freely — these are the only source of truth; they're injected as CSS
// vars on the nav row (`bottomNavChromeMotionStyle`) and consumed by
// bottom-nav.tsx, command-search-popover-content.tsx, and the
// `.nav-command-popover` rules in packages/ui/src/globals.shared.css.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Debug knob: multiplies every choreography duration/delay. Set to e.g. 10 to
 * watch the whole sequence in slow motion (instead of hand-editing one
 * duration to 5000ms). Keep at 1 for production.
 */
export const NAV_MOTION_SLOWDOWN = 1;

// Whole open sequence lands at ≤200ms (close at ~140ms).
export const NAV_SEARCH_MOTION_MS = {
  open: {
    /** Dock fades + scales out first. */
    dockFade: 60,
    /** Dock width collapses (starts while the fade finishes). */
    dockCollapse: 110,
    dockCollapseDelay: 30,
    /** Search pill expands in step with the dock collapse (ends at ~150). */
    searchExpand: 120,
    searchExpandDelay: 30,
    /** Popover rises in just as the search expand lands (ends at 200). */
    popoverEnter: 90,
    popoverEnterDelay: 110,
  },
  close: {
    /** Popover drops out immediately. */
    popoverExit: 60,
    /** Search collapses while the dock width returns. */
    searchCollapse: 100,
    searchCollapseDelay: 20,
    dockExpand: 100,
    dockExpandDelay: 20,
    /** Dock fades back in once its slot is mostly restored. */
    dockFade: 80,
    dockFadeDelay: 60,
  },
} as const;

/** Set on the bottom-nav interactive row; descendants use Tailwind `duration-[var(--motion-nav-duration)]` etc. */
export function bottomNavChromeMotionStyle(): CSSProperties {
  const ms = (value: number) => `${value * NAV_MOTION_SLOWDOWN}ms`;
  const { open, close } = NAV_SEARCH_MOTION_MS;
  return {
    [NAV_CHROME_CSS.duration]: ms(DURATION_UI_S * 1000),
    [NAV_CHROME_CSS.easeOut]: EASE_OUT_CUBIC_CSS,
    // Open choreography
    "--nav-open-dock-fade": ms(open.dockFade),
    "--nav-open-dock-collapse": ms(open.dockCollapse),
    "--nav-open-dock-collapse-delay": ms(open.dockCollapseDelay),
    "--nav-open-search": ms(open.searchExpand),
    "--nav-open-search-delay": ms(open.searchExpandDelay),
    "--nav-open-popover": ms(open.popoverEnter),
    "--nav-open-popover-delay": ms(open.popoverEnterDelay),
    // Close choreography
    "--nav-close-popover": ms(close.popoverExit),
    "--nav-close-search": ms(close.searchCollapse),
    "--nav-close-search-delay": ms(close.searchCollapseDelay),
    "--nav-close-dock-expand": ms(close.dockExpand),
    "--nav-close-dock-expand-delay": ms(close.dockExpandDelay),
    "--nav-close-dock-fade": ms(close.dockFade),
    "--nav-close-dock-fade-delay": ms(close.dockFadeDelay),
  } as CSSProperties;
}

export function motionDuration(
  shouldReduceMotion: boolean | null | undefined,
  durationSeconds: number,
): number {
  return shouldReduceMotion ? 0 : durationSeconds;
}

/** Opacity / scale enter–exit (e.g. palette, mode chip). */
export function uiEnterExitTransition(
  shouldReduceMotion: boolean | null | undefined,
) {
  return {
    type: "tween" as const,
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_OUT_CUBIC,
  };
}

/** Layout / size on screen (dock shell, shared layoutId). */
export function uiLayoutTransition(
  shouldReduceMotion: boolean | null | undefined,
) {
  return {
    type: "tween" as const,
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_IN_OUT_CUBIC,
  };
}
