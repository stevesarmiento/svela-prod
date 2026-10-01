import Foundation

/// Reuses configured `NumberFormatter`s. Building one loads ICU data and costs far more than
/// formatting with it, and price text is formatted per row, per cell, and per chart scrub step.
/// Formatting with a shared formatter is thread-safe; only the lookup is locked.
public enum NumberFormatterCache {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var formatters: [String: NumberFormatter] = [:]

  /// `key` must capture every setting `configure` applies, including the locale.
  public static func formatter(_ key: String, configure: (NumberFormatter) -> Void) -> NumberFormatter {
    lock.lock()
    defer { lock.unlock() }
    if let formatter = formatters[key] { return formatter }
    let formatter = NumberFormatter()
    configure(formatter)
    formatters[key] = formatter
    return formatter
  }
}
