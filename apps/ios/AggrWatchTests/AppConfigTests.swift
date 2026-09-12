import Testing
@testable import AggrWatch

@Test @MainActor func appTabCases() {
  let tabs: [AppTab] = [.overview, .watchlists, .compare, .screener, .search]
  #expect(Set(tabs).count == 5)
}
