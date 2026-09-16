import Foundation
import Testing
@testable import AggrCore

/// Regenerate golden data with scripts/generate-indicator-parity.ts; do not derive expectations from Swift.
@Suite struct IndicatorWebParityTests {
  struct Fixture: Decodable {
    let name: String
    let bars: [OHLCVBar]
    let series: [String: [[Double?]]]
    let events: [String: [Int]]
    let divergences: [String: [Divergence]]
    let pivots: [Pivot]
    let alerts: Alerts
  }
  struct Divergence: Decodable {
    let type: String
    let startIndex: Int, endIndex: Int, startTime: Int, endTime: Int
    let priceStart: Double, priceEnd: Double
    let oscStart: Double?, oscEnd: Double?, rsiStart: Double?, rsiEnd: Double?
  }
  struct Pivot: Decodable { let index: Int, time: Int; let value: Double; let kind: String }
  struct Alerts: Decodable { let high: Double, low: Double; let highOn: Bool, lowOn: Bool }

  @Test func everySeriesAndSignalMatchesWeb() throws {
    let url = try #require(Bundle.module.url(forResource: "indicator-web-parity", withExtension: "json"))
    let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    for fixture in fixtures {
      let mv = MarketVision.compute(fixture.bars)
      let bb = BollingerBands.calculate(fixture.bars)
      let bw = BBWP.calculate(fixture.bars)
      let rsi = RsiDivergences.calculate(fixture.bars)
      var series: [String: [[Double?]]] = [:]
      for (prefix, value) in [("mv", mv.series as Any), ("bb", bb as Any), ("bw", bw as Any), ("rsi", rsi as Any)] {
        for child in Mirror(reflecting: value).children {
          guard let name = child.label else { continue }
          if let points = child.value as? [ColoredPoint] {
            series["\(prefix).\(name)"] = points.map { [Double($0.time), $0.value.isFinite ? $0.value : nil] }
          } else if let points = child.value as? [TimePoint] {
            series["\(prefix).\(name)"] = points.map { [Double($0.epochSeconds), $0.value.isFinite ? $0.value : nil] }
          }
        }
      }
      series["rsi.reverseLevels"] = rsi.reverseLevels.map { [$0.target, $0.price] }
      series["rsi.signalCurrent"] = [[0, rsi.signalCurrent]]
      series["rsi.reverseSignalCross"] = [[0, rsi.reverseSignalCross]]
      for (key, expected) in fixture.series {
        let actual = try #require(series[key], "\(fixture.name): \(key)")
        #expect(actual.count == expected.count, "\(fixture.name): \(key) count")
        for (a, e) in zip(actual, expected) {
          #expect(a[0] == e[0], "\(fixture.name): \(key) timestamp")
          close(a[1], e[1], "\(fixture.name): \(key) at \(e[0] ?? 0)")
        }
      }
      for child in Mirror(reflecting: mv.events).children {
        guard let key = child.label, let events = child.value as? [MarketVisionEvent] else { continue }
        #expect(events.map(\.index) == fixture.events[key], "\(fixture.name): \(key) events")
      }
      for (key, actual) in [("mv.wt", mv.wtDivergences), ("mv.rsi", mv.rsiDivergences), ("mv.stoch", mv.stochDivergences)] {
        let expected = try #require(fixture.divergences[key])
        #expect(actual.count == expected.count)
        for (a, e) in zip(actual, expected) {
          #expect(a.type.rawValue == e.type && a.startIndex == e.startIndex && a.endIndex == e.endIndex)
          #expect(a.startTime == e.startTime && a.endTime == e.endTime)
          close(a.oscStart, e.oscStart, key); close(a.oscEnd, e.oscEnd, key)
          close(a.priceStart, e.priceStart, key); close(a.priceEnd, e.priceEnd, key)
        }
      }
      let expectedDivs = try #require(fixture.divergences["rsi"])
      #expect(rsi.divergences.count == expectedDivs.count)
      for (a, e) in zip(rsi.divergences, expectedDivs) {
        #expect(a.type.rawValue == e.type && a.startTime == e.startTime && a.endTime == e.endTime)
        close(a.rsiStart, e.rsiStart, "RSI divergence"); close(a.rsiEnd, e.rsiEnd, "RSI divergence")
        close(a.priceStart, e.priceStart, "RSI divergence"); close(a.priceEnd, e.priceEnd, "RSI divergence")
      }
      #expect(rsi.pivots.count == fixture.pivots.count)
      for (a, e) in zip(rsi.pivots, fixture.pivots) {
        #expect(a.index == e.index && a.time == e.time && a.isHigh == (e.kind == "high"))
        close(a.value, e.value, "pivot")
      }
      #expect(rsi.alertHigh == fixture.alerts.high && rsi.alertLow == fixture.alerts.low)
      #expect(rsi.alertHighOn == fixture.alerts.highOn && rsi.alertLowOn == fixture.alerts.lowOn)
    }
  }

  private func close(_ actual: Double?, _ expected: Double?, _ context: String) {
    if let actual, let expected {
      #expect(abs(actual - expected) < 1e-7, Comment(rawValue: context))
    } else { #expect(actual == nil && expected == nil, Comment(rawValue: context)) }
  }
}

@Suite struct IndicatorPlotScaleTests {
  @Test func visibleCandlesDetermineBollingerScale() {
    let points: [TimePoint] = [.init(epochSeconds: 0, value: 900), .init(epochSeconds: 100, value: -8), .init(epochSeconds: 200, value: 108)]
    let domain = IndicatorPlotScale.domain(points: points, visible: 100...200)
    #expect(domain.lowerBound == -22.5 && domain.upperBound == 122.5)
    #expect(domain.contains(-8) && domain.contains(108))
  }

  @Test func scaleMarginsPreserveWebGeometry() {
    let domain = IndicatorPlotScale.domain(points: [], visible: 0...1, anchors: [0, 100], margin: 0.15)
    #expect(abs(domain.lowerBound + 100 * 0.15 / 0.7) < 1e-9)
    #expect(abs(domain.upperBound - (100 + 100 * 0.15 / 0.7)) < 1e-9)
    let mv = IndicatorPlotScale.domain(points: [], visible: 0...1, anchors: [-108, 108])
    #expect(mv.lowerBound == -135 && mv.upperBound == 135)
    let flat = IndicatorPlotScale.domain(points: [.init(epochSeconds: 1, value: 50)], visible: 0...1)
    #expect(flat.lowerBound < 50 && flat.upperBound > 50)
  }

  @Test func volatilityUsesWebStopsAndRoundedValues() {
    let expected = ["oklch(0.452 0.3132 264.05)", "oklch(0.9054 0.1546 194.77)", "oklch(0.8664 0.2948 142.5)", "oklch(0.968 0.211 109.77)", "oklch(0.628 0.2577 29.23)"]
    for (index, color) in expected.enumerated() {
      #expect(OklchColor.parse(IndicatorPlotScale.volatilityColor(Double(index * 25))) == OklchColor.parse(color))
    }
    #expect(IndicatorPlotScale.volatilityColor(24.6) == IndicatorPlotScale.volatilityColor(25))
    #expect(IndicatorPlotScale.volatilityColor(-10) == IndicatorPlotScale.volatilityColor(0))
  }
}
