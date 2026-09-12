import AggrAPI
import AggrCore
import SwiftUI

/// Command palette replacement (`command-search-popover-content.tsx` + `use-hybrid-coin-search.ts`).
/// - Search tab: navigate to a token, star to add/remove from the selected watchlist.
/// - Sheet (`.coinSearch(targetGroupId:)`): add mode with a target watchlist picker.
struct CoinSearchView: View {
  enum Mode { case navigate, addToWatchlist }
  var mode: Mode = .navigate
  var initialTargetGroupId: String? = nil

  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var debounced = ""
  @State private var results: [CoinQuote] = []
  @State private var topCoins: [CoinQuote] = []
  @State private var isLoading = false
  @State private var error: String?
  @State private var targetGroupId: String?
  @State private var pendingIds: Set<String> = []

  var body: some View {
    let data = env.watchlistData
    let target = data.groups.first { $0.id == (targetGroupId ?? initialTargetGroupId) } ?? data.selectedGroup
    List {
      if mode == .addToWatchlist || !data.groups.isEmpty {
        Section {
          Menu {
            ForEach(data.groups) { g in
              Button { targetGroupId = g.id } label: {
                Label { Text("\(g.name) · \(data.coinIds(in: g).count) tokens") } icon: { WatchlistGroupIconView(icon: g.icon, size: 16) }
              }
            }
          } label: {
            HStack {
              Text("Add to").foregroundStyle(.secondary)
              WatchlistGroupIconView(icon: target?.icon, size: 14)
              Text(target?.name ?? "—").fontWeight(.semibold)
              Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
            }
          }
        }
      }

      if debounced.isEmpty {
        Section(mode == .navigate ? "Popular tokens" : "Top tokens") {
          ForEach(topCoins) { coin in row(coin, target: target) }
        }
      } else {
        Section(isLoading && results.isEmpty ? "Searching…" : "Results (\(results.count))") {
          if results.isEmpty && !isLoading {
            Text("No tokens match \"\(debounced)\"").foregroundStyle(.secondary)
          }
          ForEach(results) { coin in row(coin, target: target) }
        }
      }
      if let error { Section { Text(error).font(.footnote).foregroundStyle(Color.lossRed) } }
    }
    .listStyle(.insetGrouped)
    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search tokens")
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .navigationTitle(mode == .navigate ? "Search" : "Add token")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if mode == .addToWatchlist {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
    }
    .task { await loadTop() }
    .task(id: query) {
      // 250ms debounce like the screener search; the debounced value is the query key.
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      debounced = query.trimmingCharacters(in: .whitespaces)
      await search(debounced)
    }
  }

  @ViewBuilder
  private func row(_ coin: CoinQuote, target: WatchlistGroup?) -> some View {
    let data = env.watchlistData
    let inTarget = target.map { data.isInGroup(coin.id, groupId: $0.id) } ?? false
    HStack(spacing: 12) {
      TokenLogo(symbol: coin.symbol, imageURL: coin.image, size: 32)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) {
          Text(coin.symbol.uppercased()).font(.subheadline.weight(.semibold))
          if let r = coin.marketCapRank, r > 0 { Text("#\(r)").font(.caption2).foregroundStyle(.secondary) }
        }
        Text(LogoOverrides.cleanTokenName(coin.name)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 2) {
        UsdText(value: coin.currentPrice, font: .subheadline)
        PercentBadge(pct: coin.priceChangePercentage24h, compact: true)
      }
      Button {
        Task { await toggle(coin, target: target, currentlyIn: inTarget) }
      } label: {
        Image(systemName: inTarget ? "bookmark.fill" : "bookmark")
          .foregroundStyle(inTarget ? Color.accentColor : .secondary)
          .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .disabled(target == nil || pendingIds.contains(coin.id))
    }
    .contentShape(.rect)
    .onTapGesture {
      if mode == .navigate {
        env.router.openToken(coin.id, groupSlug: target?.slug)
      } else {
        Task { await toggle(coin, target: target, currentlyIn: inTarget) }
      }
    }
  }

  private func toggle(_ coin: CoinQuote, target: WatchlistGroup?, currentlyIn: Bool) async {
    guard let target else { return }
    pendingIds.insert(coin.id)
    defer { pendingIds.remove(coin.id) }
    do {
      if currentlyIn {
        try await env.watchlistData.remove(coinId: coin.id, from: target.id)
        env.toasts.success("Removed from \(target.name)")
      } else {
        try await env.watchlistData.add(coinId: coin.id, to: target.id)
        env.toasts.success("Added \(coin.symbol.uppercased()) to \(target.name)")
      }
    } catch {
      env.toasts.error("Could not update watchlist", error.localizedDescription)
    }
  }

  private func loadTop() async {
    let limit = mode == .navigate ? 25 : 50
    do {
      let response = try await env.queryCache.fetch(.init("top-quotes", String(limit)), policy: .topCoins) { [market = env.market] in
        try await market.quotes(limit: limit)
      }
      topCoins = response.data.values
        .filter { ($0.currentPrice ?? 0) > 0 && ($0.marketCapRank ?? 0) > 0 }
        .sorted { ($0.marketCapRank ?? .max) < ($1.marketCapRank ?? .max) }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func search(_ q: String) async {
    guard !q.isEmpty else { results = []; return }
    isLoading = true
    defer { isLoading = false }
    do {
      let limit = mode == .navigate ? 5 : 50
      let fetchLimit = max(HybridSearchRanking.searchSlateSize, limit)
      let summaries = try await env.queryCache.fetch(.init("coins-search", q, String(fetchLimit)), policy: .search) { [market = env.market] in
        try await market.searchCoins(query: q, limit: fetchLimit)
      }
      guard !Task.isCancelled else { return }
      let ids = summaries.map(\.coingeckoId)
      let quotes = ids.isEmpty ? [:] : try await env.watchlistData.fetchQuotes(ids: ids, force: false)
      guard !Task.isCancelled else { return }
      let candidates = summaries.map { s in
        HybridSearchRanking.Candidate(id: s.coingeckoId, name: s.name, symbol: s.symbol, marketCap: quotes[s.coingeckoId]?.marketCap)
      }
      let ranked = HybridSearchRanking.rank(candidates, query: q, limit: limit)
      results = ranked.map { c in
        if var qte = quotes[c.id] { qte.name = c.name; qte.symbol = c.symbol; if qte.image.isEmpty { qte.image = summaries.first { $0.coingeckoId == c.id }?.logoUrl ?? "" }; return qte }
        let s = summaries.first { $0.coingeckoId == c.id }
        return CoinQuote(id: c.id, name: c.name, symbol: c.symbol, image: s?.logoUrl ?? "")
      }
      error = nil
    } catch is CancellationError {
    } catch {
      self.error = error.localizedDescription
    }
  }
}
