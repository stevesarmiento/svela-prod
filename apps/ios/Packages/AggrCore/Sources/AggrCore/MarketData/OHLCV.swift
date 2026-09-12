import Foundation

/// OHLCV bar with epoch-second time. Used by chart series and every indicator.
public struct OHLCVBar: Sendable, Hashable, Codable {
  public var time: Int
  public var open: Double
  public var high: Double
  public var low: Double
  public var close: Double
  public var volume: Double

  public init(time: Int, open: Double, high: Double, low: Double, close: Double, volume: Double = 0) {
    self.time = time; self.open = open; self.high = high; self.low = low; self.close = close; self.volume = volume
  }

  public var date: Date { Date(timeIntervalSince1970: TimeInterval(time)) }
  public var hlc3: Double { (high + low + close) / 3 }
}
