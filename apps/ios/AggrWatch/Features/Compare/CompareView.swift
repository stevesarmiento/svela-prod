import AggrAPI
import AggrCore
import SwiftUI

/// `/comparison` — aggregate view across ALL watchlists: normalized multi-line chart + accordion table.
struct CompareView: View {
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var scale: TimeScale = .d7
  @State private var focusedGroupIDs: Set<String> = []
  @State private var expanded: Set<String> = []
  @AppStorage("compare.watchlistSort") private var sort: WatchlistCardSort = .original
  @State private var seriesByGroup: [String: [TimePoint]] = [:]
  @State private var changeByCoin: [String: Double] = [:]
  @State private var loading = false
  /// Scrubbing the comparison chart turns the accordion rows into its readout.
  @State private var scrub = ComparisonScrubStore()
  @State private var membershipKey = ""

  var body: some View {
    let data = env.watchlistData
    ScrollView {
      VStack(spacing: 16) {
        if let error = data.bootstrapError {
          EmptyState(systemImage: "exclamationmark.triangle", title: "Couldn’t load watchlists", message: error,
                     actionTitle: "Retry") { data.start() }
        } else if !data.hasLoadedBootstrap {
          RingLoader(size: .large).padding(.top, 60)
        } else if data.groups.isEmpty {
          EmptyState(illustration: .comparison, title: "No watchlists to compare", message: "Create some watchlists to compare their performance here.",
                     actionTitle: "Create Watchlist") { env.router.sheet = .createGroup }
        } else {
          chartCard
          WatchlistSectionHeader(sort: $sort, changePeriod: scale.label, accessibilityID: "comparison-watchlist-sort")
          WatchlistAccordionTable(scale: scale, expanded: $expanded, focusedGroupIDs: $focusedGroupIDs, sort: sort, seriesByGroup: seriesByGroup, changeByCoin: changeByCoin, loading: loading, scrub: scrub)
        }
      }
      .padding(.bottom, 24)
    }
    .navigationTitle("")
    .modifier(SelectionNavigationModifier(tab: .compare, title: "Compare"))
    .toolbar {
      if !env.selection.isActive {
        ToolbarItemGroup(placement: .topBarTrailing) {
          Button {
            let all = Set(data.groups.map(\.id))
            withAnimation(Motion.animation(Motion.ui, reduceMotion: reduceMotion)) {
              expanded = expanded == all ? [] : all
            }
          } label: { Label(expanded.count == data.groups.count ? "Collapse all" : "Expand all", image: expanded.count == data.groups.count ? "ActionCollapseWatchlists" : "ActionExpandWatchlists") }
          Button { env.router.sheet = .coinSearch(targetGroupId: data.selectedGroup?.id) } label: { Label("Add token", image: "ActionAddToken") }
          Button { env.router.sheet = .createGroup } label: { Label("Create watchlist", image: "ActionCreateWatchlist") }
        }
      }
    }
    .onChange(of: data.bootstrap, initial: true) { _, bootstrap in
      // The membership key sorts and joins every group; derive it when the bootstrap changes, not per body.
      let next = bootstrap.membershipKey
      if next != membershipKey { membershipKey = next }
    }
    .task(id: "\(scale.rawValue)|\(membershipKey)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive, !membershipKey.isEmpty else { return }
      var warmingPolls = 0
      while !Task.isCancelled {
        let warming = await loadSeries()
        // Re-poll warming series every few seconds (bounded) so the chart fills in without a
        // scale change; otherwise wait for the regular refresh.
        let interval: Duration
        if warming, warmingPolls < WatchlistDataStore.warmingPollLimit { warmingPolls += 1; interval = WatchlistDataStore.warmingPollInterval }
        else { warmingPolls = 0; interval = QueryPolicy.aggregateChart.refetchInterval ?? .seconds(300) }
        do { try await Task.sleep(for: interval) } catch { return }
      }
    }
  }

  private var chartCard: some View {
    let data = env.watchlistData
    let colors = ChartColors.generatePastelColors(data.groups.count)
    let series = data.groups.enumerated().map { i, g in
      MultiLineComparisonChart.Series(id: g.id, label: g.name, color: colors[i], points: seriesByGroup[g.id] ?? [])
    }
    return VStack {
      if series.allSatisfy({ $0.points.count < 2 }) {
        if loading { RingLoader().frame(height: 220) }
        else { Text(scale.isAggregateChangeUnavailable ? "N/A for this interval" : "No chart data yet").font(.footnote).foregroundStyle(.secondary).frame(height: 220) }
      } else {
        MultiLineComparisonChart(series: series, selectedIDs: focusedGroupIDs,
          datasetID: "watchlists", scale: scale, isActive: env.isSceneActive && env.router.tab == .compare,
          accessibilityID: "watchlists-comparison-chart", onSelection: scrub.setSelection)
        .frame(height: 300)
      }
      TimeScalePicker(scales: TimeScale.compareScales, selection: $scale)
        .padding(.top, 12)
    }
    .padding(.vertical, 14)
    .padding(.horizontal, 16)
  }

  /// One batched market-chart fetch over the union of coins, then equal-weight series per group.
  /// Returns true when some series are still warming on the server and should be re-polled soon.
  @discardableResult
  private func loadSeries() async -> Bool {
    let data = env.watchlistData
    guard !scale.isAggregateChangeUnavailable else { seriesByGroup = [:]; changeByCoin = [:]; return false }
    let ids = data.bootstrap.allCoinIds
    guard !ids.isEmpty else { seriesByGroup = [:]; changeByCoin = [:]; loading = false; return false }
    loading = seriesByGroup.isEmpty
    let days = scale.marketChartDaysParam
    let fetched = await WatchlistDataStore.fetchMarketChartSeries(ids: ids, days: days, market: env.market, cache: env.queryCache, force: false)
    guard !Task.isCancelled else { return false }
    let end = scale.rangeEndMs()
    var out: [String: [TimePoint]] = [:]
    for g in data.groups {
      var byCoin: [String: [TimePoint]] = [:]; var warming = Set<String>()
      for id in data.coinIds(in: g) { if let s = fetched[id] { byCoin[id] = s.points; if s.warming { warming.insert(id) } } }
      out[g.id] = AggregateSeries.equalWeightReturnSeries(.init(byCoin: byCoin, warming: warming), scale: scale, rangeEndMs: end)
    }
    seriesByGroup = out
    changeByCoin = AggregateSeries.changePctByCoinId(fetched.mapValues(\.points))
    scrub.prices = fetched.mapValues(\.points)
    scrub.windowStart = out.values.compactMap { $0.first?.epochSeconds }.min().map(Double.init)
    loading = false
    return await WatchlistDataStore.invalidateWarmingSeries(ids: ids, fetched: fetched, days: days, cache: env.queryCache)
  }
}

/// `watchlist-table.tsx`: accordion rows per watchlist with sparkline, aggregate %, coin rows (selection-enabled).
///
/// Group order, per-group aggregate change and the market-cap-sorted items are memoised on the
/// data they depend on; headers and rows are leaf views, so a scrub step only re-evaluates the
/// readouts that display the inspected value.
struct WatchlistAccordionTable: View {
  let scale: TimeScale
  @Binding var expanded: Set<String>
  @Binding var focusedGroupIDs: Set<String>
  var sort: WatchlistCardSort = .original
  let seriesByGroup: [String: [TimePoint]]
  let changeByCoin: [String: Double]
  let loading: Bool
  /// Chart scrub state; rows read the inspected return and price from it.
  var scrub = ComparisonScrubStore()
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var preparation = AccordionPreparation()

  var body: some View {
    let data = env.watchlistData
    let models = preparation.models(data: data, scale: scale, sort: sort, seriesByGroup: seriesByGroup)
    let isActive = env.isSceneActive && env.router.tab == .compare
    VStack(spacing: 12) {
      ForEach(models) { model in
        GroupHeaderRow(model: model, scale: scale, loading: loading, isActive: isActive,
                       isExpanded: expanded.contains(model.id), isFocused: focusedGroupIDs.contains(model.id),
                       scrub: scrub, reduceMotion: reduceMotion,
                       toggleExpanded: {
                         withAnimation(Motion.animation(Motion.ui, reduceMotion: reduceMotion)) {
                           if expanded.contains(model.id) { expanded.remove(model.id) } else { expanded.insert(model.id) }
                         }
                       },
                       toggleFocused: {
                         if focusedGroupIDs.contains(model.id) { focusedGroupIDs.remove(model.id) } else { focusedGroupIDs.insert(model.id) }
                       })
        if expanded.contains(model.id) {
          VStack(spacing: 10) {
            ForEach(model.rows) { row in
              CoinPanelRow(row: row, group: model.group, scale: scale, changeByCoin: changeByCoin, scrub: scrub)
            }
          }
        }
      }
    }
    .padding(.horizontal, 16)
    .onAppear { registerSelection() }
    .onChange(of: expanded) { _, _ in registerSelection() }
    .onChange(of: data.bootstrap) { _, _ in
      registerSelection()
      focusedGroupIDs.formIntersection(data.groups.map(\.id))
    }
    .onChange(of: env.router.sheet) { _, sheet in
      if sheet == nil { registerSelection() }
    }
    .onDisappear { env.selection.release(owner: "compare") }
  }

  private func registerSelection() {
    guard env.router.tab == .compare, env.router.comparePath.isEmpty, env.router.sheet == nil else { return }
    let data = env.watchlistData
    let visibleKeys = data.groups.filter { expanded.contains($0.id) }.flatMap { g in data.items(in: g).map { "\(g.id)|\($0.coinId)" } }
    env.selection.register(owner: "compare", selectableIds: visibleKeys, onRemove: { keys in
      var removed = 0, failed = 0
      let byGroup = Dictionary(grouping: keys.compactMap { k -> (String, String)? in let p = k.split(separator: "|"); return p.count == 2 ? (String(p[0]), String(p[1])) : nil }, by: \.0)
      for (groupId, pairs) in byGroup {
        do { removed += try await data.removeBulk(coinIds: pairs.map(\.1), from: groupId) } catch { failed += pairs.count }
      }
      if failed > 0 { throw SelectionStore.BulkRemoveError(removedCount: removed, failedCount: failed) }
    }, onAnalyze: { keys in
      env.router.openAnalysis(Array(Set(keys.map { String($0.split(separator: "|").last ?? "") })), sourceID: "selection-analyze")
    })
  }
}

/// Everything a header or panel needs, resolved once per data change.
struct AccordionGroupModel: Identifiable {
  struct Row: Identifiable {
    let item: WatchlistItem
    let symbol: String
    let name: String
    let imageURL: String?
    let currentPrice: Double?
    /// Quote-based change for the scale, used when the chart has no per-coin series.
    let quoteChange: Double?
    var id: String { item.id }
  }
  let group: WatchlistGroup
  let background: Color
  let border: Color
  let avatars: [TokenAvatarStack.Item]
  let series: [TimePoint]
  /// Latest charted return, else the quote-based estimate.
  let aggregateChange: Double?
  let isEstimate: Bool
  /// Items sorted by market cap, with their quote fields.
  let rows: [Row]
  var id: String { group.id }
}

/// Unobserved memo keyed on (bootstrap, quotes refresh, scale, sort, series). Building it inside
/// the table body still registers those reads with Observation, which is what the table needs.
@MainActor final class AccordionPreparation {
  private var bootstrap: WatchlistsPageBootstrap?
  private var quotesRevision: Int?
  private var scale: TimeScale?
  private var sort: WatchlistCardSort?
  private var seriesByGroup: [String: [TimePoint]] = [:]
  private var models: [AccordionGroupModel] = []
  private var colors: [String: (background: Color, border: Color)] = [:]

  func models(data: WatchlistDataStore, scale: TimeScale, sort: WatchlistCardSort, seriesByGroup: [String: [TimePoint]]) -> [AccordionGroupModel] {
    let bootstrap = data.bootstrap, quotesRevision = data.quotesRevision
    if self.bootstrap == bootstrap, self.quotesRevision == quotesRevision, self.scale == scale, self.sort == sort,
       self.seriesByGroup == seriesByGroup {
      return models
    }
    self.bootstrap = bootstrap; self.quotesRevision = quotesRevision; self.scale = scale; self.sort = sort
    self.seriesByGroup = seriesByGroup
    var byGroup: [String: AccordionGroupModel] = [:]
    for group in data.groups {
      let items = data.items(in: group)
      let quotes = items.map { data.quote($0.coinId) }
      let chartChange = scale.isAggregateChangeUnavailable ? nil : seriesByGroup[group.id]?.last?.value
      let estimate: Double? = (chartChange == nil && !scale.isAggregateChangeUnavailable)
        ? AggregateSeries.equalWeightFromQuotes(quotes.map { quote in
            quote.flatMap { AggregateSeries.quoteIntervalChange(scale: scale, change24h: $0.priceChangePercentage24h,
                                                                change7d: $0.priceChangePercentage7d, change30d: $0.priceChangePercentage30d) }
          })
        : nil
      let rows = zip(items, quotes).map { item, quote in
        (marketCap: quote?.marketCap ?? 0,
         row: AccordionGroupModel.Row(item: item, symbol: quote?.symbol ?? item.coinId, name: quote?.name ?? item.coinId,
                                      imageURL: quote?.image, currentPrice: quote?.currentPrice,
                                      quoteChange: quote.flatMap { AggregateSeries.quoteIntervalChange(scale: scale, change24h: $0.priceChangePercentage24h,
                                                                                                      change7d: $0.priceChangePercentage7d, change30d: $0.priceChangePercentage30d) }))
      }
      .sorted { $0.marketCap > $1.marketCap }
      .map(\.row)
      let themeKey = group.color ?? "default"
      let palette = colors[themeKey] ?? {
        let theme = ColorThemes.resolve(group.color)
        let resolved = (background: Color(oklch: theme.background), border: Color(oklch: theme.border))
        colors[themeKey] = resolved
        return resolved
      }()
      byGroup[group.id] = AccordionGroupModel(
        group: group, background: palette.background, border: palette.border,
        avatars: zip(items, quotes).map { .init(symbol: $1?.symbol ?? $0.coinId, imageURL: $1?.image) },
        series: seriesByGroup[group.id] ?? [], aggregateChange: chartChange ?? estimate,
        isEstimate: chartChange == nil && estimate != nil, rows: rows)
    }
    models = sort.ordered(data.groups, change: { byGroup[$0.id]?.aggregateChange }, tokenCount: { data.coinIds(in: $0).count })
      .compactMap { byGroup[$0.id] }
    return models
  }
}


/// One watchlist header: icon, name, avatars, aggregate badge, sparkline and disclosure. Only the
/// badge observes the scrub store.
private struct GroupHeaderRow: View {
  let model: AccordionGroupModel
  let scale: TimeScale
  let loading: Bool
  let isActive: Bool
  let isExpanded: Bool
  let isFocused: Bool
  let scrub: ComparisonScrubStore
  let reduceMotion: Bool
  let toggleExpanded: () -> Void
  let toggleFocused: () -> Void

  var body: some View {
    let g = model.group
    let cardBackground = isFocused ? Theme.elevated : Theme.surface
    TokenSwipeCard(id: "scope-\(g.id)", openRowID: .constant(nil), isSelected: isFocused,
                   onToggleSelection: toggleFocused,
                   selectionIcon: "scope", selectionAccessibilityLabel: "Focus watchlist chart",
                   deselectionAccessibilityLabel: "Remove watchlist from chart focus", deleteTitle: "") {
      Button(action: toggleExpanded) {
        HStack(spacing: 10) {
          WatchlistGroupIconView(icon: g.icon, size: 22)
            .foregroundStyle(.white.opacity(0.9))
            .frame(width: 40, height: 40)
            .background(model.background, in: .rect(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(model.border))
            .overlay(alignment: .bottomTrailing) {
              Image(systemName: "scope")
                .resizable()
                .scaledToFit()
                .fontWeight(.bold)
                .padding(5)
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(.blue, in: Circle())
                .overlay(Circle().strokeBorder(cardBackground, lineWidth: 3))
                .scaleEffect(isFocused || reduceMotion ? 1 : 0, anchor: .center)
                .opacity(isFocused ? 1 : 0)
                .animation(reduceMotion ? nil : .snappy(duration: 0.25, extraBounce: 0.1), value: isFocused)
                .offset(x: 4, y: 4)
            }
            .accessibilityHidden(true)

          VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
              Text(g.name)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(.primary).lineLimit(1)
              TokenAvatarStack(items: model.avatars, maxVisible: 3, size: 16, usesGlass: false)
                .fixedSize().accessibilityHidden(true)
            }
            GroupHeaderBadge(groupID: g.id, scale: scale, loading: loading,
                             aggregateChange: model.aggregateChange, isEstimate: model.isEstimate, scrub: scrub)
          }
          .frame(maxWidth: .infinity, alignment: .leading)

          ZStack {
            if model.series.count >= 2 {
              AggrSparkline(points: model.series, isActive: isActive,
                            color: Color.change(model.aggregateChange), lineWidth: 1.5, fadeLeading: false)
                .equatable()
            } else if loading && !scale.isAggregateChangeUnavailable {
              SkeletonBlock(height: 22, width: 88)
            }
          }
          .frame(width: 88, height: 40)

          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
            .rotationEffect(.degrees(isExpanded ? 0 : -90))
            .accessibilityHidden(true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .background(cardBackground, in: .rect(cornerRadius: Theme.Radius.md))
        .contentShape(.rect(cornerRadius: Theme.Radius.md))
      }
      .buttonStyle(.plain)
    }
    .accessibilityIdentifier("comparison-watchlist-\(g.id)")
    .accessibilityValue("\(isExpanded ? "Expanded" : "Collapsed")\(isFocused ? ", Chart focused" : "")")
    .accessibilityHint("Tap to \(isExpanded ? "hide" : "show") tokens. Swipe left to \(isFocused ? "remove this watchlist from chart focus" : "focus this watchlist’s chart").")
  }
}

/// The header's percent badge; while the chart is scrubbed it reads the inspected return.
private struct GroupHeaderBadge: View {
  let groupID: String
  let scale: TimeScale
  let loading: Bool
  let aggregateChange: Double?
  let isEstimate: Bool
  let scrub: ComparisonScrubStore

  var body: some View {
    let scrubbing = scrub.isScrubbing
    let inspected = scrubbing ? scrub.value(for: groupID) : nil
    let change = inspected ?? aggregateChange
    HStack(spacing: 5) {
      if scale.isAggregateChangeUnavailable {
        PercentBadge(pct: nil)
      } else if let change {
        // A morph per header per scrub step is the dominant scrub cost with many watchlists;
        // the badge morphs only for data changes, and is plain text while the finger is down.
        PercentBadge(pct: change, animated: !scrubbing)
        if isEstimate && inspected == nil {
          Text("est.").font(.system(.caption2, design: .rounded)).foregroundStyle(.secondary)
        }
      } else if loading {
        SkeletonBlock(height: 18, width: 56)
      } else {
        PercentBadge(pct: nil)
      }
    }
  }
}

/// One token row inside an expanded watchlist. Only its readout observes the scrub store.
private struct CoinPanelRow: View {
  let row: AccordionGroupModel.Row
  let group: WatchlistGroup
  let scale: TimeScale
  let changeByCoin: [String: Double]
  let scrub: ComparisonScrubStore
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let data = env.watchlistData
    let key = "\(group.id)|\(row.item.coinId)"
    let liveChange = changeByCoin[row.item.coinId] ?? row.quoteChange
    SelectableRow(id: key, removalTitle: "Remove from \(group.name)?", onRemove: {
      try await data.remove(coinId: row.item.coinId, from: group.id)
    }) {
      Button {
        if env.selection.isActive { env.selection.toggle(key) } else { env.router.openToken(row.item.coinId, groupSlug: group.slug, sourceID: "compare|\(key)") }
      } label: {
        HStack(spacing: 12) {
          TokenLogo(symbol: row.symbol, imageURL: row.imageURL, size: 34)
            .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
          VStack(alignment: .leading, spacing: 2) {
            Text(row.symbol.uppercased()).font(.subheadline.weight(.semibold))
            Text(LogoOverrides.cleanTokenName(row.name))
              .font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
          Spacer()
          CoinPanelReadout(coinId: row.item.coinId, currentPrice: row.currentPrice, liveChange: liveChange,
                           changeUnavailable: scale.isAggregateChangeUnavailable, scrub: scrub)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
    }
    .accessibilityIdentifier("comparison-token-\(key)")
    .tokenTransitionSource("compare|\(key)")
  }
}

/// Price and change for a row, inspected while scrubbing, live otherwise.
private struct CoinPanelReadout: View {
  let coinId: String
  let currentPrice: Double?
  let liveChange: Double?
  let changeUnavailable: Bool
  let scrub: ComparisonScrubStore

  var body: some View {
    let inspecting = scrub.isScrubbing
    let price = inspecting ? (scrub.price(for: coinId) ?? currentPrice) : currentPrice
    let change = inspecting ? (scrub.change(for: coinId) ?? liveChange) : liveChange
    VStack(alignment: .trailing, spacing: 3) {
      UsdText(value: price, font: .subheadline.weight(.medium))
        .contentTransition(inspecting ? .identity : .numericText(value: price ?? 0))
      if let change, !changeUnavailable {
        MoveWithBadge(usdMove: price.flatMap { MarketMetrics.usdMove(priceUsd: $0, percentChange: change) }, pct: change, animated: false)
      } else {
        Text("N/A").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
      }
    }
    .transaction { if inspecting { $0.animation = nil } }
  }
}

#if DEBUG
#Preview("Populated") {
  PreviewHost(tab: .compare) { _ in CompareView() }
}
#Preview("Empty") {
  PreviewHost(state: .empty, tab: .compare) { _ in CompareView() }
}
#endif

#if DEBUG
#Preview("Expanded comparison table") {
  PreviewHost(tab: .compare) { _ in
    PreviewValue(Set([PreviewFixtures.group.id])) { expanded in
      PreviewValue(Set<String>()) { focused in
        ScrollView {
          WatchlistAccordionTable(scale: .d7, expanded: expanded, focusedGroupIDs: focused,
            seriesByGroup: [PreviewFixtures.group.id: PreviewFixtures.returns],
            changeByCoin: ["bitcoin": 2.84, "ethereum": -1.32, "solana": 6.12], loading: false).padding()
        }
      }
    }
  }
}
#endif
