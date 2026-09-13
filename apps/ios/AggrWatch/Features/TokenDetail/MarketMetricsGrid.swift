import AggrAPI
import AggrCore
import SwiftUI

/// Port of `market-metrics.tsx`: 8 tiles, each with an info popover.
struct MarketMetricsGrid: View {
  let quote: CoinQuote?
  let alignedPrice: Double?
  let dailyOhlcv: [OHLCVBar]
  var isPending = false

  private struct Metric: Identifiable { let id: String; let label: String; let help: String; let value: MetricValue }
  private enum MetricValue { case text(String), dash, infinity, performance(usdMove: Double?, pct: Double) }

  private var metrics: [Metric] {
    let price = alignedPrice ?? quote?.currentPrice
    let mcap = quote?.marketCap
    let vol = quote?.totalVolume
    let fdv = MarketMetrics.fdvUsd(priceUsd: price, maxSupply: quote?.maxSupply)
    let floatPct = MarketMetrics.floatPct(circulatingSupply: quote?.circulatingSupply, maxSupply: quote?.maxSupply)
    let turnover = MarketMetrics.turnoverPct(volume24hUsd: vol, marketCapUsd: mcap)
    let range30 = MarketMetrics.rangePositionPct(dailyOhlcv: dailyOhlcv, days: 30)
    let atr = MarketMetrics.atrPct14d(dailyOhlcv: dailyOhlcv)
    let perf: MetricValue = {
      guard let pct = quote?.priceChangePercentage24h, pct.isFinite, let p = price, p > 0 else { return .dash }
      return .performance(usdMove: MarketMetrics.usdMove(priceUsd: p, percentChange: pct), pct: pct)
    }()
    return [
      Metric(id: "mcap", label: "Market Cap", help: "Market cap in USD (spot price × circulating supply when available).",
             value: mcap.map { .text(UsdFormat.largeUsd($0)) } ?? .dash),
      Metric(id: "fdv", label: "FDV", help: "Fully diluted valuation: price × max supply. Shows ∞ when max supply is unknown/uncapped (e.g. ETH).",
             value: fdv.map { .text(UsdFormat.largeUsd($0)) } ?? .infinity),
      Metric(id: "float", label: "Float %", help: "Circulating supply ÷ max supply. Shows ∞ when max supply is unknown/uncapped.",
             value: floatPct.map { .text(String(format: "%.1f%%", $0)) } ?? .infinity),
      Metric(id: "atr", label: "ATR % (14d)", help: "14-day Average True Range as a percent of price, using daily-bucketed candles (volatility proxy).",
             value: atr.map { .text(String(format: "%.2f%%", $0)) } ?? .dash),
      Metric(id: "range", label: "30d Position", help: "Where today's close sits within the last 30 daily candles' low→high range. 0% = near 30d lows, 100% = near 30d highs.",
             value: range30.map { .text(String(format: "%.0f%%", $0)) } ?? .dash),
      Metric(id: "vol", label: "24h Volume", help: "Notional USD traded in the last 24 hours across tracked venues.",
             value: vol.map { .text(UsdFormat.largeUsd($0)) } ?? .dash),
      Metric(id: "perf", label: "Daily Performance", help: "Rolling 24h move. Left number is the inferred USD move; badge is the 24h percent change.", value: perf),
      Metric(id: "turn", label: "Turnover", help: "24h volume ÷ market cap. Interpreted as “% of the market cap that traded today” (a liquidity/velocity proxy).",
             value: turnover.map { .text(String(format: "%.2f%%", $0)) } ?? .dash),
    ]
  }

  var body: some View {
    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
      ForEach(metrics) { m in
        VStack(spacing: 6) {
          MetricLabel(label: m.label, help: m.help)
          Group {
            switch m.value {
            case .text(let s): Text(s)
            case .dash: Text("—").foregroundStyle(.secondary)
            case .infinity: Image(systemName: "infinity").foregroundStyle(.secondary)
            case .performance(let usd, let pct): MoveWithBadge(usdMove: usd, pct: pct)
            }
          }
          .font(.system(.footnote, design: .rounded).monospacedDigit())
          .opacity(isPending ? 0.7 : 1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
      }
    }
    .padding(8)
    .glassEffect(.regular, in: .rect(cornerRadius: 16))
  }
}

struct MetricLabel: View {
  let label: String
  let help: String
  @State private var showHelp = false
  var body: some View {
    HStack(spacing: 4) {
      Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
      Button { showHelp = true } label: { Image(systemName: "info.circle").font(.system(size: 10)).foregroundStyle(.tertiary) }
        .buttonStyle(.plain)
        .popover(isPresented: $showHelp) {
          Text(help).font(.footnote).padding(12).frame(maxWidth: 260).presentationCompactAdaptation(.popover)
        }
        .accessibilityLabel("\(label) info")
    }
  }
}

#if DEBUG
#Preview("Market metrics") {
  MarketMetricsGrid(quote: PreviewFixtures.quotes[0], alignedPrice: 67_420, dailyOhlcv: PreviewFixtures.bars, isPending: false).padding().preferredColorScheme(.dark)
}
#Preview("Loading metrics") {
  MarketMetricsGrid(quote: nil, alignedPrice: nil, dailyOhlcv: [], isPending: true).padding().preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Metric help popover") {
  MetricLabel(label: "Market cap", help: "Current price multiplied by circulating supply.")
    .padding().preferredColorScheme(.dark)
}
#endif
