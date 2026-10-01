#if canImport(UIKit)
import UIKit
import CoreText
import Foundation

/// Bounded memo for text measurement and typeset `CTLine`s.
///
/// Chart labels are drawn every frame but change rarely, so re-measuring and re-typesetting the
/// same strings dominated text cost at high frame rates. Entries are keyed by string + font
/// (+ resolved color for lines); each table is dropped wholesale once it reaches `limit`, which
/// keeps memory bounded while scrubbing mints new strings every frame. Fading labels cache their
/// line at full alpha; the caller applies the frame's alpha via `CGContext.setAlpha`.
final class LivelineTextCache: @unchecked Sendable {
  static let shared = LivelineTextCache()
  static let limit = 256

  private struct SizeKey: Hashable {
    let text: String
    let fontName: String
    let pointSize: CGFloat
  }

  private struct LineKey: Hashable {
    let size: SizeKey
    let color: String
  }

  struct Line {
    let line: CTLine
    let descent: CGFloat
  }

  private let lock = NSLock()
  private var sizes: [SizeKey: CGSize] = [:]
  private var lines: [LineKey: Line] = [:]

  var lineCount: Int {
    lock.lock()
    defer { lock.unlock() }
    return lines.count
  }

  var sizeCount: Int {
    lock.lock()
    defer { lock.unlock() }
    return sizes.count
  }

  func removeAll() {
    lock.lock()
    sizes.removeAll()
    lines.removeAll()
    lock.unlock()
  }

  func size(_ text: String, font: UIFont) -> CGSize {
    let key = SizeKey(text: text, fontName: font.fontName, pointSize: font.pointSize)
    lock.lock()
    if let hit = sizes[key] {
      lock.unlock()
      return hit
    }
    lock.unlock()
    let measured = (text as NSString).size(withAttributes: [.font: font])
    lock.lock()
    if sizes.count >= Self.limit { sizes.removeAll(keepingCapacity: true) }
    sizes[key] = measured
    lock.unlock()
    return measured
  }

  func line(_ text: String, font: UIFont, color: CGColor) -> Line {
    let key = LineKey(
      size: SizeKey(text: text, fontName: font.fontName, pointSize: font.pointSize),
      color: (color.components ?? []).map { String(format: "%.4f", $0) }.joined(separator: ",")
    )
    lock.lock()
    if let hit = lines[key] {
      lock.unlock()
      return hit
    }
    lock.unlock()
    let attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      kCTForegroundColorAttributeName as NSAttributedString.Key: color,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    var ascent: CGFloat = 0
    var descent: CGFloat = 0
    var leading: CGFloat = 0
    CTLineGetTypographicBounds(line, &ascent, &descent, &leading)
    let entry = Line(line: line, descent: descent)
    lock.lock()
    if lines.count >= Self.limit { lines.removeAll(keepingCapacity: true) }
    lines[key] = entry
    lock.unlock()
    return entry
  }
}
#endif
