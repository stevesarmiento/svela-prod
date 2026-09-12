import Foundation

/// Values injected from `Config/*.xcconfig` → Info.plist. See `apps/app/src/env.client.mjs` for the web equivalents.
struct AppConfig: Sendable {
  let convexURL: String
  let clerkPublishableKey: String
  let apiBaseURL: URL

  static func load(bundle: Bundle = .main) -> AppConfig {
    func value(_ key: String) -> String {
      let raw = (bundle.object(forInfoDictionaryKey: key) as? String) ?? ""
      return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    let convex = value("CONVEX_URL")
    let clerk = value("CLERK_PUBLISHABLE_KEY")
    let api = value("API_BASE_URL")
    precondition(!convex.isEmpty, "CONVEX_URL missing from Info.plist (check Config/Debug.xcconfig)")
    precondition(!clerk.isEmpty, "CLERK_PUBLISHABLE_KEY missing from Info.plist (check Config/Debug.xcconfig)")
    guard let apiURL = URL(string: api.isEmpty ? "http://localhost:3000" : api) else {
      preconditionFailure("API_BASE_URL is not a valid URL: \(api)")
    }
    return AppConfig(convexURL: convex, clerkPublishableKey: clerk, apiBaseURL: apiURL)
  }
}
