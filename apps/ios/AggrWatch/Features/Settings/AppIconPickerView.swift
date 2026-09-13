import SwiftUI
import UIKit

enum AppIconOption: String, CaseIterable, Identifiable {
  case primary = "AppIcon"
  case blueprint = "aggr-blueprint"
  case testflight = "aggr-testflight"

  var id: String { rawValue }
  var alternateName: String? { self == .primary ? nil : rawValue }
  var previewName: String { "\(rawValue)-preview" }
  var title: String {
    switch self {
    case .primary: "Default"
    case .blueprint: "Blueprint"
    case .testflight: "TestFlight"
    }
  }
}

/// Aufn's icon tiles, backed by the system's actual selection rather than a saved preference.
struct AppIconPickerView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var activeName = UIApplication.shared.alternateIconName
  @State private var changing: AppIconOption?
  @State private var failure: String?

  private var isCanvas: Bool {
    ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 20)], spacing: 24) {
          ForEach(AppIconOption.allCases) { option in
            tile(option)
          }
        }
        .padding(.vertical, 8)
        .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: activeName)

        if !UIApplication.shared.supportsAlternateIcons && !isCanvas {
          Text("App icon changes are unavailable on this device.")
            .font(.footnote).foregroundStyle(.secondary)
        }
        if let failure {
          Label(failure, systemImage: "exclamationmark.triangle")
            .font(.footnote).foregroundStyle(.secondary)
            .accessibilityIdentifier("app-icon-error")
        }
      }
      .padding(24)
    }
    .background(Color(uiColor: .systemGroupedBackground))
    .navigationTitle("App Icon")
    .navigationBarTitleDisplayMode(.inline)
    .fontDesign(.rounded)
    .task { refreshSelection() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { refreshSelection() }
    }
  }

  private func tile(_ option: AppIconOption) -> some View {
    let selected = activeName == option.alternateName
    return Button {
      Task { await select(option) }
    } label: {
      VStack(spacing: 12) {
        Image(option.previewName)
          .resizable().scaledToFit()
          .frame(width: 76, height: 76)
          .clipShape(.rect(cornerRadius: 17, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
              .strokeBorder(Color.accentColor, lineWidth: 2)
              .padding(-5).opacity(selected ? 1 : 0)
          }
          .overlay {
            if changing == option {
              ProgressView().padding(8).background(.regularMaterial, in: .circle)
            }
          }
        Text(option.title)
          .font(.caption.weight(.semibold))
          .foregroundStyle(selected ? .primary : .secondary)
      }
      .frame(maxWidth: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(changing != nil || (!UIApplication.shared.supportsAlternateIcons && !isCanvas))
    .accessibilityLabel(option.title)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityIdentifier("app-icon-\(option.rawValue)")
  }

  private func refreshSelection() {
    guard !isCanvas else { return }
    activeName = UIApplication.shared.alternateIconName
  }

  @MainActor private func select(_ option: AppIconOption) async {
    guard changing == nil, activeName != option.alternateName else { return }
    // Canvas previews can demonstrate the selection ring without changing the installed app.
    guard !isCanvas else { activeName = option.alternateName; return }
    guard UIApplication.shared.supportsAlternateIcons else { return }
    changing = option
    failure = nil
    defer { changing = nil }
    do {
      try await UIApplication.shared.setAlternateIconName(option.alternateName)
      refreshSelection()
    } catch {
      refreshSelection()
      failure = "Couldn't change the icon. \(error.localizedDescription)"
    }
  }
}

#if DEBUG
#Preview("App Icon") {
  NavigationStack { AppIconPickerView() }
    .preferredColorScheme(.dark)
    .tint(Color("AccentColor"))
}
#endif
