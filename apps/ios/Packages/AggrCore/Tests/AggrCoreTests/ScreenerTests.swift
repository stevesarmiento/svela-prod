import Foundation
import Testing
@testable import AggrCore

// Ports of screening-dsl.test.ts, client-result.test.ts (+ URL codec round-trips)
@Suite struct ScreeningDslTests {
  @Test func rejectsUnknownMetric() {
    #expect(throws: ScreeningDslError.unknownMetric("not_a_metric")) { try ScreeningDslParser.parseFilter(metricId: "not_a_metric", op: .gte, value: 1) }
  }

  @Test func coercesCompactUsd() throws {
    #expect(try ScreeningDslParser.parseFilter(metricId: "fdv_usd", op: .lt, rawValue: "$10m").value == 10_000_000)
    #expect(try ScreeningDslParser.parseFilter(metricId: "fdv_usd", op: .lt, rawValue: "200m").value == 200_000_000)
  }

  @Test func coercesPercentPoints() throws {
    #expect(try ScreeningDslParser.parseFilter(metricId: "price_change_24h_pct", op: .gte, rawValue: "10%").value == 10)
    #expect(try ScreeningDslParser.parseFilter(metricId: "price_change_24h_pct", op: .gte, rawValue: "10% ").value == 10)
    #expect(try ScreeningDslParser.parseFilter(metricId: "price_change_24h_pct", op: .gt, value: 0.5).value == 0.5)
    #expect(try ScreeningDslParser.parseFilter(metricId: "price_change_24h_pct", op: .gt, rawValue: "0.5%").value == 0.5)
  }

  @Test func ratioNormalization() throws {
    #expect(try ScreeningDslParser.parseFilter(metricId: "taker_buy_ratio", op: .gt, value: 55).value == 0.55)
    #expect(try ScreeningDslParser.parseFilter(metricId: "taker_buy_ratio", op: .gt, rawValue: "55%").value == 0.55)
    #expect(try ScreeningDslParser.parseFilter(metricId: "taker_buy_ratio", op: .gt, value: 0.7).value == 0.7)
  }

  @Test func signedUsd() {
    #expect((try? ScreeningDslParser.parseFilter(metricId: "taker_net_buy_usd", op: .lt, value: -5_000_000)) != nil)
    #expect((try? ScreeningDslParser.parseFilter(metricId: "market_cap_usd", op: .gt, value: -1)) == nil)
  }

  @Test func takerRatioScale() {
    #expect(abs((MetricCatalog.normalizeTakerRatio(49.79) ?? 0) - 0.4979) < 1e-9)
    #expect(MetricCatalog.normalizeTakerRatio(0.55) == 0.55)
    #expect(MetricCatalog.normalizeTakerRatio(100) == 1)
    #expect(MetricCatalog.normalizeTakerRatio(.nan) == nil)
    let m = MetricCatalog.metric("taker_buy_ratio")!
    let v = m.takerValue!(TakerSnapshot(buyRatio: 55.5, sellRatio: 44.5, buyVolumeUsd: 10, sellVolumeUsd: 8, totalVolumeUsd: 18))
    #expect(abs((v ?? 0) - 0.555) < 1e-9)
  }

  @Test func defaultsAndDecoding() throws {
    let json = #"{"filters":[{"metricId":"market_cap_usd","op":"gt","value":1000000}],"limit":null}"#.data(using: .utf8)!
    let dsl = try JSONDecoder().decode(ScreeningDsl.self, from: json)
    #expect(dsl.universe == .all && dsl.limit == 250 && dsl.takerContext == nil)
  }

  @Test func summaryFormatting() {
    let a = ScreeningDsl(filters: [ScreenFilter(metricId: "market_cap_usd", op: .gt, value: 5_000_000)])
    #expect(ScreeningDslFormat.summary(a).contains("$5M"))
    let b = ScreeningDsl(filters: [ScreenFilter(metricId: "price_change_24h_pct", op: .gte, value: 10)])
    #expect(ScreeningDslFormat.summary(b).contains("10%") && !ScreeningDslFormat.summary(b).contains("10.00%"))
    let c = ScreeningDsl(filters: [ScreenFilter(metricId: "taker_buy_ratio", op: .gt, value: 0.6)], takerContext: TakerContext(range: "4h", exchange: "Binance"))
    #expect(ScreeningDslFormat.summary(c).hasSuffix("Taker: 4h · Binance"))
    #expect(ScreeningDslFormat.compactUsd(1_500) == "$1.50K")
    #expect(ScreeningDslFormat.compactUsd(0.5) == "$0.5")
  }

  @Test func promptGating() {
    #expect(SmartScreenerGate.promptLooksLikeConstraints("fdv under 200m"))
    #expect(SmartScreenerGate.promptLooksLikeConstraints("market cap > 500m"))
    #expect(SmartScreenerGate.promptLooksLikeConstraints("between 1m and 5m"))
    #expect(!SmartScreenerGate.promptLooksLikeConstraints("volume descending"))
    #expect(!SmartScreenerGate.promptLooksLikeConstraints("top gainers"))
    #expect(SmartScreenerGate.isPlainSearchToken("btc"))
    #expect(!SmartScreenerGate.isPlainSearchToken("top gainers"))
  }

  @Test func clientResultGate() {
    #expect(!SmartScreenerGate.shouldApply(ok: true, confidence: 0.59, actionsCount: 2, threshold: 0.6))
    #expect(!SmartScreenerGate.shouldApply(ok: true, confidence: 0.99, actionsCount: 0, threshold: 0.6))
    #expect(SmartScreenerGate.shouldApply(ok: true, confidence: 0.9, actionsCount: 1, threshold: 0.6))
  }

  @Test func urlCodecRoundTrip() throws {
    let dsl = ScreeningDsl(filters: [ScreenFilter(metricId: "market_cap_usd", op: .gt, value: 1e9), ScreenFilter(metricId: "taker_buy_ratio", op: .gt, value: 0.55)],
                           sort: ScreenSort(metricId: "volume_24h_usd", order: .desc), limit: 50, universe: .all, takerContext: TakerContext(range: "24h", exchange: nil))
    let encoded = ScreenerUrlCodec.encode(dsl)
    #expect(encoded.hasPrefix(#"{"f":[["market_cap_usd","gt",1000000000]"#))
    let decoded = try #require(ScreenerUrlCodec.decode(encoded))
    #expect(decoded == dsl)
    // Web-generated link
    let web = try #require(ScreenerUrlCodec.decode(#"{"f":[["fdv_usd","lt",200000000],["volume_24h_usd","gt",5000000]],"s":["volume_24h_usd","desc"]}"#))
    #expect(web.filters.count == 2 && web.sort?.metricId == "volume_24h_usd" && web.limit == 250)
    // Fail-closed
    #expect(ScreenerUrlCodec.decode("garbage") == nil)
    #expect(ScreenerUrlCodec.decode(#"{"f":[["nope","gt",1]]}"#) == nil)
    #expect(ScreenerSort.parse("marketCap.desc") == ScreenerSort(key: .marketCap, desc: true))
    #expect(ScreenerSort.parse("bogus.desc") == nil)
    let merged = ScreenerUrlCodec.mergeSort(ScreeningDsl(), sort: ScreenerSort(key: .change, desc: false))
    #expect(merged.sort == ScreenSort(metricId: "price_change_24h_pct", order: .asc))
    #expect(ScreenerUrlCodec.mergeSort(ScreeningDsl(), sort: ScreenerSort(key: .name, desc: false)).sort == nil)
  }
}
