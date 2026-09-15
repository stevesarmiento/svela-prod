import AggrAPI
import AggrCore
import SwiftUI

/// `/comparison` — aggregate view across ALL watchlists: normalized multi-line chart + accordion table.
struct CompareView: View {
  @Environment(AppEnvironment.self) private var env
  @State private var scale: TimeScale = .d7
  @State private var hidden: Set<String> = []
  @State private var expanded: Set<String> = []
  @State private var expandedInitialized = false
  @State private var seriesByGroup: [String: [TimePoint]] = [:]
  @State private var changeByCoin: [String: Double] = [:]
  @State private var loading = false

  var body: some View {
    let data = env.watchlistData
    ScrollView {
      VStack(spacing: 16) {
        HStack {
          Text("Watchlist Comparison").font(.headline)
          Spacer()
        }
        .padding(.horizontal, 16)

        if let error = data.bootstrapError {
          EmptyState(systemImage: "exclamationmark.triangle", title: "Couldn’t load watchlists", message: error,
                     actionTitle: "Retry") { data.start() }
        } else if !data.hasLoadedBootstrap {
          ProgressView().padding(.top, 60)
        } else if data.groups.isEmpty {
          EmptyState(illustration: .comparison, title: "No watchlists to compare", message: "Create some watchlists to compare their performance here.",
                     actionTitle: "Create Watchlist") { env.router.sheet = .createGroup }
        } else {
          chartCard
          WatchlistAccordionTable(scale: scale, expanded: $expanded, seriesByGroup: seriesByGroup, changeByCoin: changeByCoin, loading: loading)
        }
      }
      .padding(.bottom, 24)
    }
    .navigationTitle("Compare")
    .toolbar {
      if !env.selection.isActive {
        ToolbarItemGroup(placement: .topBarTrailing) {
          Button {
            let all = Set(data.groups.map(\.id))
            withAnimation(.snappy) { expanded = expanded == all ? [] : all }
          } label: { Label(expanded.count == data.groups.count ? "Collapse all" : "Expand all", image: expanded.count == data.groups.count ? "ActionCollapseWatchlists" : "ActionExpandWatchlists") }
          Button { env.router.sheet = .coinSearch(targetGroupId: data.selectedGroup?.id) } label: { Label("Add token", image: "ActionAddToken") }
          Button { env.router.sheet = .createGroup } label: { Label("Create watchlist", image: "ActionCreateWatchlist") }
        }
      }
    }
    .task(id: "\(scale.rawValue)|\(data.bootstrap.membershipKey)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      if !expandedInitialized, !data.groups.isEmpty { expanded = Set(data.groups.map(\.id)); expandedInitialized = true }
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
        if loading { ProgressView().frame(height: 220) }
        else { Text(scale.isAggregateChangeUnavailable ? "N/A for this interval" : "No chart data yet").font(.footnote).foregroundStyle(.secondary).frame(height: 220) }
      } else {
        MultiLineComparisonChart(series: series, hidden: $hidden, onSelect: { id in
          if let g = data.groups.first(where: { $0.id == id }) { data.selectedGroupSlug = g.slug }
          withAnimation(.snappy) { if hidden.contains(id) { hidden.remove(id) } else { hidden.insert(id) } }
        }, datasetID: "watchlists", scale: scale, isActive: env.isSceneActive && env.router.tab == .compare,
           accessibilityID: "watchlists-comparison-chart")
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
    loading = false
  }
}

/// `watchlist-table.tsx`: accordion rows per watchlist with sparkline, aggregate %, coin rows (selection-enabled).
struct WatchlistAccordionTable: View {
  let scale: TimeScale
  @Binding var expanded: Set<String>
  let seriesByGroup: [String: [TimePoint]]
  let changeByCoin: [String: Double]
  let loading: Bool
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let data = env.watchlistData
    VStack(spacing: 12) {
      ForEach(data.groups) { group in
        groupHeader(group)
        if expanded.contains(group.id) { coinsPanel(group) }
      }
    }
    .padding(.horizontal, 16)
    .onAppear { registerSelection() }
    .onChange(of: expanded) { _, _ in registerSelection() }
    .onChange(of: data.bootstrap) { _, _ in registerSelection() }
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
      env.router.sheet = .analyze(Array(Set(keys.map { String($0.split(separator: "|").last ?? "") })))
    })
  }

  @ViewBuilder
  private func groupHeader(_ g: WatchlistGroup) -> some View {
    let data = env.watchlistData
    let theme = ColorThemes.resolve(g.color)
    let items = data.items(in: g)
    let series = seriesByGroup[g.id] ?? []
    let chartChange = series.last?.value
    let estimate = AggregateSeries.equalWeightFromQuotes(items.map { data.quote($0.coinId).flatMap { q in AggregateSeries.quoteIntervalChange(scale: scale, change24h: q.priceChangePercentage24h, change7d: q.priceChangePercentage7d, change30d: q.priceChangePercentage30d) } })
    let change = chartChange ?? estimate
    let isEstimate = chartChange == nil && estimate != nil
    Button { withAnimation(.snappy) { if expanded.contains(g.id) { expanded.remove(g.id) } else { expanded.insert(g.id) } } } label: {
      HStack(spacing: 10) {
        HStack(spacing: 5) {
          WatchlistGroupIconView(icon: g.icon, size: 13).foregroundStyle(.white.opacity(0.85))
          Text(g.name).font(.caption.weight(.bold)).foregroundStyle(.white).lineLimit(1)
        }
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(Color(oklch: theme.background), in: Capsule())
        .overlay(Capsule().strokeBorder(Color(oklch: theme.border)))
        if !expanded.contains(g.id) {
          TokenAvatarStack(items: items.prefix(4).compactMap { data.quote($0.coinId) }.map { .init(symbol: $0.symbol, imageURL: $0.image) }, maxVisible: 4, size: 20, usesGlass: true)
        }
        Spacer()
        if series.count >= 2 {
          AggrSparkline(points: series, isActive: env.isSceneActive && env.router.tab == .compare,
                        color: (change ?? 0) >= 0 ? .gainGreen : .lossRed, lineWidth: 1.2, fadeLeading: false)
            .equatable().frame(width: 64, height: 22)
        } else if loading && !scale.isAggregateChangeUnavailable {
          SkeletonBlock(height: 12, width: 64)
        }
        if scale.isAggregateChangeUnavailable {
          Text("N/A").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        } else if let change {
          HStack(spacing: 3) {
            Image(systemName: "triangle.fill").font(.system(size: 7)).rotationEffect(.degrees(change < 0 ? 180 : 0))
            Text(String(format: "%.2f%%", abs(change)))
            if isEstimate { Text("est.").font(.system(size: 9)).foregroundStyle(.secondary) }
          }
          .font(.caption.monospacedDigit())
          .foregroundStyle(change > 0 ? Color.gainGreen : (change < 0 ? Color.lossRed : .secondary))
        } else {
          SkeletonBlock(height: 12, width: 40)
        }
        Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
          .rotationEffect(.degrees(expanded.contains(g.id) ? 0 : -90))
      }
      .padding(.horizontal, 12).padding(.vertical, 10)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder
  private func coinsPanel(_ g: WatchlistGroup) -> some View {
    let data = env.watchlistData
    let items = data.items(in: g).sorted { (data.quote($0.coinId)?.marketCap ?? 0) > (data.quote($1.coinId)?.marketCap ?? 0) }
    VStack(spacing: 10) {
      ForEach(items) { item in
        let q = data.quote(item.coinId)
        let key = "\(g.id)|\(item.coinId)"
        let change = changeByCoin[item.coinId] ?? q.flatMap { AggregateSeries.quoteIntervalChange(scale: scale, change24h: $0.priceChangePercentage24h, change7d: $0.priceChangePercentage7d, change30d: $0.priceChangePercentage30d) }
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
                UsdText(value: q?.currentPrice, font: .subheadline.weight(.medium))
                if let change, !scale.isAggregateChangeUnavailable {
                  MoveWithBadge(usdMove: q?.currentPrice.flatMap { MarketMetrics.usdMove(priceUsd: $0, percentChange: change) }, pct: change)
                } else {
                  Text("N/A").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
              }
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
        }
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
      ScrollView {
        WatchlistAccordionTable(scale: .d7, expanded: expanded,
          seriesByGroup: [PreviewFixtures.group.id: PreviewFixtures.returns],
          changeByCoin: ["bitcoin": 2.84, "ethereum": -1.32, "solana": 6.12], loading: false).padding()
      }
    }
  }
}
#endif
