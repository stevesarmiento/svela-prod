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
  func view(for id: String?) -> UIView? {
    // Full-screen presentations can temporarily detach the retained source hierarchy.
    guard let id, let view = views[id]?.view, !view.bounds.isEmpty else { return nil }
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
    view.layer.cornerRadius = 16
    view.layer.cornerCurve = .continuous
    return view
  }
  func updateUIView(_ view: AnchorView, context: Context) {
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
  @Environment(\.tokenTransitionSources) private var sources

  func body(content: Content) -> some View {
    content.background {
      if let sources { TokenSourceAnchor(id: id, sources: sources) }
    }
  }
}

extension View {
  func tokenTransitionSource(_ id: String) -> some View {
    modifier(TokenTransitionSource(id: id))
  }
}

/// UIKit owns the full-screen page and its constrained dismissal, including background blur and
/// cancelled drags. SwiftUI continues to own the actual token content and its child sheets.
struct TokenPagePresenter: UIViewControllerRepresentable {
  @Binding var token: TokenPresentation?
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
    var parent: TokenPagePresenter
    weak var controller: PresenterController?
    private var page: PageController?
    private var displayedToken: TokenPresentation?
    private var closingChild = false

    init(_ parent: TokenPagePresenter) { self.parent = parent }

    func synchronize() {
      if let page {
        if parent.token?.id != displayedToken?.id, !page.isBeingDismissed, !page.isBeingPresented, page.pullDismissal?.isFinishing != true {
          guard !closingChild else { return }
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
        return
      }
      guard let controller, controller.viewIfLoaded?.window != nil else { return }
      guard let token = parent.token, !parent.otherSheetPresented else { return }
      var presenter: UIViewController = controller
      while let ancestor = presenter.parent { presenter = ancestor }
      guard presenter.presentedViewController == nil else { return }

      let content = TokenPresentationView(token: token, close: { [weak self] in
        self?.closePage()
      })
      .environment(parent.env)
      .environment(parent.env.toasts)
      .preferredColorScheme(.dark)
      let page = PageController(rootView: AnyView(content))
      page.modalPresentationStyle = .fullScreen
      page.overrideUserInterfaceStyle = .dark
      page.view.backgroundColor = .black
      page.view.clipsToBounds = true
      page.view.accessibilityViewIsModal = true
      if parent.reduceMotion {
        page.preferredTransition = .crossDissolve
      } else {
        let options = UIViewController.Transition.ZoomOptions()
        options.dimmingColor = UIColor.black.withAlphaComponent(0.25)
        options.dimmingVisualEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        // UIKit owns opening. Logo-close and interactive pulls share our row collapse,
        // so native zoom cleanup cannot compete with custom dismissal state.
        options.interactiveDismissShouldBegin = { _ in false }
        let sources = parent.sources
        page.preferredTransition = .zoom(options: options) { [weak sources] _ in
          sources?.view(for: token.sourceID)
        }
      }
      page.pullDismissal = TokenPageDismissal(page: page, source: presenter.view, rowSource: parent.sources.view(for: token.sourceID), reduceMotion: parent.reduceMotion)
      self.page = page
      displayedToken = token
      page.pullDismissal?.onDismissed = { [weak self, weak page] in
        if let page { self?.finished(page) }
      }
      presenter.present(page, animated: true) { [weak self] in self?.synchronize() }
      page.presentationController?.delegate = self
    }

    private func closePage() {
      parent.token = nil
      // UIKit detaches the covered source view during full-screen presentation. Close
      // directly instead of waiting for that offscreen SwiftUI tree to render again.
      synchronize()
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
      if let page = presentationController.presentedViewController as? PageController { finished(page) }
    }

    private func finished(_ dismissed: PageController) {
      guard page === dismissed else { return }
      if parent.token?.id == displayedToken?.id { parent.token = nil }
      page = nil
      displayedToken = nil
      // Let UIKit finish removing its presentation before another route presents content.
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.parent.env.router.tokenDidDismiss()
        self.synchronize()
      }
    }

    func tearDown() {
      page?.pullDismissal?.onDismissed = nil
      page?.pullDismissal?.cancel()
      page?.dismiss(animated: false)
      page = nil
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
    .background {
      GeometryReader { geometry in
        let quote = env.watchlistData.quote(token.coinId)
        let logo = artwork ?? TokenPageArtwork(symbol: quote?.symbol ?? token.coinId, imageURL: quote?.image)
        ZStack(alignment: .top) {
          Color.black
          TokenLogo(symbol: logo.symbol, imageURL: logo.imageURL, size: 260)
            .blur(radius: 90).opacity(0.35)
            // Preserve the original glow's position while extending it above the
            // navigation container, through the handle and status-bar safe area.
            .offset(y: geometry.safeAreaInsets.top - 180)
            .frame(maxWidth: .infinity, alignment: .top)
        }
      }
      .ignoresSafeArea()
      .allowsHitTesting(false)
    }
    .overlay { ToastOverlay() }
    .fontDesign(.rounded)
    .tint(Color("AccentColor"))
    .accessibilityAction(.escape) { close() }
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
