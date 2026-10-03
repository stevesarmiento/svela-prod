import AggrAPI
import AggrCore
import SwiftUI

/// Port of `indicator-explain-dialog.tsx`: quote header, the same indicator chart, live stat chips, and the
/// streamed `/api/analyze-indicator` explanation with the multi-step loader while nothing has arrived.
/// Presented as a full-screen page over the token page, with its close control and pull-to-dismiss.
struct IndicatorExplainPage<ChartView: View, Badges: View>: View {
  let title: String
  let request: IndicatorExplainRequest
  let quote: CoinQuote?
  let coinId: String
  let close: () -> Void
  @ViewBuilder let chart: () -> ChartView
  @ViewBuilder let badges: () -> Badges

  @Environment(AppEnvironment.self) private var env
  @State private var text = ""
  @State private var isLoading = false
  @State private var error: String?
  @State private var streamTask: Task<Void, Never>?
  @State private var chunks: StreamTextCoalescer?

  static var steps: [String] {
    ["Reading indicator values", "Comparing to recent price action", "Checking trend and volatility context",
     "Thinking through what it implies", "Writing the explanation", "Almost there..."]
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        header
        Text("\(title) · \(request.timeframe) timeframe")
          .font(.footnote).foregroundStyle(.secondary)
        // The chart spans the view like the analysis page's; chips and copy keep the page inset.
        chart().padding(.horizontal, -16)
        ScrollView(.horizontal, showsIndicators: false) { HStack { badges() }.font(.caption).padding(.horizontal, 16) }
          .padding(.horizontal, -16)
          .horizontalEdgeFade(16)
        HStack(alignment: .center, spacing: 12) {
          Text("Explanation").font(.title2.weight(.semibold)).foregroundStyle(.white).accessibilityAddTraits(.isHeader)
          Spacer(minLength: 0)
          Button { run() } label: {
            Image("ActionAnalyze").renderingMode(.template).resizable().scaledToFit()
              .frame(width: 14, height: 14)
              .frame(width: 36, height: 36)
              .contentShape(Rectangle())
          }
          .disabled(isLoading)
          .accessibilityLabel("Regenerate")
          .accessibilityIdentifier("indicator-regenerate")
          .glassEffect(.regular.interactive(), in: .circle)
          .buttonStyle(.plain)
          .tint(.white)
          .foregroundStyle(.white)
        }
        .padding(.top, 8)
        if let error {
          ContentUnavailableView("Couldn't explain", systemImage: "exclamationmark.triangle", description: Text(error))
        } else if isLoading && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          MultiStepLoader(steps: Self.steps)
        } else {
          StreamingMarkdownText(text: text)
        }
      }
      .padding(16)
      .padding(.bottom, 32)
    }
    .scrollEdgeEffectStyle(.soft, for: .top)
    .safeAreaInset(edge: .top, spacing: 0) { pageBar }
    .overlay(alignment: .top) {
      Capsule().fill(.secondary.opacity(0.5)).frame(width: 36, height: 4)
        .frame(height: 16).frame(maxWidth: .infinity)
        .offset(y: -8)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
    .background { PageArtworkBackground(symbol: quote?.symbol ?? coinId, imageURL: quote?.image).equatable() }
    .overlay { ToastOverlay() }
    .fontDesign(.rounded)
    .tint(Theme.accent)
    .accessibilityAction(.escape) { close() }
    .onAppear { run() }
    .onDisappear { streamTask?.cancel(); chunks?.discard() }
  }

  /// The full-size token logo, the indicator name centered, and a close control trailing.
  private var pageBar: some View {
    ZStack {
      Text(title)
        .font(.system(.title3, design: .rounded, weight: .semibold))
        .lineLimit(1).minimumScaleFactor(0.7)
        .padding(.horizontal, Theme.hitTarget + 20)
        .frame(maxWidth: .infinity)
        .accessibilityAddTraits(.isHeader)
      HStack {
        TokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 44)
          .glassEffect(.regular, in: .circle)
          .accessibilityHidden(true)
        Spacer(minLength: 8)
        Button(action: close) {
          Image(systemName: "xmark").font(.body.weight(.semibold))
            .frame(width: Theme.hitTarget, height: Theme.hitTarget)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Close explanation")
        .accessibilityIdentifier("indicator-page-close")
        .glassEffect(.regular.interactive(), in: .circle)
        .buttonStyle(.plain)
        .tint(.white)
        .foregroundStyle(.white)
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 12)
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
        Text(UsdFormat.price(price)).font(.number(size: 30, weight: .bold)).contentTransition(.numericText()).lineLimit(1).minimumScaleFactor(0.6)
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
      .font(.number(.caption, weight: .bold))
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
    chunks?.discard()
    text = ""; error = nil; isLoading = true
    let ai = AIStreamClient(client: env.apiClient)
    let request = request
    // Batch streamed chunks into the view state at ~30 Hz instead of one body per token.
    let coalescer = StreamTextCoalescer { batch in text += batch }
    chunks = coalescer
    streamTask = Task {
      do {
        let body = try JSONEncoder().encode(request)
        for try await chunk in ai.stream(path: "/api/analyze-indicator", body: body, protocol: .uiMessageSSE) {
          coalescer.append(chunk)
        }
        coalescer.flush()
      } catch is CancellationError {
        coalescer.discard()
      } catch {
        coalescer.flush()
        if !Task.isCancelled { self.error = error.localizedDescription }
      }
      isLoading = false
    }
  }
}

#if DEBUG
#Preview("Indicator explanation") {
  PreviewHost(navigation: false) { _ in
    IndicatorExplainPage(title: "Volatility", request: .init(
      token: .init(coinId: "bitcoin", name: "Bitcoin", symbol: "BTC"), timeframe: "30",
      marketContext: .init(priceUsd: 67_420, change24hPct: 2.84, volume24hUsd: 28_600_000_000, marketCapUsd: 1_330_000_000_000, closeHistory: PreviewFixtures.line.map(\.value), closeTimesUtc: PreviewFixtures.line.map(\.epochSeconds)),
      snapshot: .bbwp(bbwpCurrent: 42, bbwpHistory: [30, 35, 42], lookback: BBWP.Config.default.lookback)
    ), quote: PreviewFixtures.quotes[0], coinId: "bitcoin", close: {}) {
      PreviewValue(Date?.none) { BBWPChart(result: PreviewFixtures.indicators.bbwp, windowDays: 14, selectedDate: $0) }
    } badges: { IndicatorStat(label: "BBWP", value: "42%") }
  }
}
#endif
