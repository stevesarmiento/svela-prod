import SwiftUI

extension EnvironmentValues {
  /// True inside a `SettingsGroup`, where rows get inset padding instead of their own divider.
  @Entry var settingsGrouped = false
}

/// A shared surface with inset dividers, keeping each section visually together.
struct SettingsGroup<Content: View>: View {
  var dividerInset: CGFloat = 62
  @ViewBuilder let content: Content

  var body: some View {
    Group(subviews: content) { rows in
      VStack(spacing: 0) {
        ForEach(rows) { row in
          row
          if row.id != rows.last?.id {
            Rectangle().fill(.white.opacity(0.045)).frame(height: 1)
              .padding(.leading, dividerInset).padding(.trailing, 20)
          }
        }
      }
    }
    .environment(\.settingsGrouped, true)
    .background(Color(white: 0.115), in: .rect(cornerRadius: 28))
  }
}

/// Page shell: top-aligned, divided rows with room between sections.
struct SettingsKitPage<Content: View>: View {
  var paintsBackground = true
  @ViewBuilder let content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        content
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .scrollEdgeEffectStyle(.soft, for: .top)
    .background((paintsBackground ? Theme.background : Color.clear).ignoresSafeArea())
  }
}

struct SettingsSectionHeader: View {
  let text: String

  init(_ text: String) { self.text = text }

  var body: some View {
    HStack {
      Text(text)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.secondary)
      Spacer()
    }
    .padding(.horizontal, 12)
    .padding(.top, 30)
    .padding(.bottom, 14)
    .accessibilityAddTraits(.isHeader)
  }
}

/// Navigation or action row with a trailing value and an optional supporting caption.
/// Vertical ellipses indicate drawers; right chevrons indicate subpages.
struct SettingsLinkRow: View {
  @Environment(\.settingsGrouped) private var grouped
  @Environment(\.dynamicTypeSize) private var typeSize
  var iconName: String
  var title: String
  var caption: String? = nil
  var value: String? = nil
  var chevronIconName: String = "chevron.forward"
  var enabled = true
  /// Destructive actions read in the loss colour and carry no chevron.
  var destructive = false
  /// Shows a spinner in place of the chevron while the action runs.
  var isBusy = false
  var accessibilityIdentifier: String? = nil
  var action: () -> Void

  var body: some View {
    Button {
      guard enabled else { return }
      Haptics.tap()
      action()
    } label: {
      HStack(alignment: .center, spacing: 14) {
        AppSymbol.image(iconName)
          .font(.system(size: 23, weight: .medium))
          .foregroundStyle(destructive ? Theme.lossRed : .secondary)
          .frame(width: 28, height: 32)
        VStack(alignment: .leading, spacing: 5) {
          Text(title)
            .font(.body.weight(.semibold))
            .foregroundStyle(destructive ? Theme.lossRed : .white)
          if let caption {
            Text(caption)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.leading)
          }
          if typeSize.isAccessibilitySize, let value {
            Text(value).font(.subheadline).foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 8)
        if !typeSize.isAccessibilitySize, let value {
          Text(value).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
            .multilineTextAlignment(.trailing)
        }
        if isBusy {
          RingLoader(size: .small, tint: .secondary).frame(width: 20, height: 20)
        } else if !destructive {
          Image(systemName: chevronIconName)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white.opacity(0.3))
            .rotationEffect(.degrees(chevronIconName == "ellipsis" ? 90 : 0))
            .frame(width: 20, height: 20)
        }
      }
      .padding(.horizontal, grouped ? 20 : 0)
      .padding(.vertical, 16)
      .frame(minHeight: 70)
      .contentShape(.rect)
      .overlay(alignment: .bottom) {
        if !grouped { Rectangle().fill(.white.opacity(0.07)).frame(height: 1).padding(.leading, 42) }
      }
    }
    .buttonStyle(.plain)
    .modifier(PressScale())
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.5)
    .accessibilityLabel(title)
    .accessibilityValue(value ?? caption ?? "")
    .accessibilityIdentifier(accessibilityIdentifier ?? "settings-row-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
  }
}

/// A switch row with a supporting description, for device-local preferences.
struct SettingsToggleRow: View {
  var iconName: String
  var title: String
  var caption: String? = nil
  @Binding var isOn: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Toggle(isOn: $isOn) {
        HStack(spacing: 14) {
          AppSymbol.image(iconName)
            .font(.system(size: 23, weight: .medium))
            .foregroundStyle(.secondary)
            .frame(width: 28, height: 32)
          Text(title).font(.body.weight(.semibold))
        }
      }
      .tint(Theme.accent)
      .onChange(of: isOn) { _, _ in Haptics.selection() }
      if let caption {
        Text(caption).font(.footnote).foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true).padding(.leading, 42)
      }
    }
    .padding(20)
    .accessibilityIdentifier("settings-toggle-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
  }
}

/// One selectable option with an accent checkmark when chosen.
struct SettingsOptionRow: View {
  @Environment(\.settingsGrouped) private var grouped
  var iconName: String? = nil
  var title: String
  var caption: String = ""
  var badge: String? = nil
  var selected: Bool
  var enabled = true
  var action: () -> Void

  var body: some View {
    Button {
      guard enabled else { return }
      Haptics.tap()
      action()
    } label: {
      HStack(spacing: 14) {
        if let iconName {
          AppSymbol.image(iconName)
            .font(.system(size: 23, weight: .medium))
            .foregroundStyle(.white.opacity(0.4))
            .frame(width: 28)
        }
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 6) {
            Text(title)
              .font(.body.weight(.semibold))
              .foregroundStyle(.primary)
            if let badge {
              Text(badge)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(.quaternary, in: .capsule)
                .foregroundStyle(.secondary)
            }
          }
          if !caption.isEmpty {
            Text(caption)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.leading)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer()
        Image(systemName: "checkmark.circle.fill")
          .foregroundStyle(Theme.accent).opacity(selected ? 1 : 0)
          .contentTransition(.symbolEffect(.replace.offUp.byLayer))
      }
      .padding(.horizontal, grouped ? 20 : 0)
      .padding(.vertical, 18)
      .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
      .contentShape(.rect)
      .overlay(alignment: .bottom) {
        if !grouped { Rectangle().fill(.white.opacity(0.07)).frame(height: 1).padding(.leading, iconName == nil ? 0 : 42) }
      }
    }
    .buttonStyle(.plain)
    .modifier(PressScale())
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.5)
    .accessibilityLabel(title)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// Read-only label / value pair on a card.
struct SettingsInfoRow: View {
  var iconName: String? = nil
  let title: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      if let iconName {
        AppSymbol.image(iconName)
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(.white.opacity(0.4))
          .frame(width: 28)
          .padding(.trailing, 5)
      }
      Text(title)
        .font(.system(size: 14, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
      Spacer(minLength: 12)
      Text(value)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    }
    .padding(12)
    .background(RoundedRectangle(cornerRadius: Theme.Radius.md).foregroundStyle(Color.white.opacity(0.07)))
    .padding(.bottom, 8)
    .accessibilityElement(children: .combine)
  }
}

/// Fine print under a section, in the kit's quiet rounded style.
struct SettingsFootnote: View {
  let text: String
  var systemImageName: String? = nil
  var tint: Color = .white.opacity(0.5)

  init(_ text: String, systemImageName: String? = nil, tint: Color = .white.opacity(0.5)) {
    self.text = text
    self.systemImageName = systemImageName
    self.tint = tint
  }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if let systemImageName {
        Image(systemName: systemImageName)
          .font(.system(size: 12))
          .foregroundStyle(tint)
      }
      Text(text)
        .font(.system(size: 13, design: .rounded))
        .foregroundStyle(tint)
        .multilineTextAlignment(.leading)
    }
    .padding(.horizontal, 6)
    .padding(.top, 12)
    .padding(.bottom, 2)
  }
}

/// Press-scale while held, without claiming the tap.
struct PressScale: ViewModifier {
  @State private var isPressed = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .scaleEffect(isPressed && !reduceMotion ? 0.96 : 1)
      .animation(.easeInOut(duration: 0.1), value: isPressed)
      .onLongPressGesture(minimumDuration: .infinity, pressing: { isPressed = $0 }, perform: {})
  }
}
