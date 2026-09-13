import SwiftUI
import Observation

/// Sonner-equivalent transient messages rendered as glass capsules at the top.
@Observable
final class ToastCenter {
  struct Toast: Identifiable, Equatable {
    enum Kind { case success, error, info }
    let id = UUID()
    var kind: Kind
    var title: String
    var description: String?
  }

  private(set) var toasts: [Toast] = []

  func success(_ title: String, _ description: String? = nil) { push(.init(kind: .success, title: title, description: description)) }
  func error(_ title: String, _ description: String? = nil) { push(.init(kind: .error, title: title, description: description)) }
  func info(_ title: String, _ description: String? = nil) { push(.init(kind: .info, title: title, description: description)) }

  private func push(_ toast: Toast) {
    withAnimation(.snappy) { toasts.append(toast) }
    Task { @MainActor [weak self] in
      try? await Task.sleep(for: .seconds(3.2))
      withAnimation(.snappy) { self?.toasts.removeAll { $0.id == toast.id } }
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
            if let d = toast.description { Text(d).font(.caption).foregroundStyle(.secondary) }
          }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .glassEffect(.regular, in: Capsule())
        .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .padding(.top, 8)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .allowsHitTesting(false)
  }

  private func icon(_ k: ToastCenter.Toast.Kind) -> String {
    switch k { case .success: "checkmark.circle.fill"; case .error: "exclamationmark.triangle.fill"; case .info: "info.circle.fill" }
  }
  private func color(_ k: ToastCenter.Toast.Kind) -> Color {
    switch k { case .success: .gainGreen; case .error: .lossRed; case .info: .secondary }
  }
}

#if DEBUG
#Preview("Show toast messages") {
  PreviewHost { env in
    VStack(spacing: 20) {
      Button("Success") { env.toasts.success("Added to watchlist") }
      Button("Error") { env.toasts.error("Couldn’t update watchlist", "Try again in a moment.") }
      Button("Info") { env.toasts.info("Sample notification") }
    }.overlay(alignment: .top) { ToastOverlay() }
  }
}
#endif
