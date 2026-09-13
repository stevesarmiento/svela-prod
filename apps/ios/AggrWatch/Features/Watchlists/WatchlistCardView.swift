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
    let up = coins.filter { ($0.priceChangePercentage24h ?? 0) > 0 }.count
    let down = coins.filter { ($0.priceChangePercentage24h ?? 0) < 0 }.count
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        ZStack {
          Circle().fill(.white.opacity(0.06)).overlay(Circle().strokeBorder(.white.opacity(0.06)))
          WatchlistGroupIconView(icon: icon, size: 20).foregroundStyle(Color(oklch: "oklch(0.871 0.006 286.286)"))
        }
        .frame(width: 40, height: 40)
        VStack(alignment: .leading, spacing: 3) {
          Text(name).font(.headline).foregroundStyle(.white).lineLimit(1)
          HStack(spacing: 8) {
            countLabel(up, "up", .gainGreen, flip: false)
            countLabel(down, "down", .lossRed, flip: true)
          }
        }
        Spacer(minLength: 0)
      }

      Group {
        if coinsCount == 0 {
          VStack(spacing: 4) {
            Text("To add tokens to this watchlist")
            Text("tap the + button above").fontWeight(.medium)
          }
          .font(.footnote).foregroundStyle(.white.opacity(0.6))
          .frame(maxWidth: .infinity).padding(.vertical, 22)
        } else if aggregate.count >= 2 {
          Sparkline(points: aggregate, lineWidth: 1.6,
                    monoColor: (aggregateChange?.value ?? 0) >= 0 ? Color.gainGreen : Color.lossRed)
            .frame(height: 70)
        } else {
          Rectangle().fill(.clear).frame(height: 70)
            .overlay { if isLoading { ProgressView().tint(.white.opacity(0.5)) } }
        }
      }

      if coinsCount > 0 {
        HStack(alignment: .bottom) {
          TokenAvatarStack(items: coins.prefix(4).map { .init(symbol: $0.symbol, imageURL: $0.image) }, maxVisible: 4, size: 26)
          if coinsCount > 4 {
            Text("+\(coinsCount - 4)").font(.caption2).foregroundStyle(.white.opacity(0.6))
          }
          Spacer()
          if let change = aggregateChange {
            HStack(spacing: 2) {
              if change.isEstimate { Text("≈").foregroundStyle(.white.opacity(0.5)) }
              Text(UsdFormat.signedPercent(change.value))
            }
            .font(.system(.subheadline, design: .rounded).monospacedDigit().weight(.bold))
            .foregroundStyle(Color(oklch: theme.accentText))
            .contentTransition(.numericText())
          } else {
            Text("—").font(.subheadline.weight(.bold)).foregroundStyle(.white.opacity(0.6))
          }
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
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

  private func countLabel(_ n: Int, _ word: String, _ tint: Color, flip: Bool) -> some View {
    HStack(spacing: 3) {
      Image(systemName: "triangle.fill").font(.system(size: 6)).foregroundStyle(tint).rotationEffect(.degrees(flip ? 180 : 0))
      Text(isLoading ? "—" : "\(n)").foregroundStyle(.white).monospacedDigit()
      Text(word).foregroundStyle(.white.opacity(0.5))
    }
    .font(.system(size: 10))
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
