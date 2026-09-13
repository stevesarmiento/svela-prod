import AggrAPI
import AggrCore
import SwiftUI

/// Selected watchlist comparison, with chart controls and editable token holdings.
struct WatchlistDetailSection: View {
  let group: WatchlistGroup
  @Environment(AppEnvironment.self) private var env
  @State private var scale: TimeScale = .d1

  var body: some View {
    VStack(spacing: 16) {
      HStack {
        Text("Performance").font(.subheadline.weight(.semibold))
        Spacer()
      }
      .padding(.horizontal, 16)

      GroupCoinsChart(group: group, scale: scale)
        .padding(.horizontal, 16)
      TimeScalePicker(scales: TimeScale.overviewScales, selection: $scale)
        .padding(.horizontal, 16)
      CoinRowsList(group: group)
    }
  }
}

/// Aggregate performance card for the selected group (1D series from the shared store; other scales fetched ad hoc).
struct GroupAggregateCard: View {
  @Environment(AppEnvironment.self) private var env
  let group: WatchlistGroup
  let scale: TimeScale
  @State private var series: [TimePoint] = []
  @State private var loading = false

  var body: some View {
    let data = env.watchlistData
    let points = scale == .d1 ? (data.aggregate1dByGroup[group.id] ?? []) : series
    let change = points.last?.value
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Equal-weight return · \(scale.label)").font(.caption).foregroundStyle(.secondary)
        Spacer()
        if let change { PercentBadge(pct: change) } else if loading { ProgressView().controlSize(.small) } else { Text("—").foregroundStyle(.secondary) }
      }
      if points.count >= 2 {
        Sparkline(points: points, lineWidth: 1.8, fadeLeading: false, monoColor: (change ?? 0) >= 0 ? .gainGreen : .lossRed)
          .frame(height: 120)
      } else {
        Rectangle().fill(.clear).frame(height: 120)
          .overlay { Text(scale.isAggregateChangeUnavailable ? "N/A for 2Y" : (loading ? "" : "No chart data yet")).font(.footnote).foregroundStyle(.secondary) }
      }
    }
    .padding(.vertical, 14)
    .task(id: "\(group.id)|\(scale.rawValue)|\(data.coinIds(in: group).joined(separator: ","))|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { return }
      guard scale != .d1, !scale.isAggregateChangeUnavailable else { series = []; return }
      loading = true
      defer { loading = false }
      let ids = data.coinIds(in: group)
      let fetched = await WatchlistDataStore.fetchMarketChartSeries(ids: ids, days: scale.marketChartDaysParam, market: env.market, cache: env.queryCache, force: false)
      guard !Task.isCancelled else { return }
      var byCoin: [String: [TimePoint]] = [:]; var warming = Set<String>()
      for (id, s) in fetched { byCoin[id] = s.points; if s.warming { warming.insert(id) } }
      series = AggregateSeries.equalWeightReturnSeries(.init(byCoin: byCoin, warming: warming), scale: scale, rangeEndMs: scale.rangeEndMs())
    }
  }
}

/// `multi-line-lightweight.tsx`: one normalized line per coin in the selected group (1D/1W/1M/1Y).
struct GroupCoinsChart: View {
  @Environment(AppEnvironment.self) private var env
  let group: WatchlistGroup
  let scale: TimeScale
  @State private var hidden: Set<String> = []
  @State private var byCoin: [String: [TimePoint]] = [:]
  @State private var loading = false

  var body: some View {
    let data = env.watchlistData
    let ids = data.coinIds(in: group)
    let colors = ChartColors.generatePastelColors(max(1, ids.count))
    let series = ids.enumerated().map { i, id in
      MultiLineComparisonChart.Series(id: id, label: (data.quote(id)?.symbol ?? id).uppercased(), color: colors[i], points: AggregateSeries.returnSeries(byCoin[id] ?? []))
    }
    VStack {
      if ids.isEmpty {
        Text("Add tokens to chart them.").font(.footnote).foregroundStyle(.secondary).frame(height: 160)
      } else if series.allSatisfy({ $0.points.count < 2 }) {
        if loading { ProgressView().frame(height: 220) } else { Text("No chart data yet").font(.footnote).foregroundStyle(.secondary).frame(height: 220) }
      } else {
        MultiLineComparisonChart(series: series, hidden: $hidden).frame(height: 300)
      }
    }
    .padding(.vertical, 14)
    .task(id: "\(group.id)|\(scale.rawValue)|\(ids.joined(separator: ","))|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { return }
      guard !ids.isEmpty else { byCoin = [:]; return }
      while !Task.isCancelled {
        loading = byCoin.isEmpty
        let fetched = await WatchlistDataStore.fetchMarketChartSeries(ids: ids, days: scale.marketChartDaysParam, market: env.market, cache: env.queryCache, force: false)
        guard !Task.isCancelled else { return }
        byCoin = AggregateSeries.alignToSharedAxis(fetched.mapValues { ($0.points, $0.warming) })
        loading = false
        do { try await Task.sleep(for: QueryPolicy.aggregateChart.refetchInterval ?? .seconds(300)) } catch { return }
      }
    }
  }
}

/// Coin rows for a group with price, 24h move, and editable holdings (`chart-table.tsx`).
struct CoinRowsList: View {
  @Environment(AppEnvironment.self) private var env
  let group: WatchlistGroup

  var body: some View {
    let data = env.watchlistData
    let items = data.items(in: group)
    VStack(spacing: 10) {
      if items.isEmpty {
        EmptyState(systemImage: "plus.circle", title: "No tokens yet", message: "Add tokens to \(group.name) to see prices and holdings.",
                   actionTitle: "Add token") { env.router.sheet = .coinSearch(targetGroupId: group.id) }
      } else {
        ForEach(items) { item in
          CoinRow(item: item, group: group)
        }
      }
    }
    .padding(.horizontal, 16)
    .onAppear { register(items) }
    .onChange(of: items) { _, next in register(next) }
    .onChange(of: env.router.sheet) { _, sheet in
      if sheet == nil { register(items) }
    }
    .onChange(of: env.router.showsWatchlistChooser) { _, choosing in
      if choosing { env.selection.release(owner: "watchlist-\(group.id)") }
      else { register(items) }
    }
    .onChange(of: env.router.tab) { _, tab in
      if tab == .watchlists { register(items) }
    }
    .onDisappear { env.selection.release(owner: "watchlist-\(group.id)") }
  }

  private func register(_ items: [WatchlistItem]) {
    guard env.router.tab == .watchlists, !env.router.showsWatchlistChooser, env.router.watchlistsPath.isEmpty,
          env.router.sheet == nil else { return }
    let data = env.watchlistData
    // Outgoing rows can still receive updates while SwiftUI animates the group change.
    // Only the displayed group may claim selection or replace its action callbacks.
    guard data.selectedGroup?.id == group.id else { return }
    env.selection.register(owner: "watchlist-\(group.id)", selectableIds: items.map(\.coinId), onRemove: { ids in
      _ = try await data.removeBulk(coinIds: ids, from: group.id)
    }, onAnalyze: { ids in env.router.sheet = .analyze(ids) })
  }
}

struct CoinRow: View {
  @Environment(AppEnvironment.self) private var env
  let item: WatchlistItem
  let group: WatchlistGroup

  var body: some View {
    let data = env.watchlistData
    let quote = data.quote(item.coinId)
    SelectableRow(id: item.coinId, removalTitle: "Remove from \(group.name)?", onRemove: {
      try await data.remove(coinId: item.coinId, from: group.id)
    }) {
    HStack(spacing: 12) {
    Button {
      if env.selection.isActive { env.selection.toggle(item.coinId) } else { env.router.openToken(item.coinId, groupSlug: group.slug, sourceID: "watchlist|\(group.id)|\(item.coinId)") }
    } label: {
      HStack(spacing: 12) {
        GlassTokenLogo(symbol: quote?.symbol ?? item.coinId, imageURL: quote?.image, size: 34)
        VStack(alignment: .leading, spacing: 2) {
          Text((quote?.symbol ?? "N/A").uppercased()).font(.subheadline.weight(.semibold))
          Text(LogoOverrides.cleanTokenName(quote?.name ?? item.coinId)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 3) {
          if let price = quote?.currentPrice, price > 0 {
            UsdText(value: price, font: .subheadline.weight(.medium))
            MoveWithBadge(usdMove: quote?.usdMove24h, pct: quote?.priceChangePercentage24h)
          } else {
            SkeletonBlock(height: 12, width: 70)
            SkeletonBlock(height: 10, width: 50)
          }
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("watchlist-token-\(item.coinId)")
      HoldingsCell(item: item, group: group, priceUsd: quote?.currentPrice)
    }
    }
    .tokenTransitionSource("watchlist|\(group.id)|\(item.coinId)")
  }
}

/// `ChartHoldingsCell`: tap → numeric field; empty clears; invalid → toast + revert; shows USD notional.
struct HoldingsCell: View {
  @Environment(AppEnvironment.self) private var env
  let item: WatchlistItem
  let group: WatchlistGroup
  let priceUsd: Double?
  @State private var editing = false
  @State private var draft = ""
  @FocusState private var focused: Bool

  private static let qtyFormatter: NumberFormatter = {
    let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 8; f.minimumFractionDigits = 0; return f
  }()

  var body: some View {
    VStack(alignment: .trailing, spacing: 3) {
      if editing {
        TextField("0", text: $draft)
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .focused($focused)
          .frame(width: 84)
          .padding(.horizontal, 6).padding(.vertical, 3)
          .background(.white.opacity(0.08), in: .rect(cornerRadius: 6))
          .onSubmit { Task { await commit() } }
          .onChange(of: focused) { _, f in if !f && editing { Task { await commit() } } }
          .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = false } } }
      } else {
        Button {
          draft = item.holdings.map { HoldingsAmount.format($0) } ?? ""
          editing = true
          focused = true
        } label: {
          Text(item.holdings.map { Self.qtyFormatter.string(from: NSNumber(value: $0)) ?? "—" } ?? "+ Add")
            .font(.caption.monospacedDigit())
            .foregroundStyle(item.holdings == nil ? .secondary : .primary)
        }
        .buttonStyle(.plain)
      }
      if let h = item.holdings, let p = priceUsd, p > 0 {
        Text(UsdFormat.price(h * p)).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
      }
    }
    .frame(minWidth: 70, alignment: .trailing)
  }

  private func commit() async {
    editing = false
    let n: Double?
    do { n = try HoldingsAmount.parse(draft) }
    catch {
      env.toasts.error("Invalid amount", "Enter a non-negative number using your region’s decimal separator, or leave empty to clear.")
      return
    }
    do { try await env.watchlistData.setHoldings(groupId: group.id, coinId: item.coinId, holdings: n) }
    catch { env.toasts.error("Could not update holdings", "Try again in a moment.") }
  }
}

#if DEBUG
#Preview("Watchlist details") {
  PreviewHost(tab: .watchlists) { _ in ScrollView { WatchlistDetailSection(group: PreviewFixtures.group).padding() } }
}
#Preview("Token cards and holdings") {
  PreviewHost { env in
    ScrollView { CoinRowsList(group: PreviewFixtures.group).padding() }
      .onAppear { env.selection.register(owner: "preview", selectableIds: PreviewFixtures.quotes.map(\.id), onRemove: { _ in }, onAnalyze: { _ in }) }
  }
}
#Preview("Group charts") {
  PreviewHost { _ in
    ScrollView { VStack(spacing: 20) {
      GroupAggregateCard(group: PreviewFixtures.group, scale: .d1)
      GroupCoinsChart(group: PreviewFixtures.group, scale: .d7)
    }.padding() }
  }
}
#endif
