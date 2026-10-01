import SwiftUI
import UIKit

/// Animation vocabulary. Every caller pairs these with `@Environment(\.accessibilityReduceMotion)`.
nonisolated enum Motion {
  static let ui: Animation = .snappy(duration: 0.22, extraBounce: 0)
  static let close: Animation = .easeOut(duration: 0.16)
  static let numeric: Animation = .snappy(duration: 0.25)

  static func animation(_ animation: Animation, reduceMotion: Bool) -> Animation? {
    reduceMotion ? nil : animation
  }
}

/// UserDefaults keys for device-local preferences.
nonisolated enum PreferenceKeys {
  static let reduceHaptics = "preferences.reduceHaptics"
}

/// Haptics fire only on committed navigation or committed selection, never on touch-down.
@MainActor
enum Haptics {
  private static let impact = UIImpactFeedbackGenerator(style: .light)
  private static let selectionGenerator = UISelectionFeedbackGenerator()
  private static let tapGenerator = UIImpactFeedbackGenerator(style: .medium)
  private static let notificationGenerator = UINotificationFeedbackGenerator()

  private static var reduced: Bool { UserDefaults.standard.bool(forKey: PreferenceKeys.reduceHaptics) }

  /// Light feedback for committed page navigation (not touch-down or a cancelled pull).
  static func pageChanged() {
    guard !reduced else { return }
    impact.impactOccurred(intensity: 0.65)
    impact.prepare()
  }

  /// The everyday tap for rows and toolbar actions.
  static func tap() {
    guard !reduced else { return }
    tapGenerator.impactOccurred()
    tapGenerator.prepare()
  }

  static func selection() {
    guard !reduced else { return }
    selectionGenerator.selectionChanged()
    // Selections arrive in runs (scrubs, pickers); keep the Taptic Engine warm for the next one.
    selectionGenerator.prepare()
  }

  /// A destructive confirmation is about to be asked.
  static func warning() {
    guard !reduced else { return }
    notificationGenerator.notificationOccurred(.warning)
  }

  /// A completed task.
  static func success() {
    guard !reduced else { return }
    notificationGenerator.notificationOccurred(.success)
  }
}
