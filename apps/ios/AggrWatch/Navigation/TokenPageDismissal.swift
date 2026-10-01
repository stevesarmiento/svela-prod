import UIKit

extension UIViewController {
  /// The view a new page is about to cover: the topmost presented page, or the window root
  /// when nothing is presented. A pull-to-dismiss snapshots this for its collapse overlay, so
  /// pages opened from another full-screen page collapse back onto that page, not the root.
  var pageBackdropView: UIView {
    guard let root = view.window?.rootViewController else { return view }
    var top: UIViewController = root
    while let presented = top.presentedViewController, !(presented is UIAlertController), presented.isBeingDismissed == false {
      top = presented
    }
    return top.view
  }
}

/// A centered, rounded pull followed by a collapse into the originating row. The animated
/// container owns its clipping; the live hosting view keeps its layout and safe areas intact.
@MainActor final class TokenPageDismissal: NSObject, UIGestureRecognizerDelegate {
  /// The view the collapse overlay was captured from; exposed for tests.
  private(set) weak var backdropView: UIView?
  private weak var page: UIViewController?
  private let overlay = UIView()
  private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
  private let shade = UIView()
  private let card = UIView()
  private var pageImage: UIView?
  private var rowImage: UIView?
  private let rowFrame: CGRect?
  private let rowCornerRadius: CGFloat
  private let reduceMotion: Bool
  private var returning: UIViewPropertyAnimator?
  private var initialProgress: CGFloat = 0
  private var maximumShrink: CGFloat = 0.2
  private var pullDistance: CGFloat = 200
  private var closing = false
  private var startsInHeader = false
  private var startsAtTop = false
  private weak var touchedScroll: UIScrollView?
  var isFinishing: Bool { closing }
  var onDismissed: (() -> Void)?

  init(page: UIViewController, source: UIView, rowSource: UIView?, rowCornerRadius: CGFloat = Theme.Radius.md, reduceMotion: Bool) {
    self.page = page
    self.reduceMotion = reduceMotion
    self.rowCornerRadius = rowCornerRadius
    self.backdropView = source
    // Layer snapshots: rasterising the backdrop with drawHierarchy stalls the main thread on
    // the tap, right as the zoom starts. Headless runners may return nil; the plain view
    // fallback keeps the collapse machinery (and its tests) working.
    let background = source.snapshotView(afterScreenUpdates: false) ?? UIView()
    if let rowSource, let window = source.window {
      rowFrame = rowSource.convert(rowSource.bounds, to: window)
      let rect = rowSource.convert(rowSource.bounds, to: source)
      rowImage = source.resizableSnapshotView(from: rect, afterScreenUpdates: false, withCapInsets: .zero)
    } else {
      rowFrame = nil
    }
    super.init()
    overlay.backgroundColor = .black
    overlay.isUserInteractionEnabled = false
    overlay.frame = source.bounds
    background.frame = overlay.bounds
    background.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.addSubview(background)
    blur.frame = overlay.bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.addSubview(blur)
    shade.backgroundColor = UIColor.black.withAlphaComponent(0.25)
    shade.frame = overlay.bounds
    shade.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.addSubview(shade)

    card.backgroundColor = .black
    card.clipsToBounds = true
    card.layer.cornerCurve = .continuous
    overlay.addSubview(card)
    let pan = UIPanGestureRecognizer(target: self, action: #selector(pull(_:)))
    pan.maximumNumberOfTouches = 1
    pan.delegate = self
    page.view.addGestureRecognizer(pan)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard let page else { return false }
    startsInHeader = touch.location(in: page.view).y < page.view.safeAreaInsets.top + 88
    // The nearest vertical scroll owns content gestures. Snapshot its position at touch-down:
    // scrolling back to the top must never turn into a dismissal halfway through that drag.
    var ancestor = touch.view
    touchedScroll = nil
    while let view = ancestor, view !== page.view {
      if let scroll = view as? UIScrollView, scroll.isScrollEnabled,
         scroll.contentSize.height + scroll.adjustedContentInset.top + scroll.adjustedContentInset.bottom > scroll.bounds.height {
        touchedScroll = scroll
        break
      }
      ancestor = view.superview
    }
    startsAtTop = touchedScroll.map {
      $0.contentOffset.y <= -$0.adjustedContentInset.top + 1 && !$0.isDecelerating
    } ?? false
    return startsInHeader || startsAtTop
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard let page, let pan = gestureRecognizer as? UIPanGestureRecognizer,
          startsInHeader || startsAtTop, !page.isModalInPresentation, !closing, !page.isBeingPresented, !page.isBeingDismissed,
          page.presentedViewController == nil, page.transitionCoordinator == nil else { return false }
    let velocity = pan.velocity(in: page.view.window)
    return velocity.y > 0 && velocity.y > abs(velocity.x) * 1.5
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                         shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    // Give a qualified downward pull first refusal. Upward/horizontal motion fails our
    // direction check immediately, leaving scrolling and chart inspection in control.
    guard let scroll = otherGestureRecognizer.view as? UIScrollView else { return false }
    return otherGestureRecognizer === scroll.panGestureRecognizer
  }

  private func prepareCard() -> Bool {
    guard let page, let window = page.view.window else { return false }
    if overlay.superview == nil {
      let snapshot = page.view.snapshotView(afterScreenUpdates: false) ?? UIView()
      overlay.frame = window.bounds
      overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      card.transform = .identity
      card.frame = page.view.convert(page.view.bounds, to: window)
      // A centered scale moves the top edge by half the lost height. Hand off to the
      // row collapse 5 points past the previous island/status-bar cutoff.
      let topEdgeLimit = max(12, window.safeAreaInsets.top - 12) + 5
      maximumShrink = min(0.2, 2 * topEdgeLimit / max(1, card.bounds.height))
      // Preserve the existing finger-to-scale response as the cutoff changes.
      pullDistance = 200 * maximumShrink / 0.2
      card.layer.cornerRadius = Theme.Radius.circle
      snapshot.frame = card.bounds
      card.addSubview(snapshot)
      pageImage = snapshot
      window.addSubview(overlay)
    }
    // Hiding only the pixels avoids moving/re-laying out the live page's navigation bar.
    page.view.alpha = 0
    return true
  }

  @objc private func pull(_ pan: UIPanGestureRecognizer) {
    guard let page, !closing else { return }
    switch pan.state {
    case .began:
      stopReturn()
      guard prepareCard() else { return }
      initialProgress = reduceMotion ? 0 : max(0, (1 - card.transform.a) / maximumShrink)
      fallthrough
    case .changed:
      guard overlay.superview != nil else { return }
      let progress = min(1, max(0, initialProgress + pan.translation(in: page.view.window).y / pullDistance))
      if !reduceMotion {
        let scale = 1 - progress * maximumShrink
        card.transform = CGAffineTransform(scaleX: scale, y: scale)
        card.layer.cornerRadius = Theme.Radius.circle
      }
      if progress >= 1 { finishPull(fingerVelocity: pan.velocity(in: page.view.window).y) }
    case .ended, .cancelled, .failed:
      // A logo tap can fail/cancel the pan without ever creating a card. It must not
      // restore a page whose visibility is owned by a presentation or dismissal.
      guard overlay.superview != nil, pageImage != nil else { return }
      // The opaque overlay still covers this, but restoring hit testing allows another pull
      // to interrupt the spring back before it has settled.
      let progress = max(0, initialProgress + pan.translation(in: page.view.window).y / pullDistance)
      let fingerVelocity = pan.velocity(in: page.view.window).y
      if pan.state == .ended, progress >= 0.2, fingerVelocity > 700 {
        finishPull(fingerVelocity: fingerVelocity)
        return
      }
      page.view.alpha = 1
      // Carry the release speed into the spring: an upward flick snaps back instead of
      // decelerating to a stop and restarting from rest.
      let remaining = 1 - card.transform.a
      let scaleVelocity = -fingerVelocity * maximumShrink / pullDistance
      let initial = remaining > 0.001 ? Self.clampedVelocity(scaleVelocity / remaining) : 0
      let animator = UIViewPropertyAnimator(
        duration: reduceMotion ? 0 : 0.28,
        timingParameters: UISpringTimingParameters(dampingRatio: 0.9, initialVelocity: CGVector(dx: initial, dy: initial))
      )
      animator.addAnimations {
        self.card.transform = .identity
      }
      returning = animator
      animator.addCompletion { [weak self, weak animator] position in
        guard let self, self.returning === animator else { return }
        self.returning = nil
        if position == .end { self.removeCard() }
      }
      animator.startAnimation()
    default: break
    }
  }

  func dismiss() {
    guard !closing, let page else { return }
    stopReturn()
    guard prepareCard() else {
      closing = true
      Haptics.pageChanged()
      page.dismiss(animated: false) { [self] in onDismissed?() }
      return
    }
    finishPull()
  }

  /// Spring velocities are relative to the remaining distance; keep a hard flick from overshooting.
  private static func clampedVelocity(_ value: CGFloat) -> CGFloat {
    min(12, max(0, value))
  }

  private func finishPull(fingerVelocity: CGFloat = 0) {
    guard !closing, let page, let pageImage else { return }
    closing = true
    Haptics.pageChanged()
    overlay.isUserInteractionEnabled = true
    page.view.isUserInteractionEnabled = false
    // Convert the pulled transform to an explicit frame. Only the outer container changes
    // height; the page content keeps its proportions and clips as the row comes into view.
    let current = card.frame
    card.transform = .identity
    card.frame = current
    pageImage.frame = card.bounds
    let target = rowFrame.flatMap { $0.intersects(overlay.bounds) && !$0.isEmpty ? $0 : nil }
    if let target, let rowImage {
      rowImage.frame = CGRect(x: 0, y: 0, width: current.width, height: target.height * current.width / target.width)
      rowImage.alpha = 0
      card.addSubview(rowImage)
    }
    // A flick toward the row keeps its momentum into the collapse.
    let travel = target.map { $0.midY - current.midY } ?? 0
    let initial = abs(travel) > 1 && fingerVelocity * travel > 0 ? Self.clampedVelocity(fingerVelocity / travel) : 0
    let animator = UIViewPropertyAnimator(
      duration: reduceMotion ? 0 : 0.28,
      timingParameters: UISpringTimingParameters(dampingRatio: 1, initialVelocity: CGVector(dx: initial, dy: initial))
    )
    animator.addAnimations {
      if let target, self.rowImage != nil {
        self.card.frame = target
        self.card.layer.cornerRadius = self.rowCornerRadius
        pageImage.frame = CGRect(x: 0, y: 0, width: target.width, height: current.height * target.width / current.width)
        pageImage.alpha = 0
        self.rowImage?.frame = self.card.bounds
        self.rowImage?.alpha = 1
      } else {
        // Source-less links have no row to return to.
        self.card.alpha = 0
      }
      self.blur.effect = nil
      self.shade.alpha = 0
    }
    animator.addCompletion { [weak self, weak page] _ in
      guard let self, let page, self.closing else { return }
      // Hold the exact row image over UIKit's handoff, avoiding a blank frame as the covered
      // comparison is reattached. The native source zoom remains the opening transition.
      page.preferredTransition = .crossDissolve
      page.dismiss(animated: false) {
        UIView.animate(withDuration: self.reduceMotion ? 0 : 0.1) {
          self.overlay.alpha = 0
        } completion: { _ in
          self.overlay.removeFromSuperview()
          // Keep the coordinator's page alive until UIKit has reattached the source and
          // the visual handoff is complete. viewDidDisappear is too early for this.
          self.onDismissed?()
        }
      }
    }
    animator.startAnimation()
  }

  private func stopReturn() {
    guard let animator = returning else { return }
    returning = nil
    animator.stopAnimation(false)
    animator.finishAnimation(at: .current)
  }

  private func removeCard() {
    overlay.removeFromSuperview()
    pageImage?.removeFromSuperview()
    pageImage = nil
    card.transform = .identity
  }

  func reset() {
    guard !closing else { return }
    stopReturn()
    let ownedPageVisibility = pageImage != nil
    removeCard()
    if ownedPageVisibility { page?.view.alpha = 1 }
  }

  func cancel() {
    closing = false
    reset()
  }
}
