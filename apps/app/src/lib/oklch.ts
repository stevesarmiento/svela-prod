/**
 * apps/app oklch entry point.
 *
 * Re-exports the shared color math from @v1/ui and adds the
 * lightweight-charts custom color parser (canvas — its built-in parser does
 * not understand `oklch()`).
 */
import type { CustomColorParser, Rgba } from "lightweight-charts";
import { oklchToRgb, parseOklch } from "@v1/ui/oklch";

export {
  adjustOklch,
  formatOklch,
  mixOklch,
  multiplyAlpha,
  oklchToRgb,
  oklchToRgbString,
  parseOklch,
  srgbToOklch,
  srgbToOklchString,
  withAlpha,
  type Oklch,
} from "@v1/ui/oklch";

/**
 * lightweight-charts custom parser. Returns null for non-oklch strings so the
 * built-in parser (hex/rgb/hsl/named) chains.
 *
 * NOTE: must be registered via `layout.colorParsers` at createChart() time —
 * never through applyOptions.
 */
export const parseOklchForCharts: CustomColorParser = (color) => {
  const o = parseOklch(color);
  if (!o) return null;
  const [r, g, b] = oklchToRgb(o);
  return [r, g, b, o.alpha] as unknown as Rgba;
};

export const CHART_COLOR_PARSERS: CustomColorParser[] = [parseOklchForCharts];
