import Foundation

/// Port of `apps/app/src/lib/logo-overrides.ts`. Static assets live at `/logos/...` on the web origin;
/// the iOS app resolves them against `webOrigin` (defaults to https://aggr.watch).
public enum LogoOverrides {
  public static let defaultWebOrigin = URL(string: "https://aggr.watch")!

  static let xstockLogos: Set<String> = [
    "AAPLx","ABBVx","ABTx","ACNx","ADBEx","AMBRx","AMDx","AMZNx","APPx","ASMLx","ASTSx","AVGOx","AXPx","AZNx","BACx",
    "BKNGx","BLKx","BLSHx","BMNRx","BRK_Bx","BTBTx","CLSKx","CMCSAx","COINx","CORZx","COSTx","CRCLx","CRMx","CRWDx",
    "CSCOx","CVXx","DFDVx","DHRx","DUOLx","EBAYx","EXPEx","FIGx","FUFUx","GLDx","GLXYx","GMEx","GOOGLx","GSx","HDx",
    "HONx","HOODx","HSDTx","HUTx","IBMx","IJRx","INTCx","IWMx","JNJx","JPMx","KOx","LINx","LLYx","LULUx","MARAx","MAx",
    "MCDx","MDTx","METAx","MNSTx","MRKx","MRVLx","MSFTx","MSTRx","MUx","NFLXx","NVDAx","NVOx","OKLOx","OPENx","ORCLx",
    "PANWx","PEPx","PFEx","PGx","PLTRx","PLx","PMx","PYPLx","QQQx","RBLXx","RIOTx","RKLBx","SBETx","SCHFx","SPCEx",
    "SPYx","STRCx","SUIGx","TBLLx","TEMx","TGTx","TMOx","TMUSx","TONXx","TQQQx","TRONx","TSLAx","TSMx","Tx","UBERx",
    "UNHx","VSTx","VTIx","VTx","Vx","WBDx","WENx","WMTx","WULFx","XOMx",
  ]

  static let symbolToFilename: [String: String] = [
    "IEMGx": "IJRx", "SPGIx": "SPYx", "STRKx": "STRCx",
  ]

  static let popularSymbolToFilename: [String: String] = [
    "btc": "bitcoin", "bitcoin": "bitcoin", "wbtc": "bitcoin",
    "eth": "ethereum", "ethereum": "ethereum",
    "sol": "solana", "solana": "solana",
    "ada": "cardano", "cardano": "cardano",
    "trx": "tron", "tron": "tron",
    "bnb": "bnb",
    "usdt": "tether", "tether": "tether",
    "xaut": "xaut", "tether-gold": "xaut", "tether gold": "xaut",
    "apt": "aptos", "aptos": "aptos",
    "sui": "sui",
    "bp": "backpack",
    "jto": "jito",
    "hype": "hyperliquid", "hyperliquid": "hyperliquid",
    "mon": "monad", "monad": "monad",
    "okxbtc": "okxbtc",
    "2z": "doublezero", "doublezero": "doublezero",
    "uni": "uniswap", "uniswap": "uniswap",
  ]

  static func xstockFilename(for symbol: String) -> String? {
    let trimmed = symbol.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    let normalized = trimmed.replacingOccurrences(of: ".", with: "_").replacingOccurrences(of: "-", with: "_")
    let candidates = trimmed == normalized ? [trimmed] : [trimmed, normalized]
    for candidate in candidates {
      if xstockLogos.contains(candidate) { return candidate }
      if let mapped = symbolToFilename[candidate], xstockLogos.contains(mapped) { return mapped }
      if let ci = xstockLogos.first(where: { $0.lowercased() == candidate.lowercased() }) { return ci }
    }
    return nil
  }

  static func normalizeSymbol(_ symbol: String) -> String {
    symbol.trimmingCharacters(in: .whitespaces).lowercased().split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? ""
  }

  static func popularFilename(for symbol: String) -> String? {
    let normalized = normalizeSymbol(symbol)
    guard !normalized.isEmpty else { return nil }
    return popularSymbolToFilename[normalized]
  }

  /// Bundled asset name (without extension) if this symbol has a curated logo, else nil.
  public static func bundledAssetName(symbol: String?) -> String? {
    guard let symbol else { return nil }
    if let x = xstockFilename(for: symbol) { return "xstocks/\(x)" }
    if let p = popularFilename(for: symbol) { return "popular/\(p)" }
    return nil
  }

  /// `getTokenLogoURL`: curated override URL (on the web origin) or the API fallback.
  public static func tokenLogoURL(symbol: String?, fallback: String?, webOrigin: URL = defaultWebOrigin) -> URL? {
    if let symbol {
      if let x = xstockFilename(for: symbol) { return webOrigin.appending(path: "logos/xstocks/\(x).png") }
      if let p = popularFilename(for: symbol) { return webOrigin.appending(path: "logos/popular/\(p).svg") }
    }
    guard let fallback, let url = URL(string: fallback) else { return nil }
    return url
  }

  /// `cleanTokenName`.
  public static func cleanTokenName(_ name: String?) -> String {
    guard var s = name, !s.isEmpty else { return "Unknown" }
    func replace(_ pattern: String, _ with: String) {
      s = s.replacingOccurrences(of: pattern, with: with, options: [.regularExpression, .caseInsensitive])
    }
    replace(#"\s*xStock\s*$"#, "")
    replace(#"\s*\(\s*(wormhole|bridged|wrapped|omnibridge|coinbase|ondo\s+tokenized)\s*\)\s*"#, " ")
    replace(#"\s*\(\s*mSOL\s*\)\s*"#, " ")
    replace(#"^\s*coinbase\s+wrapped\s+"#, "")
    replace(#"^\s*wrapped\s+"#, "")
    replace(#"\s+wrapped\s+"#, " ")
    replace(#"\s+wrapped\s*$"#, "")
    replace(#"\s+staked\s+sol(?=\s*(\(|$))"#, "")
    replace(#"\s{2,}"#, " ")
    let out = s.trimmingCharacters(in: .whitespaces)
    return out.isEmpty ? "Unknown" : out
  }
}
