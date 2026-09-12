import AggrCore
import Charts
import SwiftUI

/// Swift Charts port of the lightweight-charts price chart:
/// price line, market-cap overlay rebased at the first shared bar, Hull MHULL/SHULL, projection cone,
/// crosshair rule + month/quarter highlight, live last-bar update, extrema annotations.
struct PriceChart: View {
  let line: [TimePoint]
  let ohlc: [OHLCVBar]
  let marketCap: [TimePoint]
  let hull: HullSuite.Result
  let projection: PriceProjection.Result?
  let livePriceUsd: Double?
  let showPrice: Bool
  let scale: TimeScale
  @Binding var selectedDate: Date?

  struct Pt: Identifiable { let id: Int; let date: Date; let value: Double }

  private static func pts(_ s: [TimePoint]) -> [Pt] { s.map { Pt(id: $0.epochSeconds, date: $0.date, value: $0.value) } }

  private var priceLine: [Pt] {
    var pts = line
    if let live = livePriceUsd, let last = pts.last { pts[pts.count - 1] = TimePoint(epochSeconds: last.epochSeconds, value: live) }
    return Self.pts(pts)
  }

  /// `k = price₀ / mcap₀` at the first bar where both exist (fallback: first positive of each).
  private var rebasedMarketCap: [Pt] {
    guard !marketCap.isEmpty else { return [] }
    let closeByEpoch = Dictionary(ohlc.map { ($0.time, $0.close) }, uniquingKeysWith: { a, _ in a })
    var k: Double? = nil
    for p in marketCap where p.value > 0 {
      if let c = closeByEpoch[p.epochSeconds], c > 0 { k = c / p.value; break }
    }
    if k == nil, let c = ohlc.first(where: { $0.close > 0 })?.close, let m = marketCap.first(where: { $0.value > 0 })?.value { k = c / m }
    guard let k else { return [] }
    return marketCap.map { Pt(id: $0.epochSeconds, date: $0.date, value: $0.value * k) }
  }

  private var yDomain: ClosedRange<Double>? {
    var values = showPrice ? priceLine.map(\.value) : []
    values += rebasedMarketCap.map(\.value)
    values += hull.mhull.map(\.value)
    if let projection { values += projection.bull.map(\.value) + projection.bear.map(\.value) }
    guard let lo = values.min(), let hi = values.max(), lo.isFinite, hi.isFinite else { return nil }
    let pad = max((hi - lo) * 0.08, hi * 0.005)
    return max(0, lo - pad)...(hi + pad)
  }

  private var xDomain: ClosedRange<Date>? {
    guard let first = line.first, let lastLine = line.last else { return nil }
    let last = projection?.base.last?.date ?? lastLine.date
    return first.date...max(last, first.date.addingTimeInterval(60))
  }

  /// Month (1M) or quarter (1Y/2Y) range containing the crosshair, in UTC (`getUtcMonthRange`/`getUtcQuarterRange`).
  private var highlightRange: ClosedRange<Date>? {
    guard let selectedDate else { return nil }
    var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
    let comps = cal.dateComponents([.year, .month], from: selectedDate)
    guard let year = comps.year, let month = comps.month else { return nil }
    if scale == .y2 || scale == .max {
      let qStart = ((month - 1) / 3) * 3 + 1
      guard let s = cal.date(from: DateComponents(year: year, month: qStart, day: 1)), let e = cal.date(byAdding: .month, value: 3, to: s) else { return nil }
      return s...e
    }
    guard let s = cal.date(from: DateComponents(year: year, month: month, day: 1)), let e = cal.date(byAdding: .month, value: 1, to: s) else { return nil }
    return s...e
  }

  var body: some View {
    let price = priceLine
    let mcap = rebasedMarketCap
    let yLow = yDomain?.lowerBound ?? 0
    Chart {
      highlightContent
      if showPrice { priceContent(price, yLow: yLow) }
      overlayContent(mcap)
      projectionContent
      if showPrice { annotationContent(price) }
      crosshairContent(price)
    }
    .chartXSelection(value: $selectedDate)
    .modifier(XDomainModifier(domain: xDomain))
    .modifier(YDomainModifier(domain: yDomain))
    .chartYAxis {
      AxisMarks(position: .trailing, values: .automatic(desiredCount: 5)) { value in
        AxisGridLine().foregroundStyle(Color.white.opacity(0.06))
        AxisValueLabel { if let v = value.as(Double.self) { Text(UsdFormat.price(v)).font(.system(size: 9, design: .monospaced)) } }
      }
    }
    .chartXAxis {
      AxisMarks(values: .automatic(desiredCount: 4)) { value in
        AxisValueLabel { if let d = value.as(Date.self) { Text(d, format: xLabelFormat).font(.system(size: 9)) } }
      }
    }
    .chartLegend(.hidden)
    .chartPlotStyle { $0.clipped() }
  }

  private var xLabelFormat: Date.FormatStyle {
    scale == .y2 ? .dateTime.month(.abbreviated).year(.twoDigits) : .dateTime.month(.abbreviated).day()
  }

  // MARK: Chart content pieces

  @ChartContentBuilder
  private var highlightContent: some ChartContent {
    if let hr = highlightRange, let xd = xDomain {
      if hr.lowerBound > xd.lowerBound {
        RectangleMark(xStart: .value("s", xd.lowerBound), xEnd: .value("e", hr.lowerBound)).foregroundStyle(Color.black.opacity(0.55))
      }
      if hr.upperBound < xd.upperBound {
        RectangleMark(xStart: .value("s", hr.upperBound), xEnd: .value("e", xd.upperBound)).foregroundStyle(Color.black.opacity(0.55))
      }
      RuleMark(x: .value("hs", hr.lowerBound)).foregroundStyle(Color.white.opacity(0.25))
      RuleMark(x: .value("he", hr.upperBound)).foregroundStyle(Color.white.opacity(0.25))
    }
  }

  @ChartContentBuilder
  private func priceContent(_ price: [Pt], yLow: Double) -> some ChartContent {
    ForEach(price) { p in
      AreaMark(x: .value("Time", p.date), yStart: .value("Base", yLow), yEnd: .value("Price", p.value), series: .value("s", "price-area"))
        .interpolationMethod(.monotone)
        .foregroundStyle(LinearGradient(colors: [.white.opacity(0.10), .clear], startPoint: .top, endPoint: .bottom))
    }
    ForEach(price) { p in
      LineMark(x: .value("Time", p.date), y: .value("Price", p.value), series: .value("s", "price"))
        .interpolationMethod(.monotone)
        .foregroundStyle(.white)
        .lineStyle(StrokeStyle(lineWidth: 1.5))
    }
  }

  @ChartContentBuilder
  private func overlayContent(_ mcap: [Pt]) -> some ChartContent {
    ForEach(mcap) { p in
      LineMark(x: .value("Time", p.date), y: .value("MCap", p.value), series: .value("s", "mcap"))
        .interpolationMethod(.monotone)
        .foregroundStyle(Color(oklch: "oklch(0.85 0.16 95 / 0.5)"))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
    }
    ForEach(Self.pts(hull.mhull)) { p in
      LineMark(x: .value("Time", p.date), y: .value("MHULL", p.value), series: .value("s", "mhull"))
        .foregroundStyle(Color(oklch: OklchColor.withAlpha(ChartColors.pastel[0], 0.7)))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
    }
    ForEach(Self.pts(hull.shull)) { p in
      LineMark(x: .value("Time", p.date), y: .value("SHULL", p.value), series: .value("s", "shull"))
        .foregroundStyle(Color(oklch: OklchColor.withAlpha(ChartColors.pastel[0], 0.45)))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
    }
  }

  private struct ConeBand: Identifiable { let id: Int; let date: Date; let bull: Double; let bear: Double }

  @ChartContentBuilder
  private var projectionContent: some ChartContent {
    if let projection {
      let bands = zip(projection.bull, projection.bear).map { ConeBand(id: $0.0.epochSeconds, date: $0.0.date, bull: $0.0.value, bear: $0.1.value) }
      ForEach(bands) { b in
        AreaMark(x: .value("Time", b.date), yStart: .value("Bear", b.bear), yEnd: .value("Bull", b.bull), series: .value("s", "cone"))
          .foregroundStyle(Color.white.opacity(0.05))
      }
      projectionLine(projection.base, id: "base", color: Color(oklch: "oklch(1 0 0 / 0.55)"))
      projectionLine(projection.bull, id: "bull", color: Color(oklch: OklchColor.withAlpha(ChartColors.candleUp, 0.55)))
      projectionLine(projection.bear, id: "bear", color: Color(oklch: OklchColor.withAlpha(ChartColors.candleDown, 0.55)))
      if let anchor = projection.base.first {
        RuleMark(x: .value("Now", anchor.date)).foregroundStyle(Color.white.opacity(0.2)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
      }
    }
  }

  @ChartContentBuilder
  private func projectionLine(_ pts: [TimePoint], id: String, color: Color) -> some ChartContent {
    ForEach(Self.pts(pts)) { p in
      LineMark(x: .value("Time", p.date), y: .value(id, p.value), series: .value("s", id))
        .foregroundStyle(color)
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
    }
  }

  @ChartContentBuilder
  private func annotationContent(_ price: [Pt]) -> some ChartContent {
    if price.count >= 2, let hi = price.max(by: { $0.value < $1.value }), let lo = price.min(by: { $0.value < $1.value }) {
      PointMark(x: .value("t", hi.date), y: .value("v", hi.value)).symbolSize(0)
        .annotation(position: .top, spacing: 2, overflowResolution: .init(x: .fit, y: .disabled)) { Text(UsdFormat.price(hi.value)).font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary).fixedSize() }
      PointMark(x: .value("t", lo.date), y: .value("v", lo.value)).symbolSize(0)
        .annotation(position: .bottom, spacing: 2, overflowResolution: .init(x: .fit, y: .disabled)) { Text(UsdFormat.price(lo.value)).font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary).fixedSize() }
    }
    if let last = price.last {
      PointMark(x: .value("t", last.date), y: .value("v", last.value)).symbolSize(28).foregroundStyle(.white)
    }
  }

  @ChartContentBuilder
  private func crosshairContent(_ price: [Pt]) -> some ChartContent {
    if let selectedDate {
      RuleMark(x: .value("Selected", selectedDate))
        .foregroundStyle(Color(oklch: "oklch(0.8717 0.0093 258.34 / 0.35)"))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
      if let p = nearestPricePoint(price, to: selectedDate) {
        PointMark(x: .value("t", p.date), y: .value("v", p.value)).symbolSize(40).foregroundStyle(.white)
      }
    }
  }

  private func nearestPricePoint(_ pts: [Pt], to date: Date) -> Pt? {
    guard !pts.isEmpty else { return nil }
    let t = date.timeIntervalSince1970
    return pts.min { abs($0.date.timeIntervalSince1970 - t) < abs($1.date.timeIntervalSince1970 - t) }
  }
}

/// Applies a fixed X domain when available (keeps the projection's future range in view).
struct XDomainModifier: ViewModifier {
  let domain: ClosedRange<Date>?
  func body(content: Content) -> some View {
    if let domain { content.chartXScale(domain: domain) } else { content }
  }
}

struct YDomainModifier: ViewModifier {
  let domain: ClosedRange<Double>?
  func body(content: Content) -> some View {
    if let domain { content.chartYScale(domain: domain) } else { content }
  }
}

/// Volume pane sharing the price chart's x domain.
struct VolumeChart: View {
  let volume: [TimePoint]
  let domain: ClosedRange<Date>?

  var body: some View {
    Chart(volume, id: \.epochSeconds) { p in
      BarMark(x: .value("Time", p.date), y: .value("Volume", p.value), width: .ratio(0.6))
        .foregroundStyle(Color.white.opacity(0.25))
    }
    .modifier(XDomainModifier(domain: domain))
    .chartXAxis(.hidden)
    .chartYAxis {
      AxisMarks(position: .trailing, values: .automatic(desiredCount: 2)) { value in
        AxisValueLabel { if let v = value.as(Double.self) { Text(UsdFormat.largeUsd(v)).font(.system(size: 8, design: .monospaced)) } }
      }
    }
    .chartLegend(.hidden)
  }
}
