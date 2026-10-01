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

/// A full-screen analysis page. Ids keep the order the tokens were chosen; `sourceID` is the
/// zoom / collapse anchor ("selection-analyze" or "token-actions|<coinId>").
struct AnalysisPresentation: Identifiable, Hashable {
  let coinIds: [String]
  let sourceID: String?
  var id: String { "\(sourceID ?? "link")|\(coinIds.joined(separator: ","))" }
}

/// Modal destinations.
enum SheetRoute: Identifiable, Hashable {
  case createGroup
  case editGroup(WatchlistGroup)
  case coinSearch(targetGroupId: String?)
  case settings

  var id: String {
    switch self {
    case .createGroup: "createGroup"
    case .editGroup(let g): "editGroup:\(g.id)"
    case .coinSearch(let g): "coinSearch:\(g ?? "-")"
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
  /// Stacks over the token page when both are set.
  var analysisPresentation: AnalysisPresentation?
  private enum PendingPage { case token, analysis }
  /// A sheet that waits for a full-screen page to leave before it presents.
  private var sheetAfterPageDismissal: (route: SheetRoute, after: PendingPage)?
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

  /// Opens the analysis page for one token (deep analysis) or several (comparison).
  func openAnalysis(_ coinIds: [String], sourceID: String? = nil) {
    guard !coinIds.isEmpty else { return }
    analysisPresentation = AnalysisPresentation(coinIds: coinIds, sourceID: sourceID)
  }

  func tokenDidDismiss() { deliverPendingSheet(after: .token) }
  func analysisDidDismiss() { deliverPendingSheet(after: .analysis) }

  private func deliverPendingSheet(after page: PendingPage) {
    guard let pending = sheetAfterPageDismissal, pending.after == page else { return }
    sheetAfterPageDismissal = nil
    sheet = pending.route
  }

  /// Route a parsed deep link: switch tab, present token pages and sheets.
  func handle(_ link: DeepLink, watchlistData: WatchlistDataStore) {
    sheetAfterPageDismissal = nil
    switch link {
    case .tab(let t): analysisPresentation = nil; tokenPresentation = nil; tab = t
    case .token(let coinId, let slug):
      tab = .watchlists
      if let slug { watchlistData.selectedGroupSlug = slug }
      watchlistsPath = []
      showsWatchlistChooser = false
      analysisPresentation = nil
      openToken(coinId, groupSlug: slug)
    case .watchlists(let segment, let slug):
      tab = .watchlists
      watchlistsPath = []
      analysisPresentation = nil
      tokenPresentation = nil
      if let slug { watchlistData.selectedGroupSlug = slug }
      if let segment { showsWatchlistChooser = segment != "chart" }
      else if slug != nil { showsWatchlistChooser = false }
    case .screener(let dsl, let sort, let q):
      analysisPresentation = nil
      tokenPresentation = nil
      pendingScreenerLink = (dsl, sort, q)
      tab = .screener
    case .settings:
      if tokenPresentation != nil {
        sheetAfterPageDismissal = (.settings, .token)
        analysisPresentation = nil
        tokenPresentation = nil
      } else if analysisPresentation != nil {
        sheetAfterPageDismissal = (.settings, .analysis)
        analysisPresentation = nil
      } else { sheet = .settings }
    #if DEBUG
    case .debugBypassAuth: break
    #endif
    }
  }

  func resetAll() {
    overviewPath = []; watchlistsPath = []; comparePath = []; screenerPath = []; searchPath = []
    sheet = nil; tokenPresentation = nil; analysisPresentation = nil; sheetAfterPageDismissal = nil; pendingScreenerLink = nil; tab = .watchlists
    showsWatchlistChooser = true
  }
}
