import AggrAPI
import ClerkKit
import SwiftUI

@main
struct AggrWatchApp: App {
  @State private var environment: AppEnvironment
  @Environment(\.scenePhase) private var scenePhase

  init() {
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
        .environment(Clerk.shared)
        .preferredColorScheme(.dark)
        .onOpenURL { url in
          Task {
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
