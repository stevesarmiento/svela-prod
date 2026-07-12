import { withAlpha } from './oklch'

// Candle up/down pair shared by the chart controller and highlight overlay
// (dedupe: previously declared separately in both files).
export const CANDLE_UP_COLOR = 'oklch(0.7227 0.192 149.58)' // green-500
export const CANDLE_DOWN_COLOR = 'oklch(0.6368 0.2078 25.33)' // red-500

// Predefined pastel color palette (oklch — converted 1:1 from the original HSL pastels)
const PASTEL_COLORS = [
  'oklch(0.7945 0.046 249.44)', // Soft blue
  'oklch(0.8008 0.0617 357.54)', // Soft pink
  'oklch(0.8295 0.0677 171.92)', // Soft green
  'oklch(0.8778 0.0628 91.15)', // Soft yellow
  'oklch(0.7722 0.0802 314.32)', // Soft purple
  'oklch(0.8028 0.0572 40.48)', // Soft coral
  'oklch(0.8146 0.0578 211.58)', // Soft cyan
  'oklch(0.8144 0.0952 144.64)', // Soft lime
  'oklch(0.8111 0.0828 326.31)', // Soft magenta
  'oklch(0.8335 0.0553 75.1)', // Soft orange
  'oklch(0.8135 0.0436 229.59)', // Soft sky blue
  'oklch(0.8566 0.0719 126.06)', // Soft sage
]

export function generatePastelColors(count: number): string[] {
  if (count <= PASTEL_COLORS.length) {
    return PASTEL_COLORS.slice(0, count)
  }

  // If we need more colors than predefined, generate additional pastels.
  const colors = [...PASTEL_COLORS]
  const hueStep = 360 / count

  for (let i = PASTEL_COLORS.length; i < count; i++) {
    const hue = Math.round(((i * hueStep) % 360) * 100) / 100
    const chroma = 0.055 + (i % 3) * 0.008 // low chroma (pastel)
    const lightness = 0.8 + (i % 2) * 0.03 // high lightness
    colors.push(`oklch(${lightness} ${chroma} ${hue})`)
  }

  return colors
}

/**
 * Apply an opacity to an `oklch()` color string. Non-oklch inputs (e.g.
 * `var(--primary)` fallbacks) are returned unchanged.
 */
export function addOpacityToColor(color: string, opacity: number): string {
  return withAlpha(color, opacity)
}
