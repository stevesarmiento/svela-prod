import AggrAPI
import AggrCore
import AggrLiveline
import SwiftUI

/// Selected watchlist comparison, with chart controls and editable token holdings.
struct WatchlistDetailSection: View {
  let group: WatchlistGroup
  @Environment(AppEnvironment.self) private var env
  @State private var scale: TimeScale = .d1
  /// Scrubbing the comparison chart turns the token rows into its readout.
  @State private var scrub = ComparisonScrubStore()

  var body: some View {
    VStack(spacing: 16) {
      GroupCoinsChart(group: group, scale: scale, scrub: scrub)
        .padding(.horizontal, 16)
      TimeScalePicker(scales: TimeScale.overviewScales, selection: $scale)
        .padding(.horizontal, 16)
      CoinRowsList(group: group, scrub: scrub)
    }
    .onChange(of: group.id) { _, _ in scrub.setSelection(nil) }
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
        if let change { PercentBadge(pct: change) } else if loading { RingLoader(size: .small, tint: .secondary) } else { Text("—").foregroundStyle(.secondary) }
      }
      if points.count >= 2 {
        AggrSparkline(points: points, isActive: env.isSceneActive && env.router.tab == .watchlists && !env.router.showsWatchlistChooser,
                      color: (change ?? 0) >= 0 ? .gainGreen : .lossRed, lineWidth: 1.8, fadeLeading: false)
          .equatable()
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
  var scrub: ComparisonScrubStore? = nil
  @State private var byCoin: [String: [TimePoint]] = [:]
  @State private var loading = false

  var body: some View {
    let data = env.watchlistData
    let ids = data.coinIds(in: group)
    let colors = ChartColors.generatePastelColors(max(1, ids.count))
    let series = ids.enumerated().map { i, id in
      MultiLineComparisonChart.Series(id: id, label: (data.quote(id)?.symbol ?? id).uppercased(), color: colors[i], points: byCoin[id] ?? [])
    }
    VStack {
      if ids.isEmpty {
        Text("Add tokens to chart them.").font(.footnote).foregroundStyle(.secondary).frame(height: 160)
      } else if series.allSatisfy({ $0.points.count < 2 }) {
        if loading { RingLoader().frame(height: 220) } else { Text("No chart data yet").font(.footnote).foregroundStyle(.secondary).frame(height: 220) }
      } else {
        SelectedGroupCoinsPlot(series: series, groupID: group.id, scale: scale,
                               isActive: env.isSceneActive && env.router.tab == .watchlists && !env.router.showsWatchlistChooser,
                               onSelection: { scrub?.setSelection($0) })
          .frame(height: 300)
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
          .mapValues { AggregateSeries.returnSeries($0) }
        if let scrub {
          scrub.prices = fetched.mapValues(\.points)
          scrub.windowStart = byCoin.values.compactMap { $0.first?.epochSeconds }.min().map(Double.init)
        }
        loading = false
        do { try await Task.sleep(for: QueryPolicy.aggregateChart.refetchInterval ?? .seconds(300)) } catch { return }
      }
    }
  }
}

/// Keep selection observation below the data adapter, so selection cannot
/// renormalize history or rebuild the list of chart series.
private struct SelectedGroupCoinsPlot: View {
  let series: [MultiLineComparisonChart.Series]
  let groupID: String
  let scale: TimeScale
  let isActive: Bool
  var onSelection: (LivelineSelection?) -> Void = { _ in }
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    MultiLineComparisonChart(series: series,
      selectedIDs: env.selection.ownerId == "watchlist-\(groupID)" ? env.selection.selected : [],
      datasetID: "watchlist-\(groupID)", scale: scale, isActive: isActive,
      accessibilityID: "watchlist-coins-comparison-chart", onSelection: onSelection)
  }
}

enum WatchlistTokenSort: String, CaseIterable {
  case original, changeDescending, changeAscending, nameAscending, nameDescending
  case priceDescending, priceAscending, holdingsDescending

  var title: String {
    switch self {
    case .original: "Watchlist order (default)"
    case .changeDescending: "24h change: high to low"
    case .changeAscending: "24h change: low to high"
    case .nameAscending: "Name: A–Z"
    case .nameDescending: "Name: Z–A"
    case .priceDescending: "Price: high to low"
    case .priceAscending: "Price: low to high"
    case .holdingsDescending: "Holdings value: high to low"
    }
  }

  func ordered(_ items: [WatchlistItem], quote: (String) -> CoinQuote?) -> [WatchlistItem] {
    guard self != .original else { return items }
    let entries = items.enumerated().map { index, item in
      let q = quote(item.coinId)
      let price = q?.currentPrice.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
      let metric: Double?
      switch self {
      case .changeDescending, .changeAscending: metric = q?.priceChangePercentage24h
      case .priceDescending, .priceAscending: metric = price
      case .holdingsDescending: metric = item.holdings.flatMap { amount in price.map { amount * $0 } }
      default: metric = nil
      }
      return (index: index, item: item, name: q?.name ?? item.coinId,
              metric: metric.flatMap { $0.isFinite ? $0 : nil })
    }
    return entries.sorted { lhs, rhs in
      if self == .nameAscending || self == .nameDescending {
        let order = lhs.name.localizedStandardCompare(rhs.name)
        if order != .orderedSame { return self == .nameAscending ? order == .orderedAscending : order == .orderedDescending }
      } else {
        switch (lhs.metric, rhs.metric) {
        case let (a?, b?) where a != b:
          return self == .changeAscending || self == .priceAscending ? a < b : a > b
        case (_?, nil): return true
        case (nil, _?): return false
        default: break
        }
      }
      return lhs.index < rhs.index
    }.map(\.item)
  }
}

/// Coin rows for a group with price, 24h move, and editable holdings (`chart-table.tsx`).
struct CoinRowsList: View {
  @Environment(AppEnvironment.self) private var env
  @AppStorage("watchlists.tokenSort") private var sort: WatchlistTokenSort = .original
  let group: WatchlistGroup
  var scrub: ComparisonScrubStore? = nil

  var body: some View {
    let data = env.watchlistData
    let items = data.items(in: group)
    VStack(spacing: 10) {
      ListFilterHeader(title: "Tokens in \(group.name)", actionLabel: "Sort tokens", value: sort.title,
                       isActive: sort != .original, accessibilityID: "watchlist-token-sort") {
        Picker("Sort tokens", selection: $sort) {
          ForEach(WatchlistTokenSort.allCases, id: \.self) { option in
            Text(option.title).tag(option)
          }
        }
      }
      LazyVStack(spacing: 10) {
        if items.isEmpty {
          EmptyState(illustration: .tokens, title: "Add some tokens to watch", message: "Add tokens to \(group.name) to compare their performance here.",
                     actionTitle: "Add token") { env.router.sheet = .coinSearch(targetGroupId: group.id) }
        } else {
          ForEach(sort.ordered(items, quote: data.quote)) { item in
            CoinRow(item: item, group: group, scrub: scrub)
          }
        }
      }
      .padding(.horizontal, 16)
    }
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
  var scrub: ComparisonScrubStore? = nil

  var body: some View {
    let data = env.watchlistData
    let quote = data.quote(item.coinId)
    // While the chart is scrubbed, the row reads the inspected price and return instead of live.
    let inspecting = scrub?.isScrubbing == true
    let price = inspecting ? (scrub?.price(for: item.coinId) ?? quote?.currentPrice) : quote?.currentPrice
    let change = inspecting ? (scrub?.value(for: item.coinId) ?? scrub?.change(for: item.coinId) ?? quote?.priceChangePercentage24h) : quote?.priceChangePercentage24h
    SelectableRow(id: item.coinId, removalTitle: "Remove from \(group.name)?", onRemove: {
      try await data.remove(coinId: item.coinId, from: group.id)
    }) {
      HStack(spacing: 10) {
        Button(action: openToken) {
          GlassTokenLogo(symbol: quote?.symbol ?? item.coinId, imageURL: quote?.image, size: 34)
            .frame(width: 34, height: 34)
            .contentShape(.rect)
        }
        .accessibilityLabel("Open \(quote?.name ?? item.coinId)")

        VStack(alignment: .leading, spacing: 4) {
          Button(action: openToken) {
            Text((quote?.symbol ?? "N/A").uppercased())
              .font(.subheadline.weight(.semibold))
              .lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(.rect)
          }
          .accessibilityIdentifier("watchlist-token-\(item.coinId)")
          HoldingsCell(item: item, group: group, symbol: quote?.symbol ?? "", priceUsd: quote?.currentPrice)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Button(action: openToken) {
          VStack(alignment: .trailing, spacing: 3) {
            if let price, price > 0 {
              UsdText(value: price, font: .subheadline.weight(.medium))
                .contentTransition(.numericText(value: price))
              PercentBadge(pct: change, compact: true)
                .fixedSize(horizontal: true, vertical: false)
            } else {
              SkeletonBlock(height: 12, width: 70)
              SkeletonBlock(height: 10, width: 50)
            }
          }
          .fixedSize(horizontal: true, vertical: false)
          .contentShape(.rect)
        }
        .accessibilityIdentifier("watchlist-price-\(item.coinId)")
        .fixedSize(horizontal: true, vertical: false)
      }
      .buttonStyle(.plain)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("watchlist-row-\(item.coinId)")
    .tokenTransitionSource("watchlist|\(group.id)|\(item.coinId)")
  }

  private func openToken() {
    if env.selection.isActive { env.selection.toggle(item.coinId) }
    else { env.router.openToken(item.coinId, groupSlug: group.slug, sourceID: "watchlist|\(group.id)|\(item.coinId)") }
  }
}

/// `ChartHoldingsCell`: tap → numeric field; empty clears; invalid → toast + revert; shows USD notional.
struct HoldingsCell: View {
  @Environment(AppEnvironment.self) private var env
  let item: WatchlistItem
  let group: WatchlistGroup
  let symbol: String
  let priceUsd: Double?
  @State private var editing = false
  @State private var draft = ""
  @FocusState private var focused: Bool

  private static let qtyFormatter: NumberFormatter = {
    let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 8; f.minimumFractionDigits = 0; return f
  }()

  var body: some View {
    HStack(spacing: 6) {
      if editing {
        TextField("0", text: $draft)
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.leading)
          .focused($focused)
          .frame(maxWidth: 84)
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
          Text(item.holdings.map { amount in
            [Self.qtyFormatter.string(from: NSNumber(value: amount)) ?? "—", symbol.uppercased()]
              .filter { !$0.isEmpty }.joined(separator: " ")
          } ?? "Add Holdings")
            .font(.caption.monospacedDigit())
            .foregroundStyle(item.holdings == nil ? .secondary : .primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.holdings == nil ? "Add Holdings" : "Edit token amount")
        .accessibilityIdentifier("edit-holdings-\(item.coinId)")
      }
      if let h = item.holdings, let p = priceUsd, p > 0 {
        Text("·").foregroundStyle(.tertiary)
        Text(UsdFormat.price(h * p)).foregroundStyle(.secondary)
      }
    }
    .font(.caption.monospacedDigit())
    .lineLimit(1)
    .minimumScaleFactor(0.75)
    .frame(maxWidth: .infinity, alignment: .leading)
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
#Preview("Selected token rows with holdings") {
  PreviewHost { env in
    ScrollView { CoinRowsList(group: PreviewFixtures.group).padding(.vertical) }
      .onAppear {
        env.selection.register(owner: "preview", selectableIds: PreviewFixtures.quotes.map(\.id), onRemove: { _ in }, onAnalyze: { _ in })
        env.selection.toggle("bitcoin")
      }
  }
}
#endif
