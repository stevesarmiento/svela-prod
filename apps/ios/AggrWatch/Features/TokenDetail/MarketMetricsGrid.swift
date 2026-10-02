import AggrAPI
import AggrCore
import SwiftUI

/// All market metrics share one list of icon-led rows. Equatable on its inputs so quote polls
/// and realtime ticks elsewhere on the page never re-run the metric formatting.
struct MarketMetricsGrid: View, Equatable {
  let quote: CoinQuote?
  let alignedPrice: Double?
  let dailyOhlcv: [OHLCVBar]
  var isPending = false
  @State private var help: Metric?
  @State private var memo = MetricsMemo()
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  static func == (a: Self, b: Self) -> Bool {
    a.quote == b.quote && a.alignedPrice == b.alignedPrice && a.dailyOhlcv == b.dailyOhlcv && a.isPending == b.isPending
  }

  fileprivate struct Metric: Identifiable, Equatable {
    let id: String
    let label: String
    let icon: String
    let help: String
    let value: String
  }

  /// Unobserved memo: the eight formatted rows are rebuilt only when quote / price / candles change.
  @MainActor fileprivate final class MetricsMemo {
    private var quote: CoinQuote?
    private var alignedPrice: Double?
    private var dailyOhlcv: [OHLCVBar] = []
    private var rows: [Metric]?

    func metrics(quote: CoinQuote?, alignedPrice: Double?, dailyOhlcv: [OHLCVBar], build: () -> [Metric]) -> [Metric] {
      if let rows, self.quote == quote, self.alignedPrice == alignedPrice, self.dailyOhlcv == dailyOhlcv { return rows }
      let built = build()
      self.quote = quote; self.alignedPrice = alignedPrice; self.dailyOhlcv = dailyOhlcv; rows = built
      return built
    }
  }

  private func usdAmount(_ value: Double?) -> String {
    guard let value, value.isFinite, value >= 0 else { return "—" }
    return UsdFormat.largeUsd(value)
  }

  private var marketCap: Metric {
    Metric(id: "mcap", label: "Market Cap", icon: "chart.pie", help: "The USD market value of the circulating supply.",
           value: usdAmount(quote?.marketCap))
  }

  private var fdv: Metric {
    let value = MarketMetrics.fdvUsd(priceUsd: alignedPrice ?? quote?.currentPrice, maxSupply: quote?.maxSupply)
    return Metric(id: "fdv", label: "FDV", icon: "chart.bar.xaxis",
                  help: "Fully diluted valuation: price × max supply. Shows ∞ when max supply is unknown or uncapped.",
                  value: value.map { UsdFormat.largeUsd($0) } ?? "∞")
  }

  private var metrics: [Metric] {
    memo.metrics(quote: quote, alignedPrice: alignedPrice, dailyOhlcv: dailyOhlcv) { buildMetrics() }
  }

  private func buildMetrics() -> [Metric] {
    let floatPct = MarketMetrics.floatPct(circulatingSupply: quote?.circulatingSupply, maxSupply: quote?.maxSupply)
    let turnover = MarketMetrics.turnoverPct(volume24hUsd: quote?.totalVolume, marketCapUsd: quote?.marketCap)
    let range = MarketMetrics.rangePositionPct(dailyOhlcv: dailyOhlcv, days: 30)
    let atr = MarketMetrics.atrPct14d(dailyOhlcv: dailyOhlcv)
    return [
      marketCap,
      fdv,
      Metric(id: "vol", label: "24h Volume", icon: "chart.xyaxis.line", help: "Notional USD traded in the last 24 hours across tracked venues.", value: usdAmount(quote?.totalVolume)),
      Metric(id: "float", label: "Float %", icon: "circle.lefthalf.filled", help: "Circulating supply divided by max supply. Shows ∞ when max supply is unknown or uncapped.", value: floatPct.map { String(format: "%.1f%%", $0) } ?? "∞"),
      Metric(id: "atr", label: "ATR % (14d)", icon: "waveform.path", help: "14-day Average True Range as a percent of price, using daily candles to measure volatility.", value: atr.map { String(format: "%.2f%%", $0) } ?? "—"),
      Metric(id: "range", label: "30d Position", icon: "slider.horizontal.3", help: "Where the latest daily close sits within the last 30 daily candles’ low-to-high range. 0% is near the lows; 100% is near the highs.", value: range.map { String(format: "%.0f%%", $0) } ?? "—"),
      Metric(id: "perf", label: "Daily Performance", icon: "arrow.up.arrow.down", help: "The rolling 24-hour price change and its inferred dollar value.", value: ""),
      Metric(id: "turn", label: "Turnover", icon: "arrow.triangle.2.circlepath", help: "24-hour volume divided by market cap: the percentage of market cap traded in a day.", value: turnover.map { String(format: "%.2f%%", $0) } ?? "—"),
    ]
  }

  var body: some View {
    VStack(spacing: 24) {
      RuledSectionHeading(title: "Market Stats")

      VStack(spacing: 0) {
        metricRows(metrics)
      }
    }
    .padding(.top, 12)
    // An explicit container: its identifier must not cascade onto the `token-stat-*` rows.
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("token-market-stats")
    .popover(item: $help) { metric in
      VStack(alignment: .leading, spacing: 8) {
        Text(metric.label).font(.system(.headline, design: .rounded))
        Text(metric.help).font(.system(.subheadline, design: .rounded)).foregroundStyle(.secondary)
      }
      .padding(20).frame(idealWidth: 280, maxWidth: 320)
      .presentationCompactAdaptation(.popover)
    }
  }

  private func metricRows(_ metrics: [Metric]) -> some View {
    ForEach(Array(metrics.enumerated()), id: \.element.id) { index, metric in
      Button { help = metric } label: {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 12) {
            rowLabel(metric)
            Spacer(minLength: 8)
            metricValue(metric).fixedSize()
          }
          VStack(alignment: .leading, spacing: 8) {
            rowLabel(metric)
            metricValue(metric).padding(.leading, 36)
          }
        }
        .font(.system(.body, design: .rounded))
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .background(index.isMultiple(of: 2) ? Color.clear : Color.white.opacity(0.055), in: .rect(cornerRadius: 10))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("token-stat-\(metric.id)")
      .accessibilityHint("Explains this metric")
    }
  }

  private func rowLabel(_ metric: Metric) -> some View {
    HStack(spacing: 12) {
      Image(systemName: metric.icon).frame(width: 24).accessibilityHidden(true)
      Text(metric.label).fixedSize(horizontal: !dynamicTypeSize.isAccessibilitySize, vertical: true)
    }
    .foregroundStyle(.secondary)
  }

  @ViewBuilder private func metricValue(_ metric: Metric) -> some View {
    Group {
      if metric.id == "perf", let pct = quote?.priceChangePercentage24h, pct.isFinite,
         let price = alignedPrice ?? quote?.currentPrice, price.isFinite, price > 0 {
        MoveWithBadge(usdMove: MarketMetrics.usdMove(priceUsd: price, percentChange: pct), pct: pct)
      } else {
        Text(metric.id == "perf" ? "—" : metric.value)
          .fontWeight(.semibold).monospacedDigit()
          .foregroundStyle(.white)
      }
    }
    .opacity(isPending ? 0.7 : 1)
  }
}

#if DEBUG
private var statsPreviewQuote: CoinQuote {
  var quote = PreviewFixtures.quotes[0]
  quote.circulatingSupply = 19_750_000
  quote.maxSupply = 21_000_000
  return quote
}

#Preview("Token stats") {
  ScrollView {
    MarketMetricsGrid(quote: statsPreviewQuote, alignedPrice: 67_420, dailyOhlcv: PreviewFixtures.bars)
      .padding(20)
  }
  .background(.black).preferredColorScheme(.dark)
}

#Preview("Token stats — large text") {
  ScrollView {
    MarketMetricsGrid(quote: statsPreviewQuote, alignedPrice: 67_420, dailyOhlcv: PreviewFixtures.bars)
      .padding(16)
  }
  .background(.black).preferredColorScheme(.dark)
  .environment(\.dynamicTypeSize, .accessibility2)
}

#Preview("Token stats — unavailable") {
  MarketMetricsGrid(quote: nil, alignedPrice: nil, dailyOhlcv: [], isPending: true)
    .padding(20).background(.black).preferredColorScheme(.dark)
}
#endif
