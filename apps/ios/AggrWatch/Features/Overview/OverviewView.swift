import AggrAPI
import AggrCore
import ClerkKit
import SwiftUI

/// `/overview` — portfolio value + rebased chart, 24h breadth, news activity feed.
struct OverviewView: View {
  @Environment(AppEnvironment.self) private var env
  @State private var store: OverviewStore?

  var body: some View {
    ScrollView {
      if let store {
        if let error = store.error, !store.hasLoaded {
          EmptyState(systemImage: "exclamationmark.triangle", title: "Couldn’t load overview", message: error,
                     actionTitle: "Retry") { store.retry() }
        } else {
          VStack(spacing: 20) {
            if let error = store.error {
              VStack(spacing: 8) {
                Text(error).font(.footnote).foregroundStyle(.secondary)
                Button("Retry loading overview") { store.retry() }.buttonStyle(.glass)
              }
            }
            if store.isEmptyDashboard {
              OverviewEmptyState()
              PortfolioValueCard(store: store)
            } else {
              PortfolioValueCard(store: store)
              BreadthCard(store: store)
              EventsFeedList(store: store)
            }
          }
          .padding(16)
          .padding(.bottom, 32)
        }
      } else {
        RingLoader(size: .large).padding(.top, 80)
      }
    }
    .navigationTitle(greeting)
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        SettingsProfileButton()
      }
      .sharedBackgroundVisibility(.hidden)
    }
    .task(id: LifecycleKey(ready: env.isReadyForUserData, active: env.isSceneActive, userId: env.clerkSession.user?.id)) {
      if store == nil { store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: env.market, cache: env.queryCache) }
      guard let store else { return }
      // Subscriptions outlive tab switches: `start()` is a no-op while they are running, and the
      // positions key survives `stop()` so resuming never fans the chart fetches out again.
      if let userId = env.clerkSession.user?.id, let previous = startedUserId, previous != userId { store.reset() }
      if env.isReadyForUserData && env.isSceneActive {
        startedUserId = env.clerkSession.user?.id
        store.start()
      } else {
        store.stop()
      }
    }
    .refreshable { store?.retry() }
  }

  @State private var startedUserId: String?

  private struct LifecycleKey: Equatable {
    var ready: Bool
    var active: Bool
    var userId: String?
  }

  /// Web top-nav greeting on /overview: time-of-day + first name.
  private var greeting: String {
    let hour = Calendar.current.component(.hour, from: Date())
    let part = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good evening")
    if let first = env.clerkSession.user?.firstName, !first.isEmpty { return "\(part), \(first)" }
    return part
  }
}

/// `overview-portfolio-value-card.tsx` + `overview-performance-chart.tsx`
struct PortfolioValueCard: View {
  @Bindable var store: OverviewStore
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let portfolio = store.portfolioChartPoints
    let market = store.marketChartPoints
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        // The readout is the only view observing the scrub position.
        PortfolioValueReadout(store: store)
        Spacer()
      }
      if portfolio.count >= 2 || market.count >= 2 {
        RebasedComparisonChart(portfolio: portfolio, market: market,
                               scrubTime: $store.scrubTime, scale: store.scale,
                               isActive: env.isSceneActive && env.router.tab == .overview)
          .frame(height: 260)
      } else if !store.hasLoaded || store.seriesLoading || store.marketLoading {
        RingLoader("Loading chart…").frame(maxWidth: .infinity, minHeight: 260)
      } else {
        VStack(spacing: 10) {
          Text(store.seriesError ?? (store.marketWarming ? "Market data is warming up." : "Chart data is unavailable."))
            .font(.footnote).foregroundStyle(.secondary)
          Button("Retry chart") { Task { await store.loadSeries(force: true) } }.buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity, minHeight: 260)
      }
      if let error = store.marketError {
        VStack(alignment: .leading, spacing: 6) {
          Text("Couldn’t refresh total market cap: \(error)")
            .font(.caption).foregroundStyle(.secondary)
          Button("Retry market data") { Task { await store.loadSeries(force: true) } }.buttonStyle(.glass)
            .font(.caption)
        }
      } else if !store.marketLoading && store.marketSeries.isEmpty && !portfolio.isEmpty {
        Button("Retry market data") { Task { await store.loadSeries(force: true) } }.buttonStyle(.glass)
          .font(.caption)
      }
      TimeScalePicker(scales: TimeScale.overviewScales, selection: $store.scale)
        .padding(.top, 4)
    }
    .padding(.vertical, 14)
  }
}

/// Holdings total, coverage and range change at the scrubbed time (or live when not scrubbing).
private struct PortfolioValueReadout: View {
  let store: OverviewStore

  var body: some View {
    let range = store.rangeChange
    VStack(alignment: .leading, spacing: 6) {
      Text("Your holdings").font(.subheadline).foregroundStyle(.secondary)
      AnimatedNumber(value: store.displayValueUsd, font: .number(size: 30))
      if let note = store.coverageNote { Text(note).font(.caption).foregroundStyle(.secondary) }
      if store.hasHoldings, range.isAvailable {
        MoveWithBadge(usdMove: range.deltaUsd, pct: range.deltaPct)
      }
      if store.hasHoldings, let note = store.chartNote {
        Text(note).font(.caption2).foregroundStyle(.secondary)
      }
    }
  }
}

/// `overview-portfolio-breadth.tsx`
struct BreadthCard: View {
  let store: OverviewStore
  @Environment(AppEnvironment.self) private var env
  @State private var page = 0
  private let pageSize = 8

  var body: some View {
    let groups = store.breadthGroups
    VStack(alignment: .leading, spacing: 12) {
      if let b = store.breadth, b.total > 0 {
        TickSplitBar(breadth: b)
        HStack(spacing: 12) {
          StatTile(value: "\(b.advancers)", label: "Up", tint: .gainGreen)
          StatTile(value: "\(b.decliners)", label: "Down", tint: .lossRed)
          StatTile(value: UsdFormat.signedPercent(b.medianChangePct), label: "Median", tint: b.medianChangePct > 0 ? .gainGreen : (b.medianChangePct < 0 ? .lossRed : .primary))
          StatTile(value: "\(b.bigMovers)", label: ">5% moves")
        }
        if !groups.isEmpty { groupList(groups) }
      } else if store.bootstrap == nil || env.watchlistData.isQuotesLoading {
        SkeletonBlock(height: 8)
        HStack { ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 28) } }
      }
      if !store.hasHoldings {
        Text("Add a quantity to any watchlist coin to see your holdings value here.").font(.caption).foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 14)
  }

  @ViewBuilder
  private func groupList(_ groups: [OverviewStore.BreadthGroupRow]) -> some View {
    let pageCount = max(1, Int(ceil(Double(groups.count) / Double(pageSize))))
    let clamped = min(page, pageCount - 1)
    let visible = Array(groups.dropFirst(clamped * pageSize).prefix(pageSize))
    let maxAbs = max(1, groups.map { abs($0.changePct) }.max() ?? 1)
    VStack(spacing: 0) {
      Divider()
      ForEach(visible) { row in
        Button {
          env.watchlistData.selectedGroupSlug = row.slug
          env.router.showsWatchlistChooser = false
          env.router.tab = .watchlists
        } label: {
          HStack(spacing: 8) {
            Circle().fill(Color(oklch: ColorThemes.resolve(row.color).background)).frame(width: 8, height: 8)
            Text(row.name).font(.system(size: 13, weight: .medium)).lineLimit(1)
            Spacer()
            Text(UsdFormat.signedPercent(row.changePct)).font(.number(size: 12, weight: .regular)).foregroundStyle(tint(row.changePct))
            TickMeter(value: row.changePct, min: -maxAbs, max: maxAbs, origin: .value(0), color: tint(row.changePct))
              .frame(width: 96, height: 8)
          }
          .padding(.vertical, 9)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        Divider()
      }
      if pageCount > 1 {
        HStack {
          Text("\(clamped * pageSize + 1)–\(clamped * pageSize + visible.count) of \(groups.count)").font(.system(size: 10)).textCase(.uppercase).foregroundStyle(.secondary)
          Spacer()
          Button { page = max(0, clamped - 1) } label: { Image(systemName: "chevron.left") }.disabled(clamped == 0)
          Button { page = min(pageCount - 1, clamped + 1) } label: { Image(systemName: "chevron.right") }.disabled(clamped >= pageCount - 1)
        }
        .font(.caption)
        .padding(.top, 8)
      }
    }
  }

  private func tint(_ v: Double) -> Color { v > 0 ? .gainGreen : (v < 0 ? .lossRed : .secondary) }
}

/// `events-feed-list.tsx` + `event-card.tsx` (news-only, date-grouped).
struct EventsFeedList: View {
  let store: OverviewStore

  var body: some View {
    // Date groups are precomputed by the store when the news changes, not per body.
    let groups = store.newsGroups
    LazyVStack(alignment: .leading, spacing: 12) {
      if groups.isEmpty {
        Text("No recent news yet.").font(.caption).foregroundStyle(.secondary).padding(.horizontal, 4)
      } else {
        ForEach(groups) { group in
          Text(group.label).font(.title3.weight(.bold)).padding(.top, 6)
          ForEach(group.events) { event in EventCard(event: event) }
        }
      }
    }
  }
}

/// "3m ago" that re-renders itself each minute, so the tick never re-runs the cards around it.
struct RelativeTimeText: View {
  let ms: Double

  var body: some View {
    TimelineView(.periodic(from: .now, by: 60)) { context in
      Text(FeedHelpers.relativeTime(ms: ms, nowMs: context.date.timeIntervalSince1970 * 1000))
    }
  }
}

struct EventCard: View {
  let event: OverviewEvent
  @Environment(AppEnvironment.self) private var env
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        HStack(spacing: 6) {
          Button { env.router.openToken(event.coingeckoId, sourceID: "event|\(event.id)") } label: {
            HStack(spacing: 5) {
              TokenLogo(symbol: event.symbol, imageURL: event.logoUrl, size: 14)
              Text(event.symbol.uppercased()).font(.system(size: 13, weight: .semibold))
            }
            .padding(.leading, 5).padding(.trailing, 9).frame(height: 24)
            .background(.white.opacity(0.1), in: Capsule())
          }
          .buttonStyle(.plain)
          .tokenTransitionSource("event|\(event.id)")
          if let pct = event.percent, pct.isFinite { PercentBadge(pct: pct, compact: true) }
          if let s = event.sentiment { SentimentBadge(sentiment: s) }
          if let c = event.aiCategory, let label = FeedHelpers.categoryLabel(c) { CategoryBadge(label: label) }
        }
        Spacer()
        HStack(spacing: 6) {
          RelativeTimeText(ms: event.occurredAtMs).font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
          if let href = event.externalHref, let url = URL(string: href) {
            Button { openURL(url) } label: { Image(systemName: "eyeglasses").font(.caption) }.buttonStyle(.plain).foregroundStyle(.secondary)
          }
        }
      }
      ExpandableText(text: event.aiSummary ?? event.title, collapsedLines: 4, accessibilityIdentifier: "event-summary-toggle")
    }
    .padding(16)
    .background(Theme.surface, in: .rect(cornerRadius: Theme.Radius.md))
  }
}

struct SentimentBadge: View {
  let sentiment: OverviewSummary.Sentiment
  var body: some View {
    let color: Color = sentiment == .bullish ? .gainGreen : (sentiment == .bearish ? .lossRed : .yellow)
    Text(FeedHelpers.sentimentLabel(sentiment))
      .font(.number(size: 11, weight: .semibold))
      .padding(.horizontal, 7).frame(height: 22)
      .foregroundStyle(color).background(color.opacity(0.12), in: Capsule())
  }
}

struct CategoryBadge: View {
  let label: String
  var body: some View {
    Text(label).font(.number(size: 11, weight: .regular)).foregroundStyle(.secondary)
      .padding(.horizontal, 7).frame(height: 22)
      .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
  }
}

struct OverviewEmptyState: View {
  @Environment(AppEnvironment.self) private var env
  var body: some View {
    EmptyState(illustration: .overview, title: "Your holdings overview",
               message: "Create a watchlist and add some tokens to unlock your holdings tracking, movers, and daily briefs.",
               actionTitle: "Go to Watchlists") { env.router.tab = .watchlists }
  }
}

#if DEBUG
#Preview("Populated") {
  PreviewHost(tab: .overview) { _ in OverviewView() }
}
#Preview("Empty") {
  PreviewHost(state: .empty, tab: .overview) { _ in OverviewView() }
}
#Preview("Loading") {
  PreviewHost(state: .loading, tab: .overview) { _ in OverviewView() }
}
#Preview("Load error") {
  PreviewHost(state: .error, tab: .overview) { _ in OverviewView() }
}
#endif

#if DEBUG
#Preview("Portfolio card and breadth") {
  PreviewHost { env in
    let store = PreviewData.overviewStore(env)
    ScrollView { VStack(spacing: 20) { PortfolioValueCard(store: store); BreadthCard(store: store) }.padding() }
  }
}
#Preview("News event and badges") {
  PreviewHost { _ in
    VStack(spacing: 20) {
      EventCard(event: PreviewFixtures.event)
      HStack { SentimentBadge(sentiment: .bullish); SentimentBadge(sentiment: .bearish); SentimentBadge(sentiment: .neutral) }
      CategoryBadge(label: "Markets")
    }.padding()
  }
}
#endif
