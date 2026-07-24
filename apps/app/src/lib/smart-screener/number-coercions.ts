import { z } from "zod";

function parseCompactUsdAmount(raw: string): number | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/_/g, "");

  if (!cleaned) return null;

  const match = cleaned.match(/^([0-9]*\.?[0-9]+)\s*(k|m|b|t|bn)?$/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  const suffix = match[2] ?? "";
  const mult =
    suffix === "k"
      ? 1e3
      : suffix === "m"
        ? 1e6
        : suffix === "b" || suffix === "bn"
          ? 1e9
          : suffix === "t"
            ? 1e12
            : 1;

  const value = n * mult;
  return Number.isFinite(value) ? value : null;
}

export const UsdAmountSchema = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseCompactUsdAmount(value) ?? value;
  return value;
}, z.number().min(0));

/**
 * Percent inputs like \"55%\" or \"55\" are normalized to percent points (55).
 * If the input is already small (<= 1), we keep it as-is to allow decimals
 * for ratio-style metrics (caller should use RatioSchema for those).
 */
export const PercentPointsSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/%$/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return value;
    return parsed;
  }
  return value;
}, z.number());

export const IntegerSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int());
