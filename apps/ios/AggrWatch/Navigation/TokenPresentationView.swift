import AggrAPI
import SwiftUI
import UIKit

/// Weak anchors retain row geometry without retaining offscreen/recycled SwiftUI rows.
@MainActor final class TokenTransitionSources {
  private final class WeakView {
    weak var view: UIView?
    init(_ view: UIView) { self.view = view }
  }
  private var views: [String: WeakView] = [:]

  func register(_ view: UIView, id: String) { views[id] = WeakView(view) }
  func remove(_ view: UIView, id: String) {
    if views[id]?.view === view { views.removeValue(forKey: id) }
  }
  /// Destination geometry can be requested before UIKit attaches the presentation to a window.
  func frame(for id: String, in ancestor: UIView) -> CGRect? {
    guard let view = views[id]?.view, view.isDescendant(of: ancestor), !view.bounds.isEmpty else { return nil }
    return view.convert(view.bounds, to: ancestor)
  }

  /// Nil when unregistered, detached from a window, or not yet laid out.
  func view(for id: String?) -> UIView? {
    // Full-screen presentations can temporarily detach the retained source hierarchy.
    guard let id, let view = views[id]?.view, view.window != nil, !view.bounds.isEmpty else { return nil }
    return view
  }
}

private struct TokenTransitionSourcesKey: EnvironmentKey {
  static let defaultValue: TokenTransitionSources? = nil
}

extension EnvironmentValues {
  var tokenTransitionSources: TokenTransitionSources? {
    get { self[TokenTransitionSourcesKey.self] }
    set { self[TokenTransitionSourcesKey.self] = newValue }
  }
}

private struct TokenSourceAnchor: UIViewRepresentable {
  let id: String
  let cornerRadius: CGFloat
  let sources: TokenTransitionSources

  final class AnchorView: UIView {
    var id = ""
    weak var sources: TokenTransitionSources?
  }

  func makeUIView(context: Context) -> AnchorView {
    let view = AnchorView()
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    view.backgroundColor = .clear
    view.layer.cornerCurve = .continuous
    return view
  }
  func updateUIView(_ view: AnchorView, context: Context) {
    view.layer.cornerRadius = cornerRadius
    view.sources?.remove(view, id: view.id)
    view.id = id
    view.sources = sources
    sources.register(view, id: id)
  }
  static func dismantleUIView(_ view: AnchorView, coordinator: ()) {
    view.sources?.remove(view, id: view.id)
  }
}

private struct TokenTransitionSource: ViewModifier {
  let id: String
  let cornerRadius: CGFloat
  @Environment(\.tokenTransitionSources) private var sources

  func body(content: Content) -> some View {
    content.background {
      if let sources { TokenSourceAnchor(id: id, cornerRadius: cornerRadius, sources: sources) }
    }
  }
}

extension View {
  /// Registers an invisible anchor sharing this view's frame as a zoom / pull-dismissal source.
  func tokenTransitionSource(_ id: String, cornerRadius: CGFloat = Theme.Radius.md) -> some View {
    modifier(TokenTransitionSource(id: id, cornerRadius: cornerRadius))
  }
}

/// UIKit owns the full-screen pages and their constrained dismissal, including background blur and
/// cancelled drags: the token page, and an analysis page that may stack on top of it. SwiftUI
/// continues to own the page content and its child sheets.
struct PagePresenter: UIViewControllerRepresentable {
  @Binding var token: TokenPresentation?
  @Binding var analysis: AnalysisPresentation?
  let env: AppEnvironment
  let sources: TokenTransitionSources
  let otherSheetPresented: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  final class PresenterController: UIViewController {
    var onReady: (() -> Void)?
    override func loadView() {
      view = UIView()
      view.backgroundColor = .clear
      view.isUserInteractionEnabled = false
    }
    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      onReady?()
    }
  }

  final class PageController: UIHostingController<AnyView> {
    var pullDismissal: TokenPageDismissal?
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
  }

  final class Coordinator: NSObject, UIAdaptivePresentationControllerDelegate {
    var parent: PagePresenter
    weak var controller: PresenterController?
    private var tokenPage: PageController?
    private var displayedToken: TokenPresentation?
    private var analysisPage: PageController?
    private var displayedAnalysis: AnalysisPresentation?
    private var closingChild = false

    init(_ parent: PagePresenter) { self.parent = parent }

    /// Reconciles both slots against the router. The analysis page is always the topmost
    /// presentation, so it is reconciled first: it has to leave before anything under it changes.
    func synchronize() {
      if let analysisPage {
        // It stays only while its own route and the page it was stacked on are both unchanged.
        let stillWanted = parent.analysis?.id == displayedAnalysis?.id && parent.token?.id == displayedToken?.id
        if !stillWanted { close(analysisPage) }
        return
      }
      if let tokenPage {
        if parent.token?.id != displayedToken?.id {
          close(tokenPage)
        } else if let analysis = parent.analysis, !parent.otherSheetPresented, canPresent(from: tokenPage) {
          present(analysis, from: tokenPage)
        }
        return
      }
      guard let controller, controller.viewIfLoaded?.window != nil, !parent.otherSheetPresented else { return }
      var presenter: UIViewController = controller
      while let ancestor = presenter.parent { presenter = ancestor }
      guard canPresent(from: presenter) else { return }
      if let token = parent.token {
        // The completion re-synchronizes, which stacks a pending analysis page on top.
        present(token, from: presenter)
      } else if let analysis = parent.analysis {
        present(analysis, from: presenter)
      }
    }

    private func canPresent(from presenter: UIViewController) -> Bool {
      presenter.presentedViewController == nil && !presenter.isBeingPresented && !presenter.isBeingDismissed
    }

    /// A page's own system sheet leaves first, then the row collapse runs.
    private func close(_ page: PageController) {
      guard !closingChild, !page.isBeingDismissed, !page.isBeingPresented, page.pullDismissal?.isFinishing != true else { return }
      if let child = page.presentedViewController {
        closingChild = true
        child.dismiss(animated: true) { [weak self] in
          self?.closingChild = false
          self?.synchronize()
        }
      } else {
        page.pullDismissal?.dismiss()
      }
    }

    private func present(_ token: TokenPresentation, from presenter: UIViewController) {
      let content = TokenPresentationView(token: token, close: { [weak self] in self?.closeToken() })
      let page = makePage(content, presenter: presenter, sourceID: token.sourceID, rowCornerRadius: Theme.Radius.md)
      tokenPage = page
      displayedToken = token
      presenter.present(page, animated: true) { [weak self] in self?.synchronize() }
      page.presentationController?.delegate = self
    }

    private func present(_ analysis: AnalysisPresentation, from presenter: UIViewController) {
      let content = AnalysisPageView(presentation: analysis, close: { [weak self] in self?.closeAnalysis() })
      // 22: the token-actions capsule (44pt tall) and the selection pill segments are both capsule-like.
      let page = makePage(content, presenter: presenter, sourceID: analysis.sourceID, rowCornerRadius: 22)
      analysisPage = page
      displayedAnalysis = analysis
      presenter.present(page, animated: true) { [weak self] in self?.synchronize() }
      page.presentationController?.delegate = self
    }

    private func makePage<Content: View>(_ content: Content, presenter: UIViewController,
                                         sourceID: String?, rowCornerRadius: CGFloat) -> PageController {
      PagePresenter.makePage(content, presenter: presenter, sourceID: sourceID, rowCornerRadius: rowCornerRadius,
                             env: parent.env, sources: parent.sources, reduceMotion: parent.reduceMotion) { [weak self] page in
        self?.finished(page)
      }
    }

    // UIKit detaches the covered source view during full-screen presentation. Close
    // directly instead of waiting for that offscreen SwiftUI tree to render again.
    private func closeToken() { parent.token = nil; synchronize() }
    private func closeAnalysis() { parent.analysis = nil; synchronize() }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
      if let page = presentationController.presentedViewController as? PageController { finished(page) }
    }

    private func finished(_ dismissed: PageController) {
      if dismissed === analysisPage {
        if parent.analysis?.id == displayedAnalysis?.id { parent.analysis = nil }
        analysisPage = nil
        displayedAnalysis = nil
        // Let UIKit finish removing its presentation before another route presents content.
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.parent.env.router.analysisDidDismiss()
          self.synchronize()
        }
      } else if dismissed === tokenPage {
        if parent.token?.id == displayedToken?.id { parent.token = nil }
        tokenPage = nil
        displayedToken = nil
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.parent.env.router.tokenDidDismiss()
          self.synchronize()
        }
      }
    }

    func tearDown() {
      for page in [analysisPage, tokenPage].compactMap({ $0 }) {
        page.pullDismissal?.onDismissed = nil
        page.pullDismissal?.cancel()
      }
      analysisPage?.dismiss(animated: false)
      tokenPage?.dismiss(animated: false)
      analysisPage = nil; displayedAnalysis = nil
      tokenPage = nil; displayedToken = nil
    }
  }

  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIViewController(context: Context) -> PresenterController {
    let controller = PresenterController()
    context.coordinator.controller = controller
    controller.onReady = { [weak coordinator = context.coordinator] in coordinator?.synchronize() }
    return controller
  }
  func updateUIViewController(_ controller: PresenterController, context: Context) {
    context.coordinator.parent = self
    context.coordinator.synchronize()
  }
  static func dismantleUIViewController(_ controller: PresenterController, coordinator: Coordinator) {
    controller.onReady = nil
    coordinator.tearDown()
  }

  /// Builds a full-screen page: dark hosting controller, zoom from the registered source (or a
  /// cross-dissolve without one / under Reduce Motion), and the pull-to-dismiss that collapses the
  /// page back onto whatever it covered.
  static func makePage<Content: View>(_ content: Content, presenter: UIViewController, sourceID: String?,
                                      rowCornerRadius: CGFloat, env: AppEnvironment, sources: TokenTransitionSources,
                                      reduceMotion: Bool, onDismissed: @escaping (PageController) -> Void) -> PageController {
    let root = content
      .environment(env)
      .environment(env.toasts)
      // Pages register their own anchors (the token-actions capsule, the Explain buttons); the
      // hosting controller does not inherit the TabView's environment.
      .environment(\.tokenTransitionSources, sources)
      .preferredColorScheme(.dark)
    let page = PageController(rootView: AnyView(root))
    page.modalPresentationStyle = .fullScreen
    page.overrideUserInterfaceStyle = .dark
    page.view.backgroundColor = UIColor(Theme.background)
    page.view.clipsToBounds = true
    page.view.accessibilityViewIsModal = true
    if reduceMotion || sourceID == nil {
      page.preferredTransition = .crossDissolve
    } else {
      let options = UIViewController.Transition.ZoomOptions()
      options.dimmingColor = UIColor.black.withAlphaComponent(0.25)
      options.dimmingVisualEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
      // UIKit owns opening. Logo-close and interactive pulls share our row collapse,
      // so native zoom cleanup cannot compete with custom dismissal state.
      options.interactiveDismissShouldBegin = { _ in false }
      page.preferredTransition = .zoom(options: options) { [weak sources] _ in sources?.view(for: sourceID) }
    }
    // `pageBackdropView` resolves to the topmost page, so a stacked page collapses back onto the
    // page it covered rather than the tab root.
    page.pullDismissal = TokenPageDismissal(page: page, source: presenter.pageBackdropView, rowSource: sources.view(for: sourceID),
                                            rowCornerRadius: rowCornerRadius, reduceMotion: reduceMotion)
    page.pullDismissal?.onDismissed = { [weak page] in
      if let page { onDismissed(page) }
    }
    Haptics.pageChanged()
    return page
  }
}

/// Presents SwiftUI content as a full-screen page from inside another page or screen, with the
/// same zoom and pull-to-dismiss as the token and analysis pages. Drive it with an optional item,
/// like `.sheet(item:)`; the content receives a `close` action.
private struct FullScreenPagePresenter<Item: Identifiable, Content: View>: UIViewControllerRepresentable {
  @Binding var item: Item?
  let sourceID: (Item) -> String?
  let rowCornerRadius: CGFloat
  let content: (Item, @escaping () -> Void) -> Content
  @Environment(AppEnvironment.self) private var env
  @Environment(\.tokenTransitionSources) private var sources
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  final class Coordinator: NSObject, UIAdaptivePresentationControllerDelegate {
    var parent: FullScreenPagePresenter
    weak var controller: PagePresenter.PresenterController?
    private var page: PagePresenter.PageController?
    private var displayedID: Item.ID?

    init(_ parent: FullScreenPagePresenter) { self.parent = parent }

    func synchronize() {
      if let page {
        // The page underneath may have dismissed us itself (a route change); treat that as closed.
        if page.presentingViewController == nil && !page.isBeingPresented && !page.isBeingDismissed {
          finished(page)
          return
        }
        if parent.item?.id != displayedID, page.pullDismissal?.isFinishing != true, !page.isBeingPresented, !page.isBeingDismissed {
          page.pullDismissal?.dismiss()
        }
        return
      }
      guard let item = parent.item, let controller, controller.viewIfLoaded?.window != nil else { return }
      var presenter: UIViewController = controller
      while let ancestor = presenter.parent { presenter = ancestor }
      guard presenter.presentedViewController == nil, !presenter.isBeingPresented, !presenter.isBeingDismissed else { return }
      let sources = parent.sources ?? TokenTransitionSources()
      let content = parent.content(item) { [weak self] in
        self?.parent.item = nil
        self?.synchronize()
      }
      let page = PagePresenter.makePage(content, presenter: presenter, sourceID: parent.sourceID(item), rowCornerRadius: parent.rowCornerRadius,
                                        env: parent.env, sources: sources, reduceMotion: parent.reduceMotion) { [weak self] page in
        self?.finished(page)
      }
      self.page = page
      displayedID = item.id
      presenter.present(page, animated: true) { [weak self] in self?.synchronize() }
      page.presentationController?.delegate = self
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
      if let page = presentationController.presentedViewController as? PagePresenter.PageController { finished(page) }
    }

    private func finished(_ dismissed: PagePresenter.PageController) {
      guard dismissed === page else { return }
      if parent.item?.id == displayedID { parent.item = nil }
      page = nil
      displayedID = nil
    }

    func tearDown() {
      page?.pullDismissal?.onDismissed = nil
      page?.pullDismissal?.cancel()
      page?.dismiss(animated: false)
      page = nil
      displayedID = nil
    }
  }

  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIViewController(context: Context) -> PagePresenter.PresenterController {
    let controller = PagePresenter.PresenterController()
    context.coordinator.controller = controller
    controller.onReady = { [weak coordinator = context.coordinator] in coordinator?.synchronize() }
    return controller
  }
  func updateUIViewController(_ controller: PagePresenter.PresenterController, context: Context) {
    context.coordinator.parent = self
    context.coordinator.synchronize()
  }
  static func dismantleUIViewController(_ controller: PagePresenter.PresenterController, coordinator: Coordinator) {
    controller.onReady = nil
    coordinator.tearDown()
  }
}

extension View {
  /// Presents `content` as a full-screen page while `item` is non-nil, zooming out of the view
  /// registered under `sourceID` and collapsing back into it on pull or close.
  func fullScreenPage<Item: Identifiable, Content: View>(
    item: Binding<Item?>, sourceID: @escaping (Item) -> String?, rowCornerRadius: CGFloat = 22,
    @ViewBuilder content: @escaping (Item, @escaping () -> Void) -> Content
  ) -> some View {
    background {
      FullScreenPagePresenter(item: item, sourceID: sourceID, rowCornerRadius: rowCornerRadius, content: content)
        .frame(width: 0, height: 0)
    }
  }
}

/// The page backdrop shared by full-screen pages: the theme background with a blurred token logo
/// glow that extends above the navigation container, through the handle and status-bar safe area.
struct PageArtworkBackground: View, Equatable {
  let symbol: String
  let imageURL: String?

  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .top) {
        Theme.background
        BlurredArtwork(symbol: symbol, imageURL: imageURL)
          .equatable()
          .offset(y: geometry.safeAreaInsets.top - 180)
          .frame(maxWidth: .infinity, alignment: .top)
      }
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
  }
}

/// The 90pt blur is `Equatable` on its artwork only, so parents re-evaluating (quote polls,
/// scrolls) never rebuild it. (No `drawingGroup`: its offscreen texture would clip the blur.)
private struct BlurredArtwork: View, Equatable {
  let symbol: String
  let imageURL: String?

  var body: some View {
    TokenLogo(symbol: symbol, imageURL: imageURL, size: 260)
      .blur(radius: 90).opacity(0.35)
  }
}

struct TokenPageArtwork: Equatable {
  let symbol: String
  let imageURL: String?
}

/// Full-page content, with its own handle and controls rather than a system sheet container.
struct TokenPresentationView: View {
  let token: TokenPresentation
  let close: () -> Void
  @Environment(AppEnvironment.self) private var env
  @State private var artwork: TokenPageArtwork?

  var body: some View {
    NavigationStack {
      TokenDetailView(coinId: token.coinId, groupSlug: token.groupSlug, onClose: close,
                      onArtworkChange: { artwork = $0 })
    }
    .overlay(alignment: .top) {
      Capsule().fill(.secondary.opacity(0.5)).frame(width: 36, height: 4)
        .frame(height: 16).frame(maxWidth: .infinity)
        .offset(y: -8)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
    .background { TokenPageBackdrop(coinId: token.coinId, artwork: artwork) }
    .overlay { ToastOverlay() }
    .fontDesign(.rounded)
    .tint(Theme.accent)
    .accessibilityAction(.escape) { close() }
  }
}

/// Reads the quote only until the detail view reports its artwork, and keeps that read out of
/// the page body so a quotes poll never re-evaluates the navigation stack above it.
private struct TokenPageBackdrop: View {
  let coinId: String
  let artwork: TokenPageArtwork?
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let logo = artwork ?? {
      let quote = env.watchlistData.quote(coinId)
      return TokenPageArtwork(symbol: quote?.symbol ?? coinId, imageURL: quote?.image)
    }()
    PageArtworkBackground(symbol: logo.symbol, imageURL: logo.imageURL)
      .equatable()
  }
}

#if DEBUG
#Preview("Interactive token presentation") {
  PreviewHost(tab: .watchlists, navigation: false) { env in
    MainTabView().onAppear { env.router.showsWatchlistChooser = false }
  }
}
#Preview("Full token page") {
  PreviewHost(navigation: false) { _ in
    TokenPresentationView(token: .init(coinId: "bitcoin", groupSlug: PreviewFixtures.group.slug, sourceID: nil), close: {})
  }
}
#endif
