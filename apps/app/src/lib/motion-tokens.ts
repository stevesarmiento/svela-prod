// Shared Motion tokens to keep UI animations consistent.
// Mirrors `packages/ui/src/globals.css` motion variables.

export const DURATION_MICRO_S = 0.12 as const
export const DURATION_UI_S = 0.2 as const
// export const DURATION_UI_S = 5 as const
export const DURATION_MODAL_S = 0.26 as const

// Enter/exit (ease-out)
export const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const

// On-screen movement (ease-in-out)
export const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const

export function motionDuration(
  shouldReduceMotion: boolean | null | undefined,
  durationSeconds: number,
): number {
  return shouldReduceMotion ? 0 : durationSeconds
}

/** Opacity / scale enter–exit (e.g. palette, mode chip). */
export function uiEnterExitTransition(shouldReduceMotion: boolean | null | undefined) {
  return {
    type: "tween" as const,
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_OUT_CUBIC,
  }
}

/** Layout / size on screen (dock shell, shared layoutId). */
export function uiLayoutTransition(shouldReduceMotion: boolean | null | undefined) {
  return {
    type: "tween" as const,
    duration: motionDuration(shouldReduceMotion, DURATION_UI_S),
    ease: EASE_IN_OUT_CUBIC,
  }
}

