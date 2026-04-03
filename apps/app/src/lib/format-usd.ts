import type { Format } from "@/lib/number-flow/lite"

export function getUsdPriceFormatOptions(value: number): Format {
  const abs = Math.abs(value)

  // If the whole-dollar side gets long (e.g. $12,345), keep it readable.
  // Otherwise, show a bit more movement for typical prices (e.g. $96.123).
  let maximumFractionDigits = 3
  if (abs >= 1_000) {
    maximumFractionDigits = 2
  } else if (abs > 0 && abs < 1) {
    if (abs >= 0.1) maximumFractionDigits = 4
    else if (abs >= 0.01) maximumFractionDigits = 5
    else if (abs >= 0.001) maximumFractionDigits = 6
    else maximumFractionDigits = 7
  }

  return {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }
}

export function formatUsdPrice(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue.toLocaleString(undefined, getUsdPriceFormatOptions(safeValue))
}

