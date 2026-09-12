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
  @State private var streamTask: Task<Void, Never>?

  static let steps = ["Analyzing price data", "Looking at trend", "Understanding orderflow", "Considering liquidations", "Looking at open interest",
                      "Understanding the market", "Thinking...", "Writing out thoughts", "I have a lot of thoughts...",
                      "Im embarassed to be taking this long...", "Pardon my tardiness...", "I'm just a little bit nervous...", "You're so awesome :)"]

  var body: some View {
    let quote = env.watchlistData.quote(coinId)
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          AnalysisTokenHeader(coinId: coinId, quote: quote)
          if isLoading && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            MultiStepLoader(steps: Self.steps, interval: .milliseconds(2200))
          } else {
            StreamingMarkdownText(text: text).foregroundStyle(failed ? .secondary : .primary)
          }
          if !isLoading && !text.isEmpty {
            Text("AI-generated. Not financial advice.").font(.caption2).foregroundStyle(.tertiary).padding(.top, 8)
          }
        }
        .padding(16)
        .padding(.bottom, 24)
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
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
    .onAppear { run() }
    .onDisappear { streamTask?.cancel() }
  }

  private func run() {
    streamTask?.cancel()
    text = ""; failed = false; isLoading = true
    let ai = AIStreamClient(client: env.apiClient)
    let service = env.analysis
    let coinId = coinId
    let quote = env.watchlistData.quote(coinId)
    streamTask = Task {
      do {
        let bundle = try await service.build(coinId: coinId, fallbackName: quote?.name, fallbackSymbol: quote?.symbol)
        let body = try JSONEncoder().encode(bundle.data)
        for try await chunk in ai.stream(path: "/api/analyze", body: body, protocol: .text) { text += chunk }
      } catch is CancellationError {
      } catch AnalysisDataService.Failure.noMarketData {
        text = "Unable to prepare analysis data. Please try again."; failed = true
      } catch {
        if !Task.isCancelled { text = "Failed to generate analysis. Please try again.\n\n\(error.localizedDescription)"; failed = true }
      }
      isLoading = false
    }
  }
}

/// Quote header shared by the analysis sheets.
struct AnalysisTokenHeader: View {
  let coinId: String
  let quote: CoinQuote?
  var body: some View {
    HStack(spacing: 10) {
      TokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text(LogoOverrides.cleanTokenName(quote?.name ?? coinId)).font(.headline)
        HStack(spacing: 6) {
          if let p = quote?.currentPrice { Text(UsdFormat.price(p)).font(.system(.subheadline, design: .monospaced)) }
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
  @State private var readyCount = 0
  @State private var streamTask: Task<Void, Never>?

  static let steps = ["Gathering data for every token", "Lining up the price histories", "Computing correlations", "Measuring betas vs the benchmark",
                      "Comparing risk-adjusted momentum", "Weighing order flow", "Checking who's overheated", "Looking for rotation", "Thinking...",
                      "Writing the comparison", "So many tokens, so little time...", "You're so awesome :)"]

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          tokensRow
          if let stats { ComparativeStatsPanel(stats: stats) }
          if isLoading && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            MultiStepLoader(steps: Self.steps, interval: .milliseconds(2400))
            Text("\(readyCount) of \(coinIds.count) tokens ready").font(.caption).foregroundStyle(.secondary)
          } else {
            StreamingMarkdownText(text: text)
          }
        }
        .padding(16)
        .padding(.bottom, 24)
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
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
    .onAppear { run() }
    .onDisappear { streamTask?.cancel() }
  }

  private var tokensRow: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(coinIds, id: \.self) { id in
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
    text = ""; stats = nil; readyCount = 0; isLoading = true
    guard coinIds.count >= 2 else { text = "Select at least two tokens to compare."; isLoading = false; return }
    let ids = Array(coinIds.prefix(SelectionStore.maxAnalyzeTokens))
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
            if let bundle { await collector.add(id: id, bundle: bundle) }
            let n = await collector.count
            await MainActor.run { readyCount = n }
          }
        }
      }
      let timeout = Task<Void, Never> { try? await Task.sleep(for: .seconds(30)); return }
      _ = await Task.select(gather, timeout)
      gather.cancel(); timeout.cancel()
      let ready = await collector.ordered(ids)
      guard ready.count >= 2 else {
        if !Task.isCancelled { text = "Not enough market data loaded to run a comparison. Please try again."; isLoading = false }
        return
      }
      let comparative = ComparativeStats.compute(ready.map(\.comparativeInput))
      stats = comparative
      do {
        let body = try JSONEncoder().encode(CompareRequest(tokens: ready.map(\.data), comparative: comparative))
        for try await chunk in ai.stream(path: "/api/analyze/compare", body: body, protocol: .text) { text += chunk }
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled { text = "Failed to generate comparison. Please try again.\n\n\(error.localizedDescription)" }
      }
      isLoading = false
    }
  }

  private actor Collector {
    private var bundles: [String: AnalysisDataService.Bundle] = [:]
    var count: Int { bundles.count }
    func add(id: String, bundle: AnalysisDataService.Bundle) { bundles[id] = bundle }
    func ordered(_ ids: [String]) -> [AnalysisDataService.Bundle] { ids.compactMap { bundles[$0] } }
  }
}

extension Task where Success == Void, Failure == Never {
  /// Resolves when either task finishes (used for "wait up to N seconds" without cancelling children early).
  static func select(_ a: Task<Void, Never>, _ b: Task<Void, Never>) async -> Bool {
    await withTaskGroup(of: Bool.self) { group in
      group.addTask { await a.value; return true }
      group.addTask { await b.value; return false }
      let first = await group.next() ?? false
      group.cancelAll()
      return first
    }
  }
}

/// Compact port of `comparative-stats-panel.tsx`.
struct ComparativeStatsPanel: View {
  let stats: ComparativeStats.Result

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Benchmark: \(stats.benchmarkSymbol.uppercased())").font(.caption).foregroundStyle(.secondary)
      Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 6) {
        GridRow {
          Text("").frame(width: 48, alignment: .leading)
          ForEach(["7d", "30d", "Vol", "β", "RSI", "BBWP"], id: \.self) { h in Text(h).font(.system(size: 9)).foregroundStyle(.secondary) }
        }
        ForEach(stats.tokens) { t in
          GridRow {
            Text(t.symbol.uppercased()).font(.caption.weight(.semibold)).frame(width: 48, alignment: .leading)
            pct(t.return7dPct); pct(t.return30dPct)
            num(t.volatility30dAnnualizedPct, suffix: "%"); num(t.betaVsBenchmark, digits: 2)
            num(t.rsi, digits: 0); num(t.bbwpPct, digits: 0)
          }
        }
      }
    }
    .font(.system(.caption2, design: .monospaced))
    .padding(12)
    .background(.background.secondary, in: .rect(cornerRadius: 14))
  }

  private func pct(_ v: Double?) -> some View {
    Text(v.map { UsdFormat.signedPercent($0, fractionDigits: 1) } ?? "—").foregroundStyle(v == nil ? .secondary : ((v ?? 0) >= 0 ? Color.gainGreen : Color.lossRed))
  }
  private func num(_ v: Double?, digits: Int = 1, suffix: String = "") -> some View {
    Text(v.map { String(format: "%.\(digits)f%@", $0, suffix) } ?? "—").foregroundStyle(v == nil ? .secondary : .primary)
  }
}
