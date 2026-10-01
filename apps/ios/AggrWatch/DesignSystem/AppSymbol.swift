import SwiftUI

/// Symbols by name: our own artwork where we have it (template images in the asset catalog),
/// SF Symbols otherwise. Row components take a name, so callers can pass either.
nonisolated enum AppSymbol {
  private static let custom: Set<String> = [
    "ActionAnalyze", "ActionAddToken", "ActionCreateWatchlist", "ActionCollapseWatchlists",
    "ActionExpandWatchlists", "ActionWatchlists",
    "NavigationOverview", "NavigationWatchlists", "NavigationCompare", "NavigationScreener", "NavigationSearch",
  ]

  static func image(_ name: String) -> Image {
    custom.contains(name) ? Image(name, bundle: .main) : Image(systemName: name)
  }

  static func label(_ title: String, symbol: String) -> some View {
    Label { Text(title) } icon: { image(symbol) }
  }
}
