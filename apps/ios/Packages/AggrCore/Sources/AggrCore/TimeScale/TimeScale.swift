import Foundation

/// Stringly-typed on the web (`"1d" | "7d" | "30d" | "max" | "2y"`); a real enum here.
/// Mappings from `use-coingecko-watchlist-aggregate-chart-isolated.ts`, `use-coingecko-chart-data.ts`,
/// `use-holdings-value-over-time.ts`, `use-global-market-cap-over-time.ts`.
public enum TimeScale: String, Sendable, CaseIterable, Codable, Hashable, Identifiable {
  case d1 = "1d"
  case d7 = "7d"
  case d30 = "30d"
  case max = "max"
  case y2 = "2y"

  public var id: String { rawValue }

  /// Display labels used by the segmented selectors (1D / 1W / 1M / 1Y / 2Y).
  public var label: String {
    switch self {
    case .d1: "1D"
    case .d7: "1W"
    case .d30: "1M"
    case .max: "1Y"
    case .y2: "2Y"
    }
  }

  /// Overview + watchlist chart selector: 1D/1W/1M/1Y.
  public static let overviewScales: [TimeScale] = [.d1, .d7, .d30, .max]
  /// Compare selector: 1D/1W/1Y.
  public static let compareScales: [TimeScale] = [.d1, .d7, .max]
  /// Mobile token price chart: 1D/1W/1M/1Y.
  public static let tokenScales: [TimeScale] = [.d1, .d7, .d30, .max]

  /// `getRangeDaysFromTimeScale`
  public var rangeDays: Int {
    switch self {
    case .d1: 1
    case .d7: 7
    case .d30: 30
    case .max: 365
    case .y2: 730
    }
  }

  /// `getBucketMsFromTimeScale`
  public var bucketMs: Int {
    switch self {
    case .d1: 15 * 60 * 1000
    case .d7: 2 * 60 * 60 * 1000
    case .d30: 12 * 60 * 60 * 1000
    case .max, .y2: 24 * 60 * 60 * 1000
    }
  }

  /// `getDaysFromTimeScale` for `/api/coingecko/market-chart?days=` in list/aggregate contexts.
  public var marketChartDaysParam: String {
    switch self {
    case .d1: "1"
    case .d7: "7"
    case .d30: "30"
    case .max: "365"
    case .y2: "max"
    }
  }

  /// `TIMEFRAME_CONFIG` in `use-coingecko-chart-data.ts` for the token price chart
  /// (`30d → 90 days`, `max → 365`, `2y → max`).
  public var tokenChartDaysParam: String {
    switch self {
    case .d1: "1"
    case .d7: "7"
    case .d30: "90"
    case .max: "365"
    case .y2: "max"
    }
  }

  /// `/api/coingecko/global-market-cap?days=` supports 1/7/30/365 only.
  public var globalMarketCapDaysParam: String {
    switch self {
    case .d1: "1"
    case .d7: "7"
    case .d30: "30"
    case .max, .y2: "365"
    }
  }

  /// Aggregate-change is unavailable for 2Y on list surfaces (web shows "N/A").
  public var isAggregateChangeUnavailable: Bool { self == .y2 }

  public static func floorToBucket(_ timeMs: Int, bucketMs: Int) -> Int {
    (timeMs / bucketMs) * bucketMs
  }

  /// `getWatchlistAggregateRangeEndMs`: shared range end so bucket windows line up.
  public func rangeEndMs(now: Date = Date()) -> Int {
    TimeScale.floorToBucket(Int(now.timeIntervalSince1970 * 1000), bucketMs: bucketMs)
  }

  /// `buildBucketTimesMs`
  public static func bucketTimesMs(start: Int, end: Int, bucketMs: Int) -> [Int] {
    guard bucketMs > 0, end >= start else { return [] }
    return Array(stride(from: start, through: end, by: bucketMs))
  }
}
