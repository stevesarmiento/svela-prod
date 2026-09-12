import Foundation

/// `apps/app/convex/userSettings.ts` — `getMyUserSettings` / `upsertMyUserSettings`.
public struct UserSettings: Codable, Sendable, Hashable {
  public var memoryEnabled: Bool
  public var autoCleanupEnabled: Bool
  public var retentionDays: String
  public var theme: String
  public var currency: String
  public var dateFormat: String
  public var emailNotifications: Bool
  public var pushNotifications: Bool
  public var priceAlerts: Bool
  public var analyticsEnabled: Bool
  public var shareUsageData: Bool

  public static let defaults = UserSettings(memoryEnabled: true, autoCleanupEnabled: false, retentionDays: "30", theme: "system", currency: "USD",
                                            dateFormat: "MM/DD/YYYY", emailNotifications: true, pushNotifications: true, priceAlerts: true,
                                            analyticsEnabled: true, shareUsageData: false)
}

@MainActor
public struct SettingsRepository: Sendable {
  private let convex: ConvexService
  public init(convex: ConvexService) { self.convex = convex }

  public func settings() -> AsyncThrowingStream<UserSettings, Error> {
    convex.subscribe("userSettings:getMyUserSettings", args: [:])
  }

  /// Partial update; only provided keys are sent (server keeps the rest).
  public func update(_ patch: [String: Bool]) async throws {
    var args: ConvexArgs = [:]
    for (k, v) in patch { args[k] = v }
    try await convex.mutation("userSettings:upsertMyUserSettings", args: args)
  }
}
