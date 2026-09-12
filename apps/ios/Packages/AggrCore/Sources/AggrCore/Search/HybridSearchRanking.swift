import Foundation

/// Port of the client-side re-ranking in `apps/app/src/hooks/use-hybrid-coin-search.ts`.
public enum HybridSearchRanking {
  public static let searchSlateSize = 50

  public struct Candidate: Sendable, Hashable {
    public var id: String
    public var name: String
    public var symbol: String
    public var marketCap: Double?
    public init(id: String, name: String, symbol: String, marketCap: Double?) {
      self.id = id; self.name = name; self.symbol = symbol; self.marketCap = marketCap
    }
  }

  /// Ticker-like queries ("btc", "sol") let exact-symbol matches win.
  public static func isTickerLikeQuery(_ query: String) -> Bool {
    query.count <= 6 && !query.isEmpty && query.allSatisfy { ($0.isLetter && $0.isLowercase && $0.isASCII) || ($0.isNumber && $0.isASCII) }
  }

  public static func exactnessBoost(_ coin: Candidate, normalizedQuery q: String, tickerLike: Bool) -> Double {
    let id = coin.id.lowercased(), name = coin.name.lowercased(), symbol = coin.symbol.lowercased()
    if id == q || name == q { return 6 }
    if symbol == q { return tickerLike ? 6 : 1.5 }
    if name.hasPrefix(q) || symbol.hasPrefix(q) { return 2 }
    if name.contains(q) { return 0.5 }
    return 0
  }

  /// score = log10(max(mcap, 1)) + exactness boost; sorted desc, truncated to `limit`.
  public static func rank(_ candidates: [Candidate], query: String, limit: Int) -> [Candidate] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    let tickerLike = isTickerLikeQuery(q)
    return candidates
      .map { c -> (Candidate, Double) in
        (c, log10(max(c.marketCap ?? 0, 1)) + exactnessBoost(c, normalizedQuery: q, tickerLike: tickerLike))
      }
      .sorted { $0.1 > $1.1 }
      .prefix(limit)
      .map { $0.0 }
  }

  public enum SearchType: String, Sendable { case symbol, name, mixed }

  public static func searchType(for query: String) -> SearchType {
    let clean = query.trimmingCharacters(in: .whitespaces)
    if clean.isEmpty { return .mixed }
    let terms = clean.split(whereSeparator: { $0 == "," || $0.isWhitespace }).map(String.init).filter { !$0.isEmpty }
    let looksLikeSymbols = terms.allSatisfy { t in t.count <= 6 && t.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) } }
    return looksLikeSymbols ? .symbol : .name
  }
}
