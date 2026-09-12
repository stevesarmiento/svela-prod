import Foundation
import Testing
@testable import AggrCore

// Port of lib/price-projection.test.ts
@Suite struct PriceProjectionTests {
  static let hour = 3600
  static let t0 = 1_700_000_000

  static func series(_ count: Int, interval: Int = hour, _ close: (Int) -> Double) -> [PriceProjection.InputPoint] {
    (0..<count).map { .init(timeEpochSec: t0 + $0 * interval, close: close($0)) }
  }

  @Test func nullBelowMinimum() {
    #expect(PriceProjection.compute(Self.series(PriceProjection.minProjectionBars - 1) { _ in 100 }) == nil)
  }

  @Test func flatSeriesCollapsesCone() throws {
    let r = try #require(PriceProjection.compute(Self.series(120) { _ in 100 }))
    for i in 0..<r.base.count {
      #expect(abs(r.base[i].value - 100) < 1e-6); #expect(abs(r.bull[i].value - 100) < 1e-6); #expect(abs(r.bear[i].value - 100) < 1e-6)
    }
  }

  @Test func geometricSymmetry() throws {
    let r = try #require(PriceProjection.compute(Self.series(120) { 100 * ($0 % 2 == 0 ? 1.02 : 0.98) }))
    #expect(r.meta.sigmaPerBar > 0)
    for i in 1..<r.base.count {
      let b = r.base[i].value, u = r.bull[i].value, d = r.bear[i].value
      #expect(u > b && d < b)
      #expect(abs(u / b - b / d) < 1e-6)
    }
  }

  @Test func steadyGrowthFollowsTrend() throws {
    let g = exp(0.01)
    let pts = Self.series(100) { 100 * pow(g, Double($0)) }
    let r = try #require(PriceProjection.compute(pts))
    #expect(abs(r.meta.muPerBar - 0.01) < 1e-6)
    #expect(abs(r.meta.sigmaPerBar) < 1e-6)
    let p0 = pts.last!.close
    #expect(abs(r.base.last!.value - p0 * exp(0.01 * Double(r.meta.horizonBars))) < 1e-4)
  }

  @Test func anchorEqualsLastClose() throws {
    let pts = Self.series(90) { 50 + Double($0) * 0.5 }
    let r = try #require(PriceProjection.compute(pts))
    for path in [r.base, r.bull, r.bear] {
      #expect(path[0].epochSeconds == pts.last!.timeEpochSec)
      #expect(abs(path[0].value - pts.last!.close) < 1e-10)
    }
  }

  @Test func driftClamp() throws {
    let pts = Self.series(60) { 0.0001 * exp(0.3 * Double($0)) }
    let r = try #require(PriceProjection.compute(pts))
    #expect(abs(r.meta.muPerBar * Double(r.meta.horizonBars)) <= log(3) + 1e-9)
    #expect(r.base.last!.value <= pts.last!.close * 3 * (1 + 1e-9))
  }

  @Test func volClamp() throws {
    let r = try #require(PriceProjection.compute(Self.series(120) { 100 * ($0 % 2 == 0 ? 1.6 : 0.4) }))
    #expect(r.meta.sigmaPerBar * Double(r.meta.horizonBars).squareRoot() <= log(4) + 1e-9)
    #expect(r.meta.sigmaPerBar <= 0.35 + 1e-9)
  }

  @Test func microCapStaysPositive() throws {
    let r = try #require(PriceProjection.compute(Self.series(100) { 0.004 * exp(-0.05 * Double($0)) }))
    for path in [r.base, r.bull, r.bear] { for p in path { #expect(p.value > 0 && p.value.isFinite) } }
  }

  @Test func medianIntervalIgnoresGap() throws {
    var pts = Self.series(100) { 100 + Double($0) }
    for i in 50..<100 { pts[i].timeEpochSec += 30 * 24 * Self.hour }
    let r = try #require(PriceProjection.compute(pts))
    #expect(r.meta.intervalSec == Double(Self.hour))
    for path in [r.base, r.bull, r.bear] { for i in 1..<path.count { #expect(path[i].epochSeconds > path[i - 1].epochSeconds) } }
  }

  @Test func horizonClamps() throws {
    #expect(try #require(PriceProjection.compute(Self.series(120) { 100 + Double($0) })).meta.horizonBars == 30)
    #expect(try #require(PriceProjection.compute(Self.series(30) { 100 + Double($0) })).meta.horizonBars == 8)
    #expect(try #require(PriceProjection.compute(Self.series(1000) { 100 + Double($0 % 7) })).meta.horizonBars == 90)
  }

  @Test func spreadGrowsLinearlyInLogSpace() throws {
    let r = try #require(PriceProjection.compute(Self.series(120) { 100 * ($0 % 2 == 0 ? 1.02 : 0.98) }))
    let h = r.meta.horizonBars
    #expect(r.base.count == h + 1)
    func spread(_ i: Int) -> Double { log(r.bull[i].value / r.base[i].value) }
    let rate = spread(1)
    #expect(rate > 0)
    for i in 2...h { #expect(abs(spread(i) - rate * Double(i)) < 1e-9) }
    #expect(abs(spread(h) - r.meta.sigmaPerBar * Double(h).squareRoot()) < 1e-9)
    #expect(r.base.last!.epochSeconds == Self.t0 + 119 * Self.hour + h * Int(r.meta.intervalSec))
  }

  @Test func modifiers() throws {
    let flat = Self.series(120) { _ in 100 }
    let plain = try #require(PriceProjection.compute(flat))
    let blended = try #require(PriceProjection.compute(flat, modifiers: .init(smootherSlopePerBar: 0.02)))
    #expect(abs(plain.meta.muPerBar) < 1e-9)
    #expect(abs(blended.meta.muPerBar - 0.01) < 1e-9)

    let noisy = Self.series(120) { 100 * ($0 % 2 == 0 ? 1.02 : 0.98) }
    let p = try #require(PriceProjection.compute(noisy))
    let squeeze = try #require(PriceProjection.compute(noisy, modifiers: .init(volRegimePercentile: 0)))
    let stretched = try #require(PriceProjection.compute(noisy, modifiers: .init(volRegimePercentile: 100)))
    #expect(abs(squeeze.meta.sigmaPerBar - p.meta.sigmaPerBar * 1.25) < 1e-9)
    #expect(abs(stretched.meta.sigmaPerBar - p.meta.sigmaPerBar * 0.75) < 1e-9)

    let bullish = try #require(PriceProjection.compute(noisy, modifiers: .init(sentimentTilt: 1)))
    #expect(abs(bullish.meta.bullMult - 1.2) < 1e-9 && abs(bullish.meta.bearMult - 0.8) < 1e-9)
    let last = bullish.base.count - 1
    let up = log(bullish.bull[last].value / bullish.base[last].value)
    let down = log(bullish.base[last].value / bullish.bear[last].value)
    #expect(abs(up / down - 1.2 / 0.8) < 1e-6)
  }

  @Test func ignoresInvalidPoints() throws {
    let pts = Self.series(60) { 100 + Double($0) }
    var dirty = Array(pts[..<30])
    dirty.append(.init(timeEpochSec: pts[30].timeEpochSec, close: -5))
    dirty.append(.init(timeEpochSec: pts[10].timeEpochSec, close: 100))
    dirty.append(contentsOf: pts[30...])
    let r = try #require(PriceProjection.compute(dirty))
    let clean = try #require(PriceProjection.compute(pts))
    #expect(r.base == clean.base)
  }
}

@Suite struct ChartSeriesTests {
  @Test func bucketizeMarketChart() throws {
    let prices = (0..<10).map { ChartSeries.RawPoint(time: Double(1_700_000_000 + $0 * 1800), value: 100 + Double($0)) }
    let vols = prices.map { ChartSeries.RawPoint(time: $0.time, value: 10) }
    let d = try #require(ChartSeries.bucketizeMarketChart(prices: prices, volumes: vols, marketCaps: [], bucketSeconds: 3600))
    #expect(d.ohlc.count == 5)
    #expect(d.ohlc[0].open == 100 && d.ohlc[0].close == 101 && d.ohlc[0].high == 101)
    #expect(d.volume[0].value == 20)
  }

  @Test func upsertLatest() {
    var d = ParsedChartData(line: [TimePoint(epochSeconds: 1000, value: 10)], volume: [TimePoint(epochSeconds: 1000, value: 0)],
                            ohlc: [OHLCVBar(time: 1000, open: 9, high: 10, low: 9, close: 10)], marketCap: [])
    d = ChartSeries.upsertLatestPrice(d, latestPrice: 12, atEpochSeconds: 1100)
    #expect(d.line.count == 1 && d.line[0].value == 12 && d.ohlc[0].high == 12)
    d = ChartSeries.upsertLatestPrice(d, latestPrice: 13, atEpochSeconds: 1000 + 600)
    #expect(d.line.count == 2)
  }

  @Test func metricsAndPyth() {
    #expect(MarketMetrics.fdvUsd(priceUsd: 2, maxSupply: 10) == 20)
    #expect(MarketMetrics.fdvUsd(priceUsd: 2, maxSupply: nil) == nil)
    #expect(MarketMetrics.turnoverPct(volume24hUsd: 5, marketCapUsd: 100) == 5)
    let tick = PythHermes.normalize(.init(id: "0xabc123", price: .init(price: "1000000000", conf: "25000000", expo: -8, publish_time: 1_730_000_000)))
    #expect(tick?.feedId == "abc123")
    #expect(abs((tick?.priceUsd ?? 0) - 10) < 1e-9)
    #expect(abs((tick?.confidenceUsd ?? 0) - 0.25) < 1e-9)
    #expect(tick?.publishTimeMs == 1_730_000_000_000)
    #expect(PythHermes.normalize(.init(id: "f", price: .init(price: "0", conf: "0", expo: 0, publish_time: 1))) == nil)
    let frame = PythHermes.parseSseDataLine(#"data: {"parsed":[{"id":"a","price":{"price":"1","conf":"0","expo":0,"publish_time":1}},{"id":"b","price":{"price":"2","conf":"0","expo":0,"publish_time":1}}]}"#)
    #expect(frame?.count == 2)
  }
}
