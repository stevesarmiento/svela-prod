import AggrCore
import Foundation
import Observation
import SwiftUI

/// Port of `hooks/use-watchlist-selection.ts` + bottom-nav selection mode. One store per app; the hosting
/// screen registers its selectable ids and (optionally) a bulk-remove handler.
@Observable
final class SelectionStore {
  static let maxAnalyzeTokens = 5

  struct BulkRemoveError: Error { let removedCount: Int; let failedCount: Int }

  private(set) var selected: Set<String> = []
  private(set) var selectableIds: [String] = []
  private(set) var isRemoving = false
  /// nil for read-only tables (screener) → the dock hides Remove.
  var onRemove: ((_ ids: [String]) async throws -> Void)?
  var onAnalyze: ((_ ids: [String]) -> Void)?
  /// Owner token so a screen leaving can release the selection without clobbering another's.
  private(set) var ownerId: String?

  var isActive: Bool { !selected.isEmpty }
  var canRemove: Bool { onRemove != nil }
  var totalCount: Int { selectableIds.count }
  var allSelected: Bool { !selectableIds.isEmpty && selected.count == selectableIds.count }

  func register(owner: String, selectableIds: [String], onRemove: ((_ ids: [String]) async throws -> Void)?, onAnalyze: ((_ ids: [String]) -> Void)?) {
    if ownerId != owner { selected = [] }
    ownerId = owner
    self.selectableIds = selectableIds
    self.onRemove = onRemove
    self.onAnalyze = onAnalyze
    // Prune ids that no longer exist (skip when selectable is transiently empty).
    if !selectableIds.isEmpty { selected = selected.intersection(selectableIds) }
  }

  func release(owner: String) {
    guard ownerId == owner else { return }
    selected = []; selectableIds = []; onRemove = nil; onAnalyze = nil; ownerId = nil
  }

  func toggle(_ id: String) { if selected.contains(id) { selected.remove(id) } else { selected.insert(id) } }
  func isSelected(_ id: String) -> Bool { selected.contains(id) }
  func selectAll(_ on: Bool) { selected = on ? Set(selectableIds) : [] }
  func clear() { selected = [] }
  func reset() {
    selected = []; selectableIds = []; onRemove = nil; onAnalyze = nil; ownerId = nil
    isRemoving = false
  }

  /// `handleRemoveSelected` with the partial-success toast copy.
  func removeSelected(toasts: ToastCenter) async {
    guard let onRemove, !selected.isEmpty else { return }
    let ids = Array(selected)
    isRemoving = true
    defer { isRemoving = false }
    do {
      try await onRemove(ids)
      selected = []
      toasts.success("Removed \(ids.count) \(ids.count == 1 ? "coin" : "coins") from watchlist")
    } catch let e as BulkRemoveError where e.removedCount > 0 {
      toasts.error("Removed \(e.removedCount), failed \(e.failedCount)", "Some coins could not be removed — try again.")
    } catch {
      toasts.error("Error", "Failed to remove selected coins")
    }
  }
}

/// Bottom accessory shown while a selection is active (`selection-content.tsx`).
struct SelectionAccessoryBar: View {
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let sel = env.selection
    HStack(spacing: 12) {
      Button { sel.selectAll(!sel.allSelected) } label: {
        Image(systemName: sel.allSelected ? "checkmark.square.fill" : "square").font(.title3)
      }
      .buttonStyle(.plain)
      Text("\(sel.selected.count) of \(sel.totalCount) selected").font(.subheadline.monospacedDigit())
      Spacer()
      if sel.onAnalyze != nil {
        let over = sel.selected.count > SelectionStore.maxAnalyzeTokens
        Button { sel.onAnalyze?(Array(sel.selected)) } label: { Label("Analyze", systemImage: "sparkles") }
          .disabled(sel.selected.isEmpty || over)
          .help(over ? "Select up to \(SelectionStore.maxAnalyzeTokens) tokens to analyze" : "")
      }
      if sel.canRemove {
        Button(role: .destructive) { Task { await sel.removeSelected(toasts: env.toasts) } } label: { Label("Remove", systemImage: "trash") }
          .disabled(sel.selected.isEmpty || sel.isRemoving)
      }
      Button { sel.clear() } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain).foregroundStyle(.secondary)
    }
    .padding(.horizontal, 16)
    .font(.subheadline)
  }
}

/// Row checkbox shown in selection mode (long-press toggles selection on when inactive).
struct SelectableRow<Content: View>: View {
  let id: String
  @ViewBuilder let content: () -> Content
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let sel = env.selection
    HStack(spacing: 10) {
      if sel.isActive {
        Image(systemName: sel.isSelected(id) ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(sel.isSelected(id) ? Color.accentColor : .secondary)
          .transition(.move(edge: .leading).combined(with: .opacity))
      }
      content()
    }
    .opacity(sel.isActive && !sel.isSelected(id) ? 0.45 : 1)
    .animation(.snappy(duration: 0.2), value: sel.isActive)
    .onLongPressGesture { withAnimation(.snappy) { sel.toggle(id) } }
  }
}
