import AggrAPI
import AggrCore
import AggrLiveline
import SwiftUI

/// Compact watchlist card with noninteractive glass and a stable themed base.
struct WatchlistCardView: View {
  let name: String
  let icon: String?
  let color: String?
  let coins: [CoinQuote]
  let coinsCount: Int
  let aggregate: [TimePoint]
  let aggregateChange: (value: Double, isEstimate: Bool)?
  var isLoading = false
  var selected = false
  var loadingIdentity: String? = nil

  @Environment(\.cardPressScale) private var pressScale
  @Environment(\.cardLoadingVisible) private var parentVisible
  @Environment(\.scenePhase) private var scenePhase
  @State private var isVisibleInScroll = true

  /// Theme colours are parsed from oklch strings; cache them per theme key instead of per body.
  private struct Palette { let background: Color; let accentText: Color }
  private static var palettes: [String: Palette] = [:]
  private static let iconTint = Color(oklch: "oklch(0.871 0.006 286.286)")
  private var palette: Palette {
    let key = color ?? "default"
    if let cached = Self.palettes[key] { return cached }
    let theme = ColorThemes.resolve(color)
    let resolved = Palette(background: Color(oklch: theme.background), accentText: Color(oklch: theme.accentText))
    Self.palettes[key] = resolved
    return resolved
  }
  // Keep cached charts visible during refreshes. Empty watchlists never shimmer.
  private var showsLoadingShine: Bool { coinsCount > 0 && isLoading && aggregate.count < 2 }

  var body: some View {
    // Inner layout gives glass real, smaller bounds. The inverse outer layout
    // reserves the original footprint, with both layers placed at its center.
    CardScaleLayout(scale: 1 / pressScale) {
      CardScaleLayout(scale: pressScale) {
        content.scaleEffect(pressScale, anchor: .center)
      }
      .background(palette.background, in: .rect(cornerRadius: Theme.Radius.card * pressScale))
      .glassEffect(.regular.tint(palette.background.opacity(0.55)),
                   in: .rect(cornerRadius: Theme.Radius.card * pressScale))
    }
    .padding(4)
    .anchorPreference(key: CardLoadingBoundsKey.self, value: .bounds) { bounds in
      showsLoadingShine && isVisibleInScroll
        ? [CardLoadingBounds(anchor: bounds, scale: pressScale, phaseOffset: CardLoadingPhase.offset(for: loadingIdentity ?? name))]
        : []
    }
    .onScrollVisibilityChange(threshold: 0.01) { isVisibleInScroll = $0 }
    .accessibilityElement(children: .combine)
    .accessibilityValue(showsLoadingShine ? "Loading prices" : "")
    .overlay {
      if selected {
        RoundedRectangle(cornerRadius: Theme.Radius.lg)
          .strokeBorder(.white.opacity(0.15), lineWidth: 4)
          .scaleEffect(pressScale, anchor: .center)
          .allowsHitTesting(false)
      }
    }
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        WatchlistGroupIconView(icon: icon, size: 20)
          .foregroundStyle(Self.iconTint)
          .frame(width: 28, height: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(name).font(.headline).foregroundStyle(.white).lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
          if coinsCount == 0 {
            Text("No tokens yet").font(.caption).foregroundStyle(.white.opacity(0.6))
          } else if let change = aggregateChange {
            HStack(spacing: 2) {
              if change.isEstimate { Text("≈").foregroundStyle(.white.opacity(0.5)) }
              Text(UsdFormat.signedPercent(change.value))
            }
            .font(.number(.caption, weight: .semibold))
            .foregroundStyle(palette.accentText)
            .contentTransition(.numericText())
          } else {
            Text("—").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.6))
          }
        }
      }

      Spacer(minLength: 0)

      Group {
        if aggregate.count >= 2, coinsCount > 0 {
          AggrSparkline(points: aggregate,
                             isActive: isVisibleInScroll && parentVisible && scenePhase == .active)
            .equatable()
        } else {
          Color.clear
        }
      }
      .frame(height: 16)

      Spacer(minLength: 0)

      HStack(spacing: 8) {
        if coinsCount > 0 {
          TokenAvatarStack(items: coins.prefix(3).map { .init(symbol: $0.symbol, imageURL: $0.image) }, maxVisible: 3, size: 18, usesGlass: false)
          if coinsCount > 3 {
            Text("+\(coinsCount - 3)").font(.caption2).foregroundStyle(.white.opacity(0.6))
          }
        }
        Spacer(minLength: 0)
      }
      .frame(height: 18)
    }
    .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
    .padding(12)
  }
}

#if DEBUG
#Preview("Watchlist card") {
  WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes, coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false)).padding().preferredColorScheme(.dark)
}
#Preview("Selected card") {
  WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes, coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false), selected: true).padding().preferredColorScheme(.dark)
}
#Preview("Loading card") {
  GlassEffectContainer { WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: [], coinsCount: 3, aggregate: [], aggregateChange: nil, isLoading: true) }.modifier(CardLoadingOverlay()).padding().preferredColorScheme(.dark)
}
#Preview("Loading cards · mobile grid") {
  GlassEffectContainer { LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
    WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes,
                      coinsCount: 3, aggregate: [], aggregateChange: nil, isLoading: true)
    WatchlistCardView(name: "On my radar", icon: "sparkles", color: "purple", coins: [],
                      coinsCount: 8, aggregate: [], aggregateChange: nil, isLoading: true)
    WatchlistCardView(name: "Empty watchlist", icon: "wallet", color: "green", coins: [],
                      coinsCount: 0, aggregate: [], aggregateChange: nil, isLoading: true)
    WatchlistCardView(name: "Refreshing", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes,
                      coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false), isLoading: true)
  } }.modifier(CardLoadingOverlay()).padding().preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Centered card press") {
  HStack(spacing: 8) {
    ForEach([CGFloat(1), 0.975], id: \.self) { scale in
      WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes,
                        coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false), selected: true)
        .environment(\.cardPressScale, scale)
    }
  }
  .padding().preferredColorScheme(.dark)
}
#endif
