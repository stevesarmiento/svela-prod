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

/// Ghost content ahead of an empty state, so a fresh list never reads as a dead end: fading rows
/// (the shape of a token or headline row) or a grid of tiles.
struct SkeletonPlaceholder: View {
  enum Shape { case rows, tiles }
  let shape: Shape
  var count = 3

  var body: some View {
    switch shape {
    case .rows:
      VStack(spacing: 10) {
        ForEach(0..<count, id: \.self) { index in
          row.opacity(0.7 - Double(index) * (0.5 / Double(max(1, count - 1))))
        }
      }
    case .tiles:
      // Three small squares per row, fading by row.
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
        ForEach(0..<count, id: \.self) { index in
          tile.opacity(0.6 - Double(index / 3) * 0.4)
        }
      }
    }
  }

  private var row: some View {
    HStack(spacing: 12) {
      Circle().fill(.white.opacity(0.06)).frame(width: 40, height: 40)
      VStack(alignment: .leading, spacing: 8) {
        SkeletonBlock(height: 12, width: 120)
        SkeletonBlock(height: 12, width: 170)
      }
      Spacer()
      SkeletonBlock(height: 12, width: 84)
    }
    .padding(.horizontal, 6)
    .frame(minHeight: 56)
    .accessibilityHidden(true)
  }

  private var tile: some View {
    RoundedRectangle(cornerRadius: 14)
      .fill(.white.opacity(0.06))
      .aspectRatio(1, contentMode: .fit)
      .accessibilityHidden(true)
  }
}

/// The fresh-list empty state: ghost content, a title, a line of explanation, and one glass action.
struct FreshEmptyState: View {
  let shape: SkeletonPlaceholder.Shape
  var placeholderCount = 3
  let title: String
  let message: String
  var actionTitle: String? = nil
  var action: (() -> Void)? = nil

  /// How far the text block climbs over the faded tail of the ghost content.
  private var overlap: CGFloat { shape == .rows ? 52 : 60 }

  var body: some View {
    // The text and action sit on top of the last, faintest ghosts rather than below them.
    VStack(spacing: -overlap) {
      SkeletonPlaceholder(shape: shape, count: placeholderCount)
      VStack(spacing: 16) {
        VStack(spacing: 8) {
          Text(title)
            .font(.system(.title3, design: .rounded, weight: .semibold))
            .accessibilityAddTraits(.isHeader)
          Text(message)
            .font(.system(.subheadline, design: .rounded))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 12)
        if let actionTitle, let action {
          Button(actionTitle, action: action)
            .buttonStyle(.glass)
        }
      }
    }
    .frame(maxWidth: .infinity)
  }
}

#if DEBUG
#Preview("Empty and retry states") {
  VStack(spacing: 24) {
    EmptyState(systemImage: "bookmark", title: "No tokens yet", message: "Add tokens to build your watchlist.", actionTitle: "Add token", action: {})
    EmptyState(systemImage: "wifi.slash", title: "Couldn’t load data", message: "Try again in a moment.", actionTitle: "Retry", action: {})
    SkeletonBlock(height: 18); SkeletonBlock(height: 12, width: 140)
    FreshEmptyState(shape: .rows, title: "No news yet", message: "Headlines appear here as they arrive.", actionTitle: "Refresh", action: {})
  }.padding().preferredColorScheme(.dark)
}
#endif

