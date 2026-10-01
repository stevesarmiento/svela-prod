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
    .task(id: "\(scale.rawValue)|\(data.bootstrap.membershipKey)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { return }
      while !Task.isCancelled {
        await loadSeries()
        do { try await Task.sleep(for: QueryPolicy.aggregateChart.refetchInterval ?? .seconds(300)) } catch { return }
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

  /// One market-chart fan-out over the union of coins (concurrency 5), then equal-weight series per group.
  private func loadSeries() async {
    let data = env.watchlistData
    guard !scale.isAggregateChangeUnavailable else { seriesByGroup = [:]; changeByCoin = [:]; return }
    let ids = data.bootstrap.allCoinIds
    guard !ids.isEmpty else { seriesByGroup = [:]; changeByCoin = [:]; loading = false; return }
    loading = seriesByGroup.isEmpty
    let fetched = await WatchlistDataStore.fetchMarketChartSeries(ids: ids, days: scale.marketChartDaysParam, market: env.market, cache: env.queryCache, force: false)
    guard !Task.isCancelled else { return }
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
  }
}

/// `watchlist-table.tsx`: accordion rows per watchlist with sparkline, aggregate %, coin rows (selection-enabled).
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

  var body: some View {
    let data = env.watchlistData
    VStack(spacing: 12) {
      ForEach(sort.ordered(data.groups, change: aggregateChange, tokenCount: { data.coinIds(in: $0).count })) { group in
        groupHeader(group)
        if expanded.contains(group.id) { coinsPanel(group) }
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

  private func aggregateChange(_ group: WatchlistGroup) -> Double? {
    guard !scale.isAggregateChangeUnavailable else { return nil }
    if let value = seriesByGroup[group.id]?.last?.value { return value }
    let data = env.watchlistData
    return AggregateSeries.equalWeightFromQuotes(data.items(in: group).map { item in
      data.quote(item.coinId).flatMap { quote in
        AggregateSeries.quoteIntervalChange(scale: scale, change24h: quote.priceChangePercentage24h,
          change7d: quote.priceChangePercentage7d, change30d: quote.priceChangePercentage30d)
      }
    })
  }

  @ViewBuilder
  private func groupHeader(_ g: WatchlistGroup) -> some View {
    let data = env.watchlistData
    let theme = ColorThemes.resolve(g.color)
    let items = data.items(in: g)
    let series = seriesByGroup[g.id] ?? []
    let chartChange = series.last?.value
    // While the chart is scrubbed the header reads the inspected return instead of the latest.
    let inspected = scrub.isScrubbing ? scrub.value(for: g.id) : nil
    let change = inspected ?? aggregateChange(g)
    let isEstimate = inspected == nil && chartChange == nil && change != nil
    let focused = focusedGroupIDs.contains(g.id)
    let cardBackground = focused ? Theme.elevated : Theme.surface
    TokenSwipeCard(id: "scope-\(g.id)", openRowID: .constant(nil), isSelected: focused,
                   onToggleSelection: {
                     if focusedGroupIDs.contains(g.id) { focusedGroupIDs.remove(g.id) }
                     else { focusedGroupIDs.insert(g.id) }
                   },
                   selectionIcon: "scope", selectionAccessibilityLabel: "Focus watchlist chart",
                   deselectionAccessibilityLabel: "Remove watchlist from chart focus", deleteTitle: "") {
      Button {
        withAnimation(Motion.animation(Motion.ui, reduceMotion: reduceMotion)) {
          if expanded.contains(g.id) { expanded.remove(g.id) } else { expanded.insert(g.id) }
        }
      } label: {
        HStack(spacing: 10) {
          WatchlistGroupIconView(icon: g.icon, size: 22)
            .foregroundStyle(.white.opacity(0.9))
            .frame(width: 40, height: 40)
            .background(Color(oklch: theme.background), in: .rect(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(oklch: theme.border)))
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
                .scaleEffect(focused || reduceMotion ? 1 : 0, anchor: .center)
                .opacity(focused ? 1 : 0)
                .animation(reduceMotion ? nil : .snappy(duration: 0.25, extraBounce: 0.1), value: focused)
                .offset(x: 4, y: 4)
            }
            .accessibilityHidden(true)

          VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
              Text(g.name)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(.primary).lineLimit(1)
              TokenAvatarStack(items: items.map { item in
                let quote = data.quote(item.coinId)
                return .init(symbol: quote?.symbol ?? item.coinId, imageURL: quote?.image)
              }, maxVisible: 3, size: 16, usesGlass: true)
                .fixedSize().accessibilityHidden(true)
            }
            HStack(spacing: 5) {
              if scale.isAggregateChangeUnavailable {
                PercentBadge(pct: nil)
              } else if let change {
                PercentBadge(pct: change)
                if isEstimate {
                  Text("est.").font(.system(.caption2, design: .rounded)).foregroundStyle(.secondary)
                }
              } else if loading {
                SkeletonBlock(height: 18, width: 56)
              } else {
                PercentBadge(pct: nil)
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)

          ZStack {
            if series.count >= 2 {
              AggrSparkline(points: series, isActive: env.isSceneActive && env.router.tab == .compare,
                            color: Color.change(change), lineWidth: 1.5, fadeLeading: false)
                .equatable()
            } else if loading && !scale.isAggregateChangeUnavailable {
              SkeletonBlock(height: 22, width: 88)
            }
          }
          .frame(width: 88, height: 40)

          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
            .rotationEffect(.degrees(expanded.contains(g.id) ? 0 : -90))
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
    .accessibilityValue("\(expanded.contains(g.id) ? "Expanded" : "Collapsed")\(focused ? ", Chart focused" : "")")
    .accessibilityHint("Tap to \(expanded.contains(g.id) ? "hide" : "show") tokens. Swipe left to \(focused ? "remove this watchlist from chart focus" : "focus this watchlist’s chart").")
  }

  @ViewBuilder
  private func coinsPanel(_ g: WatchlistGroup) -> some View {
    let data = env.watchlistData
    let items = data.items(in: g).sorted { (data.quote($0.coinId)?.marketCap ?? 0) > (data.quote($1.coinId)?.marketCap ?? 0) }
    VStack(spacing: 10) {
      ForEach(items) { item in
        let q = data.quote(item.coinId)
        let key = "\(g.id)|\(item.coinId)"
        let liveChange = changeByCoin[item.coinId] ?? q.flatMap { AggregateSeries.quoteIntervalChange(scale: scale, change24h: $0.priceChangePercentage24h, change7d: $0.priceChangePercentage7d, change30d: $0.priceChangePercentage30d) }
        let inspecting = scrub.isScrubbing
        let price = inspecting ? (scrub.price(for: item.coinId) ?? q?.currentPrice) : q?.currentPrice
        let change = inspecting ? (scrub.change(for: item.coinId) ?? liveChange) : liveChange
        SelectableRow(id: key, removalTitle: "Remove from \(g.name)?", onRemove: {
          try await data.remove(coinId: item.coinId, from: g.id)
        }) {
          Button {
            if env.selection.isActive { env.selection.toggle(key) } else { env.router.openToken(item.coinId, groupSlug: g.slug, sourceID: "compare|\(key)") }
          } label: {
            HStack(spacing: 12) {
              GlassTokenLogo(symbol: q?.symbol ?? item.coinId, imageURL: q?.image, size: 34)
              VStack(alignment: .leading, spacing: 2) {
                Text((q?.symbol ?? "N/A").uppercased()).font(.subheadline.weight(.semibold))
                Text(LogoOverrides.cleanTokenName(q?.name ?? item.coinId))
                  .font(.caption).foregroundStyle(.secondary).lineLimit(1)
              }
              Spacer()
              VStack(alignment: .trailing, spacing: 3) {
                UsdText(value: price, font: .subheadline.weight(.medium))
                  .contentTransition(.numericText(value: price ?? 0))
                if let change, !scale.isAggregateChangeUnavailable {
                  MoveWithBadge(usdMove: price.flatMap { MarketMetrics.usdMove(priceUsd: $0, percentChange: change) }, pct: change)
                } else {
                  Text("N/A").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
              }
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
        }
        .accessibilityIdentifier("comparison-token-\(key)")
        .tokenTransitionSource("compare|\(key)")
      }
    }
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
