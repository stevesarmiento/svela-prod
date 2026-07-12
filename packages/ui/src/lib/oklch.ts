/**
 * OKLCH color utilities — single source of truth for color math in this repo.
 *
 * All source colors are authored as `oklch(L C H)` / `oklch(L C H / A)` strings.
 * Canvas libraries that cannot parse oklch (lightweight-charts, liveline) are
 * bridged via {@link oklchToRgb} / {@link oklchToRgbString}.
 *
 * Math per Björn Ottosson's OKLab reference implementation.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** Matches `oklch(L C H)` / `oklch(L C H / A)`. L/A may be percentages. */
const OKLCH_RE =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i;

/** Parse an `oklch()` string. Returns null for any other format. */
export function parseOklch(color: string): Oklch | null {
  const m = OKLCH_RE.exec(color.trim());
  if (!m) return null;
  const num = (s: string, pctScale: number) =>
    s.endsWith("%")
      ? (Number.parseFloat(s) / 100) * pctScale
      : Number.parseFloat(s);
  return {
    l: num(m[1] as string, 1),
    // Percentage chroma is relative to 0.4 per the CSS spec.
    c: num(m[2] as string, 0.4),
    h: Number.parseFloat(m[3] as string),
    alpha: m[4] != null ? num(m[4], 1) : 1,
  };
}

/** OKLCH -> sRGB (0-255 per channel), gamut-clamped. */
export function oklchToRgb(o: Oklch): [number, number, number] {
  const hr = (o.h * Math.PI) / 180;
  const a = o.c * Math.cos(hr);
  const b = o.c * Math.sin(hr);

  // OKLab -> non-linear LMS
  const l_ = o.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = o.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = o.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  // LMS -> linear sRGB
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (c: number) => {
    const x = Math.min(1, Math.max(0, c)); // gamut clip
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [
    Math.round(gamma(lr) * 255),
    Math.round(gamma(lg) * 255),
    Math.round(gamma(lb) * 255),
  ];
}

/** sRGB (0-255, fractional ok) -> OKLCH. Achromatic colors get H pinned to 0. */
export function srgbToOklch(
  r8: number,
  g8: number,
  b8: number,
): { l: number; c: number; h: number } {
  const lin = (c8: number) => {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  if (C < 1e-4) H = 0;
  return { l: L, c: C, h: H };
}

const trim = (n: number, dp: number) => Number.parseFloat(n.toFixed(dp));

/**
 * Format an OKLCH value as a CSS string. Rounds to L 4dp / C 4dp / H 2dp by
 * default; pass higher `precision` to bump L/C decimals when a round-trip
 * would otherwise be lossy.
 */
export function formatOklch(
  l: number,
  c: number,
  h: number,
  alpha = 1,
  precision = 4,
): string {
  const body = `${trim(l, precision)} ${trim(c, precision)} ${trim(h, Math.max(2, precision - 2))}`;
  return alpha >= 1 ? `oklch(${body})` : `oklch(${body} / ${trim(alpha, 4)})`;
}

/**
 * Convert sRGB to an `oklch()` string that round-trips exactly back to the
 * same 8-bit triplet (bumps precision until it does).
 */
export function srgbToOklchString(
  r: number,
  g: number,
  b: number,
  alpha = 1,
): string {
  const { l, c, h } = srgbToOklch(r, g, b);
  const target: [number, number, number] = [
    Math.round(r),
    Math.round(g),
    Math.round(b),
  ];
  for (let precision = 4; precision <= 7; precision++) {
    const out = formatOklch(l, c, h, alpha, precision);
    const parsed = parseOklch(out);
    if (!parsed) break;
    const [rr, gg, bb] = oklchToRgb(parsed);
    if (rr === target[0] && gg === target[1] && bb === target[2]) return out;
  }
  // Full precision fallback (never expected in practice).
  return alpha >= 1
    ? `oklch(${l} ${c} ${h})`
    : `oklch(${l} ${c} ${h} / ${alpha})`;
}

/** Bridge for canvas libs that only parse hex/rgb (e.g. liveline). */
export function oklchToRgbString(color: string): string {
  const o = parseOklch(color);
  if (!o) return color;
  const [r, g, b] = oklchToRgb(o);
  return o.alpha < 1
    ? `rgba(${r}, ${g}, ${b}, ${o.alpha})`
    : `rgb(${r}, ${g}, ${b})`;
}

/** Set/replace the alpha of an `oklch()` string — pure string surgery. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^oklch\(\s*([^/)]+?)\s*(?:\/\s*[\d.]+%?)?\s*\)$/i.exec(
    color.trim(),
  );
  if (!m) return color;
  return `oklch(${m[1]} / ${alpha})`;
}

/** Multiply the existing alpha of an `oklch()` string by `factor`. */
export function multiplyAlpha(color: string, factor: number): string {
  const o = parseOklch(color);
  if (!o) return color;
  const a = Math.max(0, Math.min(1, o.alpha * factor));
  return `oklch(${o.l} ${o.c} ${o.h} / ${a})`;
}

/**
 * Interpolate between two `oklch()` strings (shorter hue arc). Returns `a`
 * unchanged when either input is not oklch.
 */
export function mixOklch(a: string, b: string, t: number): string {
  const ca = parseOklch(a);
  const cb = parseOklch(b);
  if (!ca || !cb) return a;
  let dh = cb.h - ca.h;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const h = (ca.h + dh * t + 360) % 360;
  const l = ca.l + (cb.l - ca.l) * t;
  const c = ca.c + (cb.c - ca.c) * t;
  const alpha = ca.alpha + (cb.alpha - ca.alpha) * t;
  return formatOklch(l, c, h, alpha);
}

/**
 * Adjust lightness/chroma of an `oklch()` string (replaces the old
 * `hsl().replace` light-mode adjusters). Deltas are absolute, clamped.
 */
export function adjustOklch(
  color: string,
  { dl = 0, dc = 0, alpha }: { dl?: number; dc?: number; alpha?: number },
): string {
  const o = parseOklch(color);
  if (!o) return color;
  const l = Math.max(0, Math.min(1, o.l + dl));
  const c = Math.max(0, o.c + dc);
  const a = alpha ?? o.alpha;
  return a >= 1
    ? `oklch(${trim(l, 4)} ${trim(c, 4)} ${o.h})`
    : `oklch(${trim(l, 4)} ${trim(c, 4)} ${o.h} / ${a})`;
}
