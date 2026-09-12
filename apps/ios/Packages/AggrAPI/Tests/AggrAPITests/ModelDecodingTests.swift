import Foundation
import Testing
@testable import AggrAPI

@Suite struct ModelDecodingTests {
  @Test func quoteKeepsNullsAsNil() throws {
    let json = """
    {"data":{"bitcoin":{"id":"bitcoin","name":"Bitcoin","symbol":"btc","market_cap_rank":1,"image":"https://x/btc.png",
      "current_price":65000.5,"market_cap":null,"total_volume":1.2e10,"price_change_percentage_24h":null,
      "sparkline7d":[1,2,3],"last_updated":"2026-09-11T10:00:00.123Z"},
      "weird":{"id":"weird","name":"Weird","symbol":"w","market_cap_rank":null,"image":"",
      "current_price":null,"market_cap":null,"total_volume":null,"price_change_percentage_24h":null}},
     "status":{"timestamp":"t"}}
    """.data(using: .utf8)!
    let r = try JSONDecoder().decode(CoinQuotesResponse.self, from: json)
    let btc = try #require(r.data["bitcoin"])
    #expect(btc.marketCap == nil)
    #expect(btc.priceChangePercentage24h == nil)
    #expect(btc.currentPrice == 65000.5)
    #expect(btc.marketCapRank == 1)
    #expect(btc.sparkline7d == [1, 2, 3])
    #expect(btc.lastUpdatedDate != nil)
    let weird = try #require(r.data["weird"])
    #expect(weird.currentPrice == nil)
    #expect(weird.marketCapRank == nil)
    #expect(weird.usdMove24h == nil)
  }

  @Test func watchlistGroupDecodesConvexDoc() throws {
    let json = """
    {"_id":"k1","_creationTime":1757000000000.5,"userId":"u1","name":"Core","slug":"core","isDefault":true,"createdAt":1757000000000,"updatedAt":1757000000001,"icon":"🚀","color":"blue"}
    """.data(using: .utf8)!
    let g = try JSONDecoder().decode(WatchlistGroup.self, from: json)
    #expect(g.id == "k1")
    #expect(g.isDefault)
    #expect(g.icon == "🚀")
    #expect(g.description == nil)
  }

  @Test func pageBootstrapAllCoinIdsDedupes() {
    let g1 = WatchlistGroup(id: "g1", name: "A", slug: "a")
    let g2 = WatchlistGroup(id: "g2", name: "B", slug: "b")
    let b = WatchlistsPageBootstrap(groups: [g1, g2], defaultGroup: g1, itemsByGroupId: [
      "g1": [WatchlistItem(id: "i1", watchlistGroupId: "g1", coinId: "bitcoin")],
      "g2": [WatchlistItem(id: "i2", watchlistGroupId: "g2", coinId: "bitcoin"), WatchlistItem(id: "i3", watchlistGroupId: "g2", coinId: "solana", holdings: 2.5)],
    ])
    #expect(b.allCoinIds == ["bitcoin", "solana"])
  }

  @Test func topMarketRowTolerant() throws {
    let json = """
    [{"coingeckoId":"bitcoin","symbol":"btc","name":"Bitcoin","image":"i","currentPrice":1,"marketCapRank":1,"extraField":123}]
    """.data(using: .utf8)!
    let rows = try JSONDecoder().decode([TopMarketRow].self, from: json)
    #expect(rows.first?.marketCap == nil)
    #expect(rows.first?.currentPrice == 1)
  }

  @Test func apiErrorMapping() {
    #expect(APIError.fromStatus(429, endpoint: "/x", message: "m") == .rateLimited(endpoint: "/x", message: "m"))
    #expect(APIError.fromStatus(503, endpoint: "/x", message: "m").isRetryable)
    #expect(!APIError.fromStatus(400, endpoint: "/x", message: "m").isRetryable)
    #expect(APIClient.errorMessage(from: #"{"error":"Too many requests"}"#.data(using: .utf8)!) == "Too many requests")
  }
}

@Suite struct AnalysisDataCoverageTests {
  @Test func missingMarketCapDoesNotBecomeZero() throws {
    let row = try JSONDecoder().decode(CoinMarketRow.self, from: Data(#"{"id":"coin","name":"Coin","symbol":"c","current_price":1,"price_change_percentage_24h":0,"market_cap":null,"total_volume":2}"#.utf8))
    #expect(throws: AnalysisDataService.Failure.self) { try AnalysisDataService.validatedMarketInput(row) }
  }
  @Test func actualZeroVolumeIsAllowed() throws {
    let row = try JSONDecoder().decode(CoinMarketRow.self, from: Data(#"{"id":"coin","name":"Coin","symbol":"c","current_price":1,"price_change_percentage_24h":0,"market_cap":2,"total_volume":0}"#.utf8))
    #expect(try AnalysisDataService.validatedMarketInput(row).volume24h == 0)
  }
}
