import AggrCore
import Foundation

/// Request bodies for the AI routes. `IndicatorDataSchema` (`lib/analyze-shared.ts`) for `/api/analyze` and
/// `/api/analyze/compare`; the discriminated union in `app/api/analyze-indicator/route.ts` for indicator explains.

public struct IndicatorData: Codable, Sendable, Hashable {
  public struct Quote: Codable, Sendable, Hashable {
    public struct USD: Codable, Sendable, Hashable {
      public var price: Double
      public var percent_change_24h: Double
      public var market_cap: Double
      public var volume_24h: Double
      public var volume_change_24h: Double?
      public var market_cap_dominance: Double?
    }
    public var USD: USD
  }
  public struct PriceContext: Codable, Sendable, Hashable {
    public var currentPrice: Double
    public var priceHistory: [Double]
    public var momentum: String
    public var volatility: String
    public var support: Double
    public var resistance: Double
  }
  public struct VolumeAnalysis: Codable, Sendable, Hashable {
    public var currentVolume: Double
    public var volumeHistory: [Double]
    public var volumeTrend: String
    public var averageVolume: Double
    public var volumeSpike: Bool
  }
  public struct HullSuiteInfo: Codable, Sendable, Hashable {
    public var trendDirection: String
    public var mhull: Double?
    public var shull: Double?
    public var crossoverSignal: String?
    public var strength: String?
  }
  public struct BollingerInfo: Codable, Sendable, Hashable {
    public var indicator: String
    public var currentValue: Double
    public var upperBand: Double
    public var lowerBand: Double
    public var basis: Double
    public var position: String
    public var breachType: String?
    public var divergence: String?
    public var trend: String?
    public var history: [Double]?
  }
  public struct ReverseLevel: Codable, Sendable, Hashable {
    public var target: Double; public var price: Double?
    public init(target: Double, price: Double?) { self.target = target; self.price = price }
  }
  public struct RsiInfo: Codable, Sendable, Hashable {
    public var value: Double
    public var signal: String
    public var trend: String?
    public var history: [Double]?
    public var divergence: String?
    public var reverseLevels: [ReverseLevel]?
    public var reverseBasis: String?
  }
  public struct WaveTrendInfo: Codable, Sendable, Hashable { public var wt1: Double; public var wt2: Double; public var signal: String; public var momentum: String? }
  public struct MoneyFlowInfo: Codable, Sendable, Hashable { public var direction: String; public var strength: String; public var value: Double? }
  public struct MarketVisionInfo: Codable, Sendable, Hashable {
    public var rsi: RsiInfo?
    public var waveTrend: WaveTrendInfo?
    public var moneyFlow: MoneyFlowInfo?
  }
  public struct LiquidationInfo: Codable, Sendable, Hashable {
    public var totalLiquidations24h: Double?
    public var longLiquidations: Double?
    public var shortLiquidations: Double?
    public var openInterest: Double?
    public var openInterestChange: Double?
  }
  public struct OrderFlowInfo: Codable, Sendable, Hashable {
    public var takerBuyRatio: Double?
    public var buyVolumeUsd: Double?
    public var sellVolumeUsd: Double?
    public var buyPressure: String?
    public var sellPressure: String?
    public var netFlow: String?
  }
  public struct PriceActionInfo: Codable, Sendable, Hashable {
    public var trend: String
    public var volatility: String
    public var volume_profile: String
    public var priceLevel: String?
    public var momentum: String?
    public var divergenceSignal: Bool?
  }

  public var name: String
  public var symbol: String
  public var quote: Quote
  public var priceContext: PriceContext?
  public var volumeAnalysis: VolumeAnalysis?
  public var hullSuite: HullSuiteInfo?
  public var bollingerBands: BollingerInfo?
  public var marketVision: MarketVisionInfo?
  public var liquidationData: LiquidationInfo?
  public var orderFlow: OrderFlowInfo?
  public var priceAction: PriceActionInfo?
  public var timeframe: String?
  /// CoinGecko id — client-side only (not part of the schema; excluded from encoding).
  public var symbolId: String = ""

  enum CodingKeys: String, CodingKey {
    case name, symbol, quote, priceContext, volumeAnalysis, hullSuite, bollingerBands, marketVision, liquidationData, orderFlow, priceAction, timeframe
  }

  init(name: String, symbol: String, quote: Quote, timeframe: String?) {
    self.name = name; self.symbol = symbol; self.quote = quote; self.timeframe = timeframe
  }
}

/// `/api/analyze/compare` body.
public struct CompareRequest: Encodable, Sendable {
  public var tokens: [IndicatorData]
  public var comparative: ComparativeStats.Result?
  public init(tokens: [IndicatorData], comparative: ComparativeStats.Result?) { self.tokens = tokens; self.comparative = comparative }
}

/// `/api/analyze-indicator` body (discriminated on `indicatorType`).
public struct IndicatorExplainRequest: Encodable, Sendable {
  public struct Token: Encodable, Sendable {
    public var coinId: String; public var name: String?; public var symbol: String?
    public init(coinId: String, name: String?, symbol: String?) { self.coinId = coinId; self.name = name; self.symbol = symbol }
  }
  public struct MarketContext: Encodable, Sendable {
    public var priceUsd: Double?
    public var change24hPct: Double?
    public var volume24hUsd: Double?
    public var marketCapUsd: Double?
    public var closeHistory: [Double]?
    public var closeTimesUtc: [Int]?
    public init(priceUsd: Double?, change24hPct: Double?, volume24hUsd: Double?, marketCapUsd: Double?, closeHistory: [Double]?, closeTimesUtc: [Int]?) {
      self.priceUsd = priceUsd; self.change24hPct = change24hPct; self.volume24hUsd = volume24hUsd; self.marketCapUsd = marketCapUsd
      self.closeHistory = closeHistory; self.closeTimesUtc = closeTimesUtc
    }
  }
  public enum Snapshot: Encodable, Sendable {
    case marketVision(rsiCurrent: Double?, rsiHistory: [Double?], wt1Current: Double?, wt2Current: Double?, moneyFlowCurrent: Double?, moneyFlowHistory: [Double?])
    case bollinger(indicatorCurrent: Double?, upperCurrent: Double?, lowerCurrent: Double?, basisCurrent: Double?, indicatorHistory: [Double?], upperHistory: [Double?], lowerHistory: [Double?])
    case bbwp(bbwpCurrent: Double?, bbwpHistory: [Double?], lookback: Int)
    case rsiDivergences(rsiCurrent: Double?, rsiHistory: [Double?], divergences: [RsiDivergenceSnapshot], reverseLevels: [IndicatorData.ReverseLevel], signalCurrent: Double?, reverseSignalCross: Double?, settings: RsiSettingsSnapshot)

    public var indicatorType: String {
      switch self { case .marketVision: "marketVision"; case .bollinger: "bollinger"; case .bbwp: "bbwp"; case .rsiDivergences: "rsiDivergences" }
    }

    enum Keys: String, CodingKey {
      case rsiCurrent, rsiHistory, wt1Current, wt2Current, moneyFlowCurrent, moneyFlowHistory
      case indicatorCurrent, upperCurrent, lowerCurrent, basisCurrent, indicatorHistory, upperHistory, lowerHistory
      case bbwpCurrent, bbwpHistory, lookback
      case divergences, reverseLevels, signalCurrent, reverseSignalCross, settings
    }

    public func encode(to encoder: Encoder) throws {
      var c = encoder.container(keyedBy: Keys.self)
      switch self {
      case .marketVision(let r, let rh, let w1, let w2, let mf, let mfh):
        try c.encode(r, forKey: .rsiCurrent); try c.encode(Array(rh.suffix(180)), forKey: .rsiHistory); try c.encode(w1, forKey: .wt1Current); try c.encode(w2, forKey: .wt2Current)
        try c.encode(mf, forKey: .moneyFlowCurrent); try c.encode(Array(mfh.suffix(180)), forKey: .moneyFlowHistory)
      case .bollinger(let i, let u, let l, let b, let ih, let uh, let lh):
        try c.encode(i, forKey: .indicatorCurrent); try c.encode(u, forKey: .upperCurrent); try c.encode(l, forKey: .lowerCurrent); try c.encode(b, forKey: .basisCurrent)
        try c.encode(Array(ih.suffix(180)), forKey: .indicatorHistory); try c.encode(Array(uh.suffix(180)), forKey: .upperHistory); try c.encode(Array(lh.suffix(180)), forKey: .lowerHistory)
      case .bbwp(let v, let h, let lb):
        try c.encode(v, forKey: .bbwpCurrent); try c.encode(Array(h.suffix(240)), forKey: .bbwpHistory); try c.encode(lb, forKey: .lookback)
      case .rsiDivergences(let r, let rh, let d, let rl, let sc, let rc, let st):
        try c.encode(r, forKey: .rsiCurrent); try c.encode(Array(rh.suffix(180)), forKey: .rsiHistory); try c.encode(Array(d.suffix(96)), forKey: .divergences)
        try c.encode(Array(rl.prefix(12)), forKey: .reverseLevels); try c.encode(sc, forKey: .signalCurrent); try c.encode(rc, forKey: .reverseSignalCross); try c.encode(st, forKey: .settings)
      }
    }
  }
  public struct RsiDivergenceSnapshot: Encodable, Sendable {
    public var type: String; public var startTime: Int; public var endTime: Int
    public var priceStart: Double; public var priceEnd: Double; public var rsiStart: Double; public var rsiEnd: Double
    public init(type: String, startTime: Int, endTime: Int, priceStart: Double, priceEnd: Double, rsiStart: Double, rsiEnd: Double) {
      self.type = type; self.startTime = startTime; self.endTime = endTime; self.priceStart = priceStart; self.priceEnd = priceEnd; self.rsiStart = rsiStart; self.rsiEnd = rsiEnd
    }
  }
  public struct RsiSettingsSnapshot: Encodable, Sendable {
    public var rsiLength: Int, leftBars: Int, rightBars: Int
    public var pairMode: String, tolBars: Int, priceMode: String
    public var allowEqual: Bool, priceEps: Double, rsiEps: Double, showRegular: Bool, showHidden: Bool
    public var signalPeriod: Int?, signalType: String?, alertHigh: Double?, alertLow: Double?
    public init(rsiLength: Int, leftBars: Int, rightBars: Int, pairMode: String, tolBars: Int, priceMode: String, allowEqual: Bool, priceEps: Double, rsiEps: Double,
                showRegular: Bool, showHidden: Bool, signalPeriod: Int?, signalType: String?, alertHigh: Double?, alertLow: Double?) {
      self.rsiLength = rsiLength; self.leftBars = leftBars; self.rightBars = rightBars; self.pairMode = pairMode; self.tolBars = tolBars; self.priceMode = priceMode
      self.allowEqual = allowEqual; self.priceEps = priceEps; self.rsiEps = rsiEps; self.showRegular = showRegular; self.showHidden = showHidden
      self.signalPeriod = signalPeriod; self.signalType = signalType; self.alertHigh = alertHigh; self.alertLow = alertLow
    }
  }

  public var indicatorType: String
  public var token: Token
  public var timeframe: String
  public var marketContext: MarketContext
  public var snapshot: Snapshot

  public init(token: Token, timeframe: String, marketContext: MarketContext, snapshot: Snapshot) {
    self.indicatorType = snapshot.indicatorType; self.token = token; self.timeframe = timeframe; self.marketContext = marketContext; self.snapshot = snapshot
  }
}
