import Foundation
import Testing
import UIKit
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

@Test @MainActor func transitionSourcesIgnoreDetachedAndEmptyViews() {
  let sources = TokenTransitionSources()
  let empty = UIView()
  sources.register(empty, id: "empty")
  #expect(sources.view(for: "empty") == nil)
  let row = UIView(frame: CGRect(x: 10, y: 20, width: 44, height: 44))
  sources.register(row, id: "row")
  #expect(sources.view(for: "row") == nil, "A source outside any window cannot anchor a transition")
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
  let container = UIView(frame: CGRect(x: 100, y: 100, width: 200, height: 200))
  window.addSubview(container)
  container.addSubview(row)
  window.isHidden = false
  defer { window.isHidden = true }
  #expect(sources.view(for: "row") === row)
  #expect(sources.frame(for: "row", in: window) == CGRect(x: 110, y: 120, width: 44, height: 44))
  #expect(sources.frame(for: "row", in: UIView()) == nil)
  sources.remove(row, id: "row")
  #expect(sources.view(for: "row") == nil)
}

@Test @MainActor func pullDismissalSnapshotsTheBackdropAndFindsThePresentedPage() {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
  let root = UIViewController()
  window.rootViewController = root
  window.isHidden = false
  defer { window.isHidden = true }
  let row = UIView(frame: CGRect(x: 16, y: 300, width: 358, height: 72))
  root.view.addSubview(row)
  let page = UIViewController()
  let dismissal = TokenPageDismissal(page: page, source: root.view, rowSource: row, rowCornerRadius: 20, reduceMotion: true)
  #expect(dismissal.backdropView === root.view)
  #expect(!dismissal.isFinishing)
  #expect(page.view.gestureRecognizers?.contains { $0 is UIPanGestureRecognizer } == true)
  #expect(root.pageBackdropView === root.view)
  root.present(page, animated: false)
  #expect(root.pageBackdropView === page.view)
}
