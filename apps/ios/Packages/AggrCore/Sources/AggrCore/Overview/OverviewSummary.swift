import Foundation

/// Port of `lib/overview-summary.ts`.
public enum OverviewSummary {
  public struct ValueRow: Sendable { public var valueUsd: Double; public var changePct: Double?; public init(valueUsd: Double, changePct: Double?) { self.valueUsd = valueUsd; self.changePct = changePct } }

  /// Σ(value·pct) / Σ(value) over coins with a positive value and a finite change.
  public static func valueWeighted24hChangePct(_ rows: [ValueRow]) -> Double? {
    var weighted = 0.0, total = 0.0
    for r in rows {
      guard r.valueUsd.isFinite, r.valueUsd > 0, let pct = r.changePct, pct.isFinite else { continue }
      weighted += r.valueUsd * pct
      total += r.valueUsd
    }
    return total > 0 ? weighted / total : nil
  }

  public static func seriesChangePct(_ points: [TimePoint]) -> Double? {
    guard points.count >= 2 else { return nil }
    let start = points[0].value, end = points[points.count - 1].value
    guard start.isFinite, start > 0, end.isFinite else { return nil }
    return (end - start) / start * 100
  }

  public enum Sentiment: String, Sendable, Codable { case bullish, bearish, neutral }
  public enum Lean: String, Sendable { case bullish, bearish, mixed, quiet }

  public struct SentimentSummary: Sendable, Hashable {
    public var bullish: Int, bearish: Int, neutral: Int, total: Int
    public var lean: Lean
  }

  public static func aggregateNewsSentiment(_ rows: [Sentiment?]) -> SentimentSummary {
    var b = 0, be = 0, n = 0
    for r in rows { switch r { case .bullish?: b += 1; case .bearish?: be += 1; case .neutral?: n += 1; case nil: break } }
    let total = b + be + n
    let lean: Lean = total == 0 ? .quiet : (b > be + 1 ? .bullish : (be > b + 1 ? .bearish : .mixed))
    return SentimentSummary(bullish: b, bearish: be, neutral: n, total: total, lean: lean)
  }

  public enum Segment: Sendable, Hashable {
    case text(String)
    case pct(Double)
  }

  static let inLineBandPP = 0.25

  static func direction(_ pct: Double) -> String { pct > 0 ? "up" : (pct < 0 ? "down" : "flat") }

  static func performance(portfolio: Double?, market: Double?) -> [Segment] {
    if let p = portfolio, let m = market {
      let diff = p - m
      let relation = abs(diff) < inLineBandPP ? "in line with" : (diff > 0 ? "ahead of" : "behind")
      return [.text("Your portfolio is \(direction(p)) "), .pct(p), .text(" today, \(relation) the market's "), .pct(m), .text(".")]
    }
    if let p = portfolio {
      return [.text("Your portfolio is \(direction(p)) "), .pct(p), .text(" over the last 24h; the market benchmark is still warming up.")]
    }
    if let m = market {
      return [.text("The broader market is \(direction(m)) "), .pct(m), .text(" over the last 24h.")]
    }
    return []
  }

  static func tone(sentiment: SentimentSummary?, breadth: BreadthStats?) -> [Segment] {
    if let s = sentiment, s.total > 0, s.lean != .quiet {
      let stories = s.total == 1 ? "story" : "stories"
      switch s.lean {
      case .bullish: return [.text("News flow around your coins leans bullish (\(s.bullish) of \(s.total) \(stories)).")]
      case .bearish: return [.text("News flow around your coins leans bearish (\(s.bearish) of \(s.total) \(stories)).")]
      default: return [.text("News flow around your coins is mixed across \(s.total) \(stories).")]
      }
    }
    if let b = breadth, b.total > 0 {
      let total = b.total
      let coins = total == 1 ? "coin is" : "coins are"
      if b.advancers > b.decliners { return [.text("\(b.advancers) of \(total) \(coins) trading higher over the last 24h.")] }
      if b.decliners > b.advancers { return [.text("\(b.decliners) of \(total) \(coins) trading lower over the last 24h.")] }
      return [.text("Your coins are evenly split between gainers and losers over the last 24h.")]
    }
    return []
  }

  static func mergeAdjacentText(_ segments: [Segment]) -> [Segment] {
    var out: [Segment] = []
    for s in segments {
      if case .text(let t) = s, case .text(let prev)? = out.last { out[out.count - 1] = .text(prev + t) } else { out.append(s) }
    }
    return out
  }

  public static func buildSegments(portfolioChangePct: Double?, marketChangePct: Double?, sentiment: SentimentSummary?, breadth: BreadthStats?) -> [Segment] {
    let perf = performance(portfolio: portfolioChangePct, market: marketChangePct)
    let t = tone(sentiment: sentiment, breadth: breadth)
    var segs = perf
    if !perf.isEmpty && !t.isEmpty { segs.append(.text(" ")) }
    segs.append(contentsOf: t)
    return mergeAdjacentText(segs)
  }
}
