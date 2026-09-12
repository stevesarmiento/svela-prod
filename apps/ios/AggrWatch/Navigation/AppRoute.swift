import AggrAPI
import Foundation
import Observation

/// Pushable destinations (per-tab `NavigationStack`).
enum Route: Hashable {
  case tokenDetail(coinId: String, groupSlug: String?)
}

/// Modal destinations.
enum SheetRoute: Identifiable, Hashable {
  case createGroup
  case editGroup(WatchlistGroup)
  case coinSearch(targetGroupId: String?)
  case analyze([String])
  case settings

  var id: String {
    switch self {
    case .createGroup: "createGroup"
    case .editGroup(let g): "editGroup:\(g.id)"
    case .coinSearch(let g): "coinSearch:\(g ?? "-")"
    case .analyze(let ids): "analyze:\(ids.sorted().joined(separator: ","))"
    case .settings: "settings"
    }
  }
}

@Observable
final class AppRouter {
  var tab: AppTab = .watchlists
  var overviewPath: [Route] = []
  var watchlistsPath: [Route] = []
  var comparePath: [Route] = []
  var screenerPath: [Route] = []
  var searchPath: [Route] = []
  var sheet: SheetRoute?
  /// Screener deep link waiting for the screener store to consume (`/screener?dsl=&sort=&q=`).
  var pendingScreenerLink: (dsl: String?, sort: String?, q: String?)?

  func push(_ route: Route, on tab: AppTab? = nil) {
    let target = tab ?? self.tab
    switch target {
    case .overview: overviewPath.append(route)
    case .watchlists: watchlistsPath.append(route)
    case .compare: comparePath.append(route)
    case .screener: screenerPath.append(route)
    case .search: searchPath.append(route)
    }
  }

  func openToken(_ coinId: String, groupSlug: String? = nil) {
    push(.tokenDetail(coinId: coinId, groupSlug: groupSlug))
  }

  /// Route a parsed deep link: switch tab, push token detail, present sheets.
  func handle(_ link: DeepLink, watchlistData: WatchlistDataStore) {
    switch link {
    case .tab(let t): tab = t
    case .token(let coinId, let slug):
      tab = .watchlists
      if let slug { watchlistData.selectedGroupSlug = slug }
      watchlistsPath = [.tokenDetail(coinId: coinId, groupSlug: slug)]
    case .watchlists(let segment, let slug):
      tab = .watchlists
      watchlistsPath = []
      if let slug { watchlistData.selectedGroupSlug = slug }
      if let segment { UserDefaults.standard.set(segment, forKey: "watchlists.wt") }
    case .screener(let dsl, let sort, let q):
      pendingScreenerLink = (dsl, sort, q)
      tab = .screener
    case .settings: sheet = .settings
    #if DEBUG
    case .debugBypassAuth: break
    #endif
    }
  }

  func resetAll() {
    overviewPath = []; watchlistsPath = []; comparePath = []; screenerPath = []; searchPath = []
    sheet = nil; pendingScreenerLink = nil; tab = .watchlists
  }
}
