#if canImport(UIKit)
import UIKit
import CoreText
import Foundation

/// Bounded memo for text measurement and typeset `CTLine`s.
///
/// Chart labels are drawn every frame but change rarely, so re-measuring and re-typesetting the
/// same strings dominated text cost at high frame rates. Entries are keyed by string + font
/// (+ resolved color for lines). Each table evicts its least recently used half once it reaches
/// `limit`, so stable axis labels survive the stream of volatile badge/scrub strings. Fading labels
/// cache their line at full alpha; the caller applies the frame's alpha via `CGContext.setAlpha`.
final class LivelineTextCache: @unchecked Sendable {
  static let shared = LivelineTextCache()
  static let limit = 256

  private struct SizeKey: Hashable {
    let text: String
    let fontName: String
    let pointSize: CGFloat
  }

  /// Color components as a value key; gray-space colors expand to RGB.
  private struct ColorKey: Hashable {
    let red: Double, green: Double, blue: Double, alpha: Double
    init(_ color: CGColor) {
      let c = color.components ?? []
      switch c.count {
      case 2: red = c[0]; green = c[0]; blue = c[0]; alpha = c[1]
      case 4...: red = c[0]; green = c[1]; blue = c[2]; alpha = c[3]
      case 3: red = c[0]; green = c[1]; blue = c[2]; alpha = 1
      case 1: red = c[0]; green = c[0]; blue = c[0]; alpha = 1
      default: red = 0; green = 0; blue = 0; alpha = color.alpha
      }
    }
  }

  private struct LineKey: Hashable {
    let size: SizeKey
    let color: ColorKey
  }

  struct Line {
    let line: CTLine
    let descent: CGFloat
  }

  private struct Entry<Value> {
    var value: Value
    var used: UInt64
  }

  private let lock = NSLock()
  private var clock: UInt64 = 0
  private var sizes: [SizeKey: Entry<CGSize>] = [:]
  private var lines: [LineKey: Entry<Line>] = [:]

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

  /// Drops the least recently used half of `table`. Called with the lock held.
  private static func evict<K, V>(_ table: inout [K: Entry<V>]) {
    let cutoff = table.values.map(\.used).sorted()[table.count / 2]
    table = table.filter { $0.value.used >= cutoff }
  }

  func size(_ text: String, font: UIFont) -> CGSize {
    let key = SizeKey(text: text, fontName: font.fontName, pointSize: font.pointSize)
    lock.lock()
    clock += 1
    if let hit = sizes[key]?.value {
      sizes[key]!.used = clock
      lock.unlock()
      return hit
    }
    lock.unlock()
    let measured = (text as NSString).size(withAttributes: [.font: font])
    lock.lock()
    if sizes.count >= Self.limit { Self.evict(&sizes) }
    sizes[key] = Entry(value: measured, used: clock)
    lock.unlock()
    return measured
  }

  func line(_ text: String, font: UIFont, color: CGColor) -> Line {
    let key = LineKey(size: SizeKey(text: text, fontName: font.fontName, pointSize: font.pointSize), color: ColorKey(color))
    lock.lock()
    clock += 1
    if let hit = lines[key]?.value {
      lines[key]!.used = clock
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
    if lines.count >= Self.limit { Self.evict(&lines) }
    lines[key] = Entry(value: entry, used: clock)
    lock.unlock()
    return entry
  }
}
#endif
