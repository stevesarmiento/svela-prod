import Testing
@testable import AggrWatch

@Test @MainActor func tokenSwipeYieldsVerticalAndDiagonalScrolls() {
  #expect(TokenSwipeRules.intent(dx: 3, dy: 4) == .pending)
  #expect(TokenSwipeRules.intent(dx: 0, dy: 30) == .scroll)
  #expect(TokenSwipeRules.intent(dx: 15, dy: 10) == .scroll)
  #expect(TokenSwipeRules.intent(dx: 30, dy: 8) == .horizontal)
  #expect(TokenSwipeRules.intent(dx: -30, dy: -8) == .horizontal)
}

@Test @MainActor func tokenSwipeCommitsOnlyAtThreshold() {
  #expect(TokenSwipeRules.outcome(base: 0, translation: 55, canDelete: true, canSelect: true) == .close)
  #expect(TokenSwipeRules.outcome(base: 0, translation: 56, canDelete: true, canSelect: true) == .toggleSelect)
  #expect(TokenSwipeRules.outcome(base: 0, translation: -55, canDelete: true, canSelect: true) == .close)
  #expect(TokenSwipeRules.outcome(base: 0, translation: -56, canDelete: true, canSelect: true) == .commitDelete)
  #expect(TokenSwipeRules.outcome(base: 0, translation: -200, canDelete: false, canSelect: true) == .close)
  #expect(TokenSwipeRules.outcome(base: -56, translation: 200, canDelete: true, canSelect: true) == .close)
}

@Test @MainActor func tokenSwipeRubberBandsAndTucksUnderCardCorners() {
  #expect(TokenSwipeRules.offset(base: 0, translation: 96, canDelete: true, canSelect: true) == 66)
  #expect(TokenSwipeRules.offset(base: 0, translation: -96, canDelete: true, canSelect: true) == -66)
  #expect(TokenSwipeRules.offset(base: 0, translation: -40, canDelete: false, canSelect: true) == -10)
  #expect(TokenSwipeRules.panelWidth(travel: 56) == 72)
  #expect(TokenSwipeRules.fillProgress(travel: 28) == 0.5)
  #expect(TokenSwipeRules.fillProgress(travel: 100) == 1)
}

@Test @MainActor func selectionClearsWhenLastCardIsDeselectedOrRemoved() {
  let selection = SelectionStore()
  selection.register(owner: "watchlist", selectableIds: ["bitcoin"], onRemove: nil, onAnalyze: nil)
  selection.toggle("bitcoin")
  #expect(selection.isActive)
  selection.toggle("bitcoin")
  #expect(!selection.isActive)
  selection.toggle("bitcoin")
  selection.register(owner: "watchlist", selectableIds: [], onRemove: nil, onAnalyze: nil)
  #expect(!selection.isActive)
  selection.toggle("bitcoin")
  #expect(!selection.isActive)
}

@Test @MainActor func selectionOwnersCannotReleaseAnotherScreen() {
  let selection = SelectionStore()
  selection.register(owner: "watchlist", selectableIds: ["bitcoin"], onRemove: nil, onAnalyze: nil)
  selection.openRowID = "bitcoin"
  selection.register(owner: "screener", selectableIds: ["ethereum"], onRemove: nil, onAnalyze: nil)
  #expect(selection.openRowID == nil)
  selection.toggle("ethereum")
  selection.release(owner: "watchlist")
  #expect(selection.selected == ["ethereum"])
  selection.clear()
  #expect(!selection.isActive)
}

@Test @MainActor func analysisLimitCountsDistinctTokensAcrossGroups() {
  let selection = SelectionStore()
  let ids = ["a|bitcoin", "b|bitcoin", "a|ethereum", "a|solana", "a|sui", "a|avalanche"]
  selection.register(owner: "compare", selectableIds: ids, onRemove: nil, onAnalyze: { _ in })
  selection.selectAll(true)
  #expect(selection.selected.count == 6)
  #expect(selection.analysisCoinIds.count == 5)
  #expect(selection.canAnalyze)
  selection.register(owner: "compare", selectableIds: ids + ["a|chainlink"], onRemove: nil, onAnalyze: { _ in })
  selection.selectAll(true)
  #expect(!selection.canAnalyze)
}

@Test @MainActor func failedBulkRemovalKeepsSelectionForRetry() async {
  enum Failure: Error { case offline }
  let selection = SelectionStore()
  selection.register(owner: "watchlist", selectableIds: ["bitcoin"], onRemove: { _ in throw Failure.offline }, onAnalyze: nil)
  selection.toggle("bitcoin")
  await selection.removeSelected(toasts: ToastCenter())
  #expect(selection.selected == ["bitcoin"])
  #expect(!selection.isRemoving)
}
