import Foundation

/// Port of `timeframes.ts`.
public enum Timeframes {
  public static func parsePineTimeframeMinutes(_ tf: String) -> Int? {
    let t = tf.trimmingCharacters(in: .whitespaces)
    guard !t.isEmpty, let m = Double(t), m.isFinite, m > 0 else { return nil }
    return Int(m.rounded(.down))
  }

  public static func estimateBaseBarSeconds(_ data: [OHLCVBar]) -> Int? {
    guard data.count >= 2 else { return nil }
    let times = data.map(\.time).sorted()
    var deltas: [Int] = []
    for i in 1..<times.count { let d = times[i] - times[i - 1]; if d > 0 { deltas.append(d) } }
    guard !deltas.isEmpty else { return nil }
    deltas.sort()
    return deltas[deltas.count / 2]
  }

  public static func canResampleToMinutes(_ data: [OHLCVBar], _ targetMinutes: Int) -> Bool {
    guard let base = estimateBaseBarSeconds(data) else { return false }
    return targetMinutes * 60 >= base
  }

  public static func resample(_ data: [OHLCVBar], toSeconds target: Int) -> [OHLCVBar] {
    guard !data.isEmpty, target > 0 else { return [] }
    var out: [OHLCVBar] = []
    var cur: OHLCVBar? = nil
    var curBucket: Int? = nil
    for bar in data.sorted(by: { $0.time < $1.time }) {
      let bucket = (bar.time / target) * target
      if curBucket != bucket {
        if let c = cur { out.append(c) }
        curBucket = bucket
        cur = OHLCVBar(time: bucket, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume)
        continue
      }
      if var c = cur { c.high = max(c.high, bar.high); c.low = min(c.low, bar.low); c.close = bar.close; c.volume += bar.volume; cur = c }
    }
    if let c = cur { out.append(c) }
    return out
  }

  public static func baseToResampledIndexMap(base: [OHLCVBar], resampled: [OHLCVBar], targetSeconds: Int) -> [Int?] {
    var byBucket: [Int: Int] = [:]
    for (i, r) in resampled.enumerated() { byBucket[r.time] = i }
    return base.map { byBucket[($0.time / targetSeconds) * targetSeconds] }
  }

  public enum Lookahead { case on, off }

  /// `security()` merge: `.off` reads the last *completed* HTF bucket (B-1); `.on` reads the current bucket.
  public static func alignHtfValuesToBase(_ map: [Int?], _ htf: [Double], lookahead: Lookahead = .on) -> [Double] {
    var out = [Double](repeating: .nan, count: map.count)
    for (i, h) in map.enumerated() {
      guard let h else { continue }
      let read = lookahead == .off ? h - 1 : h
      guard read >= 0, read < htf.count else { continue }
      out[i] = htf[read]
    }
    return out
  }

  public static func toHeikinAshi(_ bars: [OHLCVBar]) -> [OHLCVBar] {
    var out: [OHLCVBar] = []
    var prevOpen: Double? = nil, prevClose: Double? = nil
    for b in bars {
      let haClose = (b.open + b.high + b.low + b.close) / 4
      let haOpen = (prevOpen == nil || prevClose == nil) ? (b.open + b.close) / 2 : (prevOpen! + prevClose!) / 2
      out.append(OHLCVBar(time: b.time, open: haOpen, high: max(b.high, haOpen, haClose), low: min(b.low, haOpen, haClose), close: haClose, volume: b.volume))
      prevOpen = haOpen; prevClose = haClose
    }
    return out
  }
}
