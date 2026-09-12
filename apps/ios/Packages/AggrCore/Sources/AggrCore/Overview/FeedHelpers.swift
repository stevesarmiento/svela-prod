import Foundation

/// Port of `overview-events-feed-card/feed-helpers.ts`.
public enum FeedHelpers {
  public static func clampPercentChange(_ v: Double) -> Double {
    guard v.isFinite else { return 0 }
    return min(9999, max(-9999, v))
  }

  /// "Today" / "Yesterday" / long date.
  public static func dateBucket(ms: Double, now: Date = Date(), calendar: Calendar = .current) -> String {
    let d = Date(timeIntervalSince1970: ms / 1000)
    let todayStart = calendar.startOfDay(for: now)
    let yesterdayStart = todayStart.addingTimeInterval(-86_400)
    if d >= todayStart { return "Today" }
    if d >= yesterdayStart { return "Yesterday" }
    return d.formatted(.dateTime.month(.wide).day().year())
  }

  public static func relativeTime(ms: Double, nowMs: Double) -> String {
    let diff = nowMs - ms
    guard diff.isFinite else { return "—" }
    if diff < 0 { return "just now" }
    let sec = Int(diff / 1000)
    if sec < 60 { return "just now" }
    let min = sec / 60
    if min < 60 { return "\(min)m ago" }
    let hr = min / 60
    if hr < 24 { return "\(hr)h ago" }
    let day = hr / 24
    if day < 14 { return "\(day)d ago" }
    return Date(timeIntervalSince1970: ms / 1000).formatted(.dateTime.month(.abbreviated).day())
  }

  public static func sentimentLabel(_ s: OverviewSummary.Sentiment) -> String {
    switch s { case .bullish: "Bullish"; case .bearish: "Bearish"; case .neutral: "Neutral" }
  }

  public static func categoryLabel(_ c: String) -> String? {
    switch c {
    case "regulation": "Regulation"
    case "security": "Security"
    case "etf": "ETF"
    case "partnership": "Partnership"
    case "market": "Market"
    case "tech": "Tech"
    case "macro": "Macro"
    default: nil
    }
  }

  public static func breakoutTimeframeDays(_ title: String) -> String? {
    guard let r = title.range(of: #"\b(\d+)d\b"#, options: [.regularExpression, .caseInsensitive]) else { return nil }
    return String(title[r].dropLast())
  }
}
