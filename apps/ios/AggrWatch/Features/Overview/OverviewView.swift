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
        } else if store.isEmptyDashboard {
          OverviewEmptyState()
        } else {
          VStack(spacing: 20) {
            if let error = store.error {
              VStack(spacing: 8) {
                Text(error).font(.footnote).foregroundStyle(.secondary)
                Button("Retry loading overview") { store.retry() }
              }
            }
            PortfolioValueCard(store: store)
            BreadthCard(store: store)
            EventsFeedList(store: store)
          }
          .padding(16)
          .padding(.bottom, 32)
        }
      } else {
        ProgressView().padding(.top, 80)
      }
    }
    .navigationTitle(greeting)
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button { env.router.sheet = .settings } label: { Label("Settings", systemImage: "person.crop.circle") }
      }
    }
    .task(id: "\(env.isReadyForUserData)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      if store == nil { store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: env.market, cache: env.queryCache) }
      store?.stop()
      if env.isReadyForUserData && env.isSceneActive { store?.start() }
    }
    .onDisappear { store?.stop() }
    .refreshable { store?.retry() }
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

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 6) {
          AnimatedNumber(value: store.displayValueUsd, font: .system(size: 30, weight: .medium, design: .rounded))
          if let note = store.coverageNote { Text(note).font(.caption).foregroundStyle(.secondary) }
          if store.hasHoldings, store.rangeChange.isAvailable {
            MoveWithBadge(usdMove: store.rangeChange.deltaUsd, pct: store.rangeChange.deltaPct)
          }
          if store.hasHoldings, let note = store.chartNote {
            Text(note).font(.caption2).foregroundStyle(.secondary)
          }
        }
        Spacer()
        TimeScalePicker(scales: TimeScale.overviewScales, selection: $store.scale)
      }
      if !store.hasLoaded {
        ProgressView("Loading holdings…").frame(maxWidth: .infinity, minHeight: 200)
      } else if !store.hasHoldings {
        Text("No holdings to chart yet.").font(.footnote).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 200)
      } else if store.portfolioChartPoints.count >= 2 {
        RebasedComparisonChart(portfolio: store.portfolioChartPoints, market: store.rebased.marketPoints, scrubTime: $store.scrubTime)
          .frame(height: 240)
      } else if store.seriesLoading {
        ProgressView().frame(maxWidth: .infinity, minHeight: 200)
      } else {
        Text(store.seriesError ?? "Price history is not available yet.").font(.footnote).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 200)
        Button("Retry") { store.retry() }
      }
    }
    .padding(14)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))
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
    .padding(14)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))
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
          UserDefaults.standard.set("chart", forKey: "watchlists.wt")
          env.router.tab = .watchlists
        } label: {
          HStack(spacing: 8) {
            Circle().fill(Color(oklch: ColorThemes.resolve(row.color).background)).frame(width: 8, height: 8)
            Text(row.name).font(.system(size: 13, weight: .medium)).lineLimit(1)
            Spacer()
            Text(UsdFormat.signedPercent(row.changePct)).font(.system(size: 12, design: .monospaced)).foregroundStyle(tint(row.changePct))
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
  @Environment(AppEnvironment.self) private var env
  @State private var now = Date()

  var body: some View {
    let events = store.newsEvents
    VStack(alignment: .leading, spacing: 12) {
      if events.isEmpty {
        Text("No recent news yet.").font(.caption).foregroundStyle(.secondary).padding(.horizontal, 4)
      } else {
        let groups = groupByDate(events)
        ForEach(groups, id: \.label) { group in
          Text(group.label).font(.title3.weight(.bold)).padding(.top, 6)
          ForEach(group.events) { event in EventCard(event: event, nowMs: now.timeIntervalSince1970 * 1000) }
        }
      }
    }
    .task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(60)); now = Date() } }
  }

  private func groupByDate(_ events: [OverviewEvent]) -> [(label: String, events: [OverviewEvent])] {
    var out: [(label: String, events: [OverviewEvent])] = []
    for e in events {
      let label = FeedHelpers.dateBucket(ms: e.occurredAtMs)
      if out.last?.label == label { out[out.count - 1].events.append(e) } else { out.append((label, [e])) }
    }
    return out
  }
}

struct EventCard: View {
  let event: OverviewEvent
  let nowMs: Double
  @Environment(AppEnvironment.self) private var env
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        HStack(spacing: 6) {
          Button { env.router.openToken(event.coingeckoId) } label: {
            HStack(spacing: 5) {
              TokenLogo(symbol: event.symbol, imageURL: event.logoUrl, size: 14)
              Text(event.symbol.uppercased()).font(.system(size: 13, weight: .semibold))
            }
            .padding(.leading, 5).padding(.trailing, 9).frame(height: 24)
            .background(.white.opacity(0.1), in: Capsule())
          }
          .buttonStyle(.plain)
          if let pct = event.percent, pct.isFinite { PercentBadge(pct: pct, compact: true) }
          if let s = event.sentiment { SentimentBadge(sentiment: s) }
          if let c = event.aiCategory, let label = FeedHelpers.categoryLabel(c) { CategoryBadge(label: label) }
        }
        Spacer()
        HStack(spacing: 6) {
          Text(FeedHelpers.relativeTime(ms: event.occurredAtMs, nowMs: nowMs)).font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
          if let href = event.externalHref, let url = URL(string: href) {
            Button { openURL(url) } label: { Image(systemName: "eyeglasses").font(.caption) }.buttonStyle(.plain).foregroundStyle(.secondary)
          }
        }
      }
      Text(event.aiSummary ?? event.title).font(.callout).foregroundStyle(.secondary).lineLimit(6)
    }
    .padding(16)
    .background(.white.opacity(0.05), in: .rect(cornerRadius: 16))
  }
}

struct SentimentBadge: View {
  let sentiment: OverviewSummary.Sentiment
  var body: some View {
    let color: Color = sentiment == .bullish ? .gainGreen : (sentiment == .bearish ? .lossRed : .yellow)
    Text(FeedHelpers.sentimentLabel(sentiment))
      .font(.system(size: 11, weight: .semibold, design: .monospaced))
      .padding(.horizontal, 7).frame(height: 22)
      .foregroundStyle(color).background(color.opacity(0.12), in: Capsule())
  }
}

struct CategoryBadge: View {
  let label: String
  var body: some View {
    Text(label).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
      .padding(.horizontal, 7).frame(height: 22)
      .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
  }
}

struct OverviewEmptyState: View {
  @Environment(AppEnvironment.self) private var env
  var body: some View {
    EmptyState(systemImage: "chart.pie", title: "Your holdings overview",
               message: "Create a watchlist and add some tokens to unlock your holdings tracking, movers, and daily briefs.",
               actionTitle: "Go to Watchlists") { env.router.tab = .watchlists }
      .padding(.top, 60)
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
      EventCard(event: PreviewFixtures.event, nowMs: Double(PreviewFixtures.now) * 1000)
      HStack { SentimentBadge(sentiment: .bullish); SentimentBadge(sentiment: .bearish); SentimentBadge(sentiment: .neutral) }
      CategoryBadge(label: "Markets")
    }.padding()
  }
}
#endif
