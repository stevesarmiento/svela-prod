import Foundation

/// Port of `floating-market-feed-utils.ts`.
public enum MarketFeed {
  public static let sizeOptions = [15, 25, 50]
  public static let defaultSize = 25
  public static let lastSeenLimit = 100

  public static func isValidSize(_ v: Int) -> Bool { sizeOptions.contains(v) }

  public static func nextSize(_ current: Int) -> Int {
    guard let i = sizeOptions.firstIndex(of: current) else { return sizeOptions[0] }
    return sizeOptions[(i + 1) % sizeOptions.count]
  }

  public static func sanitizeSize(_ v: Int?) -> Int { v.flatMap { isValidSize($0) ? $0 : nil } ?? defaultSize }

  public static func sanitizeLastSeen(_ raw: [String: Double]) -> [String: Double] {
    raw.filter { $0.value.isFinite && $0.value > 0 }
  }

  /// Newest-wins per coin; evicts least-recently-seen past `limit`.
  public static func recordLastSeen(_ map: [String: Double], coinId: String, seenAtMs: Double, limit: Int = lastSeenLimit) -> [String: Double] {
    guard !coinId.isEmpty, seenAtMs.isFinite, seenAtMs > 0 else { return map }
    var next = map
    next[coinId] = max(seenAtMs, map[coinId] ?? 0)
    if next.count <= limit { return next }
    let evict = next.sorted { $0.value < $1.value }.prefix(next.count - limit)
    for (k, _) in evict { next[k] = nil }
    return next
  }

  public static func countUnseen(postedAtMs: [Double?], lastSeenMs: Double) -> Int {
    postedAtMs.reduce(0) { acc, t in (t.map { $0.isFinite && $0 > lastSeenMs } ?? false) ? acc + 1 : acc }
  }
}
