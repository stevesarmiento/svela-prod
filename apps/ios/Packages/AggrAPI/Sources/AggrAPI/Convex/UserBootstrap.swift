import ClerkKit
import Foundation
import Observation

/// Mirrors `UserBootstrap` in `apps/app/src/components/providers/convex-provider.tsx`:
/// once Convex auth is live for a Clerk user, upsert the `users` row. Without this every
/// identity-tier query (`*My*`) returns empty.
@MainActor
@Observable
public final class UserBootstrap {
  public private(set) var bootstrappedUserId: String?
  public private(set) var lastError: String?

  private let convex: ConvexService

  public init(convex: ConvexService) {
    self.convex = convex
  }

  /// Idempotent per user id. Safe to call from `.task`/`onChange` whenever auth state changes.
  public func bootstrapIfNeeded() async {
    guard convex.authStatus == .authenticated, let user = Clerk.shared.user else { return }
    guard bootstrappedUserId != user.id else { return }
    bootstrappedUserId = user.id
    let email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses.first?.emailAddress
    let fullName = [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")
    var args: ConvexArgs = [:]
    if let email, !email.trimmingCharacters(in: .whitespaces).isEmpty { args["email"] = email }
    if !fullName.isEmpty { args["fullName"] = fullName }
    if user.hasImage { args["avatarUrl"] = user.imageUrl }
    do {
      let _: String = try await convex.mutation("users:upsertCurrentUser", args: args)
      lastError = nil
    } catch {
      bootstrappedUserId = nil
      lastError = error.localizedDescription
    }
  }

  public func reset() {
    bootstrappedUserId = nil
  }
}
