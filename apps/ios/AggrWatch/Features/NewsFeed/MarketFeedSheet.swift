import AggrAPI
import AggrCore
import SwiftUI

/// Port of `FloatingMarketNewsPanel`: news list for one coin with sentiment badges, feed-size cycling and refresh.
struct MarketFeedSheet: View {
  let store: MarketFeedStore
  let displayName: String
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL

  var body: some View {
    NavigationStack {
      Group {
        if let articles = store.articles {
          if articles.isEmpty {
            EmptyState(systemImage: "newspaper", title: "No news yet", message: store.isRefreshing ? "Fetching the latest headlines…" : "Nothing indexed for \(displayName) yet.",
                       actionTitle: env.isReadyForUserData ? "Refresh" : nil) { Task { await store.refresh() } }
          } else {
            List(articles) { article in row(article) }
              .listStyle(.plain)
          }
        } else {
          ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .navigationTitle("\(displayName) feed")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
        ToolbarItemGroup(placement: .primaryAction) {
          Button { store.cycleSize() } label: { Text("\(store.feedSize) items").font(.caption.weight(.semibold)) }
            .accessibilityLabel("Pull \(store.feedSize) items. Tap to choose the next amount.")
          Button { Task { await store.refresh() } } label: {
            if store.isRefreshing { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.trianglehead.clockwise") }
          }
          .disabled(store.isRefreshing || !env.isReadyForUserData)
        }
      }
      .safeAreaInset(edge: .bottom) {
        if let err = store.refreshError {
          Text(err).font(.caption).foregroundStyle(.secondary).padding(8).frame(maxWidth: .infinity).background(.bar)
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationBackground(.thinMaterial)
    .onAppear { store.markSeen() }
    .onChange(of: store.latestPostedMs) { _, _ in store.markSeen() }
  }

  private func row(_ a: NewsArticle) -> some View {
    Button {
      if let url = URL(string: a.url) { openURL(url) }
    } label: {
      VStack(alignment: .leading, spacing: 6) {
        Text(a.title).font(.subheadline.weight(.medium)).foregroundStyle(.primary).multilineTextAlignment(.leading).lineLimit(3)
        HStack(spacing: 8) {
          Text(FeedHelpers.relativeTime(ms: a.postedAtMs, nowMs: Date().timeIntervalSince1970 * 1000)).font(.caption2).foregroundStyle(.secondary)
          sentimentBadge(a)
          if let src = a.sourceName, !src.isEmpty {
            Text(src).font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 6).padding(.vertical, 2).background(.white.opacity(0.06), in: .capsule)
          }
          Spacer()
          Image(systemName: "arrow.up.right").font(.caption2).foregroundStyle(.tertiary)
        }
      }
      .padding(.vertical, 4)
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder private func sentimentBadge(_ a: NewsArticle) -> some View {
    switch a.sentiment {
    case .bullish?:
      Label("Bullish", systemImage: "thermometer.sun").font(.caption2).foregroundStyle(Color.gainGreen)
        .padding(.horizontal, 6).padding(.vertical, 2).background(Color.gainGreen.opacity(0.12), in: .capsule)
    case .bearish?:
      Label("Bearish", systemImage: "thermometer.snowflake").font(.caption2).foregroundStyle(Color.lossRed)
        .padding(.horizontal, 6).padding(.vertical, 2).background(Color.lossRed.opacity(0.12), in: .capsule)
    case .neutral?:
      Label("Neutral", systemImage: "thermometer.low").font(.caption2).foregroundStyle(.secondary)
        .padding(.horizontal, 6).padding(.vertical, 2).background(.white.opacity(0.06), in: .capsule)
    case nil:
      Label("Analyzing", systemImage: "arrow.turn.down.right").font(.caption2).foregroundStyle(.secondary).symbolEffect(.pulse)
        .padding(.horizontal, 6).padding(.vertical, 2).background(.white.opacity(0.06), in: .capsule)
    }
  }
}

#if DEBUG
private struct MarketFeedPreview: View {
  @State private var env: AppEnvironment
  @State private var store: MarketFeedStore
  init(state: PreviewData.State) {
    let env = PreviewData.environment(state: state)
    _env = State(initialValue: env)
    _store = State(initialValue: MarketFeedStore(coinId: "bitcoin", news: env.news, canMutate: { false }))
  }
  var body: some View {
    MarketFeedSheet(store: store, displayName: "Bitcoin").environment(env).preferredColorScheme(.dark)
      .task { store.start() }.onDisappear { store.stop() }
  }
}
#Preview("News feed") {
  MarketFeedPreview(state: .populated)
}
#Preview("No news") {
  MarketFeedPreview(state: .empty)
}
#Preview("Loading news") {
  MarketFeedPreview(state: .loading)
}
#endif
