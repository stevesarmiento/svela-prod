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

  var openRowID: String?
  var analysisCoinIds: [String] { Array(Set(selected.map { String($0.split(separator: "|").last ?? "") })).sorted() }
  var canAnalyze: Bool { !analysisCoinIds.isEmpty && analysisCoinIds.count <= Self.maxAnalyzeTokens && !isRemoving }

  var isActive: Bool { !selected.isEmpty }
  var canRemove: Bool { onRemove != nil }
  var totalCount: Int { selectableIds.count }
  var allSelected: Bool { !selectableIds.isEmpty && selected.count == selectableIds.count }

  func register(owner: String, selectableIds: [String], onRemove: ((_ ids: [String]) async throws -> Void)?, onAnalyze: ((_ ids: [String]) -> Void)?) {
    if ownerId != owner { clear() }
    ownerId = owner
    self.selectableIds = selectableIds
    self.onRemove = onRemove
    self.onAnalyze = onAnalyze
    // A loaded empty list must not leave stale actions enabled.
    selected = selected.intersection(selectableIds)
  }

  func release(owner: String) {
    guard ownerId == owner else { return }
    clear(); selectableIds = []; onRemove = nil; onAnalyze = nil; ownerId = nil
  }

  func toggle(_ id: String) { guard selectableIds.contains(id), !isRemoving else { return }; openRowID = nil; if selected.contains(id) { selected.remove(id) } else { selected.insert(id) } }
  func isSelected(_ id: String) -> Bool { selected.contains(id) }
  func selectAll(_ on: Bool) { guard !isRemoving else { return }; openRowID = nil; selected = on ? Set(selectableIds) : [] }
  func clear() { selected = []; openRowID = nil }
  func reset() {
    clear(); selectableIds = []; onRemove = nil; onAnalyze = nil; ownerId = nil
    isRemoving = false
  }

  /// `handleRemoveSelected` with the partial-success toast copy.
  func removeSelected(toasts: ToastCenter) async {
    guard let onRemove, !selected.isEmpty, !isRemoving else { return }
    let ids = Array(selected)
    let owner = ownerId
    isRemoving = true
    defer { isRemoving = false }
    do {
      try await onRemove(ids)
      if ownerId == owner { clear() }
      toasts.success("Removed \(ids.count) \(ids.count == 1 ? "coin" : "coins") from watchlist")
    } catch let e as BulkRemoveError where e.removedCount > 0 {
      toasts.error("Removed \(e.removedCount), failed \(e.failedCount)", "Some coins could not be removed — try again.")
    } catch {
      toasts.error("Error", "Failed to remove selected coins")
    }
  }
}

/// Shared card wrapper for watchlist, comparison, and screener tokens.
struct SelectableRow<Content: View>: View {
  let id: String
  var removalTitle = "Remove token?"
  var onRemove: (() async throws -> Void)? = nil
  var onBookmark: (() async -> Void)? = nil
  var isBookmarked = false
  var backgroundColor: Color? = nil
  @ViewBuilder var content: () -> Content
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var isRemoving = false

  var body: some View {
    @Bindable var selection = env.selection
    TokenSwipeCard(
      id: id, openRowID: $selection.openRowID,
      isSelected: selection.isSelected(id), inSelectionMode: selection.isActive,
      onToggleSelection: { selection.toggle(id) }, deleteTitle: removalTitle,
      deleteAccessibilityLabel: onBookmark != nil && !isBookmarked ? "Add to watchlist" : "Remove from watchlist",
      deleteIcon: onBookmark != nil && !isBookmarked ? "bookmark.fill" : "bookmark.slash.fill",
      requiresDeleteConfirmation: onBookmark == nil || isBookmarked,
      onDelete: onBookmark.map { bookmark in {
        guard !isRemoving else { return }
        isRemoving = true
        Task {
          defer { isRemoving = false }
          await bookmark()
        }
      } } ?? onRemove.map { remove in {
        guard !isRemoving else { return }
        isRemoving = true
        Task {
          defer { isRemoving = false }
          do { try await remove(); env.toasts.success("Removed from watchlist") }
          catch { env.toasts.error("Could not remove token", error.localizedDescription) }
        }
      } }
    ) {
      HStack(spacing: 10) {
        if selection.isActive {
          Image(systemName: selection.isSelected(id) ? "checkmark.circle.fill" : "circle.dashed")
            .font(.title3).foregroundStyle(selection.isSelected(id) ? Color.accentColor : .secondary)
            .contentTransition(reduceMotion ? .opacity : .symbolEffect(.replace.offUp.byLayer))
            .transition(SelectionMotion.disclose(anchor: .leading, edge: .leading, reduceMotion: reduceMotion))
            .accessibilityHidden(true)
        }
        content()
      }
      .padding(14)
      .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
      .background(backgroundColor ?? .white.opacity(selection.isSelected(id) ? 0.10 : 0.06), in: .rect(cornerRadius: 16))
      .clipShape(.rect(cornerRadius: 16))
      .contentShape(.rect(cornerRadius: 16))
      .animation(reduceMotion ? nil : .snappy, value: selection.isActive)
      .animation(reduceMotion ? nil : .snappy, value: selection.isSelected(id))
      .onLongPressGesture {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { selection.toggle(id) }
      }
    }
    .disabled(isRemoving || selection.isRemoving)
  }
}

#if DEBUG
import AggrAPI
#Preview("Selectable token cards") {
  PreviewHost { env in
    ScrollView {
      VStack(spacing: 10) {
        ForEach(PreviewFixtures.quotes) { quote in
          SelectableRow(id: quote.id) { AnalysisTokenHeader(coinId: quote.id, quote: quote) }
        }
      }.padding()
    }
    .onAppear { env.selection.register(owner: "preview", selectableIds: PreviewFixtures.quotes.map(\.id), onRemove: nil, onAnalyze: { _ in }) }
  }
}
#endif
