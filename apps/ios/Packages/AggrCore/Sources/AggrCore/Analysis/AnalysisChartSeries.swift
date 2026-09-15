import Foundation

/// Analysis sidebar chart preparation, matching `multi-mini-price-chart.tsx`.
public enum AnalysisChartSeries {
  public struct Line: Sendable, Hashable, Identifiable {
    public let id: String
    public let symbol: String
    public let points: [TimePoint]
    public init(id: String, symbol: String, points: [TimePoint]) {
      self.id = id; self.symbol = symbol; self.points = points
    }
  }

  /// Deduplicate timestamps and remove invalid observations before drawing or deriving a baseline.
  public static func clean(_ points: [TimePoint], allowsZero: Bool = false) -> [TimePoint] {
    var values: [Int: Double] = [:]
    for point in points where point.value.isFinite && (allowsZero ? point.value >= 0 : point.value > 0) {
      values[point.epochSeconds] = point.value
    }
    return values.keys.sorted().map { TimePoint(epochSeconds: $0, value: values[$0]!) }
  }

  public static func normalized(_ lines: [Line]) -> [Line] {
    guard lines.count >= 2 else { return [] }
    let fine = aligned(lines, bucket: 4 * 3600)
    if fine.count == lines.count, (fine.first?.points.count ?? 0) >= 8 { return fine }
    let daily = aligned(lines, bucket: 86_400)
    return daily.count == lines.count ? daily : fine
  }

  private static func aligned(_ lines: [Line], bucket: Int) -> [Line] {
    let buckets: [[Int: Double]] = lines.map { line in
      var values: [Int: Double] = [:]
      for p in clean(line.points) { values[Int(floor(Double(p.epochSeconds) / Double(bucket)))] = p.value }
      return values
    }
    var common = Set(buckets[0].keys)
    for values in buckets.dropFirst() { common.formIntersection(values.keys) }
    guard let last = common.max() else { return [] }
    let window = common.filter { $0 > last - 7 * 86_400 / bucket }.sorted()
    guard window.count >= 2 else { return [] }
    return lines.enumerated().map { i, line in
      let base = buckets[i][window[0]]!
      return Line(id: line.id, symbol: line.symbol, points: window.map {
        TimePoint(epochSeconds: $0 * bucket, value: (buckets[i][$0]! / base - 1) * 100)
      })
    }
  }
}
