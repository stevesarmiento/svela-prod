import ClerkKit
import Foundation
@preconcurrency import ConvexMobile

/// Bridges Clerk sessions into Convex auth using the `"convex"` JWT template.
///
/// This intentionally does NOT use the official `clerk-convex-swift` provider: that one calls
/// `session.getToken()` without a template, which this backend rejects (`aud` must be `"convex"`).
///
/// Responsibilities:
/// - `login`/`loginFromCache` return a fresh templated token (Clerk caches ~60s, 10s buffer).
/// - Listens to `Clerk.shared.auth.events`: `.sessionChanged` → `client.loginFromCache()` / `client.logout()`;
///   `.tokenRefreshed` → re-fetch the templated token and push via `onIdToken`.
/// - Runs a 45s refresh loop so Convex never holds an expired token even if no event fires.
@MainActor
public final class ClerkConvexAuthProvider: AuthProvider {
  public typealias T = String

  private var onIdToken: (@Sendable (String?) -> Void)?
  private var refreshLoopTask: Task<Void, Never>?
  private var sessionSyncTask: Task<Void, Never>?
  private weak var client: ConvexClientWithAuth<String>?
  private var lastPushedToken: String?

  /// Refresh cadence for the templated token (Clerk tokens live ~60s).
  public var refreshInterval: Duration = .seconds(45)

  public init() {}

  /// Binds the Convex client so Clerk session transitions drive Convex login/logout automatically.
  /// Call once right after constructing the client. `Clerk.configure` must already have run.
  public func bind(client: ConvexClientWithAuth<String>) {
    self.client = client
    startSessionSync()
  }

  // MARK: AuthProvider

  public func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    try await authenticate(onIdToken: onIdToken, skipCache: false)
  }

  public func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    try await authenticate(onIdToken: onIdToken, skipCache: false)
  }

  public func logout() async throws {
    stopRefreshLoop()
    onIdToken = nil
    lastPushedToken = nil
    // Sign out of Clerk only if a session still exists; when Clerk already signed out
    // (session → nil), this is a no-op so Convex logout completes cleanly.
    if Clerk.shared.session != nil {
      try await Clerk.shared.auth.signOut()
    }
  }

  public nonisolated func extractIdToken(from authResult: String) -> String {
    authResult
  }

  /// Forces an immediate templated-token refresh and pushes it to Convex (call on app foreground).
  public func refreshNow() async {
    guard onIdToken != nil else { return }
    await pushFreshToken(skipCache: true)
  }

  // MARK: Private

  private func authenticate(onIdToken: @Sendable @escaping (String?) -> Void, skipCache: Bool) async throws -> String {
    self.onIdToken = onIdToken
    let token = try await ClerkTokenFetcher.convexToken(skipCache: skipCache)
    lastPushedToken = token
    startRefreshLoop()
    return token
  }

  private func pushFreshToken(skipCache: Bool) async {
    do {
      let token = try await ClerkTokenFetcher.convexToken(skipCache: skipCache)
      if token != lastPushedToken {
        lastPushedToken = token
        onIdToken?(token)
      }
    } catch {
      // Session gone: tell Convex the token is invalid. Session sync will handle logout.
      if case ClerkTokenError.noActiveSession = error {
        onIdToken?(nil)
      }
    }
  }

  private func startRefreshLoop() {
    refreshLoopTask?.cancel()
    refreshLoopTask = Task { @MainActor [weak self] in
      guard let self else { return }
      // Event-driven refresh
      let eventsTask = Task { @MainActor [weak self] in
        for await event in Clerk.shared.auth.events {
          guard let self, !Task.isCancelled else { break }
          if case .tokenRefreshed = event {
            await self.pushFreshToken(skipCache: false)
          }
        }
      }
      // Timer-driven refresh
      while !Task.isCancelled {
        try? await Task.sleep(for: refreshInterval)
        if Task.isCancelled { break }
        await pushFreshToken(skipCache: false)
      }
      eventsTask.cancel()
    }
  }

  private func stopRefreshLoop() {
    refreshLoopTask?.cancel()
    refreshLoopTask = nil
  }

  private func startSessionSync() {
    sessionSyncTask?.cancel()
    sessionSyncTask = Task { @MainActor [weak self] in
      guard let self else { return }
      try? await ClerkTokenFetcher.waitUntilLoaded()
      await syncSession(oldSession: nil, newSession: Clerk.shared.session)
      for await event in Clerk.shared.auth.events {
        guard !Task.isCancelled else { break }
        if case .sessionChanged(let oldSession, let newSession) = event {
          await syncSession(oldSession: oldSession, newSession: newSession)
        }
      }
    }
  }

  private func syncSession(oldSession: Session?, newSession: Session?) async {
    guard let client else { return }
    let becameActive = newSession?.status == .active
      && (oldSession?.status != .active || oldSession?.id != newSession?.id)
    let removed = oldSession != nil && newSession == nil
    if becameActive {
      _ = await client.loginFromCache()
    } else if removed {
      await client.logout()
    }
  }
}
