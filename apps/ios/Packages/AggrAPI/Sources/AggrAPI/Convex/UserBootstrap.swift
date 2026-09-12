import ClerkKit
import Foundation
import Observation

@MainActor
@Observable
public final class UserBootstrap {
  public private(set) var bootstrappedUserId: String?
  public private(set) var lastError: String?
  public private(set) var isLoading = false
  private var generation = 0
  private let currentUserId: () -> String?
  private let isAuthenticated: () -> Bool
  private let upsert: () async throws -> Void
  private let retryDelay: Duration

  public convenience init(convex: ConvexService) {
    self.init(currentUserId: { Clerk.shared.user?.id }, isAuthenticated: { convex.authStatus == .authenticated }) {
      guard let user = Clerk.shared.user else { throw CancellationError() }
      var args: ConvexArgs = [:]
      if let email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses.first?.emailAddress, !email.isEmpty { args["email"] = email }
      let name = [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")
      if !name.isEmpty { args["fullName"] = name }
      if user.hasImage { args["avatarUrl"] = user.imageUrl }
      let _: String = try await convex.mutation("users:upsertCurrentUser", args: args)
    }
  }

  init(currentUserId: @escaping () -> String?, isAuthenticated: @escaping () -> Bool,
       retryDelay: Duration = .milliseconds(500), upsert: @escaping () async throws -> Void) {
    self.currentUserId = currentUserId; self.isAuthenticated = isAuthenticated
    self.retryDelay = retryDelay; self.upsert = upsert
  }

  public func bootstrapIfNeeded() async {
    guard isAuthenticated(), let userID = currentUserId(), bootstrappedUserId != userID, !isLoading else { return }
    let generation = self.generation
    isLoading = true; lastError = nil
    defer { if self.generation == generation { isLoading = false } }
    for attempt in 0..<3 {
      do {
        try Task.checkCancellation()
        guard self.generation == generation, currentUserId() == userID, isAuthenticated() else { return }
        try await upsert()
        try Task.checkCancellation()
        guard self.generation == generation, currentUserId() == userID else { return }
        bootstrappedUserId = userID; lastError = nil
        return
      } catch is CancellationError { return }
      catch {
        guard !Task.isCancelled, self.generation == generation, currentUserId() == userID else { return }
        if attempt == 2 { lastError = error.localizedDescription; return }
        do { try await Task.sleep(for: retryDelay * (attempt + 1)) } catch { return }
      }
    }
  }

  public func reset() {
    generation += 1
    bootstrappedUserId = nil; lastError = nil; isLoading = false
  }
}
