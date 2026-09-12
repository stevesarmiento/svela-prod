import Foundation

/// Port of `lib/comparative-stats.ts`: cross-asset stats computed CLIENT-SIDE from daily closes.
public enum ComparativeStats {
  static let minOverlapReturns = 10
  static let correlationWindowDays = 30

  public struct Input: Sendable {
    public var id: String
    public var symbol: String
    public var name: String
    public var marketCap: Double?
    /// Timestamped series (epoch seconds) — bucketed to daily closes.
    public var series: [TimePoint]
    /// Fallback index-aligned closes when no timestamps exist.
    public var priceHistory: [Double]
    public var rsi: Double?
    public var bbPercentB: Double?
    public var bbwpPct: Double?
    public var waveTrend: String?
    public var moneyFlow: String?
    public var openInterestChangePct: Double?
    public var takerBuyRatio: Double?

    public init(id: String, symbol: String, name: String, marketCap: Double?, series: [TimePoint] = [], priceHistory: [Double] = [],
                rsi: Double? = nil, bbPercentB: Double? = nil, bbwpPct: Double? = nil, waveTrend: String? = nil, moneyFlow: String? = nil,
                openInterestChangePct: Double? = nil, takerBuyRatio: Double? = nil) {
      self.id = id; self.symbol = symbol; self.name = name; self.marketCap = marketCap; self.series = series; self.priceHistory = priceHistory
      self.rsi = rsi; self.bbPercentB = bbPercentB; self.bbwpPct = bbwpPct; self.waveTrend = waveTrend; self.moneyFlow = moneyFlow
      self.openInterestChangePct = openInterestChangePct; self.takerBuyRatio = takerBuyRatio
    }
  }

  public struct TokenStats: Sendable, Hashable, Codable, Identifiable {
    public var id: String
    public var symbol: String
    public var name: String
    public var marketCap: Double?
    public var return7dPct: Double?
    public var return30dPct: Double?
    public var excessReturn7dPct: Double?
    public var excessReturn30dPct: Double?
    public var volatility30dAnnualizedPct: Double?
    public var betaVsBenchmark: Double?
    public var rsi: Double?
    public var bbPercentB: Double?
    public var bbwpPct: Double?
    public var waveTrend: String?
    public var moneyFlow: String?
    public var openInterestChangePct: Double?
    public var takerBuyRatio: Double?
  }

  public struct Result: Sendable, Hashable, Codable {
    public var benchmarkId: String
    public var benchmarkSymbol: String
    public var tokens: [TokenStats]
    /// Row/col order matches `tokens`; nil where overlap is too short.
    public var correlationMatrix: [[Double?]]
  }

  public struct DailyCloses: Sendable { public var days: [Int]; public var closes: [Double] }

  static func dailyReturns(_ prices: [Double]) -> [Double] {
    var out: [Double] = []
    for i in 1..<max(1, prices.count) {
      let prev = prices[i - 1], curr = prices[i]
      if prev > 0, prev.isFinite, curr.isFinite { out.append(curr / prev - 1) }
    }
    return out
  }

  static func mean(_ v: [Double]) -> Double { v.reduce(0, +) / Double(v.count) }

  static func alignTails(_ a: [Double], _ b: [Double]) -> ([Double], [Double]) {
    let n = min(a.count, b.count)
    return (Array(a.suffix(n)), Array(b.suffix(n)))
  }

  public static func pearsonCorrelation(_ a: [Double], _ b: [Double]) -> Double? {
    let (x, y) = alignTails(a, b)
    guard x.count >= minOverlapReturns else { return nil }
    let mx = mean(x), my = mean(y)
    var cov = 0.0, vx = 0.0, vy = 0.0
    for i in 0..<x.count { let dx = x[i] - mx, dy = y[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy }
    guard vx != 0, vy != 0 else { return nil }
    return cov / (vx * vy).squareRoot()
  }

  public static func betaVs(_ token: [Double], _ benchmark: [Double]) -> Double? {
    let (x, y) = alignTails(token, benchmark)
    guard x.count >= minOverlapReturns else { return nil }
    let mx = mean(x), my = mean(y)
    var cov = 0.0, varB = 0.0
    for i in 0..<x.count { cov += (x[i] - mx) * (y[i] - my); varB += (y[i] - my) * (y[i] - my) }
    guard varB != 0 else { return nil }
    return cov / varB
  }

  public static func annualizedVolatilityPct(_ returns: [Double]) -> Double? {
    guard returns.count >= minOverlapReturns else { return nil }
    let m = mean(returns)
    let variance = returns.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(returns.count - 1)
    return variance.squareRoot() * (365.0).squareRoot() * 100
  }

  static func periodReturnPct(_ prices: [Double], periods: Int) -> Double? {
    if prices.count < periods + 1 {
      if prices.count >= 2, periods >= 30 { let f = prices[0], l = prices[prices.count - 1]; return f > 0 ? (l / f - 1) * 100 : nil }
      return nil
    }
    let start = prices[prices.count - 1 - periods], end = prices[prices.count - 1]
    return start > 0 ? (end / start - 1) * 100 : nil
  }

  /// Benchmark rule: BTC if present, else ETH, else largest market cap.
  public static func pickBenchmarkIndex(_ tokens: [(symbol: String, marketCap: Double?)]) -> Int {
    if let i = tokens.firstIndex(where: { $0.symbol.lowercased() == "btc" }) { return i }
    if let i = tokens.firstIndex(where: { $0.symbol.lowercased() == "eth" }) { return i }
    var best = 0
    for i in 1..<max(1, tokens.count) where (tokens[i].marketCap ?? 0) > (tokens[best].marketCap ?? 0) { best = i }
    return best
  }

  public static func toDailyCloses(_ series: [TimePoint]) -> DailyCloses {
    var byDay: [Int: Double] = [:]
    for p in series where p.value.isFinite { byDay[Int((Double(p.epochSeconds) / 86_400).rounded(.down))] = p.value }
    let days = byDay.keys.sorted()
    return DailyCloses(days: days, closes: days.map { byDay[$0]! })
  }

  static func syntheticDailyCloses(_ prices: [Double]) -> DailyCloses { DailyCloses(days: Array(0..<prices.count), closes: prices) }

  static func alignedReturnsByDay(_ a: DailyCloses, _ b: DailyCloses) -> ([Double], [Double]) {
    let bByDay = Dictionary(zip(b.days, b.closes), uniquingKeysWith: { _, n in n })
    var ca: [Double] = [], cb: [Double] = []
    for (i, day) in a.days.enumerated() { if let closeB = bByDay[day] { ca.append(a.closes[i]); cb.append(closeB) } }
    return (dailyReturns(ca), dailyReturns(cb))
  }

  public static func compute(_ tokens: [Input]) -> Result? {
    guard !tokens.isEmpty else { return nil }
    struct Base { var input: Input; var daily: DailyCloses }
    let bases = tokens.map { Base(input: $0, daily: $0.series.isEmpty ? syntheticDailyCloses($0.priceHistory) : toDailyCloses($0.series)) }
    let benchIdx = pickBenchmarkIndex(bases.map { ($0.input.symbol, $0.input.marketCap) })
    let bench = bases[benchIdx]
    let bench7 = periodReturnPct(bench.daily.closes, periods: 7)
    let bench30 = periodReturnPct(bench.daily.closes, periods: 30)
    let stats: [TokenStats] = bases.enumerated().map { i, base in
      let r7 = periodReturnPct(base.daily.closes, periods: 7)
      let r30 = periodReturnPct(base.daily.closes, periods: 30)
      let (tr, br) = alignedReturnsByDay(base.daily, bench.daily)
      return TokenStats(
        id: base.input.id, symbol: base.input.symbol, name: base.input.name, marketCap: base.input.marketCap,
        return7dPct: r7, return30dPct: r30,
        excessReturn7dPct: (r7 != nil && bench7 != nil) ? r7! - bench7! : nil,
        excessReturn30dPct: (r30 != nil && bench30 != nil) ? r30! - bench30! : nil,
        volatility30dAnnualizedPct: annualizedVolatilityPct(Array(dailyReturns(base.daily.closes).suffix(correlationWindowDays))),
        betaVsBenchmark: i == benchIdx ? 1 : betaVs(Array(tr.suffix(correlationWindowDays)), Array(br.suffix(correlationWindowDays))),
        rsi: base.input.rsi, bbPercentB: base.input.bbPercentB, bbwpPct: base.input.bbwpPct, waveTrend: base.input.waveTrend,
        moneyFlow: base.input.moneyFlow, openInterestChangePct: base.input.openInterestChangePct, takerBuyRatio: base.input.takerBuyRatio)
    }
    let matrix: [[Double?]] = bases.enumerated().map { i, a in
      bases.enumerated().map { j, b in
        if i == j { return 1 }
        let (ra, rb) = alignedReturnsByDay(a.daily, b.daily)
        return pearsonCorrelation(Array(ra.suffix(correlationWindowDays)), Array(rb.suffix(correlationWindowDays)))
      }
    }
    return Result(benchmarkId: bench.input.id, benchmarkSymbol: bench.input.symbol, tokens: stats, correlationMatrix: matrix)
  }

  static func fmt(_ v: Double?, _ digits: Int = 2, _ suffix: String = "") -> String {
    guard let v else { return "N/A" }
    return String(format: "%.\(digits)f", v) + suffix
  }

  /// Markdown block for the compare prompt — precomputed ground truth.
  public static func format(_ s: Result) -> String {
    var lines: [String] = []
    lines.append("Benchmark: \(s.benchmarkSymbol.uppercased()) (rule: BTC, else ETH, else largest market cap in the selection)")
    lines.append("")
    lines.append("| Asset | 7d Return | 30d Return | Excess 7d vs Bench | Excess 30d vs Bench | Ann. Volatility | Beta vs Bench | RSI | OI Δ | Taker Buy |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|")
    for t in s.tokens {
      let taker = t.takerBuyRatio.map { String(format: "%.1f%%", $0 * 100) } ?? "N/A"
      lines.append("| \(t.symbol.uppercased()) | \(fmt(t.return7dPct, 2, "%")) | \(fmt(t.return30dPct, 2, "%")) | \(fmt(t.excessReturn7dPct, 2, "pp")) | \(fmt(t.excessReturn30dPct, 2, "pp")) | \(fmt(t.volatility30dAnnualizedPct, 0, "%")) | \(fmt(t.betaVsBenchmark)) | \(fmt(t.rsi, 1)) | \(fmt(t.openInterestChangePct, 2, "%")) | \(taker) |")
    }
    lines.append("")
    lines.append("Indicator posture per asset (Wave Trend / Money Flow from Market Vision; %B = RSI-Bollinger position 0..1; BBWP = Bollinger Band Width Percentile on daily closes, <20 squeeze / >80 expansion climax):")
    lines.append("| Asset | Wave Trend | Money Flow | RSI-BB %B | BBWP |")
    lines.append("|---|---|---|---|---|")
    for t in s.tokens { lines.append("| \(t.symbol.uppercased()) | \(t.waveTrend ?? "N/A") | \(t.moneyFlow ?? "N/A") | \(fmt(t.bbPercentB, 2)) | \(fmt(t.bbwpPct, 0)) |") }
    lines.append("")
    let symbols = s.tokens.map { $0.symbol.uppercased() }
    lines.append("Pairwise correlation of daily returns (30d):")
    lines.append("| | \(symbols.joined(separator: " | ")) |")
    lines.append("|---|\(symbols.map { _ in "---" }.joined(separator: "|"))|")
    for (i, row) in s.correlationMatrix.enumerated() {
      lines.append("| \(symbols[i]) | \(row.map { $0.map { String(format: "%.2f", $0) } ?? "N/A" }.joined(separator: " | ")) |")
    }
    return lines.joined(separator: "\n")
  }
}
