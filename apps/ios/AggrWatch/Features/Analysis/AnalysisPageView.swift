import AggrAPI
import AggrCore
import SwiftUI

/// Full-page analysis with the token page's presentation: fixed header, logo glow, pull handle.
/// A phone shows one scroll with a full-bleed chart, then Report / Market data tabs; a wide display
/// shows the chart and market data as a sidebar beside the report.
struct AnalysisPageView: View {
  let presentation: AnalysisPresentation
  let close: () -> Void
  @Environment(AppEnvironment.self) private var env
  @State private var session: AnalysisSession
  @State private var showMetrics = false
  /// Scroll offset lives on an observable object read only by the header's scrim, so a scroll
  /// frame never re-runs the page (and its Swift Charts). Mirrors `TokenPageChrome`.
  @State private var chrome = AnalysisPageChrome()
  @ScaledMetric(relativeTo: .title) private var headerHeight = 72.0

  init(presentation: AnalysisPresentation, close: @escaping () -> Void) {
    self.presentation = presentation
    self.close = close
    _session = State(initialValue: AnalysisSession(coinIds: presentation.coinIds))
  }

  var body: some View {
    GeometryReader { geometry in
      Group {
        if geometry.size.width >= 760 { wide } else { phone }
      }
      .overlay(alignment: .top) {
        AnalysisPageHeader(session: session, chrome: chrome, expandedHeight: headerHeight,
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
    .background { AnalysisBackdrop(coinId: session.requestedIds.first ?? "") }
    .overlay { ToastOverlay() }
    .fontDesign(.rounded)
    .tint(Theme.accent)
    .accessibilityAction(.escape) { close() }
    .task { session.start(env: env) }
    .onDisappear { session.cancel() }
  }

  private var phone: some View {
    ScrollView {
      VStack(spacing: 24) {
        Color.clear.frame(height: headerHeight - 12)
        // The chart spans the view; its readout keeps the page inset.
        chartSection(inset: 16)
        UnderlineTabs(options: [false, true], label: { $0 ? "Market data" : "Report" }, selection: $showMetrics,
                      accessibilityLabel: "Analysis content", accessibilityIdentifier: "analysis-content-picker")
          .padding(.horizontal, 16)
        Group { if showMetrics { metrics } else { AnalysisReport(session: session) } }
          .padding(.horizontal, 16)
      }
      .padding(.bottom, 32)
    }
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      max(0, geometry.contentOffset.y + geometry.contentInsets.top)
    } action: { _, offset in
      chrome.update(scrollOffset: offset)
    }
    .accessibilityIdentifier(showMetrics ? "analysis-data-scroll" : "analysis-report-scroll")
  }

  private var wide: some View {
    HStack(alignment: .top, spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          Color.clear.frame(height: headerHeight - 16)
          chartSection(inset: 0)
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
          Color.clear.frame(height: headerHeight - 4)
          AnalysisReport(session: session)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        max(0, geometry.contentOffset.y + geometry.contentInsets.top)
      } action: { _, offset in
        chrome.update(scrollOffset: offset)
      }
      .accessibilityIdentifier("analysis-report-scroll")
    }
  }

  /// Chart content without a container. `inset` applies to the readout rows only, so the plot
  /// itself runs edge to edge.
  @ViewBuilder private func chartSection(inset: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      if session.isComparison {
        if session.stats != nil {
          AnalysisComparisonChart(lines: session.chartLines, inset: inset).equatable()
        } else if session.isLoading {
          RingLoader("\(session.readyCount) of \(session.requestedIds.count) tokens ready").frame(maxWidth: .infinity, minHeight: 220)
        } else {
          Text("Comparison chart unavailable").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
        }
        if !session.includedIds.isEmpty && session.includedIds.count < session.requestedIds.count {
          Text("Comparing \(session.includedIds.count) of \(session.requestedIds.count) tokens. Unavailable: \(session.missingSymbols).")
            .font(.caption).foregroundStyle(.orange)
            .padding(.horizontal, inset)
        }
      } else if let priceData = session.priceData {
        AnalysisPriceChart(model: priceData, inset: inset).equatable()
      } else if session.chartFailed {
        Text("Price chart unavailable").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
      } else {
        RingLoader("Loading price history").frame(maxWidth: .infinity, minHeight: 220)
      }
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

/// Header chrome state, written per scroll frame and observed only by `AnalysisPageHeader`.
@Observable
final class AnalysisPageChrome {
  var scrollOffset: CGFloat = 0

  func update(scrollOffset offset: CGFloat) {
    if scrollOffset != offset { scrollOffset = offset }
  }
}

/// Keeps the quote read for the blurred backdrop out of the page body.
private struct AnalysisBackdrop: View {
  let coinId: String
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let quote = env.watchlistData.quote(coinId)
    PageArtworkBackground(symbol: quote?.symbol ?? coinId, imageURL: quote?.image)
      .equatable()
  }
}

/// The streamed report with its loader, failure and disclaimer states.
struct AnalysisReport: View {
  let session: AnalysisSession

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Market overview").font(.title2.weight(.semibold)).foregroundStyle(.white).accessibilityAddTraits(.isHeader)
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

/// Fixed header: close control with the full-size logo (stacked logos for a comparison, which
/// shows no name), the name beside it, and the regenerate control trailing. Only its scrim follows the scroll, so
/// content stays readable as it passes underneath.
struct AnalysisPageHeader: View {
  let session: AnalysisSession
  let chrome: AnalysisPageChrome
  let expandedHeight: CGFloat
  let topInset: CGFloat
  let close: () -> Void
  @Environment(AppEnvironment.self) private var env
  @ScaledMetric(relativeTo: .title) private var titleSize = 22.0
  @ScaledMetric(relativeTo: .title) private var logoSize = 44.0

  var body: some View {
    let quotes = session.requestedIds.map { env.watchlistData.quote($0) }
    let items = zip(session.requestedIds, quotes).map { TokenAvatarStack.Item(symbol: $1?.symbol ?? $0, imageURL: $1?.image) }
    let scrim = min(1, max(0, chrome.scrollOffset / 40))
    let title = session.isComparison
      ? items.map { $0.symbol.uppercased() }.joined(separator: " · ")
      : LogoOverrides.cleanTokenName(quotes.first??.name ?? session.requestedIds.first)
    HStack(spacing: 12) {
        Button(action: close) {
          Group {
            if session.isComparison {
              TokenAvatarStack(items: items, maxVisible: 4, size: logoSize, usesGlass: true)
            } else {
              TokenLogo(symbol: items.first?.symbol ?? "", imageURL: items.first?.imageURL, size: logoSize)
                .glassEffect(.regular.interactive(), in: .circle)
            }
          }
          .frame(minWidth: Theme.hitTarget, minHeight: Theme.hitTarget, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close analysis")
        .accessibilityIdentifier("analysis-page-close")

        // A comparison is identified by its logos alone; one token also shows its name.
        Text(session.isComparison ? "" : title)
          .font(.system(size: titleSize, weight: .medium, design: .rounded))
          .lineLimit(1).minimumScaleFactor(0.65)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel(title)
          .accessibilityIdentifier("analysis-header-name")

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
      }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(alignment: .top) {
      // Tint the existing blurred backdrop without the gray lift of a system material. The scrim
      // reaches up through the status bar and is layout-neutral, so the header keeps its height.
      Rectangle().fill(Color.black.opacity(0.8))
        .frame(height: expandedHeight + topInset + 16)
        .mask(LinearGradient(stops: [.init(color: .black, location: 0),
                                     .init(color: .black, location: 0.72),
                                     .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        .offset(y: -topInset)
        .opacity(scrim)
        .allowsHitTesting(false)
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
#Preview("Analysis header") {
  PreviewHost(navigation: false) { _ in
    AnalysisPageHeader(session: AnalysisSession(coinIds: ["bitcoin"]), chrome: AnalysisPageChrome(), expandedHeight: 72, topInset: 0, close: {})
      .frame(height: 72)
  }
}
#endif
