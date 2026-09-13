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
  #if DEBUG
  private var previewMode = false
  private var previewUser: User?
  public init(previewUser: User?) { previewMode = true; self.previewUser = previewUser }
  #endif

  public var isLoaded: Bool {
    #if DEBUG
    if previewMode { return true }
    #endif
    return Clerk.shared.isLoaded
  }
  public var user: User? {
    #if DEBUG
    if previewMode { return previewUser }
    #endif
    return Clerk.shared.user
  }
  public var session: Session? {
    #if DEBUG
    if previewMode { return nil }
    #endif
    return Clerk.shared.session
  }
  public var isSignedIn: Bool {
    #if DEBUG
    if previewMode { return previewUser != nil }
    #endif
    return Clerk.shared.session?.status == .active && Clerk.shared.user != nil
  }

  /// Google OAuth via Clerk's native flow (ASWebAuthenticationSession). `transferable: true`
  /// lets Clerk create the account on first sign-in, mirroring the web sign-in → sign-up fallback.
  public func signInWithGoogle() async {
    #if DEBUG
    if previewMode { lastError = "Authentication is unavailable in an offline preview."; return }
    #endif
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
    #if DEBUG
    if previewMode { lastError = "Authentication is unavailable in an offline preview."; return }
    #endif
    do {
      try await Clerk.shared.auth.signOut()
    } catch {
      lastError = error.localizedDescription
    }
  }
}
