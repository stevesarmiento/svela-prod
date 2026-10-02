import CoreGraphics
import Foundation

/// Reusable offscreen bitmaps for per-frame chart rendering.
///
/// Allocating a fresh `CGContext` (full pixel buffer + colorspace) on every display-link tick is
/// wasteful, so contexts are kept until the pixel dimensions change (resize or display-scale
/// change), which the caller detects simply by asking for a context of the current size.
///
/// Two contexts alternate. `CGContext.makeImage()` shares the bitmap's pixels copy-on-write, so
/// drawing the next frame into the same context while the layer still displays the previous image
/// forces a full bitmap copy. Drawing into the other buffer instead lets the previous image be
/// released before its context is touched again.
///
/// Usage contract per frame:
/// 1. `let ctx = buffer.context(pixelWidth:pixelHeight:)` (the same context until `swap()`)
/// 2. `ctx.clear(...)` the full pixel rect (the buffer holds the frame before last)
/// 3. wrap drawing in `saveGState()`/`restoreGState()` (CTM transforms would
///    otherwise compound across frames on a reused context)
/// 4. after `makeImage()` is handed to the layer, call `swap()`
@MainActor
final class LivelineRenderBuffer {
  private static let colorSpace = CGColorSpaceCreateDeviceRGB()

  private var contexts: [CGContext?] = [nil, nil]
  private var current = 0
  private var pixelWidth = 0
  private var pixelHeight = 0

  /// Returns the current bitmap context of the requested size, reusing it when dimensions match.
  func context(pixelWidth: Int, pixelHeight: Int) -> CGContext? {
    if pixelWidth != self.pixelWidth || pixelHeight != self.pixelHeight {
      contexts = [nil, nil]
      self.pixelWidth = pixelWidth
      self.pixelHeight = pixelHeight
    }
    if let context = contexts[current] { return context }
    let fresh = CGContext(
      data: nil,
      width: pixelWidth,
      height: pixelHeight,
      bitsPerComponent: 8,
      bytesPerRow: pixelWidth * 4,
      space: Self.colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    contexts[current] = fresh
    return fresh
  }

  /// Makes the other buffer current for the next frame.
  func swap() { current = 1 - current }
}
