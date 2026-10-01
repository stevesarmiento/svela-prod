import AggrAPI
import AggrCore
import SwiftUI

/// Full-page analysis with the token page's presentation: collapsing header, logo glow, pull handle.
/// A phone shows one scroll with the chart, then a Report / Market data switch; a wide display shows
/// the chart and market data as a sidebar beside the report.
struct AnalysisPageView: View {
  let presentation: AnalysisPresentation
  let close: () -> Void
  @Environment(AppEnvironment.self) private var env
  @State private var session: AnalysisSession
  @State private var showMetrics = false
  @State private var scrollOffset: CGFloat = 0
  @ScaledMetric(relativeTo: .title) private var headerHeight = 120.0

  init(presentation: AnalysisPresentation, close: @escaping () -> Void) {
    self.presentation = presentation
    self.close = close
    _session = State(initialValue: AnalysisSession(coinIds: presentation.coinIds))
  }

  var body: some View {
    let firstId = session.requestedIds.first ?? ""
    let firstQuote = env.watchlistData.quote(firstId)
    GeometryReader { geometry in
      Group {
        if geometry.size.width >= 760 { wide } else { phone }
      }
      .overlay(alignment: .top) {
        AnalysisPageHeader(session: session, scrollOffset: scrollOffset, expandedHeight: headerHeight,
                           topInset: geometry.safeAreaInsets.top, close: close)
          .frame(height: headerHeight)
      }
      .scrollEdgeEffectStyle(.soft, for: .top)
    }
    .overlay(alignment: .top) {
      Capsule().fill(.secondary.opacity(0.5)).frame(width: 36, height: 4)
        .frame(height: 16).frame(maxWidth: .infinity)
        .offset(y: -8)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
    .background { PageArtworkBackground(symbol: firstQuote?.symbol ?? firstId, imageURL: firstQuote?.image) }
    .overlay { ToastOverlay() }
    .fontDesign(.rounded)
    .tint(Theme.accent)
    .accessibilityAction(.escape) { close() }
    .task { session.start(env: env) }
    .onDisappear { session.cancel() }
  }

  private var phone: some View {
    ScrollView {
      VStack(spacing: 28) {
        Color.clear.frame(height: headerHeight - 16)
        chartCard
        SegmentedGlassPicker(options: [false, true], label: { $0 ? "Market data" : "Report" }, selection: $showMetrics,
                             accessibilityLabel: "Analysis content", accessibilityIdentifier: "analysis-content-picker",
                             segmentWidth: 120)
        if showMetrics { metrics } else { AnalysisReport(session: session) }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 32)
    }
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      max(0, geometry.contentOffset.y + geometry.contentInsets.top)
    } action: { _, offset in
      scrollOffset = offset
    }
    .accessibilityIdentifier(showMetrics ? "analysis-data-scroll" : "analysis-report-scroll")
  }

  private var wide: some View {
    HStack(alignment: .top, spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          Color.clear.frame(height: headerHeight - 16)
          chartCard
          Hairline()
          metrics
        }
        .padding(20)
      }
      .frame(width: 340)
      .accessibilityIdentifier("analysis-data-scroll")
      Hairline(axis: .vertical)
      ScrollView {
        VStack(spacing: 28) {
          Color.clear.frame(height: headerHeight - 16)
          AnalysisReport(session: session)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        max(0, geometry.contentOffset.y + geometry.contentInsets.top)
      } action: { _, offset in
        scrollOffset = offset
      }
      .accessibilityIdentifier("analysis-report-scroll")
    }
  }

  private var chartCard: some View {
    GlassCard {
      VStack(alignment: .leading, spacing: 12) {
        if session.isComparison {
          if session.stats != nil {
            AnalysisComparisonChart(lines: session.chartLines)
          } else if session.isLoading {
            RingLoader("\(session.readyCount) of \(session.requestedIds.count) tokens ready").frame(maxWidth: .infinity, minHeight: 220)
          } else {
            Text("Comparison chart unavailable").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
          }
          if !session.includedIds.isEmpty && session.includedIds.count < session.requestedIds.count {
            Text("Comparing \(session.includedIds.count) of \(session.requestedIds.count) tokens. Unavailable: \(session.missingSymbols).")
              .font(.caption).foregroundStyle(.orange)
          }
        } else if let priceData = session.priceData {
          AnalysisPriceChart(model: priceData)
        } else if session.chartFailed {
          Text("Price chart unavailable").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
        } else {
          RingLoader("Loading price history").frame(maxWidth: .infinity, minHeight: 220)
        }
      }
      .padding(16)
    }
  }

  @ViewBuilder private var metrics: some View {
    if session.isComparison {
      if let stats = session.stats { ComparativeStatsPanel(stats: stats) }
      else if session.isLoading { RingLoader("Computing comparison statistics").frame(maxWidth: .infinity, minHeight: 160) }
      else { Text("Comparison data unavailable. Try regenerating the analysis.").foregroundStyle(.secondary) }
    } else {
      if let bundle = session.bundle { AnalysisMarketMetrics(bundle: bundle) }
      else if session.isLoading { RingLoader("Preparing market data").frame(maxWidth: .infinity, minHeight: 160) }
      else { Text("Market data unavailable. Try regenerating the analysis.").foregroundStyle(.secondary) }
    }
  }
}

/// The streamed report with its loader, failure and disclaimer states.
struct AnalysisReport: View {
  let session: AnalysisSession

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Market overview").font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
      if session.isLoading && session.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        MultiStepLoader(steps: session.steps, interval: .milliseconds(2200))
      } else if session.failed {
        Label("Analysis unavailable", systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
        Text(session.text).foregroundStyle(.secondary)
      } else {
        StreamingMarkdownText(text: session.text)
        if session.isLoading { RingLoader("Writing analysis…", size: .small).font(.caption) }
        else if !session.text.isEmpty { Text("AI-generated. Not financial advice.").font(.caption2).foregroundStyle(.tertiary) }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Close control, name line and date caption moving into a compact header as the page scrolls.
/// One token shows its logo and name; a comparison shows the stacked logos and the symbols.
struct AnalysisPageHeader: View {
  let session: AnalysisSession
  let scrollOffset: CGFloat
  let expandedHeight: CGFloat
  let topInset: CGFloat
  let close: () -> Void
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @ScaledMetric(relativeTo: .title) private var titleSize = 20.0

  var body: some View {
    let quotes = session.requestedIds.map { env.watchlistData.quote($0) }
    let items = zip(session.requestedIds, quotes).map { TokenAvatarStack.Item(symbol: $1?.symbol ?? $0, imageURL: $1?.image) }
    let textScale = expandedHeight / 120
    let progress = min(1, max(0, scrollOffset / max(1, expandedHeight - 64 * textScale)))
    // Direct manipulation has no trailing spring. Reduce Motion switches between the two layouts.
    let p = reduceMotion ? (progress < 0.5 ? 0.0 : 1.0) : progress
    let title = session.isComparison
      ? items.map { $0.symbol.uppercased() }.joined(separator: " · ")
      : LogoOverrides.cleanTokenName(quotes.first??.name ?? session.requestedIds.first)
    GeometryReader { geometry in
      let width = geometry.size.width
      // The avatar stack overlaps each logo by 30%, so its width grows 14pt per extra logo.
      let controlWidth: CGFloat = session.isComparison ? 20 + 14 * CGFloat(max(0, min(items.count, 4) - 1)) : 20
      let nameX = 20 + controlWidth * (1 + 1.2 * p) + 12
      let nameAvailable = max(0, width - nameX - 100)
      ZStack(alignment: .topLeading) {
        // Tint the existing blurred backdrop without the gray lift of a system material.
        Rectangle().fill(Color.black.opacity(0.8))
          .frame(width: width, height: 80 * textScale + topInset)
          .mask(LinearGradient(stops: [.init(color: .black, location: 0),
                                       .init(color: .black, location: (topInset + 56 * textScale) / (topInset + 80 * textScale)),
                                       .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
          .offset(y: -topInset)
          .opacity(progress)
          .allowsHitTesting(false)

        Button(action: close) {
          Group {
            if session.isComparison {
              TokenAvatarStack(items: items, maxVisible: 4, size: 20, usesGlass: true)
            } else {
              TokenLogo(symbol: items.first?.symbol ?? "", imageURL: items.first?.imageURL, size: 20)
                .glassEffect(.regular.interactive(), in: .circle)
            }
          }
          .scaleEffect(1 + 1.2 * p, anchor: .leading)
          .frame(height: Theme.hitTarget, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: 20, y: 8 + 6 * p)
        .accessibilityLabel("Close analysis")
        .accessibilityIdentifier("analysis-page-close")

        if p < 0.5 {
          Text(title)
            .font(.system(size: session.isComparison ? titleSize * 0.85 : titleSize, weight: .medium, design: .rounded))
            .foregroundStyle(session.isComparison ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
            .lineLimit(1).minimumScaleFactor(0.65)
            .frame(width: nameAvailable, alignment: .leading)
            .offset(x: nameX, y: 18 * textScale)
            .opacity(max(0, 1 - Double(p) * 2))
            .accessibilityIdentifier("analysis-header-name")
            .allowsHitTesting(false)
          Text("Analysis as of \(session.analysisDate.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption).foregroundStyle(.secondary)
            .offset(x: 20, y: 64 * textScale)
            .opacity(max(0, 1 - Double(p) * 2))
            .allowsHitTesting(false)
        }

        Button(action: session.regenerate) {
          Image(systemName: "arrow.clockwise").font(.title3.weight(.semibold))
            .frame(width: Theme.hitTarget, height: Theme.hitTarget)
            .contentShape(Rectangle())
        }
        .disabled(session.isLoading)
        .accessibilityLabel("Regenerate")
        .accessibilityIdentifier("analysis-regenerate")
        .padding(.horizontal, 4)
        .glassEffect(.regular.interactive(), in: .capsule)
        .buttonStyle(.plain)
        .tint(.white)
        .foregroundStyle(.white)
        .frame(width: width - 32, alignment: .trailing)
        .offset(x: 16, y: 8)
      }
      .frame(width: width, height: geometry.size.height, alignment: .topLeading)
    }
  }
}

#if DEBUG
#Preview("Deep analysis page") {
  PreviewHost(navigation: false) { _ in
    AnalysisPageView(presentation: .init(coinIds: ["bitcoin"], sourceID: nil), close: {})
  }
}
#Preview("Comparison analysis page") {
  PreviewHost(navigation: false) { _ in
    AnalysisPageView(presentation: .init(coinIds: ["bitcoin", "ethereum", "solana"], sourceID: nil), close: {})
  }
}
#Preview("Interactive analysis presentation") {
  PreviewHost(tab: .watchlists, navigation: false) { env in
    MainTabView().onAppear {
      env.router.showsWatchlistChooser = false
      env.router.openAnalysis(["bitcoin", "ethereum"])
    }
  }
}
#Preview("Compact analysis header") {
  PreviewHost(navigation: false) { _ in
    AnalysisPageHeader(session: AnalysisSession(coinIds: ["bitcoin"]), scrollOffset: 160, expandedHeight: 120, topInset: 0, close: {})
      .frame(height: 120)
  }
}
#endif
