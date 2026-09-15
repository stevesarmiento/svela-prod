import AggrAPI
import AggrCore
import SwiftUI

/// Port of `indicator-explain-dialog.tsx`: quote header, the same indicator chart, live stat chips, and the
/// streamed `/api/analyze-indicator` explanation with the multi-step loader while nothing has arrived.
struct IndicatorExplainSheet<ChartView: View, Badges: View>: View {
  let title: String
  let request: IndicatorExplainRequest
  let quote: CoinQuote?
  let coinId: String
  @ViewBuilder let chart: () -> ChartView
  @ViewBuilder let badges: () -> Badges

  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var isLoading = false
  @State private var error: String?
  @State private var streamTask: Task<Void, Never>?

  static var steps: [String] {
    ["Reading indicator values", "Comparing to recent price action", "Checking trend and volatility context",
     "Thinking through what it implies", "Writing the explanation", "Almost there..."]
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          header
          Text("\(title) · \(request.timeframe) timeframe")
            .font(.caption).foregroundStyle(.secondary)
          chart().clipShape(.rect(cornerRadius: 12))
          ScrollView(.horizontal, showsIndicators: false) { HStack { badges() }.font(.caption) }
          Divider()
          if let error {
            ContentUnavailableView("Couldn't explain", systemImage: "exclamationmark.triangle", description: Text(error))
          } else if isLoading && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            MultiStepLoader(steps: Self.steps)
          } else {
            StreamingMarkdownText(text: text)
          }
        }
        .padding(16)
        .padding(.bottom, 24)
      }
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .primaryAction) {
          Button { run() } label: { Label("Regenerate", image: "ActionAnalyze") }.disabled(isLoading)
        }
      }
    }
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
    .onAppear { run() }
    .onDisappear { streamTask?.cancel() }
  }

  private var header: some View {
    let name = displayName
    let change = request.marketContext.change24hPct ?? quote?.priceChangePercentage24h
    return VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        TokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 20)
        Text(name).font(.subheadline.weight(.bold))
        Text("is currently").font(.subheadline).foregroundStyle(.secondary)
      }
      if let price = request.marketContext.priceUsd ?? quote?.currentPrice, price > 0 {
        Text(UsdFormat.price(price)).font(.system(size: 30, weight: .bold)).contentTransition(.numericText()).lineLimit(1).minimumScaleFactor(0.6)
      }
      HStack(spacing: 6) {
        if let change, change.isFinite {
          Image(systemName: change >= 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 9, weight: .bold))
          Text(String(format: "%.2f%%", abs(change)))
          Text("24h").foregroundStyle(.secondary).fontWeight(.regular)
        } else {
          Text("N/A").foregroundStyle(.secondary)
        }
      }
      .font(.system(.caption, design: .rounded).monospacedDigit().weight(.bold))
      .foregroundStyle((change ?? 0) >= 0 ? Color.gainGreen : Color.lossRed)
    }
  }

  /// `resolveExplainDisplayName`
  private var displayName: String {
    if let n = quote?.name.trimmingCharacters(in: .whitespaces), !n.isEmpty, n != "Loading...", n != "Unknown" { return LogoOverrides.cleanTokenName(n) }
    if let s = quote?.symbol, !s.isEmpty { return s.uppercased() }
    return coinId.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }.joined(separator: " ")
  }

  private func run() {
    #if DEBUG
    if env.convex.isPreview { text = PreviewData.analysisText; isLoading = false; return }
    #endif
    streamTask?.cancel()
    text = ""; error = nil; isLoading = true
    let ai = AIStreamClient(client: env.apiClient)
    let request = request
    streamTask = Task {
      do {
        let body = try JSONEncoder().encode(request)
        for try await chunk in ai.stream(path: "/api/analyze-indicator", body: body, protocol: .uiMessageSSE) {
          text += chunk
        }
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled { self.error = error.localizedDescription }
      }
      isLoading = false
    }
  }
}

#if DEBUG
#Preview("Indicator explanation") {
  PreviewHost(navigation: false) { _ in
    IndicatorExplainSheet(title: "Volatility", request: .init(
      token: .init(coinId: "bitcoin", name: "Bitcoin", symbol: "BTC"), timeframe: "30",
      marketContext: .init(priceUsd: 67_420, change24hPct: 2.84, volume24hUsd: 28_600_000_000, marketCapUsd: 1_330_000_000_000, closeHistory: PreviewFixtures.line.map(\.value), closeTimesUtc: PreviewFixtures.line.map(\.epochSeconds)),
      snapshot: .bbwp(bbwpCurrent: 42, bbwpHistory: [30, 35, 42], lookback: BBWP.Config.default.lookback)
    ), quote: PreviewFixtures.quotes[0], coinId: "bitcoin") {
      PreviewValue(Date?.none) { BBWPChart(result: PreviewFixtures.indicators.bbwp, windowDays: 14, selectedDate: $0) }
    } badges: { IndicatorStat(label: "BBWP", value: "42%") }
  }
}
#endif
