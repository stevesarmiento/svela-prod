import AggrCore
import SwiftUI

/// Mirrors `WatchlistGroupIcon`: emoji text or SF Symbol.
struct WatchlistGroupIconView: View {
  let icon: String?
  var size: CGFloat = 20

  var body: some View {
    switch WatchlistGroupIcons.resolve(icon) {
    case .emoji(let e):
      Text(e).font(.system(size: size))
    case .sfSymbol(let name):
      Image(systemName: name)
        .font(.system(size: size * 0.9, weight: .semibold))
        .frame(width: size, height: size)
    }
  }
}

/// 6-column swatch grid from `ColorThemes.all`.
struct ColorGridPicker: View {
  @Binding var selection: String

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
      ForEach(ColorThemes.all) { theme in
        Button {
          selection = theme.key
        } label: {
          RoundedRectangle(cornerRadius: 8)
            .fill(Color(oklch: theme.background))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(oklch: theme.border), lineWidth: 1))
            .frame(height: 32)
            .overlay {
              if selection == theme.key {
                RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.5), lineWidth: 2).padding(-3)
              }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(theme.name)
      }
    }
  }
}

/// Emojis | Icons tabbed grid.
struct IconGridPicker: View {
  @Binding var selection: String
  var onPick: () -> Void = {}
  @State private var tab = 0

  var body: some View {
    VStack(spacing: 12) {
      Picker("", selection: $tab) {
        Text("Emojis").tag(0)
        Text("Icons").tag(1)
      }
      .pickerStyle(.segmented)
      ScrollView {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
          ForEach(tab == 0 ? WatchlistGroupIcons.emojis : WatchlistGroupIcons.symbols) { option in
            Button {
              selection = option.key
              onPick()
            } label: {
              WatchlistGroupIconView(icon: option.key, size: 22)
                .frame(width: 44, height: 44)
                .background(selection == option.key ? Color.white.opacity(0.15) : Color.clear, in: .rect(cornerRadius: 10))
                .overlay {
                  if selection == option.key {
                    RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.3), lineWidth: 2)
                  }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(option.label)
          }
        }
      }
    }
  }
}

#if DEBUG
#Preview("Icons and color pickers") {
  ScrollView { VStack(spacing: 24) {
    HStack { WatchlistGroupIconView(icon: "wallet", size: 32); WatchlistGroupIconView(icon: "sparkles", size: 32); WatchlistGroupIconView(icon: nil, size: 32) }
    PreviewValue("blue") { ColorGridPicker(selection: $0) }
    PreviewValue("wallet") { IconGridPicker(selection: $0) }
  }.padding() }.preferredColorScheme(.dark)
}
#endif
