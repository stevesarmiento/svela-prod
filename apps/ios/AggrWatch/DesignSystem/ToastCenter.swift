import Observation
import SwiftUI

/// Transient messages rendered as glass capsules at the top. A toast may carry one action
/// (Undo), which keeps it up a little longer and makes it tappable.
@MainActor
@Observable
final class ToastCenter {
  struct Toast: Identifiable, Equatable {
    enum Kind { case success, error, info }

    struct Action {
      let title: String
      let handler: () -> Void
    }

    let id = UUID()
    var kind: Kind
    var title: String
    var description: String?
    var action: Action?

    static func == (lhs: Toast, rhs: Toast) -> Bool { lhs.id == rhs.id }
  }

  static let lifetime: Duration = .seconds(3.2)
  static let actionLifetime: Duration = .seconds(5)

  private(set) var toasts: [Toast] = []

  func success(_ title: String, _ description: String? = nil, action: Toast.Action? = nil) {
    push(.init(kind: .success, title: title, description: description, action: action))
  }

  func error(_ title: String, _ description: String? = nil) {
    push(.init(kind: .error, title: title, description: description))
  }

  func info(_ title: String, _ description: String? = nil, action: Toast.Action? = nil) {
    push(.init(kind: .info, title: title, description: description, action: action))
  }

  func dismiss(_ id: UUID) {
    withAnimation(Motion.ui) { toasts.removeAll { $0.id == id } }
  }

  private func push(_ toast: Toast) {
    withAnimation(Motion.ui) {
      // A newer undoable message replaces the older one: only the latest can be undone cleanly.
      if toast.action != nil { toasts.removeAll { $0.action != nil } }
      toasts.append(toast)
    }
    let lifetime = toast.action == nil ? Self.lifetime : Self.actionLifetime
    Task { @MainActor [weak self] in
      try? await Task.sleep(for: lifetime)
      self?.dismiss(toast.id)
    }
  }
}

struct ToastOverlay: View {
  @Environment(ToastCenter.self) private var center

  var body: some View {
    VStack(spacing: 8) {
      ForEach(center.toasts) { toast in
        HStack(spacing: 10) {
          Image(systemName: icon(toast.kind)).foregroundStyle(color(toast.kind))
          VStack(alignment: .leading, spacing: 1) {
            Text(toast.title).font(.subheadline.weight(.semibold))
            if let description = toast.description {
              Text(description).font(.footnote).foregroundStyle(.secondary)
            }
          }
          if let action = toast.action {
            Button(action.title) {
              Haptics.tap()
              action.handler()
              center.dismiss(toast.id)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.accent)
            .buttonStyle(.plain)
            .padding(.leading, 4)
            .frame(minHeight: Theme.hitTarget)
            .contentShape(.rect)
          }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, toast.action == nil ? 10 : 0)
        .glassEffect(.regular, in: Capsule())
        .allowsHitTesting(toast.action != nil)
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityIdentifier("toast")
      }
    }
    .padding(.top, 8)
    .padding(.horizontal, 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    // Only an actionable toast may take touches; the full-size overlay must never shadow the page.
    .allowsHitTesting(center.toasts.contains { $0.action != nil })
  }

  private func icon(_ kind: ToastCenter.Toast.Kind) -> String {
    switch kind {
    case .success: "checkmark.circle.fill"
    case .error: "exclamationmark.triangle.fill"
    case .info: "info.circle.fill"
    }
  }

  private func color(_ kind: ToastCenter.Toast.Kind) -> Color {
    switch kind {
    case .success: .gainGreen
    case .error: .lossRed
    case .info: .secondary
    }
  }
}

#if DEBUG
#Preview("Show toast messages") {
  PreviewHost { env in
    VStack(spacing: 20) {
      Button("Success") { env.toasts.success("Added to watchlist") }
      Button("Undo") { env.toasts.info("Removed from watchlist", action: .init(title: "Undo") {}) }
      Button("Error") { env.toasts.error("Couldn’t update watchlist", "Try again in a moment.") }
      Button("Info") { env.toasts.info("Sample notification") }
    }.overlay(alignment: .top) { ToastOverlay() }
  }
}
#endif
