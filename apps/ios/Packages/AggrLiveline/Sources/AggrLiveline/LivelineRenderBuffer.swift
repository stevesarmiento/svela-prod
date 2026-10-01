import CoreGraphics
import Foundation

/// Reusable offscreen bitmap for per-frame chart rendering.
///
/// Allocating a fresh `CGContext` (full pixel buffer + colorspace) on every display-link tick is
/// wasteful. This holder reuses one context until the pixel dimensions change (resize or
/// display-scale change), which the caller detects simply by asking for a context of the
/// current size.
///
/// Usage contract per frame:
/// 1. `let ctx = buffer.context(pixelWidth:pixelHeight:)`
/// 2. `ctx.clear(...)` the full pixel rect (the buffer holds last frame's pixels)
/// 3. wrap drawing in `saveGState()`/`restoreGState()` (CTM transforms would
///    otherwise compound across frames on a reused context)
@MainActor
final class LivelineRenderBuffer {
  private static let colorSpace = CGColorSpaceCreateDeviceRGB()

  private var context: CGContext?
  private var pixelWidth = 0
  private var pixelHeight = 0

  /// Returns a bitmap context of the requested size, reusing the previous one
  /// when dimensions match.
  func context(pixelWidth: Int, pixelHeight: Int) -> CGContext? {
    if let context, pixelWidth == self.pixelWidth, pixelHeight == self.pixelHeight {
      return context
    }
    let fresh = CGContext(
      data: nil,
      width: pixelWidth,
      height: pixelHeight,
      bitsPerComponent: 8,
      bytesPerRow: pixelWidth * 4,
      space: Self.colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    context = fresh
    self.pixelWidth = pixelWidth
    self.pixelHeight = pixelHeight
    return fresh
  }
}
