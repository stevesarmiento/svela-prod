import AggrAPI
import ClerkKit
import SwiftUI

/// Auth gate: Clerk loading → spinner; no user → Login; user → main tabs.
/// Also drives the `users:upsertCurrentUser` bootstrap whenever Convex auth becomes live.
struct RootView: View {
  @Environment(AppEnvironment.self) private var env
  private var clerk: ClerkSessionStore { env.clerkSession }

  var body: some View {
    Group {
      if !clerk.isLoaded {
        ProgressView("Loading…")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color.black)
      } else if clerk.user == nil && !bypass {
        LoginView()
      } else if !bypass && !env.isReadyForUserData {
        VStack(spacing: 16) {
          if let error = env.userBootstrap.lastError {
            ContentUnavailableView("Couldn’t load your account", systemImage: "exclamationmark.triangle", description: Text(error))
          } else {
            ProgressView("Connecting your account…")
          }
          Button("Retry") { Task { await env.retryUserData() } }
            .disabled(env.userBootstrap.isLoading)
          Button("Sign out") { Task { _ = await env.signOut() } }
        }
      } else {
        MainTabView()
          .environment(env.toasts)
      }
    }
    .fontDesign(.rounded)
    .tint(Color("AccentColor"))
    .task(id: BootstrapKey(userId: clerk.user?.id, convexStatus: env.convex.authStatus)) {
      #if DEBUG
      if env.convex.isPreview { return }
      #endif
      await env.synchronizeUserSession()
      guard !Task.isCancelled else { return }
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

#if DEBUG
#Preview("Signed in") {
  PreviewHost(navigation: false) { _ in RootView() }
}
#Preview("Signed out") {
  PreviewHost(signedIn: false, navigation: false) { _ in RootView() }
}
#endif
