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
      Tab(value: .overview) {
        NavigationStack(path: $router.overviewPath) {
          OverviewView().navigationDestination(for: Route.self, destination: destination)
            .modifier(SelectionNavigationModifier(tab: .overview))
        }
      } label: {
        Image("NavigationOverview").renderingMode(.template).accessibilityLabel("Overview")
      }
      Tab(value: .watchlists) {
        NavigationStack(path: $router.watchlistsPath) {
          WatchlistsView().navigationDestination(for: Route.self, destination: destination)
            .modifier(SelectionNavigationModifier(tab: .watchlists))
        }
      } label: {
        Image("NavigationWatchlists").renderingMode(.template).accessibilityLabel("Watchlists")
      }
      Tab(value: .compare) {
        NavigationStack(path: $router.comparePath) {
          CompareView().navigationDestination(for: Route.self, destination: destination)
            .modifier(SelectionNavigationModifier(tab: .compare))
        }
      } label: {
        Image("NavigationCompare").renderingMode(.template).accessibilityLabel("Compare")
      }
      Tab(value: .screener) {
        NavigationStack(path: $router.screenerPath) {
          ScreenerView().navigationDestination(for: Route.self, destination: destination)
            .modifier(SelectionNavigationModifier(tab: .screener))
        }
      } label: {
        Image("NavigationScreener").renderingMode(.template).accessibilityLabel("Screener")
      }
      Tab(value: .search, role: .search) {
        NavigationStack(path: $router.searchPath) {
          CoinSearchView(mode: .navigate).navigationDestination(for: Route.self, destination: destination)
            .modifier(SelectionNavigationModifier(tab: .search))
        }
      } label: {
        Image(systemName: "magnifyingglass").accessibilityLabel("Search")
      }
    }
    .tabBarMinimizeBehavior(.onScrollDown)
    .onChange(of: router.tab) { _, _ in env.selection.clear() }
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

/// Keep the TabView and its navigation stacks alive; only their controls change.
/// Selection replaces the system tab bar rather than adding an accessory above it.
private struct SelectionNavigationModifier: ViewModifier {
  let tab: AppTab
  @Environment(AppEnvironment.self) private var env
  @State private var confirmingRemoval = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private var selecting: Bool { env.router.tab == tab && env.selection.isActive }

  func body(content: Content) -> some View {
    content
      .toolbar(selecting ? .hidden : .visible, for: .tabBar)
      .navigationBarTitleDisplayMode(selecting ? .inline : .automatic)
      .toolbar {
        if selecting {
          ToolbarItem(placement: .principal) {
            Text("\(env.selection.selected.count) Selected")
              .font(.headline.monospacedDigit())
              .contentTransition(.numericText())
          }
          ToolbarItem(placement: .topBarTrailing) {
            Button(env.selection.allSelected ? "Deselect all" : "Select all") {
              withAnimation(reduceMotion ? nil : .snappy) { env.selection.selectAll(!env.selection.allSelected) }
            }
            .disabled(env.selection.isRemoving)
          }
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 8) {
          if selecting {
            TokenSelectionActionBar(
              canRemove: env.selection.canRemove, isBusy: env.selection.isRemoving,
              canAnalyze: env.selection.canAnalyze,
              onCancel: { withAnimation(reduceMotion ? nil : .snappy) { env.selection.clear() } },
              onRemove: { confirmingRemoval = true },
              onAnalyze: { env.selection.onAnalyze?(Array(env.selection.selected)) }
            )
            .transition(SelectionMotion.disclose(anchor: .bottom, edge: .bottom, reduceMotion: reduceMotion))
            if !env.selection.canAnalyze && !env.selection.isRemoving {
              Text("Select up to \(SelectionStore.maxAnalyzeTokens) different tokens to analyze.")
                .font(.caption).foregroundStyle(.secondary)
                .padding(.horizontal, 20)
                .transition(.opacity)
            }
          }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, selecting ? 8 : 0)
        .animation(reduceMotion ? nil : .snappy, value: selecting)
      }
      .animation(reduceMotion ? nil : .snappy, value: selecting)
      .confirmationDialog("Remove selected tokens?", isPresented: $confirmingRemoval, titleVisibility: .visible) {
        Button("Remove \(env.selection.selected.count) tokens", role: .destructive) {
          Task { await env.selection.removeSelected(toasts: env.toasts) }
        }
      } message: {
        Text("Tokens are removed from their selected watchlists. Holdings are also cleared when a token leaves its last watchlist.")
      }
      .onChange(of: selecting) { _, active in if !active { confirmingRemoval = false } }
  }
}

private struct PlaceholderScreen: View {
  let title: String
  var body: some View {
    ContentUnavailableView(title, systemImage: "hammer", description: Text("Coming in a later phase."))
      .navigationTitle(title)
  }
}



#if DEBUG
#Preview("Bottom navigation") {
  PreviewHost(navigation: false) { _ in MainTabView() }
}
#Preview("Watchlists and swipe selection") {
  PreviewHost(tab: .watchlists, navigation: false) { _ in MainTabView() }
}
#Preview("Screener navigation") {
  PreviewHost(tab: .screener, navigation: false) { _ in MainTabView() }
}
#endif

#if DEBUG
private struct SelectionTabPreview: View {
  @State private var selectedInitialRows = false
  var body: some View {
    PreviewHost(tab: .screener, navigation: false) { env in
      MainTabView()
        .task(id: env.selection.selectableIds) {
          guard !selectedInitialRows, env.selection.selectableIds.count >= 2 else { return }
          selectedInitialRows = true
          for id in env.selection.selectableIds.prefix(2) { env.selection.toggle(id) }
        }
    }
  }
}
#Preview("Selection replaces bottom navigation") { SelectionTabPreview() }
#endif
