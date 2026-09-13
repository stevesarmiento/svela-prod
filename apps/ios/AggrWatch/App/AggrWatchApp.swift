import AggrAPI
import ClerkKit
import SwiftUI
import UIKit

@main
struct AggrWatchApp: App {
  @State private var environment: AppEnvironment
  @Environment(\.scenePhase) private var scenePhase

  init() {
    AppTypography.configureNavigation()
    #if DEBUG
    if PreviewData.isRunning {
      _environment = State(initialValue: PreviewData.environment())
      return
    }
    #endif
    let config = AppConfig.load()
    Clerk.configure(publishableKey: config.clerkPublishableKey)
    let env = AppEnvironment(config: config)
    env.applyLaunchArguments()
    _environment = State(initialValue: env)
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(environment)
        .preferredColorScheme(.dark)
        .onOpenURL { url in
          Task {
            #if DEBUG
            if environment.convex.isPreview { return }
            #endif
            if (try? await Clerk.shared.handle(url)) == true { return }
            environment.handleDeepLink(url)
          }
        }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            Task { await environment.handleForeground() }
          } else {
            environment.handleBackground()
          }
        }
    }
  }
}
#if DEBUG
#Preview("App") {
  PreviewHost(navigation: false) { _ in RootView() }
}
#endif

/// Native navigation chrome does not always inherit SwiftUI's font design environment.
@MainActor enum AppTypography {
  static func configureNavigation() {
    func rounded(_ style: UIFont.TextStyle) -> UIFont {
      let base = UIFont.preferredFont(forTextStyle: style)
      return UIFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: 0)
    }
    UINavigationBar.appearance().titleTextAttributes = [.font: rounded(.headline)]
    UINavigationBar.appearance().largeTitleTextAttributes = [.font: rounded(.largeTitle)]
    UIBarButtonItem.appearance().setTitleTextAttributes([.font: rounded(.body)], for: .normal)
  }
}
