import Foundation
import Testing
@testable import AggrWatch

@Test @MainActor func tokenPresentationReturnsToItsOriginWithoutPushing() {
  let router = AppRouter()
  router.tab = .compare
  router.openToken("bitcoin", groupSlug: "core", sourceID: "compare|core|bitcoin")
  #expect(router.tokenPresentation?.sourceID == "compare|core|bitcoin")
  #expect(router.tokenPresentation?.groupSlug == "core")
  #expect(router.comparePath.isEmpty)
  router.tokenPresentation = nil
  #expect(router.tab == .compare)
  #expect(router.comparePath.isEmpty)
}

#if DEBUG
@Test @MainActor func navigationLinksRestoreComparisonAndResetDismissesDetails() {
  let env = PreviewData.environment()
  let slug = PreviewFixtures.group.slug
  env.router.handle(.token(coinId: "bitcoin", groupSlug: slug), watchlistData: env.watchlistData)
  #expect(env.router.tab == .watchlists)
  #expect(!env.router.showsWatchlistChooser)
  #expect(env.router.watchlistsPath.isEmpty)
  #expect(env.router.tokenPresentation?.sourceID == nil)
  #expect(env.watchlistData.selectedGroup?.slug == slug)
  env.router.handle(.watchlists(segment: "grid", groupSlug: slug), watchlistData: env.watchlistData)
  #expect(env.router.showsWatchlistChooser)
  #expect(env.router.tokenPresentation == nil)
  env.router.handle(.watchlists(segment: nil, groupSlug: slug), watchlistData: env.watchlistData)
  #expect(!env.router.showsWatchlistChooser)
  env.router.openToken("ethereum")
  env.router.resetAll()
  #expect(env.router.tokenPresentation == nil)
  #expect(env.router.showsWatchlistChooser)
}

@Test @MainActor func deepLinksLeaveTokenPresentationBeforeOpeningAnotherDestination() {
  let env = PreviewData.environment()
  env.router.openToken("bitcoin")
  env.router.handle(.settings, watchlistData: env.watchlistData)
  #expect(env.router.tokenPresentation == nil)
  #expect(env.router.sheet == nil)
  env.router.tokenDidDismiss()
  #expect(env.router.sheet == .settings)
  env.router.sheet = nil
  env.router.openToken("bitcoin")
  env.router.handle(.tab(.overview), watchlistData: env.watchlistData)
  #expect(env.router.tokenPresentation == nil)
  #expect(env.router.tab == .overview)
}
#endif
