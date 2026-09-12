import Foundation

/// Codable ports of `lib/smart-screener/screen-api.ts` (+ `client-result.ts`, `prompt-gating.ts`).
public struct ScreenRequest: Encodable, Sendable {
  public var text: String?
  public var dsl: ScreeningDsl?
  public var interpretOnly: Bool?
  public var surface: String = "screener"
  public init(text: String? = nil, dsl: ScreeningDsl? = nil, interpretOnly: Bool? = nil, surface: String = "screener") {
    self.text = text; self.dsl = dsl; self.interpretOnly = interpretOnly; self.surface = surface
  }
}

public struct ScreenResponseRow: Codable, Sendable, Hashable, Identifiable {
  public var coingeckoId: String
  public var symbol: String
  public var name: String
  public var image: String
  public var currentPrice: Double?
  public var marketCap: Double?
  public var marketCapRank: Double?
  public var totalVolume: Double?
  public var priceChangePercentage24h: Double?
  public var updatedAt: Double?
  public var metrics: [String: Double?]?
  public var id: String { coingeckoId }

  public var marketRow: ScreenerMarketRow {
    ScreenerMarketRow(coingeckoId: coingeckoId, symbol: symbol, name: name, image: image, currentPrice: currentPrice, marketCap: marketCap,
                      marketCapRank: marketCapRank, totalVolume: totalVolume, priceChangePercentage24h: priceChangePercentage24h, updatedAt: updatedAt, metrics: metrics)
  }
}

public struct ScreenCoverage: Codable, Sendable, Hashable {
  public var scanned: Double
  public var matched: Double
  public var maxRankScanned: Double?
  public var missingByMetricId: [String: Double]
  public var warmupScheduled: Bool
  public var warmupTopN: Double?
  public var takerCoinsRequested: Double?
  public var takerCoinsMissing: Double?
}

public struct ScreenError: Codable, Sendable, Hashable {
  public var code: String
  public var message: String
}

public struct ScreenResponse: Codable, Sendable, Hashable {
  public var ok: Bool
  public var confidence: Double
  public var dsl: ScreeningDsl
  public var summary: String
  public var resultIds: [String]
  public var rows: [ScreenResponseRow]
  public var coverage: ScreenCoverage
  public var userMessage: String?
  public var requestId: String?
  public var error: ScreenError?
}

public enum SmartScreenerGate {
  /// `shouldApplySmartScreenerResult`
  public static func shouldApply(ok: Bool, confidence: Double, actionsCount: Int, threshold: Double) -> Bool {
    guard ok, confidence.isFinite, actionsCount > 0 else { return false }
    return confidence >= threshold
  }

  /// `promptLooksLikeConstraints`
  public static func promptLooksLikeConstraints(_ text: String) -> Bool {
    let s = text.lowercased()
    if s.range(of: #"[<>]=?"#, options: .regularExpression) != nil { return true }
    return s.range(of: #"\b(under|below|over|above|between|from|to|at\s+least|at\s+most|>=|<=)\b"#, options: .regularExpression) != nil
  }

  /// Single short token (≤18 chars, no whitespace) bypasses the LLM and becomes plain text search.
  public static func isPlainSearchToken(_ text: String) -> Bool {
    let t = text.trimmingCharacters(in: .whitespaces)
    return !t.isEmpty && t.split(whereSeparator: { $0.isWhitespace }).count == 1 && t.count <= 18
  }
}

/// `TakerFlowMetrics` (`/api/smart-screener/taker-metrics`)
public struct TakerFlowMetrics: Codable, Sendable, Hashable {
  public var buyRatio: Double
  public var sellRatio: Double
  public var buyVolumeUsd: Double
  public var sellVolumeUsd: Double
  public var totalVolumeUsd: Double
  public var lastUpdatedMs: Double
  public var stale: Bool

  /// 0…100 buy percent after normalization; nil when unusable.
  public var buyPct: Double? {
    guard let r = MetricCatalog.normalizeTakerRatio(buyRatio), totalVolumeUsd > 0 else { return nil }
    return r * 100
  }
}

public struct TakerMetricsResponse: Codable, Sendable {
  public var success: Bool
  public var byId: [String: TakerFlowMetrics?]
  public init(success: Bool, byId: [String: TakerFlowMetrics?]) { self.success = success; self.byId = byId }
}
