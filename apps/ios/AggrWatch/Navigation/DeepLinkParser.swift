import Foundation

/// Maps `aggrwatch://…` and `https://<APP_URL>/…` links to in-app destinations. Mirrors the web routes;
/// strips an optional `/en` or `/fr` locale prefix. Screener `?dsl=` decoding lands with Phase 4.
enum DeepLink: Equatable {
  case tab(AppTab)
  case token(coinId: String, groupSlug: String?)
  case watchlists(segment: String?, groupSlug: String?)
  case screener(dsl: String?, sort: String?, q: String?)
  case settings
  #if DEBUG
  case debugBypassAuth
  #endif
}

enum DeepLinkParser {
  static func parse(_ url: URL, appOrigin: URL?) -> DeepLink? {
    var path: [String]
    let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
    if url.scheme == "aggrwatch" {
      path = [url.host].compactMap { $0 } + url.pathComponents.filter { $0 != "/" }
    } else if let origin = appOrigin, url.host == origin.host {
      path = url.pathComponents.filter { $0 != "/" }
    } else {
      return nil
    }
    if let first = path.first, ["en", "fr"].contains(first) { path.removeFirst() }
    func query(_ name: String) -> String? { comps?.queryItems?.first { $0.name == name }?.value }

    switch path.first {
    case nil, "dashboard": return .tab(.watchlists)
    case "overview": return .tab(.overview)
    case "comparison", "compare": return .tab(.compare)
    case "screener": return .screener(dsl: query("dsl"), sort: query("sort"), q: query("q"))
    case "settings": return .settings
    case "search": return .tab(.search)
    case "watchlists", "watchlist", "charts":
      if path.count >= 2 { return .token(coinId: path[1], groupSlug: query("wg")) }
      return .watchlists(segment: query("wt"), groupSlug: query("wg"))
    #if DEBUG
    case "debug":
      if path.count >= 2, path[1] == "bypass-auth" { return .debugBypassAuth }
      return nil
    #endif
    default: return nil
    }
  }
}
