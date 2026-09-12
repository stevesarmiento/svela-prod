import AggrAPI
import AggrCore
import SwiftUI

/// `/watchlists` — Grid | Chart segments (`wt`), selected group (`wg`), Create / Add token actions.
struct WatchlistsView: View {
  enum Segment: String { case grid, chart }

  @Environment(AppEnvironment.self) private var env
  @AppStorage("watchlists.wt") private var segmentRaw = Segment.grid.rawValue
  @State private var groupToDelete: WatchlistGroup?

  private var segment: Binding<Segment> {
    Binding(get: { Segment(rawValue: segmentRaw) ?? .grid }, set: { segmentRaw = $0.rawValue })
  }

  var body: some View {
    @Bindable var router = env.router
    let data = env.watchlistData
    ScrollView {
      VStack(spacing: 16) {
        Picker("View", selection: segment) {
          Text("Grid").tag(Segment.grid)
          Text("Chart").tag(Segment.chart)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)

        if !data.hasLoadedBootstrap {
          ProgressView().padding(.top, 60)
        } else if data.groups.isEmpty {
          EmptyState(systemImage: "bookmark", title: "No watchlists yet",
                     message: "Create a watchlist to start tracking tokens.",
                     actionTitle: "Create Watchlist") { router.sheet = .createGroup }
        } else if segment.wrappedValue == .grid {
          WatchlistsGrid(onSelect: { group in
            data.selectedGroupSlug = group.slug
            withAnimation(.snappy) { segmentRaw = Segment.chart.rawValue }
          }, onEdit: { router.sheet = .editGroup($0) }, onDelete: { groupToDelete = $0 })
        } else {
          WatchlistDetailSection()
        }
      }
      .padding(.bottom, 24)
    }
    .navigationTitle("Watchlists")
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button { router.sheet = .settings } label: { Label("Settings", systemImage: "person.crop.circle") }
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button { router.sheet = .coinSearch(targetGroupId: data.selectedGroup?.id) } label: { Label("Add token", systemImage: "plus.circle") }
          .disabled(data.selectedGroup == nil)
        Button { router.sheet = .createGroup } label: { Label("Create watchlist", systemImage: "plus.square.on.square") }
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
        WatchlistCardView(
          name: group.name, icon: group.icon, color: group.color,
          coins: coins, coinsCount: ids.count,
          aggregate: data.aggregate1dByGroup[group.id] ?? [],
          aggregateChange: data.aggregateChange1d(for: group),
          isLoading: data.isQuotesLoading || (data.isAggregateLoading && !ids.isEmpty && (data.aggregate1dByGroup[group.id] ?? []).isEmpty),
          selected: data.selectedGroup?.id == group.id
        )
        .contentShape(.rect(cornerRadius: 20))
        .onTapGesture { onSelect(group) }
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
