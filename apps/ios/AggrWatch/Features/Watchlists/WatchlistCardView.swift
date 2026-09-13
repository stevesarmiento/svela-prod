import AggrAPI
import AggrCore
import SwiftUI

/// Port of `watchlist-card.tsx` `WatchlistCardView`.
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

  private var theme: ColorTheme { ColorThemes.resolve(color) }

  var body: some View {
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
          Sparkline(points: aggregate, lineWidth: 1.4, monoColor: .white.opacity(0.65))
        } else {
          Color.clear.overlay {
            if isLoading { ProgressView().controlSize(.mini).tint(.white.opacity(0.5)) }
          }
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
    .background {
      ZStack {
        RoundedRectangle(cornerRadius: 20).fill(Color(oklch: theme.background))
        DotPattern().opacity(0.3)
        WatchlistGroupIconView(icon: icon, size: 64)
          .foregroundStyle(.black.opacity(0.35))
          .blur(radius: 30)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          .padding(-8)
      }
      .clipShape(RoundedRectangle(cornerRadius: 20))
    }
    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color(oklch: theme.border), lineWidth: 1))
    .overlay {
      if selected { RoundedRectangle(cornerRadius: 24).strokeBorder(.white.opacity(0.15), lineWidth: 4).padding(-4) }
    }
  }

}

/// The 10×10 dotted texture behind the card.
private struct DotPattern: View {
  var body: some View {
    Canvas { ctx, size in
      let step: CGFloat = 10
      var y: CGFloat = 5
      while y < size.height {
        var x: CGFloat = 5
        while x < size.width {
          ctx.fill(Path(ellipseIn: CGRect(x: x - 1, y: y - 1, width: 2, height: 2)), with: .color(.white.opacity(0.2)))
          x += step
        }
        y += step
      }
    }
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
  WatchlistCardView(name: "Core holdings", icon: "wallet", color: "blue", coins: [], coinsCount: 3, aggregate: [], aggregateChange: nil, isLoading: true).padding().preferredColorScheme(.dark)
}
#endif
