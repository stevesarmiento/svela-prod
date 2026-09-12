import Foundation

/// Port of `apps/app/src/lib/user-display.ts`.
public enum UserDisplay {
  public static func formatWalletAddress(_ address: String?) -> String {
    guard let value = address?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return "" }
    if value.count <= 8 { return value }
    return "\(value.prefix(3))...\(value.suffix(3))"
  }

  public static func displayName(fullName: String?, email: String?, walletAddress: String?, fallback: String = "User") -> String {
    if let fullName = fullName?.trimmingCharacters(in: .whitespacesAndNewlines), !fullName.isEmpty { return fullName }
    if let local = email?.split(separator: "@").first.map({ String($0).trimmingCharacters(in: .whitespaces) }), !local.isEmpty { return local }
    let wallet = formatWalletAddress(walletAddress)
    if !wallet.isEmpty { return wallet }
    return fallback
  }
}
