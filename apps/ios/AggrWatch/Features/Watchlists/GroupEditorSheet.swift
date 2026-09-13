import AggrAPI
import AggrCore
import SwiftUI

/// Create / edit watchlist group: live preview card + editor panel
/// (`create-watchlist.tsx`, `watchlists-grid.tsx` EditWatchlistDialog, `watchlist-group-editor-panel.tsx`).
struct GroupEditorSheet: View {
  enum Mode: Hashable {
    case create
    case edit(WatchlistGroup)
  }

  let mode: Mode
  @Environment(AppEnvironment.self) private var env
  @Environment(\.dismiss) private var dismiss

  @State private var name: String
  @State private var icon: String
  @State private var color: String
  @State private var nameError: String?
  @State private var showIconPicker = false
  @State private var isSaving = false

  init(mode: Mode) {
    self.mode = mode
    switch mode {
    case .create:
      _name = State(initialValue: "")
      _icon = State(initialValue: WatchlistGroupIcons.defaultKey)
      _color = State(initialValue: ColorThemes.defaultKey)
    case .edit(let g):
      _name = State(initialValue: g.name)
      _icon = State(initialValue: g.icon ?? WatchlistGroupIcons.defaultKey)
      _color = State(initialValue: g.color ?? ColorThemes.defaultKey)
    }
  }

  private var previewCoins: [CoinQuote] {
    switch mode {
    case .create:
      return [
        CoinQuote(id: "bitcoin", name: "Bitcoin", symbol: "BTC", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png", marketCapRank: 1, currentPrice: 43250.32, priceChangePercentage24h: 2.47),
        CoinQuote(id: "ethereum", name: "Ethereum", symbol: "ETH", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png", marketCapRank: 2, currentPrice: 2650.85, priceChangePercentage24h: -1.23),
        CoinQuote(id: "solana", name: "Solana", symbol: "SOL", image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png", marketCapRank: 5, currentPrice: 98.45, priceChangePercentage24h: 4.82),
      ]
    case .edit(let g):
      return env.watchlistData.coinIds(in: g).compactMap { env.watchlistData.quote($0) }
    }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 20) {
          previewCard
          if showIconPicker {
            IconGridPicker(selection: $icon) { withAnimation(.snappy) { showIconPicker = false } }
              .frame(minHeight: 320)
          } else {
            details
          }
        }
        .padding(20)
      }
      .navigationTitle(showIconPicker ? "Choose icon" : (isCreate ? "New Watchlist" : "Edit Watchlist"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if showIconPicker {
            Button("Back") { withAnimation(.snappy) { showIconPicker = false } }
          } else {
            Button("Cancel") { dismiss() }
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(isCreate ? "Create" : "Save") { Task { await submit() } }
            .disabled(isSaving || showIconPicker)
        }
      }
    }
    .presentationDetents([.large])
    .presentationBackground(.thinMaterial)
  }

  private var isCreate: Bool { if case .create = mode { true } else { false } }

  private var previewCard: some View {
    let coins = previewCoins
    let agg: (Double, Bool)? = {
      if case .edit(let g) = mode { return env.watchlistData.aggregateChange1d(for: g) }
      return (1.83, false)
    }()
    return WatchlistCardView(
      name: name.isEmpty ? "New Watchlist" : name, icon: icon, color: color,
      coins: coins, coinsCount: coins.count,
      aggregate: { if case .edit(let g) = mode { return env.watchlistData.aggregate1dByGroup[g.id] ?? [] }; return [] }(),
      aggregateChange: agg
    )
  }

  private var details: some View {
    VStack(spacing: 20) {
      HStack(spacing: 10) {
        Button { withAnimation(.snappy) { showIconPicker = true } } label: {
          WatchlistGroupIconView(icon: icon, size: 20)
            .frame(width: 48, height: 48)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Choose icon")
        VStack(alignment: .leading, spacing: 4) {
          TextField("Watchlist name", text: $name)
            .textFieldStyle(.plain)
            .padding(.horizontal, 14).frame(height: 48)
            .background(.white.opacity(0.06), in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(nameError == nil ? Color.white.opacity(0.08) : Color.lossRed.opacity(0.7)))
            .onChange(of: name) { _, v in if !v.trimmingCharacters(in: .whitespaces).isEmpty { nameError = nil } }
          if let nameError { Text(nameError).font(.caption).foregroundStyle(Color.lossRed) }
        }
      }
      ColorGridPicker(selection: $color)
    }
  }

  private func submit() async {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { nameError = "Enter a watchlist name"; return }
    isSaving = true
    defer { isSaving = false }
    do {
      switch mode {
      case .create:
        _ = try await env.watchlistData.createGroup(name: trimmed, icon: icon, color: color)
        env.toasts.success("Watchlist created successfully")
      case .edit(let g):
        try await env.watchlistData.updateGroup(g, name: trimmed, icon: icon, color: color)
        env.toasts.success("Watchlist updated")
      }
      dismiss()
    } catch {
      env.toasts.error(isCreate ? "Failed to create watchlist" : "Failed to update watchlist", error.localizedDescription)
    }
  }
}

#if DEBUG
#Preview("Create watchlist") {
  PreviewHost(navigation: false) { _ in GroupEditorSheet(mode: .create) }
}
#Preview("Edit watchlist") {
  PreviewHost(navigation: false) { _ in GroupEditorSheet(mode: .edit(PreviewFixtures.group)) }
}
#endif
