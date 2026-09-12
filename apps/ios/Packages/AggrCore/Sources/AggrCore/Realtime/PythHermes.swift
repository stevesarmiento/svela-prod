import Foundation

/// Pure parts of `lib/realtime-prices/pyth-hermes-stream.ts` and `pyth-feed-mapping.ts`.
public enum PythHermes {
  public struct ParsedPrice: Sendable, Codable, Hashable {
    public struct Price: Sendable, Codable, Hashable {
      public var price: String
      public var conf: String
      public var expo: Int
      public var publish_time: Double
      public init(price: String, conf: String, expo: Int, publish_time: Double) { self.price = price; self.conf = conf; self.expo = expo; self.publish_time = publish_time }
    }
    public var id: String
    public var price: Price
    public init(id: String, price: Price) { self.id = id; self.price = price }
  }

  /// A single SSE `data:` frame may carry MULTIPLE parsed feed updates.
  public struct SseMessage: Sendable, Codable { public var parsed: [ParsedPrice]? }

  public struct Tick: Sendable, Hashable {
    public var feedId: String
    public var priceUsd: Double
    public var confidenceUsd: Double?
    public var publishTimeMs: Double?
    public init(feedId: String, priceUsd: Double, confidenceUsd: Double?, publishTimeMs: Double?) {
      self.feedId = feedId; self.priceUsd = priceUsd; self.confidenceUsd = confidenceUsd; self.publishTimeMs = publishTimeMs
    }
  }

  public static func normalizeFeedId(_ id: String) -> String {
    id.hasPrefix("0x") ? String(id.dropFirst(2)) : id
  }

  /// `normalizeHermesParsedPrice`: price × 10^expo; null on non-positive/non-finite.
  public static func normalize(_ parsed: ParsedPrice) -> Tick? {
    guard let raw = Double(parsed.price.price), raw.isFinite else { return nil }
    let multiplier = pow(10.0, Double(parsed.price.expo))
    let priceUsd = raw * multiplier
    guard priceUsd.isFinite, priceUsd > 0 else { return nil }
    let conf = Double(parsed.price.conf).map { $0 * multiplier }.flatMap { $0.isFinite ? $0 : nil }
    let pt = parsed.price.publish_time
    let publishMs: Double? = (pt.isFinite && pt > 0) ? pt * 1000 : nil
    return Tick(feedId: normalizeFeedId(parsed.id), priceUsd: priceUsd, confidenceUsd: conf, publishTimeMs: publishMs)
  }

  /// Parse one SSE line; only `data:` lines with decodable JSON produce entries.
  public static func parseSseDataLine(_ line: String) -> [ParsedPrice]? {
    guard line.hasPrefix("data:") else { return nil }
    let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
    guard !payload.isEmpty, let data = payload.data(using: .utf8) else { return nil }
    guard let msg = try? JSONDecoder().decode(SseMessage.self, from: data) else { return nil }
    return msg.parsed ?? []
  }

  /// Curated CoinGecko id → Hermes feed id (hex, no 0x).
  public static let feedMapping: [String: String] = [
    "bitcoin": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "ethereum": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "solana": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ]

  public static func feedId(forCoingeckoId id: String) -> String? {
    feedMapping[id.trimmingCharacters(in: .whitespaces)]
  }
}

/// `RealtimeQuoteStatusKind`
public enum RealtimeQuoteStatus: String, Sendable, Hashable {
  case realtime, lastKnown, fallback, disabled

  public var label: String {
    switch self {
    case .realtime: "LIVE"
    case .lastKnown: "WARM"
    case .fallback: "CACHED"
    case .disabled: ""
    }
  }
}
