import Foundation

/// Port of `pine-series.ts`.
public struct CandleSources: Sendable {
  public var open: [Double]
  public var high: [Double]
  public var low: [Double]
  public var close: [Double]
  public var hlc3: [Double]

  public init(_ bars: [OHLCVBar]) {
    open = bars.map(\.open); high = bars.map(\.high); low = bars.map(\.low); close = bars.map(\.close)
    hlc3 = bars.map { ($0.high + $0.low + $0.close) / 3 }
  }

  public init(open: [Double], high: [Double], low: [Double], close: [Double]) {
    self.open = open; self.high = high; self.low = low; self.close = close
    hlc3 = zip(zip(high, low), close).map { ($0.0 + $0.1 + $1) / 3 }
  }

  public func series(_ source: VmcSource) -> [Double] {
    switch source { case .open: open; case .high: high; case .low: low; case .close: close; case .hlc3: hlc3 }
  }
}

public enum VmcSource: String, Sendable, Codable { case open, high, low, close, hlc3 }

public enum PineSeries {
  /// `cross(a, b)`: true when a crosses b between bar i-1 and i.
  public static func cross(_ a: [Double], _ b: [Double]) -> [Bool] {
    let n = max(a.count, b.count)
    var out = [Bool](repeating: false, count: n)
    guard n > 1 else { return out }
    for i in 1..<n {
      guard i < a.count, i < b.count else { continue }
      let a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i]
      guard a0.isFinite, a1.isFinite, b0.isFinite, b1.isFinite else { continue }
      out[i] = (a0 <= b0 && a1 > b1) || (a0 >= b0 && a1 < b1)
    }
    return out
  }
}
