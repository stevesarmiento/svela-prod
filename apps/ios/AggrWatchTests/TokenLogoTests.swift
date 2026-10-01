import Testing
@testable import AggrWatch

@Test @MainActor func curatedTokenLogosDecodeWithoutNetwork() {
  for symbol in ["BTC", "WBTC", "ETH", "SOL", "ADA", "TRX", "BNB", "USDT", "XAUT", "APT", "SUI", "BP", "JTO", "HYPE", "MON", "OKXBTC", "2Z", "UNI", "AAPLx", "brk.bx", "STRKx"] {
    #expect(TokenLogo.bundledImage(symbol: symbol) != nil, "Missing native logo for \(symbol)")
  }
  #expect(TokenLogo.bundledImage(symbol: "unknown-token") == nil)
}

@Test @MainActor func logoCandidatesPreferCuratedOverrideThenAPI() {
  let xstock = TokenLogo.logoCandidates(symbol: "AAPLx", imageURL: "https://img.example/x.png")
  #expect(xstock.count == 2)
  #expect(xstock.first?.absoluteString.hasPrefix("https://aggr.watch/logos/xstocks/") == true)
  #expect(xstock.last?.absoluteString == "https://img.example/x.png")
  // Popular overrides are SVGs the raster decoder cannot read: only the API artwork is tried.
  #expect(TokenLogo.logoCandidates(symbol: "BTC", imageURL: "https://img.example/btc.png").map(\.absoluteString) == ["https://img.example/btc.png"])
  #expect(TokenLogo.logoCandidates(symbol: "zzz", imageURL: "ftp://img.example/z.png").isEmpty)
  #expect(TokenLogo.logoCandidates(symbol: "zzz", imageURL: nil).isEmpty)
}
