import SwiftUI

struct CardLoadingBounds {
  let anchor: Anchor<CGRect>
  let scale: CGFloat
  let phaseOffset: Double
}

struct CardLoadingBoundsKey: PreferenceKey {
  static var defaultValue: [CardLoadingBounds] { [] }
  static func reduce(value: inout [CardLoadingBounds], nextValue: () -> [CardLoadingBounds]) {
    value.append(contentsOf: nextValue())
  }
}

nonisolated enum CardLoadingPhase {
  /// Stable per-card phase offset (FNV-1a 64) so cards stagger without per-card clocks.
  static func offset(for identity: String) -> Double {
    let hash = identity.utf8.reduce(UInt64(14_695_981_039_346_656_037)) { ($0 ^ UInt64($1)) &* 1_099_511_628_211 }
    return Double(hash % 1000) / 1000
  }
}

/// GlassEffectContainer composites its surfaces above ordinary descendants, so every card's
/// loading highlight is drawn here, outside the container, using the card's published bounds.
struct CardLoadingOverlay: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.cardLoadingVisible) private var parentVisible

  func body(content: Content) -> some View {
    content.overlayPreferenceValue(CardLoadingBoundsKey.self) { cards in
      if !cards.isEmpty && parentVisible && scenePhase == .active {
        // One clock for the grid. Only the decorative surfaces update per frame.
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { timeline in
          let phase = reduceMotion ? 0.5 : timeline.date.timeIntervalSinceReferenceDate
            .truncatingRemainder(dividingBy: 0.5) / 0.5
          GeometryReader { proxy in
            ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
              let rect = proxy[card.anchor].insetBy(dx: 4, dy: 4)
              let cardPhase = reduceMotion ? 0.5 : (phase + card.phaseOffset).truncatingRemainder(dividingBy: 1)
              CardLoadingSweep(phase: cardPhase, strength: reduceMotion ? 0.3 : 1)
                .frame(width: max(0, rect.width), height: max(0, rect.height))
                .clipShape(.rect(cornerRadius: Theme.Radius.card))
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

/// A soft light band sweeping diagonally across the card: pure gradient, nothing sampled.
struct CardLoadingSweep: View {
  let phase: Double
  let strength: Double

  var body: some View {
    let center = -0.3 + 1.6 * phase
    let swell = pow(max(0, sin(.pi * phase)), 2)
    let halfWidth = 0.06 + 0.10 * swell
    let visibility = smoothstep(0.03, 0.15, phase) * (1 - smoothstep(0.83, 0.98, phase))
    let alpha = visibility * min(1, max(0, strength))
    LinearGradient(
      stops: [
        .init(color: .clear, location: clamp(center - halfWidth * 2)),
        .init(color: .white.opacity(0.06 * alpha), location: clamp(center - halfWidth)),
        .init(color: .white.opacity(0.16 * alpha), location: clamp(center)),
        .init(color: .white.opacity(0.06 * alpha), location: clamp(center + halfWidth)),
        .init(color: .clear, location: clamp(center + halfWidth * 2)),
      ],
      startPoint: UnitPoint(x: 0, y: 0.38),
      endPoint: UnitPoint(x: 1, y: 0.62)
    )
    .blendMode(.plusLighter)
  }

  private func clamp(_ value: Double) -> CGFloat {
    CGFloat(min(1, max(0, value)))
  }

  private func smoothstep(_ edge0: Double, _ edge1: Double, _ x: Double) -> Double {
    let t = min(1, max(0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }
}
