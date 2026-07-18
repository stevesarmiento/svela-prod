import { cn } from "@v1/ui/cn";

/**
 * Segmented tick meter for sidebar stat rows: a strip of thin vertical ticks
 * where the bright segment shows the value's magnitude/direction against its
 * domain. Two layers of the same repeating-gradient tick pattern — a dim base
 * and a bright overlay clipped to the filled range — so any width stays crisp
 * with two DOM nodes.
 *
 * Color comes from `currentColor`: set a text color class on the parent (or
 * via `className`) to make the ticks green/red/zinc.
 *
 * The meter is decorative reinforcement — always render the numeric value as
 * text beside it (this component is aria-hidden).
 */

const TICK_PATTERN =
  "repeating-linear-gradient(to right, currentColor 0 1.5px, transparent 1.5px 4px)";

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function TickMeter({
  value,
  min,
  max,
  origin = "min",
  className,
}: {
  value: number;
  min: number;
  max: number;
  /**
   * Domain value the filled segment grows from: `'min'` for bounded fills
   * (e.g. RSI 0-100), or a number for centered/diverging fills (0 for signed
   * deltas, 50 for a buy ratio).
   */
  origin?: number | "min";
  className?: string;
}) {
  if (!Number.isFinite(value) || !(max > min)) return null;

  const pct = (v: number) => clampPct(((v - min) / (max - min)) * 100);
  const originPct = origin === "min" ? 0 : pct(origin);
  const valuePct = pct(value);
  const left = Math.min(originPct, valuePct);
  const right = 100 - Math.max(originPct, valuePct);

  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block h-2.5 w-16 shrink-0", className)}
    >
      <span
        className="absolute inset-0 opacity-25"
        style={{ backgroundImage: TICK_PATTERN }}
      />
      <span
        className="absolute inset-0"
        style={{
          backgroundImage: TICK_PATTERN,
          clipPath: `inset(0 ${right}% 0 ${left}%)`,
        }}
      />
    </span>
  );
}
