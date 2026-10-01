import SwiftUI

extension View {
  /// Fades the leading and trailing `width` points to transparent so horizontally scrolling
  /// content slides out of view instead of being cut off at the edge. Size the fade to the
  /// content's horizontal inset so nothing is dimmed at rest.
  func horizontalEdgeFade(_ width: CGFloat) -> some View {
    mask {
      HStack(spacing: 0) {
        LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
          .frame(width: width)
        Color.black
        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
          .frame(width: width)
      }
    }
  }
}
