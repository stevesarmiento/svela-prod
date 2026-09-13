import AggrAPI
import AggrCore
import SwiftUI

/// `/screener` — browse / search / DSL screen, filter chips, smart prompt, coverage, freshness.
struct ScreenerView: View {
  @Environment(AppEnvironment.self) private var env
  @State private var store: ScreenerStore?
  @State private var showPrompt = false
  @State private var editingFilterIndex: Int?? = nil   // .some(nil) = add new
  @State private var searchDraft = ""

  var body: some View {
    Group {
      if let store {
        ScreenerContent(store: store, showPrompt: $showPrompt, editingFilterIndex: $editingFilterIndex)
      } else {
        ProgressView()
      }
    }
    .navigationTitle("Screener")
    .toolbar {
      if !env.selection.isActive {
        if let store {
          ToolbarItemGroup(placement: .topBarTrailing) {
            SortMenu(store: store)
            if let url = URL(string: "https://aggr.watch/screener" + store.webURLQuery) {
              ShareLink(item: url) { Label("Share screener", systemImage: "square.and.arrow.up") }
            }
            Button { showPrompt = true } label: {
              Label("Smart Screener", systemImage: "sparkles")
            }
            .overlay(alignment: .topTrailing) {
              if store.dsl != nil { Circle().fill(.blue).frame(width: 7, height: 7).offset(x: 2, y: -2) }
            }
          }
        }
      }
    }
    .sheet(isPresented: $showPrompt) { if let store { SmartPromptSheet(store: store) } }
    .sheet(item: editTargetBinding) { target in
      if let store { FilterEditorSheet(store: store, index: target.index) }
    }
    .task(id: "\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { store?.stop(); return }
      if store == nil { store = ScreenerStore(api: env.screener, market: env.market, cache: env.queryCache) }
      store?.start()
    }
    .onDisappear { store?.stop() }
    .task(id: "\(pendingLinkKey)|\(store != nil)") {
      guard let link = env.router.pendingScreenerLink, let store else { return }
      store.applyLink(dsl: link.dsl, sort: link.sort, q: link.q)
      env.router.pendingScreenerLink = nil
    }
  }
}

extension ScreenerView {
  fileprivate var editTargetBinding: Binding<FilterEditTarget?> {
    Binding<FilterEditTarget?>(
      get: { editingFilterIndex.map { FilterEditTarget(index: $0) } },
      set: { newValue in editingFilterIndex = newValue.map { Int??.some($0.index) } ?? nil }
    )
  }

  fileprivate var pendingLinkKey: String {
    guard let l = env.router.pendingScreenerLink else { return "" }
    return "\(l.dsl ?? "")|\(l.sort ?? "")|\(l.q ?? "")"
  }
}

private struct FilterEditTarget: Identifiable { let index: Int?; var id: String { index.map(String.init) ?? "new" } }

private struct ScreenerContent: View {
  @Bindable var store: ScreenerStore
  @Binding var showPrompt: Bool
  @Binding var editingFilterIndex: Int??
  @Environment(AppEnvironment.self) private var env

  private func registerSelection(_ rows: [ScreenerMarketRow]) {
    guard env.router.tab == .screener, env.router.screenerPath.isEmpty else { return }
    // Read-only table: no Remove (screener passes nil), Analyze only.
    env.selection.register(owner: "screener", selectableIds: rows.map(\.coingeckoId), onRemove: nil, onAnalyze: { ids in env.router.sheet = .analyze(ids) })
  }

  var body: some View {
    let rows = store.sortedRows
    List {
      Section {
        FilterChipsRow(store: store, onEdit: { editingFilterIndex = .some($0) }, onAdd: { editingFilterIndex = .some(nil) })
          .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
          .listRowSeparator(.hidden)
        if let caption = store.coverageCaption {
          Text(caption).font(.caption2).foregroundStyle(.secondary).listRowSeparator(.hidden)
        }
        FreshnessIndicator(lastUpdatedAtMs: store.lastUpdatedAtMs, isRefreshing: store.isFetching).listRowSeparator(.hidden)
        if let error = store.error {
          HStack { Text(error).font(.caption).foregroundStyle(Color.lossRed); Spacer(); Button("Retry") { store.refetch() }.font(.caption) }
        }
      }
      .listRowBackground(Color.clear)

      Section {
        if rows.isEmpty && !store.isLoading {
          if store.source == .browse {
            EmptyState(systemImage: "binoculars", title: "No screener data available", message: "Try again in a moment.", actionTitle: "Retry") { store.refetch() }
          } else {
            EmptyState(systemImage: "line.3.horizontal.decrease.circle", title: "No tokens match your filters",
                       message: store.screenUserMessage ?? (store.coverage.map { "0 of \(Int($0.scanned)) scanned matched your filters." } ?? "Try adjusting your search or filter criteria"),
                       actionTitle: "Clear filters") { store.clearAll() }
          }
        } else if rows.isEmpty {
          ForEach(0..<8, id: \.self) { _ in SkeletonRow() }
        } else {
          ForEach(rows) { row in
            SelectableRow(id: row.coingeckoId) {
              ScreenerRowView(row: row, taker: store.takerById[row.coingeckoId], takerLoading: store.takerLoading)
                .contentShape(.rect)
                .onTapGesture { if env.selection.isActive { env.selection.toggle(row.coingeckoId) } else { env.router.openToken(row.coingeckoId) } }
            }
            .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
          }
        }
      } header: {
        HStack { Text("Token"); Text("\(rows.count)").font(.caption2.monospacedDigit()).padding(.horizontal, 5).background(.white.opacity(0.1), in: Capsule()); Spacer(); Text(store.source == .screen ? "Screen" : (store.source == .search ? "Search" : "Top 500")) }
      }
    }
    .listStyle(.plain)
    .searchable(text: Binding(get: { store.q }, set: { store.setQ($0) }), placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search tokens")
    .refreshable { store.refetch() }
    .onAppear { registerSelection(rows) }
    .onChange(of: rows.map(\.id)) { _, _ in registerSelection(store.sortedRows) }
    .onDisappear { env.selection.release(owner: "screener") }
  }
}

/// One coin row (`screener-columns.tsx`): token / price / mcap · vol / daily perf / order flow / 2-week trail.
struct ScreenerRowView: View {
  let row: ScreenerMarketRow
  let taker: TakerFlowMetrics?
  let takerLoading: Bool

  var body: some View {
    let loading = row.isLoadingQuote
    VStack(spacing: 8) {
      HStack(spacing: 10) {
        TokenLogo(symbol: row.symbol, imageURL: row.image, size: 22)
        Text(row.symbol.uppercased()).font(.subheadline.weight(.bold))
        Text(LogoOverrides.cleanTokenName(row.name)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        Spacer()
        if loading { SkeletonBlock(height: 12, width: 64) } else { UsdText(value: row.currentPrice, font: .system(.footnote, design: .monospaced)) }
      }
      HStack(spacing: 10) {
        if loading {
          SkeletonBlock(height: 10, width: 60); SkeletonBlock(height: 10, width: 60)
        } else {
          statText("MCAP", row.marketCap.map(UsdFormat.largeUsd) ?? "—")
          statText("VOL", row.totalVolume.map(UsdFormat.largeUsd) ?? "—")
        }
        Spacer()
        if !loading, let pct = row.priceChangePercentage24h {
          MoveWithBadge(usdMove: row.currentPrice.flatMap { MarketMetrics.usdMove(priceUsd: $0, percentChange: pct) }, pct: pct)
        } else if !loading {
          Text("—").font(.caption).foregroundStyle(.secondary)
        }
      }
      HStack(spacing: 10) {
        TakerVolumeCell(metrics: taker, isLoading: takerLoading)
        Spacer()
        TrailCell(coinId: row.coingeckoId, percentChange24h: row.priceChangePercentage24h)
          .frame(width: 120, height: 28)
      }
    }
    .padding(.vertical, 6)
  }

  private func statText(_ label: String, _ value: String) -> some View {
    HStack(spacing: 4) {
      Text(label).font(.system(size: 9, weight: .semibold)).foregroundStyle(.tertiary)
      Text(value).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
    }
  }
}

private struct SkeletonRow: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack { Circle().fill(.quaternary).frame(width: 22, height: 22); SkeletonBlock(height: 12, width: 50); SkeletonBlock(height: 10, width: 90); Spacer(); SkeletonBlock(height: 12, width: 64) }
      HStack { SkeletonBlock(height: 10, width: 60); SkeletonBlock(height: 10, width: 60); Spacer(); SkeletonBlock(height: 14, width: 100) }
    }
    .padding(.vertical, 6)
  }
}

/// `screener-taker-volume-cell.tsx`: TickMeter (origin 50) + dominant-side badge; neutral grey between 45–55%.
struct TakerVolumeCell: View {
  let metrics: TakerFlowMetrics?
  let isLoading: Bool
  @State private var showDetail = false

  var body: some View {
    if let m = metrics, let buyPct = m.buyPct {
      let skew: Int = buyPct >= 55 ? 1 : (buyPct <= 45 ? -1 : 0)
      let meterColor: Color = buyPct >= 50 ? .gainGreen : .lossRed
      let badgeColor: Color = skew > 0 ? .gainGreen : (skew < 0 ? .lossRed : .secondary)
      Button { showDetail = true } label: {
        HStack(spacing: 8) {
          TickMeter(value: buyPct, min: 0, max: 100, origin: .value(50), color: meterColor)
          HStack(spacing: 3) {
            Image(systemName: "triangle.fill").font(.system(size: 5)).rotationEffect(.degrees(buyPct < 50 ? 180 : 0))
            Text(String(format: "%.1f%%", buyPct >= 50 ? buyPct : 100 - buyPct))
          }
          .font(.system(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(badgeColor)
          .padding(.horizontal, 6).padding(.vertical, 2)
          .background(badgeColor.opacity(skew == 0 ? 0.08 : 0.12), in: Capsule())
        }
      }
      .buttonStyle(.plain)
      .popover(isPresented: $showDetail) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Buy \(UsdFormat.largeUsd(m.buyVolumeUsd))")
          Text("Sell \(UsdFormat.largeUsd(m.sellVolumeUsd))")
          Text("Taker volume across exchanges, last 24h\(m.stale ? " (refreshing…)" : "")").foregroundStyle(.secondary)
        }
        .font(.caption.monospacedDigit()).padding(12).presentationCompactAdaptation(.popover)
      }
    } else if isLoading {
      SkeletonBlock(height: 12, width: 110)
    } else {
      Text("—").font(.caption).foregroundStyle(.tertiary)
    }
  }
}

/// `screener-inline-trail-cell.tsx`: 14d market-chart trail, neutral first week + colored last 7 days; lazy per visible row.
struct TrailCell: View {
  let coinId: String
  let percentChange24h: Double?
  @Environment(AppEnvironment.self) private var env
  @State private var points: [TimePoint] = []
  @State private var unavailable = false

  var body: some View {
    Group {
      if points.count >= 2 {
        let end = points.last!.epochSeconds
        let weekAgo = end - 7 * 86_400
        let last7 = points.filter { $0.epochSeconds >= weekAgo }
        let up = (last7.last?.value ?? 0) >= (last7.first?.value ?? 0)
        Sparkline(points: ChartSeries.downsample(points, max: 128), lineWidth: 1.2, tailStart: weekAgo,
                  tailColor: up ? Color(oklch: "oklch(0.7688 0.1687 161.95)") : Color(oklch: "oklch(0.7022 0.1892 22.23)"))
      } else if unavailable {
        Text("—").foregroundStyle(.secondary).accessibilityLabel("Price history unavailable")
      } else {
        SkeletonBlock(height: 24, width: 110)
      }
    }
    .task(id: "\(coinId)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { return }
      unavailable = false
      let key = QueryCache.Key("market-chart", coinId, "14")
      do {
        let response = try await env.queryCache.fetch(key, policy: .screenerTop) { [market = env.market] in try await market.marketChart(coinId: coinId, days: "14") }
        try Task.checkCancellation()
        points = response.data.prices.map { TimePoint(epochSeconds: TimePoint.normalizeEpochSeconds($0.time), value: $0.value) }
        unavailable = points.count < 2
      } catch { if !Task.isCancelled { unavailable = true } }
    }
  }
}

/// `screener-auto-refresh-indicator.tsx`
struct FreshnessIndicator: View {
  let lastUpdatedAtMs: Double?
  let isRefreshing: Bool
  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(isRefreshing ? Color.blue : Color.gainGreen).frame(width: 6, height: 6)
        .phaseAnimator([0.3, 1]) { v, p in v.opacity(isRefreshing ? p : 1) } animation: { _ in .easeInOut(duration: 0.8) }
      Text(isRefreshing ? "Refreshing…" : "Updated:").font(.system(size: 10)).foregroundStyle(.tertiary)
      Text(lastUpdatedAtMs.map { Date(timeIntervalSince1970: $0 / 1000).formatted(.dateTime.month(.abbreviated).day().hour().minute()) } ?? "—")
        .font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary)
    }
  }
}

/// Sort menu = header-click sort in column-key domain ("marketCap.desc").
struct SortMenu: View {
  let store: ScreenerStore
  var body: some View {
    Menu {
      ForEach([("Name", ScreenerSortKey.name), ("Price", .price), ("Market cap", .marketCap), ("24h volume", .volume), ("Daily performance", .change)], id: \.1) { label, key in
        Button {
          if store.sort?.key == key { store.setSort(ScreenerSort(key: key, desc: !(store.sort?.desc ?? true))) }
          else { store.setSort(ScreenerSort(key: key, desc: key != .name)) }
        } label: {
          if store.sort?.key == key { Label(label, systemImage: store.sort!.desc ? "arrow.down" : "arrow.up") } else { Text(label) }
        }
      }
      if store.sort != nil { Divider(); Button("Clear sort") { store.setSort(nil) } }
    } label: { Label("Sort", systemImage: "arrow.up.arrow.down") }
  }
}

/// `screener-filter-chips.tsx`
struct FilterChipsRow: View {
  let store: ScreenerStore
  let onEdit: (Int) -> Void
  let onAdd: () -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        if !store.q.isEmpty { FilterChip(text: "Search: \(store.q)") { store.setQ("") } }
        if let dsl = store.dsl {
          ForEach(Array(dsl.filters.enumerated()), id: \.offset) { i, f in
            FilterChip(text: ScreeningDslFormat.filter(f), onTap: { onEdit(i) }) {
              var next = dsl; next.filters.remove(at: i)
              store.setDsl(next.filters.isEmpty && next.sort == nil ? nil : next)
            }
          }
          if let s = dsl.sort, store.sort == nil {
            FilterChip(text: "Sort: \(MetricCatalog.metric(s.metricId)?.label ?? s.metricId) \(s.order == .desc ? "↓" : "↑")") {
              var next = dsl; next.sort = nil
              store.setDsl(next.filters.isEmpty ? nil : next)
            }
          }
          if dsl.limit != ScreeningDsl.defaultLimit { FilterChip(text: "Limit: \(dsl.limit)") { var n = dsl; n.limit = ScreeningDsl.defaultLimit; store.setDsl(n) } }
          if let t = dsl.takerContext, t.range != "24h" || t.exchange != nil {
            FilterChip(text: "Taker: \(t.range)\(t.exchange.map { " · \($0)" } ?? "")") { var n = dsl; n.takerContext = nil; store.setDsl(n) }
          }
        }
        if let s = store.sort { FilterChip(text: "Sort: \(s.key.rawValue) \(s.desc ? "↓" : "↑")") { store.setSort(nil) } }
        Button(action: onAdd) {
          Label("Add filter", systemImage: "plus").font(.caption).padding(.horizontal, 8).frame(height: 26)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3])).foregroundStyle(.secondary))
        }
        .buttonStyle(.plain).foregroundStyle(.secondary)
        if store.dsl != nil || !store.q.isEmpty || store.sort != nil {
          Button("Clear") { store.clearAll() }.font(.caption).foregroundStyle(.secondary)
        }
      }
    }
  }
}

struct FilterChip: View {
  let text: String
  var onTap: (() -> Void)? = nil
  let onRemove: () -> Void
  var body: some View {
    HStack(spacing: 6) {
      Button { onTap?() } label: { Text(text).font(.caption.monospacedDigit()) }.buttonStyle(.plain).disabled(onTap == nil)
      Button(action: onRemove) { Image(systemName: "xmark").font(.system(size: 9, weight: .bold)) }.buttonStyle(.plain)
    }
    .padding(.horizontal, 8).frame(height: 26)
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3])).foregroundStyle(.white.opacity(0.25)))
    .background(.white.opacity(0.05), in: .rect(cornerRadius: 8))
  }
}

/// `screener-filter-editor.tsx`: staged metric → operator → value; same coercion as the LLM path.
struct FilterEditorSheet: View {
  let store: ScreenerStore
  let index: Int?
  @Environment(\.dismiss) private var dismiss
  @State private var stage = 0
  @State private var metricId: String?
  @State private var op: ScreenFilterOp = .gt
  @State private var raw = ""
  @State private var search = ""
  @State private var error: String?

  init(store: ScreenerStore, index: Int?) {
    self.store = store; self.index = index
    if let index, let f = store.dsl?.filters[index] {
      _stage = State(initialValue: 2); _metricId = State(initialValue: f.metricId); _op = State(initialValue: f.op)
      _raw = State(initialValue: OklchColor.jsNumberString(f.value))
    }
  }

  var body: some View {
    NavigationStack {
      Group {
        switch stage {
        case 0: metricStage
        case 1: opStage
        default: valueStage
        }
      }
      .navigationTitle(index == nil ? "Add filter" : "Edit filter")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        if stage == 2 {
          ToolbarItem(placement: .confirmationAction) { Button("Apply") { apply() } }
        }
        if index != nil {
          ToolbarItem(placement: .bottomBar) { Button("Remove filter", role: .destructive) { remove() } }
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationBackground(.thinMaterial)
  }

  private var breadcrumb: some View {
    HStack(spacing: 6) {
      if let metricId, let m = MetricCatalog.metric(metricId) {
        Button(m.label) { withAnimation { stage = 0 } }.buttonStyle(.bordered).controlSize(.small)
      }
      if stage == 2 { Button(op.symbol) { withAnimation { stage = 1 } }.buttonStyle(.bordered).controlSize(.small) }
      Spacer()
    }
    .padding(.horizontal, 16).padding(.top, 8)
  }

  private var metricStage: some View {
    List {
      ForEach(MetricDefinition.Group.allCases, id: \.self) { group in
        let metrics = MetricCatalog.all.filter { $0.group == group && matches($0) }
        if !metrics.isEmpty {
          Section(group.rawValue) {
            ForEach(metrics) { m in
              Button { metricId = m.id; withAnimation { stage = 1 } } label: {
                VStack(alignment: .leading, spacing: 2) {
                  Text(m.label)
                  if let d = m.description { Text(d).font(.caption2).foregroundStyle(.secondary) }
                }
              }
            }
          }
        }
      }
    }
    .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Type a filter…")
  }

  private func matches(_ m: MetricDefinition) -> Bool {
    let s = search.trimmingCharacters(in: .whitespaces).lowercased()
    guard !s.isEmpty else { return true }
    return m.label.lowercased().contains(s) || m.synonyms.contains { $0.contains(s) }
  }

  private var opStage: some View {
    VStack(spacing: 0) {
      breadcrumb
      List(ScreenFilterOp.allCases, id: \.self) { o in
        Button { op = o; withAnimation { stage = 2 } } label: {
          HStack { Text(o.symbol).font(.system(.body, design: .monospaced)).frame(width: 28); Text(o.label) }
        }
      }
    }
  }

  private var valueStage: some View {
    let unit = metricId.flatMap { MetricCatalog.metric($0)?.unit }
    return VStack(alignment: .leading, spacing: 12) {
      breadcrumb
      TextField(ScreeningDslFormat.placeholder(unit: unit), text: $raw)
        .keyboardType(unit == .rank ? .numberPad : .asciiCapable)
        .textInputAutocapitalization(.never).autocorrectionDisabled()
        .padding(12).background(.white.opacity(0.06), in: .rect(cornerRadius: 12))
        .padding(.horizontal, 16)
        .onSubmit { apply() }
      if let error { Text(error).font(.caption).foregroundStyle(Color.lossRed).padding(.horizontal, 16) }
      Spacer()
    }
  }

  private func apply() {
    guard let metricId else { return }
    do {
      let filter = try ScreeningDslParser.parseFilter(metricId: metricId, op: op, rawValue: raw)
      var dsl = store.dsl ?? ScreeningDsl()
      if let index, index < dsl.filters.count { dsl.filters[index] = filter } else { dsl.filters.append(filter) }
      store.setDsl(dsl)
      dismiss()
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func remove() {
    guard let index, var dsl = store.dsl, index < dsl.filters.count else { dismiss(); return }
    dsl.filters.remove(at: index)
    store.setDsl(dsl.filters.isEmpty && dsl.sort == nil ? nil : dsl)
    dismiss()
  }
}

/// `screener-smart-prompt-dialog.tsx`
struct SmartPromptSheet: View {
  let store: ScreenerStore
  @Environment(\.dismiss) private var dismiss
  @State private var draft = ""
  @State private var inlineError: String?
  @FocusState private var focused: Bool

  private let examples = [
    "market cap over $1b with buy ratio above 55%",
    "fdv under 200m, volume over $5m",
    "7d return above 25%, sorted by volume",
  ]

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        TextField("Describe what you're looking for...", text: $draft, axis: .vertical)
          .lineLimit(1...4)
          .focused($focused)
          .padding(14).background(.white.opacity(0.06), in: .rect(cornerRadius: 14))
          .onSubmit { Task { await submit(draft) } }
        if let inlineError { Text(inlineError).font(.caption).foregroundStyle(Color.lossRed) }
        if store.isInterpreting {
          HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Interpreting…").font(.caption).foregroundStyle(.secondary) }
        }
        VStack(alignment: .leading, spacing: 8) {
          ForEach(examples, id: \.self) { ex in
            Button { draft = ex; Task { await submit(ex) } } label: {
              Text(ex).font(.caption).multilineTextAlignment(.leading)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3])).foregroundStyle(.white.opacity(0.2)))
            }
            .buttonStyle(.plain)
          }
        }
        Spacer()
      }
      .padding(20)
      .navigationTitle("Smart Screener")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Screen") { Task { await submit(draft) } }.disabled(store.isInterpreting || draft.trimmingCharacters(in: .whitespaces).isEmpty) }
      }
      .task { focused = true }
    }
    .presentationDetents([.medium, .large])
    .presentationBackground(.thinMaterial)
  }

  private func submit(_ raw: String) async {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return }
    inlineError = nil
    if SmartScreenerGate.isPlainSearchToken(trimmed) {
      store.setQ(trimmed); dismiss(); return
    }
    let response = await store.interpret(trimmed)
    if response?.ok == true { dismiss(); return }
    inlineError = response?.userMessage ?? "Couldn't interpret that right now. Try again in a moment."
  }
}

#if DEBUG
#Preview("Populated") {
  PreviewHost(tab: .screener) { _ in ScreenerView() }
}
#endif

#if DEBUG
#Preview("Token row and loading row") {
  VStack(spacing: 20) {
    ScreenerRowView(row: PreviewFixtures.marketRows[0].screenerRow, taker: nil, takerLoading: false)
    SkeletonRow()
    HStack { TakerVolumeCell(metrics: nil, isLoading: true); TakerVolumeCell(metrics: nil, isLoading: false) }
    FreshnessIndicator(lastUpdatedAtMs: Double(PreviewFixtures.now) * 1000, isRefreshing: false)
    FilterChip(text: "Market cap > $1B", onTap: {}, onRemove: {})
  }.padding().preferredColorScheme(.dark)
}
#Preview("Filter editor") {
  PreviewHost(navigation: false) { env in
    FilterEditorSheet(store: ScreenerStore(api: env.screener, market: env.market, cache: env.queryCache), index: nil)
  }
}
#Preview("Smart screener prompt") {
  PreviewHost(navigation: false) { env in
    SmartPromptSheet(store: ScreenerStore(api: env.screener, market: env.market, cache: env.queryCache))
  }
}
#endif

#if DEBUG
private struct ScreenerStatePreview: View {
  @State private var env: AppEnvironment
  @State private var store: ScreenerStore
  @State private var showPrompt = false
  @State private var editingFilterIndex: Int??
  init(state: PreviewData.State) {
    let env = PreviewData.environment(tab: .screener)
    let store = ScreenerStore(api: env.screener, market: env.market, cache: env.queryCache)
    store.seedPreview(state: state)
    _env = State(initialValue: env)
    _store = State(initialValue: store)
  }
  var body: some View {
    NavigationStack {
      ScreenerContent(store: store, showPrompt: $showPrompt, editingFilterIndex: $editingFilterIndex)
        .navigationTitle("Screener")
    }.environment(env).preferredColorScheme(.dark)
  }
}
#Preview("Loading screener") { ScreenerStatePreview(state: .loading) }
#Preview("Empty screener") { ScreenerStatePreview(state: .empty) }
#Preview("Screener error") { ScreenerStatePreview(state: .error) }
#endif
