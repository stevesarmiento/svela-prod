import AggrAPI
import Foundation
import Observation

/// Pushable destinations (per-tab `NavigationStack`).
enum Route: Hashable {
  case tokenDetail(coinId: String, groupSlug: String?)
}

/// Source identity includes the row's context: a token can appear in several watchlists.
struct TokenPresentation: Identifiable, Hashable {
  let coinId: String
  let groupSlug: String?
  let sourceID: String?
  var id: String { "\(sourceID ?? "link")|\(groupSlug ?? "")|\(coinId)" }
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
  var tokenPresentation: TokenPresentation?
  private var sheetAfterTokenDismissal: SheetRoute?
  // Honor existing web links and the previously saved Grid / Chart preference.
  var showsWatchlistChooser = UserDefaults.standard.string(forKey: "watchlists.wt") != "chart" {
    didSet { UserDefaults.standard.set(showsWatchlistChooser ? "grid" : "chart", forKey: "watchlists.wt") }
  }
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

  func openToken(_ coinId: String, groupSlug: String? = nil, sourceID: String? = nil) {
    tokenPresentation = TokenPresentation(coinId: coinId, groupSlug: groupSlug, sourceID: sourceID)
  }

  func tokenDidDismiss() {
    if let next = sheetAfterTokenDismissal {
      sheetAfterTokenDismissal = nil
      sheet = next
    }
  }

  /// Route a parsed deep link: switch tab, present token pages and sheets.
  func handle(_ link: DeepLink, watchlistData: WatchlistDataStore) {
    sheetAfterTokenDismissal = nil
    switch link {
    case .tab(let t): tokenPresentation = nil; tab = t
    case .token(let coinId, let slug):
      tab = .watchlists
      if let slug { watchlistData.selectedGroupSlug = slug }
      watchlistsPath = []
      showsWatchlistChooser = false
      openToken(coinId, groupSlug: slug)
    case .watchlists(let segment, let slug):
      tab = .watchlists
      watchlistsPath = []
      tokenPresentation = nil
      if let slug { watchlistData.selectedGroupSlug = slug }
      if let segment { showsWatchlistChooser = segment != "chart" }
      else if slug != nil { showsWatchlistChooser = false }
    case .screener(let dsl, let sort, let q):
      tokenPresentation = nil
      pendingScreenerLink = (dsl, sort, q)
      tab = .screener
    case .settings:
      if tokenPresentation != nil {
        sheetAfterTokenDismissal = .settings
        tokenPresentation = nil
      } else { sheet = .settings }
    #if DEBUG
    case .debugBypassAuth: break
    #endif
    }
  }

  func resetAll() {
    overviewPath = []; watchlistsPath = []; comparePath = []; screenerPath = []; searchPath = []
    sheet = nil; tokenPresentation = nil; sheetAfterTokenDismissal = nil; pendingScreenerLink = nil; tab = .watchlists
    showsWatchlistChooser = true
  }
}
