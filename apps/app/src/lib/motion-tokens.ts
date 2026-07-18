// Shared Motion tokens to keep UI animations consistent.
// Numeric durations mirror `packages/ui/src/globals.css` (--duration-* in ms).
// Inject `bottomNavChromeMotionStyle()` on the bottom-nav shell so CSS/Tailwind can read `var(--motion-nav-*)`.

import type { CSSProperties } from "react";

export const DURATION_MICRO_S = 0.12 as const;
export const DURATION_UI_S = 0.2 as const;
export const DURATION_MODAL_S = 0.26 as const;

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

/** Set on the bottom-nav interactive row; descendants use Tailwind `duration-[var(--motion-nav-duration)]` etc. */
export function bottomNavChromeMotionStyle(): CSSProperties {
  return {
    [NAV_CHROME_CSS.duration]: `${DURATION_UI_S * 1000}ms`,
    [NAV_CHROME_CSS.easeOut]: EASE_OUT_CUBIC_CSS,
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
