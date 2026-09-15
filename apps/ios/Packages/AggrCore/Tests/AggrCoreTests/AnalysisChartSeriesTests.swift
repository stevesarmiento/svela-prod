import Foundation
import Testing
@testable import AggrCore

@Test func analysisChartAlignsDifferentWindowsAndRebasesTogether() {
  let base = 1_700_006_400, step = 4 * 3600
  let a = (0..<60).map { TimePoint(epochSeconds: base + $0 * step, value: 100 + Double($0)) }
  let b = (3..<57).map { TimePoint(epochSeconds: base + $0 * step + 60, value: 200 + Double($0) * 4) }
  let lines = AnalysisChartSeries.normalized([.init(id: "a", symbol: "A", points: a), .init(id: "b", symbol: "B", points: b)])
  #expect(lines.count == 2)
  #expect(lines[0].points.map(\.epochSeconds) == lines[1].points.map(\.epochSeconds))
  #expect(lines.allSatisfy { $0.points.first?.value == 0 })
  #expect(lines[0].points.count == 42)
  #expect(lines[0].points.last!.epochSeconds - lines[0].points.first!.epochSeconds < 7 * 86_400)
  #expect(abs(lines[0].points.last!.value - (156.0 / 115 - 1) * 100) < 0.00001)
}

@Test func analysisChartDailyFallbackAndMissingOverlap() {
  let day = 86_400
  let a = (0..<10).map { TimePoint(epochSeconds: $0 * day, value: 100 + Double($0)) }
  let b = (0..<10).map { TimePoint(epochSeconds: $0 * day + 8 * 3600, value: 50 + Double($0)) }
  let lines = AnalysisChartSeries.normalized([.init(id: "a", symbol: "A", points: a), .init(id: "b", symbol: "B", points: b)])
  #expect(lines.count == 2)
  #expect(lines[0].points.count == 7)
  #expect(lines[0].points.map(\.epochSeconds) == lines[1].points.map(\.epochSeconds))
  let missing = AnalysisChartSeries.normalized([.init(id: "a", symbol: "A", points: a), .init(id: "b", symbol: "B", points: [.init(epochSeconds: 100 * day, value: 1)])])
  #expect(missing.isEmpty)
}

@Test func analysisChartCleansInvalidAndDuplicateObservationsWithoutInventingPrices() {
  let points: [TimePoint] = [.init(epochSeconds: 3, value: .nan), .init(epochSeconds: 2, value: 4),
    .init(epochSeconds: 1, value: 2), .init(epochSeconds: 2, value: 5), .init(epochSeconds: 4, value: 0),
    .init(epochSeconds: 5, value: -.infinity)]
  #expect(AnalysisChartSeries.clean(points).map(\.value) == [2, 5])
  #expect(AnalysisChartSeries.clean(points, allowsZero: true).map(\.value) == [2, 5, 0])
}

@Test func analysisComparisonSupportsFiveAssetsWithoutCrossingIdentities() {
  let lines = (0..<5).map { i in
    AnalysisChartSeries.Line(id: "token-\(i)", symbol: "T\(i)", points: (0..<60).map {
      TimePoint(epochSeconds: $0 * 14400, value: 100 + Double($0 * (i + 1)))
    })
  }
  let normalized = AnalysisChartSeries.normalized(lines)
  #expect(normalized.map(\.id) == lines.map(\.id))
  #expect(normalized.count == 5)
  #expect(normalized.allSatisfy { $0.points.count == 42 && $0.points.first?.value == 0 })
  #expect(Set(normalized.compactMap { $0.points.last?.value }).count == 5)
}
