import Foundation

/// Port of `lib/smart-screener/screening-dsl.ts`.
public enum ScreenFilterOp: String, Sendable, Codable, CaseIterable, Hashable {
  case gt, gte, lt, lte, eq

  public var symbol: String {
    switch self { case .gt: ">"; case .gte: "≥"; case .lt: "<"; case .lte: "≤"; case .eq: "=" }
  }
  public var label: String {
    switch self { case .gt: "greater than"; case .lt: "less than"; case .gte: "greater than or equal"; case .lte: "less than or equal"; case .eq: "equal to" }
  }
}

public struct ScreenFilter: Sendable, Hashable, Codable {
  public var metricId: String
  public var op: ScreenFilterOp
  public var value: Double
  public init(metricId: String, op: ScreenFilterOp, value: Double) { self.metricId = metricId; self.op = op; self.value = value }
}

public struct ScreenSort: Sendable, Hashable, Codable {
  public enum Order: String, Sendable, Codable { case asc, desc }
  public var metricId: String
  public var order: Order
  public init(metricId: String, order: Order) { self.metricId = metricId; self.order = order }
}

public enum ScreenUniverse: String, Sendable, Codable { case all, current, watchlist }

public struct TakerContext: Sendable, Hashable, Codable {
  public var range: String
  public var exchange: String?
  public init(range: String = "24h", exchange: String? = nil) { self.range = range; self.exchange = exchange }
}

public struct ScreeningDsl: Sendable, Hashable, Codable {
  public var filters: [ScreenFilter]
  public var sort: ScreenSort?
  public var limit: Int
  public var universe: ScreenUniverse
  public var takerContext: TakerContext?

  public static let defaultLimit = 250

  public init(filters: [ScreenFilter] = [], sort: ScreenSort? = nil, limit: Int = ScreeningDsl.defaultLimit, universe: ScreenUniverse = .all, takerContext: TakerContext? = nil) {
    self.filters = filters; self.sort = sort; self.limit = limit; self.universe = universe; self.takerContext = takerContext
  }

  enum CodingKeys: String, CodingKey { case filters, sort, limit, universe, takerContext }

  /// Lenient decoding mirrors the zod defaults (`limit: null → 250`, missing universe → all).
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    filters = try c.decodeIfPresent([ScreenFilter].self, forKey: .filters) ?? []
    sort = try c.decodeIfPresent(ScreenSort.self, forKey: .sort)
    limit = (try c.decodeIfPresent(Double.self, forKey: .limit)).map { Int($0) } ?? ScreeningDsl.defaultLimit
    universe = try c.decodeIfPresent(ScreenUniverse.self, forKey: .universe) ?? .all
    takerContext = try c.decodeIfPresent(TakerContext.self, forKey: .takerContext)
  }

  public var usesTakerMetrics: Bool {
    filters.contains { MetricCatalog.metric($0.metricId)?.source == .taker } || (sort.map { MetricCatalog.metric($0.metricId)?.source == .taker } ?? false)
  }
}

public enum ScreeningDslError: LocalizedError, Sendable, Equatable {
  case unknownMetric(String)
  case notANumber
  case usdMustBeNonNegative
  case ratioOutOfRange
  case rankMustBeInteger
  case tooManyFilters
  case limitOutOfRange

  public var errorDescription: String? {
    switch self {
    case .unknownMetric(let id): "Unknown metricId: \(id)"
    case .notANumber: "Value must be a finite number"
    case .usdMustBeNonNegative: "USD value must be >= 0"
    case .ratioOutOfRange: "Ratio must be 0..1 (or a % like 55%)"
    case .rankMustBeInteger: "Rank must be an integer >= 1"
    case .tooManyFilters: "At most 20 filters"
    case .limitOutOfRange: "Limit must be 1..500"
    }
  }
}

public enum ScreeningDslParser {
  /// Canonical value normalization — the ONLY place filter values are transformed:
  /// ratio values > 1 are percent input → ÷100; percent has NO magnitude heuristic.
  public static func normalize(unit: MetricUnit, value: Double) -> Double {
    guard value.isFinite else { return value }
    if unit == .ratio && value > 1 { return value / 100 }
    return value
  }

  /// `ScreenFilterSchema`: coerce raw (string or number) → normalize by unit → validate.
  public static func parseFilter(metricId: String, op: ScreenFilterOp, rawValue: String) throws -> ScreenFilter {
    guard let metric = MetricCatalog.metric(metricId) else { throw ScreeningDslError.unknownMetric(metricId) }
    guard let coerced = NumberCoercions.coerce(rawValue) else { throw ScreeningDslError.notANumber }
    return try validate(ScreenFilter(metricId: metricId, op: op, value: normalize(unit: metric.unit, value: coerced)), metric: metric)
  }

  public static func parseFilter(metricId: String, op: ScreenFilterOp, value: Double) throws -> ScreenFilter {
    guard let metric = MetricCatalog.metric(metricId) else { throw ScreeningDslError.unknownMetric(metricId) }
    return try validate(ScreenFilter(metricId: metricId, op: op, value: normalize(unit: metric.unit, value: value)), metric: metric)
  }

  static func validate(_ f: ScreenFilter, metric: MetricDefinition) throws -> ScreenFilter {
    guard f.value.isFinite else { throw ScreeningDslError.notANumber }
    switch metric.unit {
    case .usd: if f.value < 0 && !metric.allowNegative { throw ScreeningDslError.usdMustBeNonNegative }
    case .ratio: if f.value < 0 || f.value > 1 { throw ScreeningDslError.ratioOutOfRange }
    case .rank: if f.value != f.value.rounded() || f.value < 1 { throw ScreeningDslError.rankMustBeInteger }
    default: break
    }
    return f
  }

  /// Validate a whole DSL (all filters through the schema, sort metric known, limit 1..500).
  public static func validate(_ dsl: ScreeningDsl) throws -> ScreeningDsl {
    guard dsl.filters.count <= 20 else { throw ScreeningDslError.tooManyFilters }
    var out = dsl
    out.filters = try dsl.filters.map { try parseFilter(metricId: $0.metricId, op: $0.op, value: $0.value) }
    if let s = dsl.sort, MetricCatalog.metric(s.metricId) == nil { throw ScreeningDslError.unknownMetric(s.metricId) }
    guard (1...500).contains(dsl.limit) else { throw ScreeningDslError.limitOutOfRange }
    if let t = dsl.takerContext, !MetricCatalog.takerRanges.contains(t.range) { out.takerContext = TakerContext(range: "24h", exchange: t.exchange) }
    return out
  }
}

public enum ScreeningDslFormat {
  static func trimZeros(_ s: String) -> String {
    var t = s
    if t.hasSuffix(".00") { t.removeLast(3) }
    return t
  }

  /// `formatCompactUsd`
  public static func compactUsd(_ value: Double) -> String {
    guard value.isFinite else { return "\(value)" }
    let abs = Swift.abs(value)
    let sign = value < 0 ? "-" : ""
    if abs == 0 { return "$0" }
    if abs >= 1e12 { return "\(sign)$\(trimZeros(String(format: "%.2f", abs / 1e12)))T" }
    if abs >= 1e9 { return "\(sign)$\(trimZeros(String(format: "%.2f", abs / 1e9)))B" }
    if abs >= 1e6 { return "\(sign)$\(trimZeros(String(format: "%.2f", abs / 1e6)))M" }
    if abs >= 1e3 { return "\(sign)$\(trimZeros(String(format: "%.2f", abs / 1e3)))K" }
    if abs >= 1 { return "\(sign)$\(trimZeros(String(format: "%.2f", abs)))" }
    if abs >= 0.01 {
      var s = String(format: "%.4f", abs)
      while s.hasSuffix("0") { s.removeLast() }
      if s.hasSuffix(".") { s.removeLast() }
      return "\(sign)$\(s)"
    }
    return "\(sign)$\(String(format: "%.2g", abs))"
  }

  public static func value(unit: MetricUnit, value: Double) -> String {
    switch unit {
    case .usd: compactUsd(value)
    case .percent: trimZeros(String(format: "%.2f", value)) + "%"
    case .rank: String(Int(value.rounded(.down)))
    case .ratio: String(format: "%.0f", value * 100) + "%"
    case .number: OklchColor.jsNumberString(value)
    }
  }

  /// "Market cap > $5M"
  public static func filter(_ f: ScreenFilter) -> String {
    let metric = MetricCatalog.metric(f.metricId)
    let label = metric?.label ?? f.metricId
    let v = metric.map { value(unit: $0.unit, value: f.value) } ?? OklchColor.jsNumberString(f.value)
    return "\(label) \(f.op.symbol) \(v)"
  }

  public static func summary(_ dsl: ScreeningDsl) -> String {
    var parts = dsl.filters.map(filter)
    if let s = dsl.sort {
      parts.append("Sort: \(MetricCatalog.metric(s.metricId)?.label ?? s.metricId) \(s.order == .desc ? "↓" : "↑")")
    }
    if dsl.usesTakerMetrics {
      let range = dsl.takerContext?.range ?? "24h"
      let ex = dsl.takerContext?.exchange
      parts.append("Taker: \(range)\(ex.map { " · \($0)" } ?? "")")
    }
    return parts.joined(separator: " • ")
  }

  /// `unitPlaceholder`
  public static func placeholder(unit: MetricUnit?) -> String {
    switch unit {
    case .usd?: "e.g. 200m or $1.5b"
    case .percent?: "percent points, e.g. 10"
    case .ratio?: "0..1 or 55%"
    case .rank?: "e.g. 100"
    default: "value"
    }
  }
}
