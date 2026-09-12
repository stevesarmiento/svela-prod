import Testing
@testable import AggrCore

@Suite struct LogoOverridesTests {
  @Test func xstockAndPopularResolution() {
    #expect(LogoOverrides.tokenLogoURL(symbol: "AAPLx", fallback: nil)?.absoluteString == "https://aggr.watch/logos/xstocks/AAPLx.png")
    #expect(LogoOverrides.tokenLogoURL(symbol: "brk.bx", fallback: nil)?.absoluteString == "https://aggr.watch/logos/xstocks/BRK_Bx.png")
    #expect(LogoOverrides.tokenLogoURL(symbol: "STRKx", fallback: nil)?.absoluteString == "https://aggr.watch/logos/xstocks/STRCx.png")
    #expect(LogoOverrides.tokenLogoURL(symbol: "BTC", fallback: nil)?.absoluteString == "https://aggr.watch/logos/popular/bitcoin.svg")
    #expect(LogoOverrides.tokenLogoURL(symbol: "XAUT (Wormhole)", fallback: nil)?.absoluteString == "https://aggr.watch/logos/popular/xaut.svg")
    #expect(LogoOverrides.tokenLogoURL(symbol: "DOGE", fallback: "https://x/doge.png")?.absoluteString == "https://x/doge.png")
    #expect(LogoOverrides.tokenLogoURL(symbol: nil, fallback: nil) == nil)
  }

  @Test func cleanTokenName() {
    #expect(LogoOverrides.cleanTokenName("Nasdaq xStock") == "Nasdaq")
    #expect(LogoOverrides.cleanTokenName("Jupiter Staked SOL") == "Jupiter")
    #expect(LogoOverrides.cleanTokenName("Marinade staked SOL (mSOL)") == "Marinade")
    #expect(LogoOverrides.cleanTokenName("Wrapped Ether") == "Ether")
    #expect(LogoOverrides.cleanTokenName("Coinbase Wrapped BTC") == "BTC")
    #expect(LogoOverrides.cleanTokenName("Tether (Wormhole)") == "Tether")
    #expect(LogoOverrides.cleanTokenName(nil) == "Unknown")
  }
}

@Suite struct HybridSearchRankingTests {
  @Test func tickerLike() {
    #expect(HybridSearchRanking.isTickerLikeQuery("btc"))
    #expect(!HybridSearchRanking.isTickerLikeQuery("bitcoin"))
    #expect(!HybridSearchRanking.isTickerLikeQuery("bit coin"))
  }

  @Test func exactTickerBeatsSquatterForShortQuery() {
    let btc = HybridSearchRanking.Candidate(id: "bitcoin", name: "Bitcoin", symbol: "btc", marketCap: 1e12)
    let squatter = HybridSearchRanking.Candidate(id: "btc-coin", name: "BTC Coin", symbol: "btcc", marketCap: 1e4)
    let ranked = HybridSearchRanking.rank([squatter, btc], query: "btc", limit: 10)
    #expect(ranked.first?.id == "bitcoin")
  }

  @Test func nameQuerySymbolSquatterLoses() {
    let real = HybridSearchRanking.Candidate(id: "bitcoin", name: "Bitcoin", symbol: "btc", marketCap: 1e12)
    let squatter = HybridSearchRanking.Candidate(id: "bitcoin-2", name: "Bitcoin2", symbol: "bitcoin", marketCap: 1e4)
    let ranked = HybridSearchRanking.rank([squatter, real], query: "bitcoin", limit: 10)
    #expect(ranked.first?.id == "bitcoin")
  }

  @Test func searchType() {
    #expect(HybridSearchRanking.searchType(for: "btc, eth") == .symbol)
    #expect(HybridSearchRanking.searchType(for: "bitcoin cash") == .name)
    #expect(HybridSearchRanking.searchType(for: "") == .mixed)
  }
}

@Suite struct IconTests {
  @Test func resolveIcons() {
    #expect(WatchlistGroupIcons.resolve(nil) == .sfSymbol("sparkles"))
    #expect(WatchlistGroupIcons.resolve("fire") == .sfSymbol("flame.fill"))
    #expect(WatchlistGroupIcons.resolve("🚀") == .emoji("🚀"))
    #expect(WatchlistGroupIcons.resolve("garbage-key") == .sfSymbol("sparkles"))
  }
}

@Suite struct AggregateSeriesTests {
  @Test func equalWeightAveragesReturns() {
    let end = 1_700_000_000_000 // ms
    let scale = TimeScale.d1
    let start = end - scale.rangeDays * 86_400_000
    let sec = { (ms: Int) in ms / 1000 }
    let a = [TimePoint(epochSeconds: sec(start), value: 100), TimePoint(epochSeconds: sec(end), value: 80)]   // -20%
    let b = [TimePoint(epochSeconds: sec(start), value: 10), TimePoint(epochSeconds: sec(end), value: 9)]     // -10%
    let out = AggregateSeries.equalWeightReturnSeries(.init(byCoin: ["a": a, "b": b]), scale: scale, rangeEndMs: end)
    #expect(out.first?.value == 0)
    #expect(abs((out.last?.value ?? 0) - (-15)) < 1e-9)
  }

  @Test func changePctByCoin() {
    let m = AggregateSeries.changePctByCoinId(["x": [TimePoint(epochSeconds: 1, value: 50), TimePoint(epochSeconds: 2, value: 75)]])
    #expect(m["x"] == 50)
  }
}
