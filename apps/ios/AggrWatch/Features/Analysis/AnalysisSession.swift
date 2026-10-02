import AggrAPI
import AggrCore
import Foundation
import Observation

/// One analysis run per presentation: payload preparation, chart loading and the streamed report.
/// Single vs comparison is decided by the number of requested tokens. Ports `analysis-dialog.tsx`
/// (`useAnalysisData` + `/api/analyze`) and `multi-analysis-dialog.tsx` (per-token payloads,
/// client-side comparative stats, `/api/analyze/compare`, 30 s fallback to whatever loaded).
@Observable
final class AnalysisSession {
  let coinIds: [String]
  /// Deduped and capped, in the order the tokens were chosen.
  let requestedIds: [String]
  var isComparison: Bool { requestedIds.count > 1 }

  var text = ""
  var isLoading = false
  var failed = false
  var analysisDate = Date()
  // Single token
  var bundle: AnalysisDataService.Bundle?
  var priceData: AnalysisPriceChart.Model?
  var chartFailed = false
  // Comparison
  var stats: ComparativeStats.Result?
  var chartLines: [AnalysisChartSeries.Line] = []
  var includedIds: [String] = []
  var readyCount = 0

  @ObservationIgnored private var env: AppEnvironment?
  /// Streamed chunks are batched into `text` at ~30 Hz instead of republishing per token.
  @ObservationIgnored private lazy var chunks = StreamTextCoalescer { [weak self] batch in self?.text += batch }
  @ObservationIgnored private var streamTask: Task<Void, Never>?
  @ObservationIgnored private var chartTask: Task<Void, Never>?
  @ObservationIgnored private var generation = UUID()

  static let singleSteps = ["Analyzing price data", "Looking at trend", "Understanding orderflow", "Considering liquidations", "Looking at open interest",
                            "Understanding the market", "Thinking...", "Writing out thoughts", "I have a lot of thoughts...",
                            "Im embarassed to be taking this long...", "Pardon my tardiness...", "I'm just a little bit nervous...", "You're so awesome :)"]
  static let comparisonSteps = ["Gathering data for every token", "Lining up the price histories", "Computing correlations", "Measuring betas vs the benchmark",
                                "Comparing risk-adjusted momentum", "Weighing order flow", "Checking who's overheated", "Looking for rotation", "Thinking...",
                                "Writing the comparison", "So many tokens, so little time...", "You're so awesome :)"]
  var steps: [String] { isComparison ? Self.comparisonSteps : Self.singleSteps }

  init(coinIds: [String]) {
    self.coinIds = coinIds
    var seen = Set<String>()
    requestedIds = Array(coinIds.filter { seen.insert($0).inserted }.prefix(SelectionStore.maxAnalyzeTokens))
  }

  /// The first call runs the analysis; later calls are no-ops (SwiftUI may re-run `.task`).
  func start(env: AppEnvironment) {
    guard self.env == nil else { return }
    self.env = env
    run()
  }

  func regenerate() { run() }

  func cancel() {
    streamTask?.cancel(); streamTask = nil
    chartTask?.cancel(); chartTask = nil
    chunks.discard()
    generation = UUID()
  }

  func quote(for id: String) -> CoinQuote? { env?.watchlistData.quote(id) }

  var missingSymbols: String {
    requestedIds.filter { !includedIds.contains($0) }.map { (quote(for: $0)?.symbol ?? $0).uppercased() }.joined(separator: ", ")
  }

  private func run() {
    guard let env else { return }
    cancel()
    let runID = UUID(); generation = runID
    text = ""; failed = false; isLoading = true; analysisDate = Date()
    if isComparison { runComparison(env: env, runID: runID) } else { runSingle(env: env, runID: runID) }
  }

  private func runSingle(env: AppEnvironment, runID: UUID) {
    let ai = AIStreamClient(client: env.apiClient)
    let service = env.analysis
    let coinId = requestedIds[0]
    let quote = env.watchlistData.quote(coinId)
    chartTask = Task { await loadChart(service: service, coinId: coinId, runID: runID) }
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
          chunks.append(chunk)
        }
        chunks.flush()
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled, generation == runID {
          chunks.discard()
          text = "Failed to generate analysis. Please try again.\n\n\(error.localizedDescription)"; failed = true
        }
      }
      if !Task.isCancelled, generation == runID { chunks.flush(); isLoading = false }
    }
  }

  private func loadChart(service: AnalysisDataService, coinId: String, runID: UUID) async {
    chartFailed = false
    do {
      let chart = try await service.priceChart(coinId: coinId)
      try Task.checkCancellation()
      guard generation == runID else { return }
      priceData = .init(data: chart)
    } catch {
      if !Task.isCancelled, generation == runID { chartFailed = true }
    }
  }

  private func runComparison(env: AppEnvironment, runID: UUID) {
    stats = nil; chartLines = []; includedIds = []; readyCount = 0
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
            await MainActor.run { if self.generation == runID { self.readyCount = n } }
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
          chunks.append(chunk)
        }
        chunks.flush()
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled, generation == runID {
          chunks.discard()
          text = "Failed to generate comparison. Please try again.\n\n\(error.localizedDescription)"; failed = true
        }
      }
      if !Task.isCancelled, generation == runID { chunks.flush(); isLoading = false }
    }
  }

  private actor Collector {
    private var bundles: [String: AnalysisDataService.Bundle] = [:]
    var count: Int { bundles.count }
    func add(id: String, bundle: AnalysisDataService.Bundle) { bundles[id] = bundle }
    func ordered(_ ids: [String]) -> [AnalysisDataService.Bundle] { ids.compactMap { bundles[$0] } }
  }
}

/// Batches streamed text into one publish per ~30 Hz tick. A chunk that arrives while a tick is
/// pending joins it; `flush()` delivers immediately at the end of a stream.
@MainActor final class StreamTextCoalescer {
  static let interval: Duration = .milliseconds(33)
  private var pending = ""
  private var tick: Task<Void, Never>?
  private let deliver: (String) -> Void

  init(deliver: @escaping (String) -> Void) { self.deliver = deliver }

  func append(_ chunk: String) {
    pending += chunk
    guard tick == nil else { return }
    tick = Task { [weak self] in
      try? await Task.sleep(for: Self.interval)
      guard let self, !Task.isCancelled else { return }
      self.tick = nil
      self.flush()
    }
  }

  /// Delivers whatever is buffered now.
  func flush() {
    tick?.cancel(); tick = nil
    guard !pending.isEmpty else { return }
    let batch = pending
    pending = ""
    deliver(batch)
  }

  /// Drops the buffer without delivering (cancelled or failed stream).
  func discard() {
    tick?.cancel(); tick = nil
    pending = ""
  }
}
