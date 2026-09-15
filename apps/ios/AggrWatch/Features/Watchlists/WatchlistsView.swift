import AggrAPI
import AggrCore
import SwiftUI
import UIKit

/// The grid chooses a watchlist; its comparison remains mounted while the chooser is open.
struct WatchlistsView: View {
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var groupToDelete: WatchlistGroup?

  private var choosing: Bool { env.router.showsWatchlistChooser || env.watchlistData.selectedGroup == nil }
  private var transitionAnimation: Animation? { reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24) }

  var body: some View {
    let router = env.router
    let data = env.watchlistData
    GeometryReader { viewport in
      ZStack {
        if let error = data.bootstrapError {
          EmptyState(systemImage: "exclamationmark.triangle", title: "Couldn’t load watchlists", message: error,
                     actionTitle: "Retry") { data.start() }
        } else if !data.hasLoadedBootstrap {
          ProgressView()
        } else if data.groups.isEmpty {
          ScrollView {
            EmptyState(illustration: .watchlists, title: "Build your first watchlist",
                       message: "Add tokens, track your groups’ performance, and spot trends at a glance.",
                       actionTitle: "Create Watchlist") { router.sheet = .createGroup }
              .padding(.top, 24)
          }
        } else {
          // Keep the motion outside the group's identity: switching to a different
          // watchlist must fade in just like reopening the already-mounted one.
          ZStack {
            if let group = data.selectedGroup {
              ScrollView {
                WatchlistDetailSection(group: group)
                  .padding(.top, 12).padding(.bottom, 24)
              }
              .id(group.id)
            }
          }
          .modifier(WatchlistPageMotion(visible: !choosing, hiddenScale: 0.98))
          ScrollView {
            WatchlistsGrid(onSelect: { group in
              NavigationFeedback.pageChanged()
              env.selection.clear()
              withAnimation(transitionAnimation) {
                data.selectedGroupSlug = group.slug
                router.showsWatchlistChooser = false
              }
            }, onEdit: { router.sheet = .editGroup($0) }, onDelete: { groupToDelete = $0 })
            .environment(\.watchlistCardLoadingVisible, choosing && router.tab == .watchlists)
            .padding(.top, 12).padding(.bottom, 24)
          }
          .modifier(WatchlistPageMotion(visible: choosing, hiddenScale: 1.055))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .animation(transitionAnimation, value: choosing)
      .navigationTitle("")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          WatchlistNavigationHeader(viewportSize: viewport.size, onShowChooser: showChooser,
                                    onDelete: { groupToDelete = $0 })
        }
        .sharedBackgroundVisibility(.hidden)
      }
    }
    .alert("Delete \"\(groupToDelete?.name ?? "")\"?", isPresented: Binding(get: { groupToDelete != nil }, set: { if !$0 { groupToDelete = nil } }), presenting: groupToDelete) { group in
      Button("Cancel", role: .cancel) {}
      Button("Delete watchlist", role: .destructive) {
        Task {
          do { try await data.deleteGroup(group); env.toasts.success("Watchlist deleted") }
          catch { env.toasts.error("Failed to delete watchlist", error.localizedDescription) }
        }
      }
    } message: { _ in Text("Tokens in this watchlist will be removed from it.") }
  }
  private func showChooser() {
    guard !choosing else { return }
    NavigationFeedback.pageChanged()
    env.selection.clear()
    withAnimation(transitionAnimation) { env.router.showsWatchlistChooser = true }
  }
}

/// Observe navigation inside the toolbar host itself. Its content must update on
/// the first selection, independently of the parent navigation bar's cached body.
private struct WatchlistNavigationHeader: View {
  let viewportSize: CGSize
  let onShowChooser: () -> Void
  let onDelete: (WatchlistGroup) -> Void
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var choosing: Bool { env.router.showsWatchlistChooser || env.watchlistData.selectedGroup == nil }

  private var selecting: Bool {
    env.router.tab == .watchlists && env.selection.isActive && env.selection.ownerId != "search-add"
  }

  var body: some View {
    // Keep the native toolbar item and its bounds stable during selection. Replacing
    // it with separate principal/trailing items makes UIKit move both header states.
    ZStack {
      if selecting {
        selectionHeader
          .transition(reduceMotion ? .identity : AnyTransition(.blurReplace))
      } else {
        ZStack {
          comparisonHeader
            .modifier(WatchlistPageMotion(visible: !choosing, hiddenScale: 0.98,
                                         distanceAboveCenter: (viewportSize.height + 44) / 2))
          chooserHeader
            .modifier(WatchlistPageMotion(visible: choosing, hiddenScale: 1.055,
                                         distanceAboveCenter: (viewportSize.height + 44) / 2))
        }
        .transition(reduceMotion ? .identity : AnyTransition(.blurReplace))
      }
    }
    .frame(width: max(0, viewportSize.width - 40), height: 44)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: selecting)
    .animation(reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24), value: choosing)
  }

  private var selectionHeader: some View {
    HStack(spacing: 12) {
      Text("\(env.selection.selected.count) Selected")
        .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
        .lineLimit(1)
        .contentTransition(reduceMotion ? .identity : .numericText())
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: env.selection.selected.count)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("watchlist-selection-title")
      Button(env.selection.allSelected ? "Deselect all" : "Select all") {
        withAnimation(reduceMotion ? nil : .snappy) {
          env.selection.selectAll(!env.selection.allSelected)
        }
      }
      .font(.system(.body, design: .rounded, weight: .semibold))
      .padding(.horizontal, 16)
      .frame(height: 44)
      .buttonStyle(.plain)
      .foregroundStyle(.tint)
      .glassEffect(.regular.interactive(), in: .capsule)
      .disabled(env.selection.isRemoving)
    }
    .frame(height: 44)
  }

  private var chooserHeader: some View {
    HStack {
      SettingsProfileButton()
      Spacer(minLength: 0)
      Button { env.router.sheet = .createGroup } label: {
        Image("ActionCreateWatchlist").renderingMode(.template)
          .foregroundStyle(.tint)
          .frame(width: 44, height: 44)
      }
      .buttonStyle(.plain)
      .glassEffect(.regular.interactive(), in: .circle)
      .accessibilityLabel("Create watchlist")
    }
    .overlay {
      Text("Watchlists")
        .font(.system(.title2, design: .rounded, weight: .bold))
        .lineLimit(1)
        .padding(.horizontal, 52)
        .accessibilityAddTraits(.isHeader)
        .allowsHitTesting(false)
    }
  }

  private var comparisonHeader: some View {
    HStack(spacing: 12) {
      if let group = env.watchlistData.selectedGroup {
        Button(action: onShowChooser) {
          WatchlistGroupIconView(icon: group.icon, size: 20)
            .foregroundStyle(.tint)
            .frame(width: 44, height: 44).compositingGroup()
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityIdentifier("watchlist-chooser")
        .accessibilityLabel("Choose watchlist, current watchlist: \(group.name)")

        Button(action: onShowChooser) {
          Text(group.name)
            .font(.system(.title2, design: .rounded, weight: .bold))
            .lineLimit(1).truncationMode(.tail)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Return to watchlists, current watchlist: \(group.name)")
        .accessibilityIdentifier("comparison-title")

        HStack(spacing: 0) {
          Button { env.router.sheet = .coinSearch(targetGroupId: group.id) } label: {
            Image("ActionAddToken").renderingMode(.template)
              .frame(width: 44, height: 44)
          }
          .accessibilityLabel("Add token")
          Menu {
            Button { env.router.sheet = .editGroup(group) } label: { Label("Edit watchlist", systemImage: "pencil.tip.crop.circle") }
            if !group.isDefault {
              Button(role: .destructive) { onDelete(group) } label: { Label("Delete watchlist", systemImage: "trash.fill") }
            }
            Button { env.router.sheet = .createGroup } label: { Label("Create watchlist", image: "ActionCreateWatchlist") }
          } label: {
            Image(systemName: "ellipsis").frame(width: 44, height: 44)
          }
          .accessibilityLabel("Watchlist actions")
        }
        .font(.title3.weight(.semibold))
        .foregroundStyle(.tint)
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .capsule)
      }
    }
  }

}

/// Header and scroll content share a scale origin at the center of the page.
/// The toolbar lives above the scroll view, so its translation accounts for that
/// distance rather than shrinking each toolbar control around its own center.
private struct WatchlistPageMotion: ViewModifier {
  let visible: Bool
  let hiddenScale: CGFloat
  var distanceAboveCenter: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    let scale = visible || reduceMotion ? 1 : hiddenScale
    content
      .scaleEffect(scale)
      .offset(y: -distanceAboveCenter * (scale - 1))
      .opacity(visible ? 1 : 0)
      .allowsHitTesting(visible)
      .accessibilityHidden(!visible)
  }
}

/// Native button tracking cancels when a press becomes a scroll or context menu.
/// The card owns its centered content, glass, and halo transforms; the grid keeps its size.
private struct WatchlistCardPressStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .compositingGroup()
      .environment(\.watchlistCardPressScale, configuration.isPressed && !reduceMotion ? 0.975 : 1)
      .opacity(configuration.isPressed && reduceMotion ? 0.9 : 1)
      .animation(reduceMotion ? nil : .easeOut(duration: configuration.isPressed ? 0.06 : 0.12),
                 value: configuration.isPressed)
  }
}

/// Local display order only; never changes the saved watchlists or selected group.
enum WatchlistCardSort: String, CaseIterable {
  case original, changeDescending, changeAscending, nameAscending, nameDescending, mostTokens, fewestTokens

  var title: String {
    switch self {
    case .original: "Oldest first (default)"
    case .changeDescending: "24h change: high to low"
    case .changeAscending: "24h change: low to high"
    case .nameAscending: "Name: A–Z"
    case .nameDescending: "Name: Z–A"
    case .mostTokens: "Most tokens"
    case .fewestTokens: "Fewest tokens"
    }
  }

  func ordered(_ groups: [WatchlistGroup], change: (WatchlistGroup) -> Double?,
               tokenCount: (WatchlistGroup) -> Int) -> [WatchlistGroup] {
    if self == .original {
      // Preserve the stored "original" preference while making its order explicit.
      // Fall back to Convex's document timestamp for older records without createdAt.
      let dated = groups.enumerated().map { index, group in
        let date = [group.createdAt, group.creationTime].first { $0.isFinite && $0 > 0 } ?? .infinity
        return (index: index, group: group, date: date)
      }
      return dated.sorted {
        $0.date == $1.date ? $0.index < $1.index : $0.date < $1.date
      }.map(\.group)
    }
    // Calculate once per group, not on every comparison while sorting.
    let entries = groups.enumerated().map { index, group in
      let value = change(group)
      return (index: index, group: group, change: value.flatMap { $0.isFinite ? $0 : nil }, count: tokenCount(group))
    }
    return entries.sorted { lhs, rhs in
      switch self {
      case .original: break
      case .changeDescending, .changeAscending:
        // Unavailable prices always go last, including when sorting ascending.
        if let a = lhs.change, let b = rhs.change {
          if a != b { return self == .changeDescending ? a > b : a < b }
        } else if (lhs.change == nil) != (rhs.change == nil) {
          return lhs.change != nil
        }
      case .nameAscending, .nameDescending:
        let order = lhs.group.name.localizedStandardCompare(rhs.group.name)
        if order != .orderedSame { return self == .nameAscending ? order == .orderedAscending : order == .orderedDescending }
      case .mostTokens, .fewestTokens:
        if lhs.count != rhs.count { return self == .mostTokens ? lhs.count > rhs.count : lhs.count < rhs.count }
      }
      return lhs.index < rhs.index
    }.map(\.group)
  }
}

/// `watchlists-grid.tsx`: responsive grid of cards.
struct WatchlistsGrid: View {
  @Environment(AppEnvironment.self) private var env
  @State private var cardWidth: CGFloat = 0
  @AppStorage("watchlists.cardSort") private var sort: WatchlistCardSort = .original
  let onSelect: (WatchlistGroup) -> Void
  let onEdit: (WatchlistGroup) -> Void
  let onDelete: (WatchlistGroup) -> Void

  var body: some View {
    let data = env.watchlistData
    VStack(spacing: 12) {
      HStack {
        Text("Your Watchlists")
          .font(.system(.headline, design: .rounded, weight: .semibold))
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Menu {
          Picker("Sort watchlists", selection: $sort) {
            ForEach(WatchlistCardSort.allCases, id: \.self) { option in
              Text(option.title).tag(option)
            }
          }
        } label: {
          Image(systemName: "line.3.horizontal.decrease")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(sort == .original ? Color.secondary : Color.accentColor)
            .frame(width: 44, height: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Sort watchlists")
        .accessibilityValue(sort.title)
        .accessibilityIdentifier("watchlist-sort")
      }
      .padding(.leading, 20)
      .padding(.trailing, 12)

      cards(data: data)
    }
  }

  private func cards(data: WatchlistDataStore) -> some View {
    // Share glass rendering without blending neighboring cards together.
    GlassEffectContainer(spacing: 0) {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 0), spacing: 8), count: 2), spacing: 8) {
        ForEach(sort.ordered(data.groups, change: { data.aggregateChange1d(for: $0)?.value },
                             tokenCount: { data.coinIds(in: $0).count })) { group in
          let ids = data.coinIds(in: group)
          let coins = ids.compactMap { data.quote($0) }
          let card = WatchlistCardView(
            name: group.name, icon: group.icon, color: group.color,
            coins: coins, coinsCount: ids.count,
            aggregate: data.aggregate1dByGroup[group.id] ?? [],
            aggregateChange: data.aggregateChange1d(for: group),
            isLoading: data.isQuotesLoading || data.aggregatePendingGroupIDs.contains(group.id),
            selected: data.selectedGroup?.id == group.id,
            loadingIdentity: group.id
          )
          Button { onSelect(group) } label: {
            card
              .contentShape(.rect(cornerRadius: 24))
          }
          .buttonStyle(WatchlistCardPressStyle())
          .contentShape(.contextMenuPreview, .rect(cornerRadius: 24))
          .accessibilityIdentifier("watchlist-card-\(group.id)")
          .accessibilityHint("Open watchlist comparison")
          .accessibilityAddTraits(data.selectedGroup?.id == group.id ? .isSelected : [])
          .contextMenu {
            Button { onEdit(group) } label: { Label("Edit", systemImage: "pencil.tip.crop.circle") }
            if !group.isDefault {
              Button(role: .destructive) { onDelete(group) } label: { Label("Delete", systemImage: "trash.fill") }
            }
          } preview: {
            // A dedicated glass host lifts the complete card, not just its selection halo.
            GlassEffectContainer(spacing: 0) { card }
              .modifier(WatchlistCardLoadingOverlay())
              .frame(width: cardWidth > 0 ? cardWidth : nil)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    }
    .modifier(WatchlistCardLoadingOverlay())
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
      cardWidth = max(0, (width - 8) / 2)
    }
    .padding(.horizontal, 12)
    .background { WatchlistTouchResponse().frame(width: 0, height: 0) }
  }
}

/// Deliver touch-down to the grid's buttons immediately. UIKit still owns tap,
/// scroll cancellation, and context menus; no second gesture activates a card.
private struct WatchlistTouchResponse: UIViewRepresentable {
  func makeUIView(context: Context) -> TouchResponseView { TouchResponseView() }
  func updateUIView(_ uiView: TouchResponseView, context: Context) { uiView.configureScrollView() }
  static func dismantleUIView(_ uiView: TouchResponseView, coordinator: ()) { uiView.restore() }

  final class TouchResponseView: UIView {
    private weak var configuredScroll: UIScrollView?
    private var originalDelay = true

    override func didMoveToWindow() {
      super.didMoveToWindow()
      configureScrollView()
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      configureScrollView()
    }

    func configureScrollView() {
      var ancestor = superview
      while let view = ancestor {
        if let scroll = view as? UIScrollView {
          guard configuredScroll !== scroll else { return }
          restore()
          configuredScroll = scroll
          originalDelay = scroll.delaysContentTouches
          scroll.delaysContentTouches = false
          return
        }
        ancestor = view.superview
      }
    }

    func restore() {
      configuredScroll?.delaysContentTouches = originalDelay
      configuredScroll = nil
    }
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
