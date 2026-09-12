import Foundation

/// Port of `use-screener-url-state.ts` + `use-screener-results.ts` helpers. Keeps deep links interoperable with the web.
public enum ScreenerSortKey: String, Sendable, CaseIterable, Codable { case name, price, marketCap, volume, change }

public struct ScreenerSort: Sendable, Hashable, Codable {
  public var key: ScreenerSortKey
  public var desc: Bool
  public init(key: ScreenerSortKey, desc: Bool) { self.key = key; self.desc = desc }

  /// "marketCap.desc"
  public static func parse(_ raw: String) -> ScreenerSort? {
    let parts = raw.split(separator: ".").map(String.init)
    guard parts.count == 2, let key = ScreenerSortKey(rawValue: parts[0]), parts[1] == "asc" || parts[1] == "desc" else { return nil }
    return ScreenerSort(key: key, desc: parts[1] == "desc")
  }
  public var serialized: String { "\(key.rawValue).\(desc ? "desc" : "asc")" }

  public static let sortKeyToMetricId: [ScreenerSortKey: String?] = [.name: nil, .price: "price_usd", .marketCap: "market_cap_usd", .volume: "volume_24h_usd", .change: "price_change_24h_pct"]
  public static let metricIdToSortKey: [String: ScreenerSortKey] = ["price_usd": .price, "market_cap_usd": .marketCap, "volume_24h_usd": .volume, "price_change_24h_pct": .change]
}

public enum ScreenerUrlCodec {
  /// Compact tuple form `{f:[[metric,op,value]], s:[metric,order], l, u, t:[range,exchange]}`; defaults omitted.
  public static func encode(_ dsl: ScreeningDsl) -> String {
    var obj: [String: Any] = [:]
    if !dsl.filters.isEmpty { obj["f"] = dsl.filters.map { [$0.metricId, $0.op.rawValue, $0.value] as [Any] } }
    if let s = dsl.sort { obj["s"] = [s.metricId, s.order.rawValue] }
    if dsl.limit != ScreeningDsl.defaultLimit { obj["l"] = dsl.limit }
    if dsl.universe != .all { obj["u"] = dsl.universe.rawValue }
    if let t = dsl.takerContext { obj["t"] = [t.range, t.exchange as Any? ?? NSNull()] }
    // Deterministic key order like JSON.stringify of the object literal (f, s, l, u, t).
    var parts: [String] = []
    for key in ["f", "s", "l", "u", "t"] {
      guard let v = obj[key], let data = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed]), let s = String(data: data, encoding: .utf8) else { continue }
      parts.append("\"\(key)\":\(s)")
    }
    return "{\(parts.joined(separator: ","))}"
  }

  /// FAIL-CLOSED: any garbage → nil (browse mode).
  public static func decode(_ raw: String) -> ScreeningDsl? {
    guard let data = raw.data(using: .utf8), let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
    var filters: [ScreenFilter] = []
    if let f = obj["f"] {
      guard let arr = f as? [[Any]] else { return nil }
      for tuple in arr {
        guard tuple.count >= 3, let id = tuple[0] as? String, let opRaw = tuple[1] as? String, let op = ScreenFilterOp(rawValue: opRaw) else { return nil }
        let filter: ScreenFilter?
        if let n = tuple[2] as? NSNumber { filter = try? ScreeningDslParser.parseFilter(metricId: id, op: op, value: n.doubleValue) }
        else if let s = tuple[2] as? String { filter = try? ScreeningDslParser.parseFilter(metricId: id, op: op, rawValue: s) }
        else { filter = nil }
        guard let filter else { return nil }
        filters.append(filter)
      }
    }
    var sort: ScreenSort? = nil
    if let s = obj["s"], !(s is NSNull) {
      guard let arr = s as? [Any], arr.count == 2, let id = arr[0] as? String, let o = arr[1] as? String, let order = ScreenSort.Order(rawValue: o), MetricCatalog.metric(id) != nil else { return nil }
      sort = ScreenSort(metricId: id, order: order)
    }
    var limit = ScreeningDsl.defaultLimit
    if let l = obj["l"] { guard let n = l as? NSNumber else { return nil }; limit = n.intValue }
    var universe = ScreenUniverse.all
    if let u = obj["u"] { guard let s = u as? String, let un = ScreenUniverse(rawValue: s) else { return nil }; universe = un }
    var taker: TakerContext? = nil
    if let t = obj["t"], !(t is NSNull) {
      guard let arr = t as? [Any], arr.count >= 1, let range = arr[0] as? String, MetricCatalog.takerRanges.contains(range) else { return nil }
      let ex = arr.count > 1 ? (arr[1] as? String) : nil
      taker = TakerContext(range: range, exchange: (ex?.isEmpty ?? true) ? nil : ex)
    }
    return try? ScreeningDslParser.validate(ScreeningDsl(filters: filters, sort: sort, limit: limit, universe: universe, takerContext: taker))
  }

  /// `mergeSortIntoDsl`: header-click sort becomes a server-side DSL sort ("name" has no metric).
  public static func mergeSort(_ dsl: ScreeningDsl, sort: ScreenerSort?) -> ScreeningDsl {
    guard let sort, let metricId = ScreenerSort.sortKeyToMetricId[sort.key] ?? nil else { return dsl }
    var out = dsl
    out.sort = ScreenSort(metricId: metricId, order: sort.desc ? .desc : .asc)
    return out
  }

  /// `canonicalDslKey`
  public static func canonicalKey(_ dsl: ScreeningDsl) -> String {
    "f:\(dsl.filters.map { "\($0.metricId)|\($0.op.rawValue)|\($0.value)" }.joined(separator: ","))|s:\(dsl.sort.map { "\($0.metricId).\($0.order.rawValue)" } ?? "-")|l:\(dsl.limit)|u:\(dsl.universe.rawValue)|t:\(dsl.takerContext.map { "\($0.range).\($0.exchange ?? "")" } ?? "-")"
  }
}
