import Foundation

/// Port of `lib/overview-performance.ts`.
public enum OverviewPerformance {
  static func normalize(_ points: [TimePoint]) -> [TimePoint] {
    var byTime: [Int: Double] = [:]
    for p in points where p.value.isFinite { byTime[p.epochSeconds] = p.value }
    return byTime.keys.sorted().map { TimePoint(epochSeconds: $0, value: byTime[$0]!) }
  }

  /// Forward-fill sparse source points onto denser bucket times (positive values only carry).
  public static func forwardFill(source: [TimePoint], bucketTimesSec: [Int]) -> [TimePoint] {
    let src = normalize(source)
    guard !src.isEmpty, !bucketTimesSec.isEmpty else { return [] }
    var out: [TimePoint] = []
    var cursor = 0
    var last: Double? = nil
    for t in bucketTimesSec {
      while cursor < src.count && src[cursor].epochSeconds <= t {
        let v = src[cursor].value
        if v.isFinite && v > 0 { last = v }
        cursor += 1
      }
      if let last { out.append(TimePoint(epochSeconds: t, value: last)) }
    }
    return out
  }

  public static func rebaseFromFirstPoint(_ points: [TimePoint]) -> [TimePoint] {
    let n = normalize(points).filter { $0.value > 0 }
    guard let baseline = n.first?.value, baseline.isFinite, baseline > 0 else { return [] }
    return n.map { TimePoint(epochSeconds: $0.epochSeconds, value: $0.value / baseline * 100) }
  }

  /// Nearest point value (binary search; ties prefer the left neighbour).
  public static func valueAt(_ points: [TimePoint], time target: Int) -> Double? {
    let n = normalize(points)
    guard !n.isEmpty else { return nil }
    var lo = 0, hi = n.count - 1
    while lo <= hi {
      let mid = (lo + hi) / 2
      if n[mid].epochSeconds == target { return n[mid].value }
      if n[mid].epochSeconds < target { lo = mid + 1 } else { hi = mid - 1 }
    }
    let right = lo < n.count ? n[lo] : nil
    let left = lo - 1 >= 0 ? n[lo - 1] : nil
    switch (left, right) {
    case (nil, nil): return nil
    case (nil, let r?): return r.value
    case (let l?, nil): return l.value
    case (let l?, let r?): return abs(l.epochSeconds - target) <= abs(r.epochSeconds - target) ? l.value : r.value
    }
  }

  public struct RebasedComparison: Sendable, Hashable {
    public var baselineTime: Int?
    public var portfolioPoints: [TimePoint]
    public var marketPoints: [TimePoint]
    public var portfolioReturnPct: Double?
    public var marketReturnPct: Double?
    public var outperformancePct: Double?
    public static let empty = RebasedComparison(baselineTime: nil, portfolioPoints: [], marketPoints: [], portfolioReturnPct: nil, marketReturnPct: nil, outperformancePct: nil)
  }

  /// Rebase both series to 100 at the first overlapping valid point.
  public static func buildRebasedComparison(portfolio: [TimePoint], market: [TimePoint]) -> RebasedComparison {
    let p = normalize(portfolio).filter { $0.value > 0 }
    let m = normalize(market).filter { $0.value > 0 }
    guard !p.isEmpty, !m.isEmpty else { return .empty }
    let marketByTime = Dictionary(m.map { ($0.epochSeconds, $0.value) }, uniquingKeysWith: { a, _ in a })
    let portfolioByTime = Dictionary(p.map { ($0.epochSeconds, $0.value) }, uniquingKeysWith: { a, _ in a })
    guard let baseP = p.first(where: { (marketByTime[$0.epochSeconds] ?? 0) > 0 }) else { return .empty }
    let baselineTime = baseP.epochSeconds
    let baseM = marketByTime[baselineTime]!
    guard baseP.value > 0, baseM > 0 else { return .empty }
    let common = p.filter { $0.epochSeconds >= baselineTime && marketByTime[$0.epochSeconds] != nil }.map(\.epochSeconds)
    let pp = common.map { TimePoint(epochSeconds: $0, value: (portfolioByTime[$0] ?? baseP.value) / baseP.value * 100) }
    let mp = common.map { TimePoint(epochSeconds: $0, value: (marketByTime[$0] ?? baseM) / baseM * 100) }
    let pr = pp.last.map { $0.value - 100 }
    let mr = mp.last.map { $0.value - 100 }
    let out: Double? = (pr != nil && mr != nil) ? pr! - mr! : nil
    return RebasedComparison(baselineTime: baselineTime, portfolioPoints: pp, marketPoints: mp, portfolioReturnPct: pr, marketReturnPct: mr, outperformancePct: out)
  }

  /// Nearest series time to a target (for scrub → onHover). Ties prefer the left neighbour.
  public static func closestTime(_ points: [TimePoint], to target: Int) -> Int? {
    guard !points.isEmpty else { return nil }
    let sorted = points.sorted { $0.epochSeconds < $1.epochSeconds }
    var lo = 0, hi = sorted.count - 1
    while lo <= hi {
      let mid = (lo + hi) / 2
      if sorted[mid].epochSeconds == target { return target }
      if sorted[mid].epochSeconds < target { lo = mid + 1 } else { hi = mid - 1 }
    }
    let right = lo < sorted.count ? sorted[lo].epochSeconds : nil
    let left = lo - 1 >= 0 ? sorted[lo - 1].epochSeconds : nil
    switch (left, right) {
    case (nil, nil): return nil
    case (nil, let r?): return r
    case (let l?, nil): return l
    case (let l?, let r?): return abs(l - target) <= abs(r - target) ? l : r
    }
  }
}
