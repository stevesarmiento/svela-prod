import AggrCore
import Testing
@testable import AggrAPI

@Suite struct AnalysisReadinessTests {
  @Test func missingVolumeDoesNotBecomeValidHistory() throws {
    let line = (0..<40).map { TimePoint(epochSeconds: $0 * 14400, value: 100 + Double($0)) }
    #expect(throws: AnalysisDataService.Failure.self) {
      try AnalysisDataService.validateHistory(line: line, rawVolume: [], bucketSeconds: 14400)
    }
    let realZeros = line.map { ChartSeries.RawPoint(time: Double($0.epochSeconds), value: 0) }
    try AnalysisDataService.validateHistory(line: line, rawVolume: realZeros, bucketSeconds: 14400)
    #expect(throws: AnalysisDataService.Failure.self) {
      try AnalysisDataService.validateHistory(line: line, rawVolume: Array(realZeros.prefix(29)), bucketSeconds: 14400)
    }
    let unrelated = realZeros.map { ChartSeries.RawPoint(time: $0.time + 100 * 86400, value: 100) }
    #expect(throws: AnalysisDataService.Failure.self) {
      try AnalysisDataService.validateHistory(line: line, rawVolume: unrelated, bucketSeconds: 14400)
    }
  }
}
