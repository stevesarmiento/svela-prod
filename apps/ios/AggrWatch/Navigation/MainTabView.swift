import AggrAPI
import SwiftUI

/// Mirrors the web bottom dock (`components/navigation/bottom-nav-constants.ts`): Overview, Watchlists, Compare, Screener.
/// The system search tab replaces the `/` command palette.
enum AppTab: Hashable {
  case overview, watchlists, compare, screener, search
}

struct MainTabView: View {
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    @Bindable var router = env.router
    TabView(selection: $router.tab) {
      Tab("Overview", systemImage: "house.fill", value: .overview) {
        NavigationStack(path: $router.overviewPath) {
          OverviewView().navigationDestination(for: Route.self, destination: destination)
        }
      }
      Tab("Watchlists", systemImage: "bookmark.fill", value: .watchlists) {
        NavigationStack(path: $router.watchlistsPath) {
          WatchlistsView().navigationDestination(for: Route.self, destination: destination)
        }
      }
      Tab("Compare", systemImage: "chart.xyaxis.line", value: .compare) {
        NavigationStack(path: $router.comparePath) {
          CompareView().navigationDestination(for: Route.self, destination: destination)
        }
      }
      Tab("Screener", systemImage: "binoculars.fill", value: .screener) {
        NavigationStack(path: $router.screenerPath) {
          ScreenerView().navigationDestination(for: Route.self, destination: destination)
        }
      }
      Tab(value: .search, role: .search) {
        NavigationStack(path: $router.searchPath) {
          CoinSearchView(mode: .navigate).navigationDestination(for: Route.self, destination: destination)
        }
      }
    }
    .tabBarMinimizeBehavior(.onScrollDown)
    .modifier(SelectionAccessoryModifier(isActive: env.selection.isActive))
    .sheet(item: $router.sheet) { sheet in
      switch sheet {
      case .createGroup: GroupEditorSheet(mode: .create)
      case .editGroup(let g): GroupEditorSheet(mode: .edit(g))
      case .coinSearch(let targetGroupId):
        NavigationStack { CoinSearchView(mode: .addToWatchlist, initialTargetGroupId: targetGroupId) }
          .presentationDetents([.large])
      case .analyze(let ids):
        if ids.count == 1, let id = ids.first { DeepAnalysisSheet(coinId: id) } else { MultiAnalysisSheet(coinIds: ids) }
      case .settings: SettingsView()
      }
    }
    .overlay { ToastOverlay() }
    .task { env.warnIfAPIHostUnreachableFromDevice() }
    .task(id: "\(env.isReadyForUserData)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      if env.isReadyForUserData && env.isSceneActive { await env.watchlistData.refreshOnForeground() }
      else { env.watchlistData.pause() }
    }
  }

  @ViewBuilder
  private func destination(_ route: Route) -> some View {
    switch route {
    case .tokenDetail(let coinId, let groupSlug): TokenDetailView(coinId: coinId, groupSlug: groupSlug)
    }
  }
}

/// Attaches the selection dock only while a selection is active (`tabViewBottomAccessory` has no enable flag).
private struct SelectionAccessoryModifier: ViewModifier {
  let isActive: Bool
  func body(content: Content) -> some View {
    if isActive { content.tabViewBottomAccessory { SelectionAccessoryBar() } } else { content }
  }
}

private struct PlaceholderScreen: View {
  let title: String
  var body: some View {
    ContentUnavailableView(title, systemImage: "hammer", description: Text("Coming in a later phase."))
      .navigationTitle(title)
  }
}


