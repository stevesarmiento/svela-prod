import ClerkKit
import Foundation
import Observation

/// Thin, observable façade over `Clerk.shared` for views and coordinators.
@MainActor
@Observable
public final class ClerkSessionStore {
  public private(set) var isSigningIn = false
  public private(set) var lastError: String?

  public init() {}

  public var isLoaded: Bool { Clerk.shared.isLoaded }
  public var user: User? { Clerk.shared.user }
  public var session: Session? { Clerk.shared.session }
  public var isSignedIn: Bool { Clerk.shared.session?.status == .active && Clerk.shared.user != nil }

  /// Google OAuth via Clerk's native flow (ASWebAuthenticationSession). `transferable: true`
  /// lets Clerk create the account on first sign-in, mirroring the web sign-in → sign-up fallback.
  public func signInWithGoogle() async {
    guard !isSigningIn else { return }
    isSigningIn = true
    lastError = nil
    defer { isSigningIn = false }
    do {
      try await ClerkTokenFetcher.waitUntilLoaded()
      _ = try await Clerk.shared.auth.signInWithOAuth(provider: .google, transferable: true)
    } catch {
      if (error as NSError).domain == "com.apple.AuthenticationServices.WebAuthenticationSession",
         (error as NSError).code == 1 {
        // User cancelled the browser sheet; not an error worth surfacing.
        return
      }
      lastError = error.localizedDescription
    }
  }

  public func signOut() async {
    do {
      try await Clerk.shared.auth.signOut()
    } catch {
      lastError = error.localizedDescription
    }
  }
}
