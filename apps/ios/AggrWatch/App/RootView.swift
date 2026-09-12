import AggrAPI
import ClerkKit
import SwiftUI

/// Auth gate: Clerk loading → spinner; no user → Login; user → main tabs.
/// Also drives the `users:upsertCurrentUser` bootstrap whenever Convex auth becomes live.
struct RootView: View {
  @Environment(AppEnvironment.self) private var env
  @Environment(Clerk.self) private var clerk

  var body: some View {
    Group {
      if !clerk.isLoaded {
        ProgressView("Loading…")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color.black)
      } else if clerk.user == nil && !bypass {
        LoginView()
      } else {
        MainTabView()
          .environment(env.toasts)
      }
    }
    .task(id: BootstrapKey(userId: clerk.user?.id, convexStatus: env.convex.authStatus)) {
      await env.userBootstrap.bootstrapIfNeeded()
    }
  }

  private var bypass: Bool {
    #if DEBUG
    env.debugBypassAuth
    #else
    false
    #endif
  }

  private struct BootstrapKey: Equatable {
    var userId: String?
    var convexStatus: ConvexAuthStatus
  }
}
