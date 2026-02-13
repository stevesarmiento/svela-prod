import type { Format } from "@/lib/number-flow/lite"

export function getUsdPriceFormatOptions(value: number): Format {
  const abs = Math.abs(value)

  let maximumFractionDigits = 2
  if (abs > 0 && abs < 1) {
    if (abs >= 0.1) maximumFractionDigits = 3
    else if (abs >= 0.01) maximumFractionDigits = 4
    else if (abs >= 0.001) maximumFractionDigits = 5
    else if (abs >= 0.0001) maximumFractionDigits = 6
    else if (abs >= 0.00001) maximumFractionDigits = 7
    else maximumFractionDigits = 8
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

