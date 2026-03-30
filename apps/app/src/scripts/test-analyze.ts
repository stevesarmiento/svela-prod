/* eslint-disable no-console */

interface PostResult {
  label: string
  status: number
  statusText: string
  contentType: string | null
  bodyText: string
}

function makeSentinelPayload() {
  const priceHistory: Array<number> = Array.from({ length: 30 }, (_, i) => 10000 + i * 37.5)
  const volumeHistory: Array<number> = Array.from({ length: 30 }, (_, i) => 500_000_000 + i * 12_345_678)
  const rsiHistory: Array<number> = Array.from({ length: 30 }, (_, i) => 35 + (i % 10) * 1.7)

  return {
    name: "Sentinel Token",
    symbol: "SENT",
    quote: {
      USD: {
        price: 12345.67,
        percent_change_24h: 4.56,
        market_cap: 9876543210,
        volume_24h: 123456789,
        volume_change_24h: 12.34,
        market_cap_dominance: 0.42,
      },
    },
    timeframe: "30d",

    priceContext: {
      currentPrice: 12345.67,
      priceHistory,
      momentum: "bullish" as const,
      volatility: "moderate" as const,
      support: 11111.11,
      resistance: 22222.22,
    },

    volumeAnalysis: {
      currentVolume: 123456789,
      volumeHistory,
      volumeTrend: "increasing" as const,
      averageVolume: volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length,
      volumeSpike: true,
    },

    hullSuite: {
      trendDirection: "bullish" as const,
      mhull: 12001.01,
      shull: 11999.99,
      crossoverSignal: "trending_up" as const,
      strength: "strong" as const,
    },

    bollingerBands: {
      indicator: "RSI" as const,
      currentValue: 42.42,
      upperBand: 70.7,
      lowerBand: 30.3,
      basis: 50.5,
      position: "normal" as const,
      breachType: "none" as const,
      divergence: "bullish" as const,
      trend: "improving",
      history: rsiHistory,
    },

    marketVision: {
      rsi: {
        value: 42.42,
        signal: "neutral" as const,
        trend: "improving",
        history: rsiHistory,
        divergence: "bullish" as const,
      },
      mfi: {
        value: 55.55,
        signal: "neutral" as const,
      },
      waveTrend: {
        wt1: 11.11,
        wt2: 22.22,
        signal: "bullish_cross" as const,
        momentum: "moderate" as const,
      },
      moneyFlow: {
        direction: "inflow" as const,
        strength: "strong" as const,
        value: 33.33,
      },
      stochastic: {
        k: 77.7,
        d: 66.6,
        signal: "bullish_cross" as const,
      },
    },

    liquidationData: {
      totalLiquidations24h: 88888,
      longLiquidations: 55555,
      shortLiquidations: 33333,
      liquidationRatio: 1.6667,
      openInterest: 999999,
      openInterestChange: 7.89,
    },

    orderFlow: {
      takerBuyRatio: 0.654321,
      buyVolumeUsd: 111111,
      sellVolumeUsd: 222222,
      buyPressure: "high" as const,
      sellPressure: "low" as const,
      netFlow: "bullish" as const,
    },

    priceAction: {
      trend: "uptrend" as const,
      volatility: "moderate" as const,
      volume_profile: "increasing" as const,
      priceLevel: "breakout" as const,
      momentum: "bullish" as const,
      divergenceSignal: true,
    },
  }
}

async function postJson(label: string, url: string, body: unknown): Promise<PostResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const contentType = response.headers.get("content-type")
  const bodyText = await response.text()

  return {
    label,
    status: response.status,
    statusText: response.statusText,
    contentType,
    bodyText,
  }
}

function printResult(result: PostResult) {
  const preview = result.bodyText.slice(0, 500)
  console.log("")
  console.log("===", result.label, "===")
  console.log("status:", result.status, result.statusText)
  console.log("content-type:", result.contentType)
  console.log("body.length:", result.bodyText.length)
  console.log("body.preview:", JSON.stringify(preview))
}

async function main() {
  const url = process.env.ANALYZE_URL ?? "http://localhost:3000/api/analyze"
  const payload = makeSentinelPayload()

  console.log("Target:", url)
  console.log("Sending sentinel payload for:", payload.name, payload.symbol)

  const direct = await postJson("direct-json", url, payload)
  printResult(direct)

  const nested = await postJson("nested-prompt-json", url, { prompt: JSON.stringify(payload) })
  printResult(nested)

  if (direct.status !== 200 || nested.status !== 200) {
    process.exitCode = 1
  }
}

await main()
