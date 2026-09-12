import Foundation

/// `{ time, value }` series point. `epochSeconds` keeps the web convention (CoinGecko market-chart timestamps are seconds).
public struct TimePoint: Sendable, Hashable, Codable {
  public var epochSeconds: Int
  public var value: Double

  public init(epochSeconds: Int, value: Double) {
    self.epochSeconds = epochSeconds
    self.value = value
  }

  public var date: Date { Date(timeIntervalSince1970: TimeInterval(epochSeconds)) }

  /// `normalizeChartTime`: values > 1e10 are milliseconds.
  public static func normalizeEpochSeconds(_ t: Double) -> Int {
    t > 1e10 ? Int(t / 1000) : Int(t)
  }
}
