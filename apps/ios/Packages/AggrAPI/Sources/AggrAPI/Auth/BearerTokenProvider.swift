import ClerkKit
import Foundation

/// Supplies a bearer JWT for outbound requests.
///
/// Two flavours exist and must never be mixed:
/// - ``ClerkDefaultTokenProvider`` → default Clerk session token, accepted by the Next.js `/api/*` routes.
/// - ``ClerkConvexTokenProvider`` → Clerk JWT template `"convex"` (aud: "convex"), the only token Convex accepts.
public protocol BearerTokenProvider: Sendable {
  func token(skipCache: Bool) async throws -> String?
}

public enum ClerkTokenError: LocalizedError, Sendable, Equatable {
  case notLoaded
  case noActiveSession
  case tokenUnavailable

  public var errorDescription: String? {
    switch self {
    case .notLoaded: "Clerk has not finished loading."
    case .noActiveSession: "No active Clerk session. Sign in first."
    case .tokenUnavailable: "Clerk returned no session token."
    }
  }
}

/// The Clerk JWT template name that mints tokens with `aud: "convex"`.
/// Mirrors `apps/app/src/lib/auth.ts` and `convex/auth.config.ts`.
public let convexJwtTemplate = "convex"

enum ClerkTokenFetcher {
  /// Waits (bounded) for Clerk to finish loading its client/environment.
  @MainActor
  static func waitUntilLoaded(timeout: Duration = .seconds(15)) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now + timeout
    while !Clerk.shared.isLoaded {
      if clock.now >= deadline { throw ClerkTokenError.notLoaded }
      try await Task.sleep(for: .milliseconds(100))
    }
  }

  @MainActor
  static func activeSession() throws -> Session {
    guard let session = Clerk.shared.session, session.status == .active else {
      throw ClerkTokenError.noActiveSession
    }
    return session
  }

  /// Fetches the default Clerk session token.
  @MainActor
  static func defaultToken(skipCache: Bool) async throws -> String {
    try await waitUntilLoaded()
    let session = try activeSession()
    guard let token = try await session.getToken(.init(skipCache: skipCache)), !token.isEmpty else {
      throw ClerkTokenError.tokenUnavailable
    }
    return token
  }

  /// Fetches the `"convex"` template token, falling back to the default token
  /// (mirrors the web client's `useAuthWithConvexTokenFallback`).
  @MainActor
  static func convexToken(skipCache: Bool) async throws -> String {
    try await waitUntilLoaded()
    let session = try activeSession()
    if let templated = try? await session.getToken(.init(template: convexJwtTemplate, skipCache: skipCache)),
       !templated.isEmpty {
      return templated
    }
    guard let token = try await session.getToken(.init(skipCache: skipCache)), !token.isEmpty else {
      throw ClerkTokenError.tokenUnavailable
    }
    return token
  }
}

/// Default session token → use for the Next.js API routes only.
public struct ClerkDefaultTokenProvider: BearerTokenProvider {
  public init() {}
  public func token(skipCache: Bool) async throws -> String? {
    try await ClerkTokenFetcher.defaultToken(skipCache: skipCache)
  }
}

/// `"convex"` template token → use for Convex only.
public struct ClerkConvexTokenProvider: BearerTokenProvider {
  public init() {}
  public func token(skipCache: Bool) async throws -> String? {
    try await ClerkTokenFetcher.convexToken(skipCache: skipCache)
  }
}
