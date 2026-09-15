import SwiftUI

struct EmptyState: View {
  var systemImage: String? = nil
  var image: String? = nil
  var illustration: EmptyStateIllustration.Kind? = nil
  let title: String
  let message: String
  var actionTitle: String? = nil
  var action: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 14) {
      if let illustration {
        EmptyStateIllustration(kind: illustration)
          .padding(.bottom, 8)
      } else {
        Group {
          if let image {
            Image(image).renderingMode(.template).resizable().scaledToFit()
              .frame(width: 36, height: 36)
          } else if let systemImage {
            Image(systemName: systemImage)
          }
        }
        .font(.system(size: 36, weight: .light))
        .foregroundStyle(.secondary)
      }
      Text(title)
        .font(illustration == nil ? .headline : .system(.title2, design: .rounded, weight: .bold))
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .buttonStyle(.glass)
          .foregroundStyle(.white)
          .padding(.top, 4)
      }
    }
    .fontDesign(.rounded)
    .padding(.horizontal, 24)
    .padding(.vertical, 28)
    .frame(maxWidth: .infinity)
  }
}

/// Native versions of the web's decorative UI illustrations. Fixed sample curves,
/// bundled logos, and skeleton marks keep these separate from real account data.
struct EmptyStateIllustration: View {
  enum Kind: String, CaseIterable { case watchlists, tokens, comparison, overview, screener }
  let kind: Kind
  private let palette: [Color] = [.init(red: 0.56, green: 0.71, blue: 0.86), .init(red: 0.87, green: 0.58, blue: 0.72), .init(red: 0.48, green: 0.79, blue: 0.68)]
  private var height: CGFloat { kind == .screener ? 96 : 240 }

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        dots
        switch kind {
        case .watchlists: watchlists
        case .tokens: tokens
        case .comparison: comparison
        case .overview: overview
        case .screener: screener
        }
      }
      .frame(width: 360, height: height)
      .mask {
        LinearGradient(stops: [.init(color: .white, location: 0), .init(color: .white, location: 0.68),
                               .init(color: .white.opacity(0.45), location: 0.90), .init(color: .clear, location: 1)],
                       startPoint: .top, endPoint: .bottom)
      }
      .scaleEffect(proxy.size.width / 360, anchor: .topLeading)
    }
    .aspectRatio(360 / height, contentMode: .fit)
    .frame(maxWidth: 360)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private var dots: some View {
    Canvas { context, size in
      for x in stride(from: 5.0, to: size.width, by: 10) {
        for y in stride(from: 5.0, to: size.height, by: 10) {
          context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 1.4, height: 1.4)), with: .color(.white.opacity(0.10)))
        }
      }
    }
    .mask(RadialGradient(colors: [.white, .clear], center: .center, startRadius: 40, endRadius: 190))
  }

  private var watchlists: some View {
    ZStack {
      miniCard(color: Color(red: 0.53, green: 0.34, blue: 0.04), icon: "target", seed: 11, symbols: ["BTC", "ETH", "SOL"])
        .rotationEffect(.degrees(-8)).offset(x: -42, y: -38)
      miniCard(color: Color(red: 0.63, green: 0.09, blue: 0.25), icon: "rainbow", seed: 23, symbols: ["BNB", "ADA", "TRX"])
        .rotationEffect(.degrees(6)).offset(x: 42, y: 42)
      miniCard(color: Color(red: 0.10, green: 0.24, blue: 0.64), icon: "sparkles", seed: 37, symbols: ["UNI", "SUI", "JTO"])
        .rotationEffect(.degrees(-1))
    }
  }

  private func miniCard(color: Color, icon: String, seed: UInt32, symbols: [String]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 10) {
        Image(systemName: icon).font(.system(size: 21, weight: .medium)).foregroundStyle(.white.opacity(0.8))
        VStack(alignment: .leading, spacing: 5) { mark(82, 6, opacity: 0.25); mark(40, 4) }
        Spacer(minLength: 0)
      }
      EmptyIllustrationLine(seed: seed).stroke(.white.opacity(0.50), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
        .frame(height: 29)
      HStack { logos(symbols, size: 18); Spacer(); mark(27, 7, opacity: 0.15) }
    }
    .padding(14).frame(width: 210, height: 126)
    .background(color, in: .rect(cornerRadius: 18))
    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(.white.opacity(0.15)))
    .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
  }

  private var tokens: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(.white.opacity(0.35))
        mark(100, 6)
        Spacer()
      }
      .padding(15)
      Divider().overlay(.white.opacity(0.06))
      ForEach(Array([("BTC", "Bitcoin"), ("SOL", "Solana"), ("ETH", "Ethereum"), ("USDT", "Tether")].enumerated()), id: \.offset) { index, token in
        HStack(spacing: 10) {
          logo(token.0, size: 26)
          VStack(alignment: .leading, spacing: 4) {
            Text(token.1).font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.white.opacity(0.65))
            Text(token.0).font(.system(size: 8, design: .rounded)).foregroundStyle(.white.opacity(0.3))
          }
          Spacer()
          Image(systemName: index == 1 ? "checkmark.circle.fill" : "plus.circle")
            .font(.system(size: 16)).foregroundStyle(index == 1 ? Color.accentColor.opacity(0.7) : .white.opacity(0.2))
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(index == 1 ? .white.opacity(0.04) : .clear)
      }
    }
    .frame(width: 296)
    .background(Color(white: 0.055), in: .rect(cornerRadius: 22))
    .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.white.opacity(0.10)))
    .rotationEffect(.degrees(-2))
  }

  private var comparison: some View {
    HStack(alignment: .top, spacing: 10) {
      VStack(spacing: 8) {
        ForEach(0..<3) { index in
          HStack(spacing: 5) {
            Circle().fill(palette[index].opacity(0.8)).frame(width: 5, height: 5)
            mark(35, 5)
          }
          .padding(8).background(palette[index].opacity(index == 0 ? 0.1 : 0.03), in: .rect(cornerRadius: 7))
        }
      }.padding(.top, 10)
      VStack(spacing: 18) {
        HStack { logos(["BTC", "ETH", "SOL"], size: 18); Spacer(); mark(38, 5) }
        ZStack {
          ForEach(0..<3) { index in
            EmptyIllustrationLine(seed: UInt32([42, 73, 91][index]))
              .stroke(palette[index].opacity(0.7), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
          }
        }.frame(height: 110)
      }
      .padding(12).background(.white.opacity(0.02), in: .rect(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.06)))
    }
    .padding(10).frame(width: 336)
    .background(Color(white: 0.035), in: .rect(cornerRadius: 18))
    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(.white.opacity(0.09)))
  }

  private var overview: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 14) {
        mark(70, 9, opacity: 0.26)
        ZStack {
          EmptyIllustrationLine(seed: 42).stroke(.white.opacity(0.5), lineWidth: 1.4)
          EmptyIllustrationLine(seed: 73).stroke(palette[1].opacity(0.6), lineWidth: 1.4)
        }.frame(height: 68)
        HStack(spacing: 2) { ForEach(0..<3) { i in palette[i].opacity(0.5).frame(height: 7) } }.clipShape(.rect(cornerRadius: 2))
        ForEach(0..<3) { i in
          HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 5) { mark(CGFloat(35 + i * 10), 4); palette[i].opacity(0.3).frame(height: 4) }
            logos(["BTC", "ETH", "SOL"], size: 13)
          }
        }
      }.frame(width: 146)
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 12) { mark(28, 5, opacity: 0.25); mark(28, 5) }
        Divider()
        ForEach(Array(["BTC", "SOL", "ETH", "SUI"].enumerated()), id: \.offset) { i, symbol in
          HStack(alignment: .top, spacing: 7) {
            logo(symbol, size: 21)
            VStack(alignment: .leading, spacing: 5) {
              mark(42, 5, opacity: 0.2); mark(CGFloat(64 + i * 4), 4); mark(55, 4, opacity: 0.07)
              Capsule().fill(palette[i % 3].opacity(0.18)).frame(width: 26, height: 7)
            }
          }
        }
      }.frame(width: 146)
    }.padding(16)
    .background(Color(white: 0.025), in: .rect(cornerRadius: 18))
    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(.white.opacity(0.05)))
  }

  private var screener: some View {
    HStack(spacing: 8) {
      ForEach(Array(["Large Caps", "Momentum", "High Volume"].enumerated()), id: \.offset) { i, title in
        Text(title).font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.8)).padding(.horizontal, 11).padding(.vertical, 12)
          .background([Color.blue, .yellow, .pink][i].opacity(0.28), in: .rect(cornerRadius: 9))
          .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder([Color.blue, .yellow, .pink][i].opacity(0.5)))
      }
    }
  }

  private func mark(_ width: CGFloat, _ height: CGFloat, opacity: Double = 0.12) -> some View {
    Capsule().fill(.white.opacity(opacity)).frame(width: width, height: height)
  }
  private func logos(_ symbols: [String], size: CGFloat) -> some View {
    HStack(spacing: -size * 0.25) { ForEach(symbols, id: \.self) { logo($0, size: size) } }
  }
  private func logo(_ symbol: String, size: CGFloat) -> some View {
    Group {
      if let image = TokenLogo.bundledImage(symbol: symbol) { Image(uiImage: image).resizable().scaledToFit() }
      else { Circle().fill(.white.opacity(0.12)).overlay(Text(symbol.prefix(1)).font(.system(size: size * 0.5))) }
    }
    .frame(width: size, height: size).clipShape(.circle)
    .overlay(Circle().strokeBorder(.black.opacity(0.3), lineWidth: 1))
  }
}

/// The same seeded random-walk construction used by the web illustrations,
/// rendered once as a vector path rather than running live charts for decoration.
private struct EmptyIllustrationLine: Shape {
  let seed: UInt32
  func path(in rect: CGRect) -> Path {
    var state = seed
    func random() -> Double {
      state &+= 0x6d2b79f5
      var x = state
      x = (x ^ (x >> 15)) &* (x | 1)
      x ^= x &+ ((x ^ (x >> 7)) &* (x | 61))
      return Double(x ^ (x >> 14)) / 4_294_967_296
    }
    let trend = (random() - 0.5) * 0.08, volatility = 0.25 + random() * 0.25
    var value = (random() - 0.5) * 0.6
    let values = (0..<24).map { _ -> Double in
      value = max(-6, min(6, value + (random() - 0.5) * volatility + trend)); return value
    }
    let low = values.min() ?? 0, span = max(0.01, (values.max() ?? 1) - low)
    let points = values.enumerated().map { i, v in
      CGPoint(x: rect.minX + CGFloat(i) / 23 * rect.width, y: rect.maxY - (v - low) / span * rect.height)
    }
    var path = Path(); path.move(to: points[0])
    for i in 1..<points.count {
      let a = points[i - 1], b = points[i], x = (a.x + b.x) / 2
      path.addCurve(to: b, control1: CGPoint(x: x, y: a.y), control2: CGPoint(x: x, y: b.y))
    }
    return path
  }
}

struct SkeletonBlock: View {
  var height: CGFloat = 14
  var width: CGFloat? = nil
  var body: some View {
    RoundedRectangle(cornerRadius: 6)
      .fill(.quaternary)
      .frame(width: width, height: height)
      .redacted(reason: .placeholder)
  }
}

#if DEBUG
#Preview("Empty and retry states") {
  VStack(spacing: 24) {
    EmptyState(systemImage: "bookmark", title: "No tokens yet", message: "Add tokens to build your watchlist.", actionTitle: "Add token", action: {})
    EmptyState(systemImage: "wifi.slash", title: "Couldn’t load data", message: "Try again in a moment.", actionTitle: "Retry", action: {})
    SkeletonBlock(height: 18); SkeletonBlock(height: 12, width: 140)
  }.padding().preferredColorScheme(.dark)
}
#endif

#if DEBUG
#Preview("Illustrated empty states · mobile") {
  ScrollView {
    VStack(spacing: 16) {
      ForEach(EmptyStateIllustration.Kind.allCases, id: \.rawValue) { kind in
        EmptyState(illustration: kind, title: kind.rawValue.capitalized,
                   message: "Add tokens and watchlists to get started.", actionTitle: "Get started", action: {})
      }
    }
  }.preferredColorScheme(.dark)
}
#Preview("Illustrated empty state · large text") {
  ScrollView {
    EmptyState(illustration: .watchlists, title: "Build your first watchlist",
               message: "Add tokens, track your groups’ performance, and spot trends at a glance.",
               actionTitle: "Create Watchlist", action: {})
  }.environment(\.dynamicTypeSize, .accessibility3).preferredColorScheme(.dark)
}
#endif
