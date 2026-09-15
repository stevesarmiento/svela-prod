import AggrAPI
import AggrCore
import SwiftUI

/// Port of `analysis-dialog.tsx`: builds the `/api/analyze` payload (`useAnalysisData`) and streams the report.
struct DeepAnalysisSheet: View {
  let coinId: String
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var isLoading = false
  @State private var failed = false
  @State private var bundle: AnalysisDataService.Bundle?
  @State private var priceData: AnalysisPriceChart.Model?
  @State private var chartFailed = false
  @State private var generation = UUID()
  @State private var analysisDate = Date()
  @State private var streamTask: Task<Void, Never>?

  static let steps = ["Analyzing price data", "Looking at trend", "Understanding orderflow", "Considering liquidations", "Looking at open interest",
                      "Understanding the market", "Thinking...", "Writing out thoughts", "I have a lot of thoughts...",
                      "Im embarassed to be taking this long...", "Pardon my tardiness...", "I'm just a little bit nervous...", "You're so awesome :)"]

  var body: some View {
    let quote = env.watchlistData.quote(coinId)
    NavigationStack {
      AnalysisWorkspace {
        AnalysisTokenHeader(coinId: coinId, quote: quote, priceOverride: bundle?.series.last?.value)
        Text("Analysis as of \(analysisDate.formatted(date: .abbreviated, time: .shortened))")
          .font(.caption).foregroundStyle(.secondary)
      } chart: {
        if let priceData { AnalysisPriceChart(model: priceData) }
        else if chartFailed {
          Text("Price chart unavailable").font(.caption).foregroundStyle(.secondary)
        } else { ProgressView("Loading price history").frame(maxWidth: .infinity, minHeight: 180) }
      } metrics: {
        if let bundle { AnalysisMarketMetrics(bundle: bundle) }
        else if isLoading { ProgressView("Preparing market data").frame(maxWidth: .infinity, minHeight: 160) }
        else { Text("Market data unavailable. Try regenerating the analysis.").foregroundStyle(.secondary) }
      } report: {
        AnalysisReport(text: text, isLoading: isLoading, failed: failed, steps: Self.steps)
      }
      .navigationTitle("Deep Analysis")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .primaryAction) {
          Button { run() } label: { Label("Regenerate", systemImage: "arrow.clockwise") }.disabled(isLoading)
        }
      }
    }
    .frame(idealWidth: 1000)
    .presentationSizing(.page.fitted(horizontal: true, vertical: false))
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
    .onAppear { run() }
    .task(id: generation) { await loadChart() }
    .onDisappear { streamTask?.cancel(); generation = UUID() }
  }

  private func run() {
    streamTask?.cancel()
    let runID = UUID(); generation = runID
    text = ""; failed = false; isLoading = true; analysisDate = Date()
    let ai = AIStreamClient(client: env.apiClient)
    let service = env.analysis
    let coinId = coinId
    let quote = env.watchlistData.quote(coinId)
    streamTask = Task {
      do {
        let bundle = try await service.build(coinId: coinId, fallbackName: quote?.name, fallbackSymbol: quote?.symbol)
        try Task.checkCancellation()
        guard generation == runID else { return }
        self.bundle = bundle
        #if DEBUG
        if env.convex.isPreview { text = PreviewData.analysisText; isLoading = false; return }
        #endif
        let body = try JSONEncoder().encode(bundle.data)
        for try await chunk in ai.stream(path: "/api/analyze", body: body, protocol: .text) {
          guard !Task.isCancelled, generation == runID else { return }
          text += chunk
        }
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled, generation == runID {
          text = "Failed to generate analysis. Please try again.\n\n\(error.localizedDescription)"; failed = true
        }
      }
      if !Task.isCancelled, generation == runID { isLoading = false }
    }
  }

  private func loadChart() async {
    chartFailed = false
    do {
      let chart = try await env.analysis.priceChart(coinId: coinId)
      try Task.checkCancellation()
      priceData = .init(data: chart)
    } catch {
      if !Task.isCancelled { chartFailed = true }
    }
  }

}

/// Quote header shared by the analysis sheets.
struct AnalysisTokenHeader: View {
  let coinId: String
  let quote: CoinQuote?
  var priceOverride: Double? = nil
  var body: some View {
    HStack(spacing: 10) {
      GlassTokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text(LogoOverrides.cleanTokenName(quote?.name ?? coinId)).font(.headline)
        HStack(spacing: 6) {
          if let p = priceOverride ?? quote?.currentPrice { Text(UsdFormat.price(p)).font(.system(.subheadline, design: .rounded).monospacedDigit()) }
          PercentBadge(pct: quote?.priceChangePercentage24h, compact: true)
        }
      }
      Spacer()
    }
  }
}

/// Port of `multi-analysis-dialog.tsx`: 2–5 tokens → per-token payloads, client-side comparative stats,
/// `/api/analyze/compare`. Falls back to whatever loaded after 30s.
struct MultiAnalysisSheet: View {
  let coinIds: [String]
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var isLoading = false
  @State private var stats: ComparativeStats.Result?
  @State private var chartLines: [AnalysisChartSeries.Line] = []
  @State private var includedIds: [String] = []
  @State private var failed = false
  @State private var generation = UUID()
  @State private var analysisDate = Date()
  @State private var readyCount = 0
  @State private var streamTask: Task<Void, Never>?

  static let steps = ["Gathering data for every token", "Lining up the price histories", "Computing correlations", "Measuring betas vs the benchmark",
                      "Comparing risk-adjusted momentum", "Weighing order flow", "Checking who's overheated", "Looking for rotation", "Thinking...",
                      "Writing the comparison", "So many tokens, so little time...", "You're so awesome :)"]

  var body: some View {
    NavigationStack {
      AnalysisWorkspace {
        tokensRow
        Text("Analysis as of \(analysisDate.formatted(date: .abbreviated, time: .shortened))")
          .font(.caption).foregroundStyle(.secondary)
        if !includedIds.isEmpty && includedIds.count < requestedIds.count {
          Text("Comparing \(includedIds.count) of \(requestedIds.count) tokens. Unavailable: \(missingSymbols).")
            .font(.caption).foregroundStyle(.orange)
        }
      } chart: {
        if stats != nil { AnalysisComparisonChart(lines: chartLines) }
        else if isLoading { ProgressView("\(readyCount) of \(requestedIds.count) tokens ready").frame(maxWidth: .infinity, minHeight: 180) }
      } metrics: {
        if let stats { ComparativeStatsPanel(stats: stats) }
        else if isLoading { ProgressView("Computing comparison statistics").frame(maxWidth: .infinity, minHeight: 160) }
        else { Text("Comparison data unavailable. Try regenerating the analysis.").foregroundStyle(.secondary) }
      } report: {
        AnalysisReport(text: text, isLoading: isLoading, failed: failed, steps: Self.steps)
      }
      .navigationTitle("Compare \(coinIds.count) tokens")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .primaryAction) {
          Button { run() } label: { Label("Regenerate", systemImage: "arrow.clockwise") }.disabled(isLoading)
        }
      }
    }
    .frame(idealWidth: 1000)
    .presentationSizing(.page.fitted(horizontal: true, vertical: false))
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
    .onAppear { run() }
    .onDisappear { streamTask?.cancel(); generation = UUID() }
  }

  private var tokensRow: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(requestedIds, id: \.self) { id in
          let q = env.watchlistData.quote(id)
          HStack(spacing: 6) {
            TokenLogo(symbol: q?.symbol ?? id, imageURL: q?.image, size: 18)
            Text((q?.symbol ?? id).uppercased()).font(.caption.weight(.semibold))
          }
          .padding(.horizontal, 10).padding(.vertical, 6)
          .glassEffect(.regular, in: .capsule)
        }
      }
    }
  }

  private func run() {
    streamTask?.cancel()
    let runID = UUID(); generation = runID
    text = ""; stats = nil; chartLines = []; includedIds = []; failed = false; readyCount = 0; isLoading = true; analysisDate = Date()
    let ids = requestedIds
    guard ids.count >= 2 else { text = "Select at least two tokens to compare."; failed = true; isLoading = false; return }
    let service = env.analysis
    let ai = AIStreamClient(client: env.apiClient)
    let quotes = Dictionary(uniqueKeysWithValues: ids.map { ($0, env.watchlistData.quote($0)) })
    streamTask = Task {
      // Collect payloads concurrently; after 30s proceed with whatever is ready (web fallback).
      let collector = Collector()
      let gather = Task {
        await withTaskGroup(of: (String, AnalysisDataService.Bundle?).self) { group in
          for id in ids {
            group.addTask { (id, try? await service.build(coinId: id, fallbackName: quotes[id]??.name, fallbackSymbol: quotes[id]??.symbol)) }
          }
          for await (id, bundle) in group {
            guard !Task.isCancelled else { break }
            if let bundle { await collector.add(id: id, bundle: bundle) }
            let n = await collector.count
            guard !Task.isCancelled else { break }
            await MainActor.run { if generation == runID { readyCount = n } }
          }
        }
      }
      _ = await AsyncDeadline.wait(for: gather, timeout: .seconds(30))
      guard !Task.isCancelled, generation == runID else { return }
      let ready = await collector.ordered(ids)
      guard !Task.isCancelled, generation == runID else { return }
      guard ready.count >= 2 else {
        if !Task.isCancelled { text = "Not enough market data loaded to run a comparison. Please try again."; failed = true; isLoading = false }
        return
      }
      let comparative = ComparativeStats.compute(ready.map(\.comparativeInput))
      stats = comparative
      includedIds = ready.map { $0.data.symbolId }
      chartLines = AnalysisChartSeries.normalized(ready.map { .init(id: $0.data.symbolId, symbol: $0.data.symbol, points: $0.series) })
      #if DEBUG
      if env.convex.isPreview { text = PreviewData.analysisText; isLoading = false; return }
      #endif
      do {
        let body = try JSONEncoder().encode(CompareRequest(tokens: ready.map(\.data), comparative: comparative))
        for try await chunk in ai.stream(path: "/api/analyze/compare", body: body, protocol: .text) {
          guard !Task.isCancelled, generation == runID else { return }
          text += chunk
        }
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled, generation == runID { text = "Failed to generate comparison. Please try again.\n\n\(error.localizedDescription)"; failed = true }
      }
      if !Task.isCancelled, generation == runID { isLoading = false }
    }
  }

  private var requestedIds: [String] {
    var seen = Set<String>()
    return Array(coinIds.filter { seen.insert($0).inserted }.prefix(SelectionStore.maxAnalyzeTokens))
  }
  private var missingSymbols: String {
    requestedIds.filter { !includedIds.contains($0) }.map { (env.watchlistData.quote($0)?.symbol ?? $0).uppercased() }.joined(separator: ", ")
  }

  private actor Collector {
    private var bundles: [String: AnalysisDataService.Bundle] = [:]
    var count: Int { bundles.count }
    func add(id: String, bundle: AnalysisDataService.Bundle) { bundles[id] = bundle }
    func ordered(_ ids: [String]) -> [AnalysisDataService.Bundle] { ids.compactMap { bundles[$0] } }
  }
}

#if DEBUG
#Preview("Deep analysis") {
  PreviewHost(navigation: false) { _ in DeepAnalysisSheet(coinId: "bitcoin") }
}
#Preview("Compare analysis") {
  PreviewHost(navigation: false) { _ in MultiAnalysisSheet(coinIds: ["bitcoin", "ethereum"]) }
}
#Preview("Token header") {
  AnalysisTokenHeader(coinId: "bitcoin", quote: PreviewFixtures.quotes[0]).padding().preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Comparative statistics") {
  ComparativeStatsPanel(stats: ComparativeStats.compute(PreviewFixtures.quotes.map { quote in
    .init(id: quote.id, symbol: quote.symbol, name: quote.name, marketCap: quote.marketCap,
          series: PreviewFixtures.line, rsi: 56, bbwpPct: 42)
  })!).padding().preferredColorScheme(.dark)
}
#endif
