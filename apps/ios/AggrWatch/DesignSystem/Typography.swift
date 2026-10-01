import SwiftUI
import UIKit

extension Font {
  /// Rounded design with monospaced digits: the font for every number in the app.
  static func number(_ style: Font.TextStyle = .subheadline, weight: Font.Weight = .semibold) -> Font {
    .system(style, design: .rounded, weight: weight).monospacedDigit()
  }

  static func number(size: CGFloat, weight: Font.Weight = .medium) -> Font {
    .system(size: size, weight: weight, design: .rounded).monospacedDigit()
  }
}

extension UIFont {
  /// The UIKit twin of `Font.number(size:weight:)`, for views that measure or draw around text.
  static func number(size: CGFloat, weight: UIFont.Weight) -> UIFont {
    let base = UIFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
    return UIFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: size)
  }
}
