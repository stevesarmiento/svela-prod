import AggrAPI
import AggrCore
import SwiftUI

/// The grid chooses a watchlist; its comparison remains mounted while the chooser is open.
struct WatchlistsView: View {
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var groupToDelete: WatchlistGroup?

  private var choosing: Bool { env.router.showsWatchlistChooser || env.watchlistData.selectedGroup == nil }
  private var transitionAnimation: Animation { reduceMotion ? .easeOut(duration: 0.16) : .spring(duration: 0.26, bounce: 0.08) }

  var body: some View {
    @Bindable var router = env.router
    let data = env.watchlistData
    ZStack {
      if let error = data.bootstrapError {
        EmptyState(systemImage: "exclamationmark.triangle", title: "Couldn’t load watchlists", message: error,
                   actionTitle: "Retry") { data.start() }
      } else if !data.hasLoadedBootstrap {
        ProgressView()
      } else if data.groups.isEmpty {
        EmptyState(systemImage: "bookmark", title: "No watchlists yet",
                   message: "Create a watchlist to start tracking tokens.",
                   actionTitle: "Create Watchlist") { router.sheet = .createGroup }
      } else {
        if let group = data.selectedGroup {
          ScrollView {
            WatchlistDetailSection()
              .padding(.top, 12).padding(.bottom, 24)
          }
          .id(group.id)
          .opacity(choosing ? 0 : 1)
          .scaleEffect(reduceMotion || !choosing ? 1 : 0.98)
          .allowsHitTesting(!choosing)
          .accessibilityHidden(choosing)
        }
        ScrollView {
          WatchlistsGrid(onSelect: { group in
            env.selection.clear()
            withAnimation(transitionAnimation) {
              data.selectedGroupSlug = group.slug
              router.showsWatchlistChooser = false
            }
          }, onEdit: { router.sheet = .editGroup($0) }, onDelete: { groupToDelete = $0 })
          .padding(.top, 12).padding(.bottom, 24)
        }
        .opacity(choosing ? 1 : 0)
        .scaleEffect(reduceMotion || choosing ? 1 : 1.02)
        .allowsHitTesting(choosing)
        .accessibilityHidden(!choosing)
      }
    }
    .animation(transitionAnimation, value: choosing)
    .navigationTitle(choosing ? "Watchlists" : "")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if !env.selection.isActive {
        if choosing {
          ToolbarItem(placement: .principal) {
            Text("Watchlists")
              .font(.system(.title2, design: .rounded, weight: .bold))
              .accessibilityAddTraits(.isHeader)
          }
        }
        ToolbarItem(placement: .topBarLeading) {
          if !choosing, let group = data.selectedGroup {
            Button(action: showChooser) {
              WatchlistGroupIconView(icon: group.icon, size: 24)
                .frame(width: 28, height: 28).compositingGroup()
            }
            .accessibilityIdentifier("watchlist-chooser")
            .accessibilityLabel("Choose watchlist, current watchlist: \(group.name)")
          } else {
            Button { router.sheet = .settings } label: { Label("Settings", systemImage: "person.crop.circle") }
          }
        }
        if !choosing, let group = data.selectedGroup {
          ToolbarItem(placement: .topBarLeading) {
            Button(action: showChooser) {
              Text(group.name)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .lineLimit(1).truncationMode(.tail)
                .frame(maxWidth: 180, alignment: .leading)
            }
            .buttonStyle(.plain)
            .fixedSize(horizontal: true, vertical: false)
            .accessibilityLabel("Return to watchlists, current watchlist: \(group.name)")
            .accessibilityIdentifier("comparison-title")
          }
          .sharedBackgroundVisibility(.hidden)
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
          if choosing {
            Button { router.sheet = .createGroup } label: { Label("Create watchlist", systemImage: "plus.square.on.square") }
          } else {
            Button { router.sheet = .coinSearch(targetGroupId: data.selectedGroup?.id) } label: { Label("Add token", systemImage: "plus") }
            Menu {
              if let group = data.selectedGroup {
                Button { router.sheet = .editGroup(group) } label: { Label("Edit watchlist", systemImage: "pencil") }
                if !group.isDefault {
                  Button(role: .destructive) { groupToDelete = group } label: { Label("Delete watchlist", systemImage: "trash") }
                }
              }
              Button { router.sheet = .createGroup } label: { Label("Create watchlist", systemImage: "plus.square.on.square") }
            } label: { Label("Watchlist actions", systemImage: "ellipsis") }
          }
        }
      }
    }
    .confirmationDialog("Delete \"\(groupToDelete?.name ?? "")\"?", isPresented: Binding(get: { groupToDelete != nil }, set: { if !$0 { groupToDelete = nil } }), titleVisibility: .visible) {
      Button("Delete watchlist", role: .destructive) {
        guard let g = groupToDelete else { return }
        Task {
          do { try await data.deleteGroup(g); env.toasts.success("Watchlist deleted") }
          catch { env.toasts.error("Failed to delete watchlist", error.localizedDescription) }
        }
      }
    } message: { Text("Tokens in this watchlist will be removed from it.") }
  }
  private func showChooser() {
    env.selection.clear()
    withAnimation(transitionAnimation) { env.router.showsWatchlistChooser = true }
  }
}

/// `watchlists-grid.tsx`: responsive grid of cards.
struct WatchlistsGrid: View {
  @Environment(AppEnvironment.self) private var env
  let onSelect: (WatchlistGroup) -> Void
  let onEdit: (WatchlistGroup) -> Void
  let onDelete: (WatchlistGroup) -> Void

  var body: some View {
    let data = env.watchlistData
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 16)], spacing: 16) {
      ForEach(data.groups) { group in
        let ids = data.coinIds(in: group)
        let coins = ids.compactMap { data.quote($0) }
        Button { onSelect(group) } label: {
          WatchlistCardView(
            name: group.name, icon: group.icon, color: group.color,
            coins: coins, coinsCount: ids.count,
            aggregate: data.aggregate1dByGroup[group.id] ?? [],
            aggregateChange: data.aggregateChange1d(for: group),
            isLoading: data.isQuotesLoading || (data.isAggregateLoading && !ids.isEmpty && (data.aggregate1dByGroup[group.id] ?? []).isEmpty),
            selected: data.selectedGroup?.id == group.id
          )
          .contentShape(.rect(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("watchlist-card-\(group.id)")
        .accessibilityHint("Open watchlist comparison")
        .contextMenu {
          Button { onEdit(group) } label: { Label("Edit", systemImage: "pencil") }
          if !group.isDefault {
            Button(role: .destructive) { onDelete(group) } label: { Label("Delete", systemImage: "trash") }
          }
        }
      }
    }
    .padding(.horizontal, 16)
  }
}

#if DEBUG
#Preview("Watchlist chooser") {
  PreviewHost(tab: .watchlists) { env in
    WatchlistsView().onAppear { env.router.showsWatchlistChooser = true }
  }
}
#Preview("Selected comparison") {
  PreviewHost(tab: .watchlists) { env in
    WatchlistsView().onAppear { env.router.showsWatchlistChooser = false }
  }
}
#Preview("Empty") {
  PreviewHost(state: .empty, tab: .watchlists) { _ in WatchlistsView() }
}
#Preview("Loading") {
  PreviewHost(state: .loading, tab: .watchlists) { _ in WatchlistsView() }
}
#Preview("Load error") {
  PreviewHost(state: .error, tab: .watchlists) { _ in WatchlistsView() }
}
#endif

#if DEBUG
#Preview("Watchlist grid") {
  PreviewHost { _ in ScrollView { WatchlistsGrid(onSelect: { _ in }, onEdit: { _ in }, onDelete: { _ in }) } }
}
#endif
