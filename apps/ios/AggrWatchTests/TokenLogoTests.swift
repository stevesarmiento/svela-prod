import Testing
@testable import AggrWatch

@Test @MainActor func curatedTokenLogosDecodeWithoutNetwork() {
  for symbol in ["BTC", "WBTC", "ETH", "SOL", "ADA", "TRX", "BNB", "USDT", "XAUT", "APT", "SUI", "BP", "JTO", "HYPE", "MON", "OKXBTC", "2Z", "UNI", "AAPLx", "brk.bx", "STRKx"] {
    #expect(TokenLogo.bundledImage(symbol: symbol) != nil, "Missing native logo for \(symbol)")
  }
  #expect(TokenLogo.bundledImage(symbol: "unknown-token") == nil)
}
