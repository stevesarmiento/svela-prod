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

  @Environment(\.watchlistCardPressScale) private var pressScale
  @Environment(\.watchlistCardLoadingVisible) private var parentVisible
  @Environment(\.scenePhase) private var scenePhase
  @State private var isVisibleInScroll = true

  private var theme: ColorTheme { ColorThemes.resolve(color) }
  // Keep cached charts visible during refreshes. Empty watchlists never shimmer.
  private var showsLoadingShine: Bool { coinsCount > 0 && isLoading && aggregate.count < 2 }

  var body: some View {
    // Inner layout gives glass real, smaller bounds. The inverse outer layout
    // reserves the original footprint, with both layers placed at its center.
    WatchlistCardScaleLayout(scale: 1 / pressScale) {
      WatchlistCardScaleLayout(scale: pressScale) {
        content.scaleEffect(pressScale, anchor: .center)
      }
      .background(Color(oklch: theme.background), in: .rect(cornerRadius: 20 * pressScale))
      .glassEffect(.regular.tint(Color(oklch: theme.background).opacity(0.55)),
                   in: .rect(cornerRadius: 20 * pressScale))
    }
    .padding(4)
    .anchorPreference(key: WatchlistLoadingBoundsKey.self, value: .bounds) { bounds in
      showsLoadingShine && isVisibleInScroll ? [WatchlistLoadingBounds(anchor: bounds, scale: pressScale,
                                                                       phaseOffset: loadingPhaseOffset)] : []
    }
    .onScrollVisibilityChange(threshold: 0.01) { isVisibleInScroll = $0 }
    .accessibilityElement(children: .combine)
    .accessibilityValue(showsLoadingShine ? "Loading prices" : "")
    .overlay {
      if selected {
        RoundedRectangle(cornerRadius: 24)
          .strokeBorder(.white.opacity(0.15), lineWidth: 4)
          .scaleEffect(pressScale, anchor: .center)
          .allowsHitTesting(false)
      }
    }
  }

  private var loadingPhaseOffset: Double {
    // Stable across scroll reuse, refreshes and launches; no per-card clocks.
    let hash = (loadingIdentity ?? name).utf8.reduce(UInt64(14695981039346656037)) { ($0 ^ UInt64($1)) &* 1099511628211 }
    return Double(hash % 1000) / 1000
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        WatchlistGroupIconView(icon: icon, size: 20)
          .foregroundStyle(Color(oklch: "oklch(0.871 0.006 286.286)"))
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
            .font(.system(.caption, design: .rounded).monospacedDigit().weight(.semibold))
            .foregroundStyle(Color(oklch: theme.accentText))
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
          TokenAvatarStack(items: coins.prefix(3).map { .init(symbol: $0.symbol, imageURL: $0.image) }, maxVisible: 3, size: 18, usesGlass: true)
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

private struct WatchlistLoadingBounds {
  let anchor: Anchor<CGRect>
  let scale: CGFloat
  let phaseOffset: Double
}

private struct WatchlistLoadingBoundsKey: PreferenceKey {
  static var defaultValue: [WatchlistLoadingBounds] { [] }
  static func reduce(value: inout [WatchlistLoadingBounds], nextValue: () -> [WatchlistLoadingBounds]) {
    value.append(contentsOf: nextValue())
  }
}

/// GlassEffectContainer composites its surfaces above ordinary descendants.
/// Draw all loading highlights outside that container, using each card's bounds.
struct WatchlistCardLoadingOverlay: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.watchlistCardLoadingVisible) private var parentVisible

  func body(content: Content) -> some View {
    content.overlayPreferenceValue(WatchlistLoadingBoundsKey.self) { cards in
      if !cards.isEmpty && parentVisible && scenePhase == .active {
        // One clock for the grid. Only the decorative surfaces update per frame;
        // card content, native glass, and ready charts remain outside the shader.
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { timeline in
          let phase = reduceMotion ? 0.5 : timeline.date.timeIntervalSinceReferenceDate
            .truncatingRemainder(dividingBy: 0.5) / 0.5
          GeometryReader { proxy in
            ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
              let rect = proxy[card.anchor].insetBy(dx: 4, dy: 4)
              let cardPhase = reduceMotion ? 0.5 : (phase + card.phaseOffset).truncatingRemainder(dividingBy: 1)
              WatchlistMetalLoadingSurface(phase: cardPhase, strength: reduceMotion ? 0.3 : 1)
                .frame(width: max(0, rect.width), height: max(0, rect.height))
                .clipShape(.rect(cornerRadius: 20))
                .scaleEffect(card.scale, anchor: .center)
                .position(x: rect.midX, y: rect.midY)
            }
          }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
    }
  }
}

/// A procedural optical surface, not a filtered snapshot of the card's text/UI.
/// Using the shader as a ShapeStyle avoids an extra source-image sampling pass.
private struct WatchlistMetalLoadingSurface: View {
  let phase: Double
  let strength: Double

  var body: some View {
    GeometryReader { proxy in
      Rectangle().fill(ShaderLibrary.watchlistLoadingSurface(
        .float2(Float(proxy.size.width), Float(proxy.size.height)),
        .float(Float(phase)), .float(Float(strength))
      ))
    }
  }
}

/// Changes the size offered to glass without stretching or reflowing its label.
private struct WatchlistCardScaleLayout: Layout {
  var scale: CGFloat
  var animatableData: CGFloat {
    get { scale }
    set { scale = newValue }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let size = content.sizeThatFits(ProposedViewSize(width: proposal.width.map { $0 / scale },
                                                   height: proposal.height.map { $0 / scale }))
    return CGSize(width: size.width * scale, height: size.height * scale)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center,
                         proposal: ProposedViewSize(width: bounds.width / scale, height: bounds.height / scale))
  }
}

extension EnvironmentValues {
  @Entry var watchlistCardPressScale: CGFloat = 1
  @Entry var watchlistCardLoadingVisible = true
}

#if DEBUG
#Preview("Watchlist card") {
  WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes, coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false)).padding().preferredColorScheme(.dark)
}
#Preview("Selected card") {
  WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes, coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false), selected: true).padding().preferredColorScheme(.dark)
}
#Preview("Loading card") {
  GlassEffectContainer { WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: [], coinsCount: 3, aggregate: [], aggregateChange: nil, isLoading: true) }.modifier(WatchlistCardLoadingOverlay()).padding().preferredColorScheme(.dark)
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
  } }.modifier(WatchlistCardLoadingOverlay()).padding().preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Centered card press") {
  HStack(spacing: 8) {
    ForEach([CGFloat(1), 0.975], id: \.self) { scale in
      WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: PreviewFixtures.quotes,
                        coinsCount: 3, aggregate: PreviewFixtures.returns, aggregateChange: (2.84, false), selected: true)
        .environment(\.watchlistCardPressScale, scale)
    }
  }
  .padding().preferredColorScheme(.dark)
}
#endif
