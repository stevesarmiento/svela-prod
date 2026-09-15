import AggrAPI
import AggrCore
import SwiftUI

struct AnalysisMetricSection<Content: View>: View {
  let title: String
  @ViewBuilder var content: () -> Content
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(title).font(.headline).accessibilityAddTraits(.isHeader)
      content()
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct AnalysisMetricRow: View {
  let title: String
  let value: String
  var icon: String? = nil
  var tint: Color = .primary
  var badge: String? = nil
  var meter: Double? = nil
  var domain: ClosedRange<Double> = 0...100
  var origin: Double? = nil

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) { label; Spacer(minLength: 8); readout }
      VStack(alignment: .leading, spacing: 6) { label; readout }
    }
    .font(.subheadline)
    .accessibilityElement(children: .combine)
  }
  private var label: some View {
    HStack(spacing: 6) {
      if let icon { Image(systemName: icon).font(.caption).frame(width: 18).accessibilityHidden(true) }
      Text(title)
    }.foregroundStyle(.secondary).fixedSize(horizontal: true, vertical: false)
  }
  private var readout: some View {
    HStack(spacing: 7) {
      if let meter, meter.isFinite {
        TickMeter(value: meter, min: domain.lowerBound, max: domain.upperBound,
                  origin: origin.map { .value($0) } ?? .min, color: tint)
      }
      if !value.isEmpty { Text(value).monospacedDigit().foregroundStyle(tint) }
      if let badge { AnalysisStatusBadge(text: badge, tint: tint) }
    }.fixedSize(horizontal: true, vertical: false)
  }
}

struct AnalysisStatusBadge: View {
  let text: String
  var tint: Color = .secondary
  var body: some View {
    Text(text).font(.caption).foregroundStyle(tint)
      .padding(.horizontal, 6).padding(.vertical, 3)
      .background(tint.opacity(0.12), in: .capsule)
  }
}

/// Every section of `market-metrics-sidebar.tsx`, backed by the report's retained data bundle.
struct AnalysisMarketMetrics: View {
  let bundle: AnalysisDataService.Bundle
  private var data: IndicatorData { bundle.data }
  private var quote: IndicatorData.Quote.USD { data.quote.USD }

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      AnalysisMetricSection(title: "Market metrics") {
        AnalysisMetricRow(title: "Current price", value: UsdFormat.price(bundle.series.last?.value ?? quote.price), icon: "dollarsign")
        AnalysisMetricRow(title: "Market cap", value: UsdFormat.largeUsd(quote.market_cap), icon: "dollarsign.bank.building")
        AnalysisMetricRow(title: "24h volume", value: UsdFormat.largeUsd(quote.volume_24h), icon: "chart.bar.xaxis",
                          badge: data.volumeAnalysis?.volumeTrend.capitalized)
      }
      Divider()
      AnalysisMetricSection(title: "Price levels") {
        // The web takes the last 21 observations, despite labeling them '21d'. Keep the calculation,
        // but state the actual window instead of describing intraday observations as daily bars.
        AnalysisMetricRow(title: "Resistance", value: bundle.series.suffix(21).map(\.value).max().map { UsdFormat.price($0) } ?? "—",
                          icon: "tengesign", tint: .lossRed)
        AnalysisMetricRow(title: "Support", value: bundle.series.suffix(21).map(\.value).min().map { UsdFormat.price($0) } ?? "—",
                          icon: "tengesign", tint: .gainGreen)
        Text("Range of the latest 21 price observations.").font(.caption).foregroundStyle(.secondary)
      }
      Divider()
      technical
      Divider()
      structure
    }
    .accessibilityIdentifier("analysis-market-metrics")
  }

  private var technical: some View {
    AnalysisMetricSection(title: "Technical indicators") {
      if let hull = data.hullSuite {
        AnalysisMetricRow(title: "Hull Suite", value: hull.strength?.capitalized ?? "", icon: "shadow",
                          tint: hull.trendDirection == "bullish" ? .gainGreen : .lossRed, badge: hull.trendDirection.capitalized)
      }
      if let bb = data.bollingerBands {
        AnalysisMetricRow(title: "Relative strength", value: AnalysisValueStyle.number(bb.currentValue), icon: "waveform.path.ecg.rectangle",
                          tint: bb.currentValue > 70 ? .lossRed : bb.currentValue < 30 ? .gainGreen : .secondary,
                          badge: bb.currentValue > 70 ? "Overbought" : bb.currentValue < 30 ? "Oversold" : "Neutral", meter: bb.currentValue)
        AnalysisMetricRow(title: "RSI bands", value: "\(AnalysisValueStyle.number(bb.lowerBand)) – \(AnalysisValueStyle.number(bb.upperBand))", icon: "fibrechannel")
        if let divergence = bb.divergence, divergence != "none" {
          AnalysisMetricRow(title: "Divergence", value: "", icon: "trapezoid.and.line.horizontal",
                            tint: divergence == "bullish" ? .gainGreen : .lossRed, badge: divergence.capitalized + " signal")
        }
      }
      if let mf = data.marketVision?.moneyFlow, let value = mf.value {
        let extent = max(15, abs(value) * 1.25)
        AnalysisMetricRow(title: "Money flow", value: AnalysisValueStyle.number(abs(value)), icon: "gauge.with.dots.needle.67percent",
                          tint: AnalysisValueStyle.color(value), badge: mf.direction.capitalized, meter: value, domain: -extent...extent, origin: 0)
      }
      if let wt = data.marketVision?.waveTrend {
        let extent = max(60, abs(wt.wt1) * 1.1)
        AnalysisMetricRow(title: "Wave trend", value: AnalysisValueStyle.number(wt.wt1), icon: "character.duployan",
                          tint: wt.wt1 > wt.wt2 ? .gainGreen : .lossRed, badge: wt.wt1 > wt.wt2 ? "Bullish" : "Bearish",
                          meter: wt.wt1, domain: -extent...extent, origin: 0)
      }
      if data.marketVision == nil && data.bollingerBands == nil {
        Text("Indicator history is unavailable.").font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  private var structure: some View {
    AnalysisMetricSection(title: "Market structure") {
      if let oi = data.liquidationData?.openInterest {
        AnalysisMetricRow(title: "Open interest", value: UsdFormat.largeUsd(oi), icon: "globe",
                          tint: AnalysisValueStyle.color(data.liquidationData?.openInterestChange),
                          badge: data.liquidationData?.openInterestChange.map { AnalysisValueStyle.percent($0) })
      }
      if let buy = data.orderFlow?.takerBuyRatio, buy.isFinite, (0...1).contains(buy) {
        AnalysisMetricRow(title: "Order flow", value: "", icon: "calendar.day.timeline.right",
                          tint: buy >= 0.5 ? .gainGreen : .lossRed,
                          badge: "\(AnalysisValueStyle.number(buy * 100))% buy / \(AnalysisValueStyle.number((1 - buy) * 100))% sell",
                          meter: buy * 100, origin: 50)
      }
      if let liq = data.liquidationData, let total = liq.totalLiquidations24h {
        AnalysisMetricRow(title: "24h liquidations", value: UsdFormat.largeUsd(total), icon: "drop.halffull")
        if let longs = liq.longLiquidations, let shorts = liq.shortLiquidations {
          AnalysisMetricRow(title: "Liquidation bias", value: "", tint: longs > shorts ? .lossRed : .gainGreen,
                            badge: longs > shorts ? "Long heavy" : "Short heavy")
        }
      }
      if data.liquidationData == nil && data.orderFlow == nil {
        Text("Derivatives data is unavailable for this asset.").font(.caption).foregroundStyle(.secondary)
      }
      AnalysisMetricRow(title: "24h trend", value: AnalysisValueStyle.percent(quote.percent_change_24h),
                        icon: quote.percent_change_24h > 2 ? "chart.line.uptrend.xyaxis" : quote.percent_change_24h < -2 ? "chart.line.downtrend.xyaxis" : "chart.line.flattrend.xyaxis",
                        tint: AnalysisValueStyle.color(quote.percent_change_24h),
                        badge: quote.percent_change_24h > 2 ? "Uptrend" : quote.percent_change_24h < -2 ? "Downtrend" : "Sideways")
    }
  }
}

/// Full cross-asset sidebar: shared meter domains, pairwise correlations and every indicator/flow field.
struct ComparativeStatsPanel: View {
  let stats: ComparativeStats.Result
  private var maxReturn: Double { max(1, stats.tokens.flatMap { [$0.return7dPct, $0.return30dPct] }.compactMap { $0 }.map(abs).max() ?? 1) }
  private var maxVol: Double { max(1, stats.tokens.compactMap(\.volatility30dAnnualizedPct).max() ?? 1) }

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Benchmark: \(stats.benchmarkSymbol.uppercased())").font(.caption).foregroundStyle(.secondary)
      AnalysisMetricSection(title: "Returns") {
        comparisonTable(first: "7d", second: "30d") { t in
          meterCell(t.return7dPct, domain: -maxReturn...maxReturn, origin: 0)
          meterCell(t.return30dPct, domain: -maxReturn...maxReturn, origin: 0)
        }
      }
      Divider()
      AnalysisMetricSection(title: "Risk vs \(stats.benchmarkSymbol.uppercased())") {
        comparisonTable(first: "Volatility", second: "Beta") { t in
          meterCell(t.volatility30dAnnualizedPct, domain: 0...maxVol, tint: .orange, signed: false)
          Text(AnalysisValueStyle.number(t.betaVsBenchmark, digits: 2))
            .foregroundStyle((t.betaVsBenchmark ?? 0) > 1.5 ? Color.orange : .secondary)
        }
        Text("Beta: recent move per 1% benchmark move. Volatility is annualized from 30 days of daily returns.")
          .font(.caption).foregroundStyle(.secondary)
      }
      Divider()
      correlation
      Divider()
      indicators
      Divider()
      momentum
    }.accessibilityIdentifier("analysis-comparative-metrics")
  }

  private func comparisonTable<Cells: View>(first: String, second: String, @ViewBuilder cells: @escaping (ComparativeStats.TokenStats) -> Cells) -> some View {
    Grid(alignment: .trailing, horizontalSpacing: 16, verticalSpacing: 12) {
      GridRow {
        Text("Token").frame(maxWidth: .infinity, alignment: .leading)
        Text(first); Text(second)
      }.font(.caption).foregroundStyle(.secondary)
      ForEach(stats.tokens) { token in
        GridRow { tokenName(token); cells(token) }
      }
    }.font(.subheadline.monospacedDigit())
  }
  private func tokenName(_ token: ComparativeStats.TokenStats) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(token.symbol.uppercased()).fontWeight(.semibold)
      if token.id == stats.benchmarkId { Text("benchmark").font(.caption2).foregroundStyle(.secondary) }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
  private func meterCell(_ value: Double?, domain: ClosedRange<Double>, origin: Double? = nil, tint: Color? = nil, signed: Bool = true) -> some View {
    VStack(alignment: .trailing, spacing: 4) {
      Text(signed ? AnalysisValueStyle.percent(value) : AnalysisValueStyle.number(value, digits: 0, suffix: "%"))
        .foregroundStyle(tint ?? AnalysisValueStyle.color(value))
      if let value {
        TickMeter(value: value, min: domain.lowerBound, max: domain.upperBound,
                  origin: origin.map { .value($0) } ?? .min, color: tint ?? AnalysisValueStyle.color(value))
      }
    }
  }

  private var correlation: some View {
    AnalysisMetricSection(title: "Correlation · 30 days") {
      ScrollView(.horizontal) {
        Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 12) {
          GridRow {
            Text("").frame(width: 52)
            ForEach(stats.tokens) { t in Text(t.symbol.uppercased()).frame(minWidth: 44) }
          }.foregroundStyle(.secondary)
          ForEach(Array(stats.tokens.enumerated()), id: \.element.id) { i, t in
            GridRow {
              Text(t.symbol.uppercased()).fontWeight(.semibold).frame(width: 52, alignment: .leading)
              ForEach(Array(stats.tokens.enumerated()), id: \.element.id) { j, other in
                let value = stats.correlationMatrix.indices.contains(i) && stats.correlationMatrix[i].indices.contains(j) ? stats.correlationMatrix[i][j] : nil
                Text(i == j ? "—" : AnalysisValueStyle.number(value, digits: 2))
                  .foregroundStyle(i == j ? Color.secondary.opacity(0.4) : correlationColor(value))
                  .frame(minWidth: 44)
                  .accessibilityLabel("\(t.symbol.uppercased()) and \(other.symbol.uppercased())")
                  .accessibilityValue(i == j ? "Same token" : value.map { AnalysisValueStyle.number($0, digits: 2) } ?? "Insufficient overlapping history")
              }
            }
          }
        }.font(.caption.monospacedDigit())
      }
      Text("+1 moves together · 0 little relationship · −1 moves oppositely. A dash means insufficient overlapping history.")
        .font(.caption).foregroundStyle(.secondary)
    }
  }
  private func correlationColor(_ value: Double?) -> Color {
    guard let value else { return .secondary.opacity(0.4) }
    if value < -0.2 { return .lossRed }
    return .primary.opacity(value >= 0.8 ? 1 : value >= 0.5 ? 0.8 : value >= 0.2 ? 0.6 : 0.4)
  }

  private var indicators: some View {
    AnalysisMetricSection(title: "Indicators") {
      ForEach(stats.tokens) { t in
        VStack(alignment: .leading, spacing: 10) {
          HStack {
            Text(t.symbol.uppercased()).font(.subheadline.weight(.semibold))
            if let bbwp = t.bbwpPct, bbwp <= 20 || bbwp >= 80 {
              AnalysisStatusBadge(text: bbwp <= 20 ? "Squeeze" : "Expansion", tint: bbwp <= 20 ? .orange : .pink)
            }
          }
          AnalysisMetricRow(title: "Wave trend", value: t.waveTrend?.replacingOccurrences(of: "_", with: " ").capitalized ?? "—",
                            tint: t.waveTrend?.contains("bullish") == true ? .gainGreen : t.waveTrend?.contains("bearish") == true ? .lossRed : .secondary)
          AnalysisMetricRow(title: "Money flow", value: t.moneyFlow?.capitalized ?? "—",
                            tint: t.moneyFlow?.hasPrefix("inflow") == true ? .gainGreen : t.moneyFlow?.hasPrefix("outflow") == true ? .lossRed : .secondary)
          AnalysisMetricRow(title: "RSI bands %B", value: AnalysisValueStyle.number(t.bbPercentB, digits: 2))
          AnalysisMetricRow(title: "BBWP", value: AnalysisValueStyle.number(t.bbwpPct, digits: 0, suffix: "%"), meter: t.bbwpPct)
        }
        if t.id != stats.tokens.last?.id { Divider() }
      }
      Text("%B is RSI’s position within its Bollinger bands. BBWP ≤20 indicates a squeeze; ≥80 indicates expansion.")
        .font(.caption).foregroundStyle(.secondary)
    }
  }

  private var momentum: some View {
    AnalysisMetricSection(title: "Momentum & flow") {
      ForEach(stats.tokens) { t in
        VStack(alignment: .leading, spacing: 10) {
          Text(t.symbol.uppercased()).font(.subheadline.weight(.semibold))
          AnalysisMetricRow(title: "RSI", value: AnalysisValueStyle.number(t.rsi, digits: 0),
                            tint: (t.rsi ?? 50) >= 70 ? .lossRed : (t.rsi ?? 50) <= 30 ? .gainGreen : .orange,
                            badge: t.rsi.flatMap { $0 >= 70 ? "Hot" : $0 <= 30 ? "Oversold" : nil }, meter: t.rsi)
          if let oi = t.openInterestChangePct {
            AnalysisMetricRow(title: "Open interest change", value: AnalysisValueStyle.percent(oi), tint: AnalysisValueStyle.color(oi))
          }
          if let buy = t.takerBuyRatio {
            AnalysisMetricRow(title: "Taker buy", value: AnalysisValueStyle.number(buy * 100, digits: 0, suffix: "%"),
                              tint: buy > 0.5 ? .gainGreen : .lossRed, meter: buy * 100, origin: 50)
          }
          if t.openInterestChangePct == nil && t.takerBuyRatio == nil {
            Text("Derivatives data unavailable").font(.caption).foregroundStyle(.secondary)
          }
          if t.id != stats.benchmarkId {
            AnalysisMetricRow(title: "Excess return · 7d", value: AnalysisValueStyle.percent(t.excessReturn7dPct, suffix: "pp"), tint: AnalysisValueStyle.color(t.excessReturn7dPct))
            AnalysisMetricRow(title: "Excess return · 30d", value: AnalysisValueStyle.percent(t.excessReturn30dPct, suffix: "pp"), tint: AnalysisValueStyle.color(t.excessReturn30dPct))
          }
        }
        if t.id != stats.tokens.last?.id { Divider() }
      }
    }
  }
}
