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

  @Test func marketChartBatchDecodesPerCoinPayloadsAndFailures() throws {
    let json = """
    {"results":{"bitcoin":{"data":{"prices":[{"time":1,"value":2}],"volumes":[],"market_caps":[]},
      "status":{"cached":true,"stale":false,"warmupRequested":false,"warming":false,"coverage":"full","points":1,"lastUpdated":5,"lastFetchedAt":null}}},
     "failed":["unknown-coin"],"status":{"requested":2,"returned":1}}
    """.data(using: .utf8)!
    let r = try JSONDecoder().decode(MarketChartBatchResponse.self, from: json)
    #expect(r.results["bitcoin"]?.data.prices == [MarketChartPoint(time: 1, value: 2)])
    #expect(r.results["bitcoin"]?.status?.needsWarmup == false)
    #expect(r.failed == ["unknown-coin"])
  }

  @Test func ninetyDayChartClipsToTheTrailingThirtyDays() {
    let day = 86_400.0
    let end = 1_800_000_000.0
    let times = stride(from: end - 89 * day, through: end, by: day).map { $0 }
    func pts(_ scale: Double) -> [MarketChartPoint] { times.map { MarketChartPoint(time: $0 * scale, value: $0) } }
    let seconds = MarketChartResponse(data: .init(prices: pts(1), volumes: pts(1), market_caps: pts(1)),
                                      status: ChartStatus(points: 90))
    let clipped = seconds.clipped(toLastDays: 30)
    #expect(clipped.data.prices.count == 31)
    #expect(clipped.data.prices.first?.time == end - 30 * day)
    #expect(clipped.data.prices.last?.time == end)
    #expect(clipped.data.volumes.count == 31 && clipped.data.market_caps.count == 31)
    #expect(clipped.status?.points == 31)
    // Millisecond timestamps clip on the same boundary without being rewritten.
    let millis = MarketChartResponse(data: .init(prices: pts(1000), volumes: [], market_caps: []), status: nil)
    #expect(millis.clipped(toLastDays: 30).data.prices.count == 31)
    #expect(millis.clipped(toLastDays: 30).data.prices.first?.time == (end - 30 * day) * 1000)
    let empty = MarketChartResponse(data: .init(prices: [], volumes: [], market_caps: []), status: nil)
    #expect(empty.clipped(toLastDays: 30).data.prices.isEmpty)
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

@Test func reverseLevelsEncodeUnreachablePricesAsNull() throws {
  let level = IndicatorData.ReverseLevel(target: 70, price: nil)
  let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(level)) as? [String: Any])
  // `price` is `nullable` in `IndicatorDataSchema`: the key must be present.
  #expect(json["target"] as? Double == 70)
  #expect(json.keys.contains("price"))
  #expect(json["price"] is NSNull)
}
