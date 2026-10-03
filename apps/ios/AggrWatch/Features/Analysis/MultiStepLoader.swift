import SwiftUI

/// Port of `@v1/ui/mult-step-loader`: cycles through step labels while a stream has not produced text yet.
struct MultiStepLoader: View {
  let steps: [String]
  var interval: Duration = .milliseconds(1800)
  @State private var index = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(visible.enumerated()), id: \.element) { _, step in
        let i = steps.firstIndex(of: step) ?? 0
        HStack(spacing: 10) {
          Image(systemName: i < index ? "checkmark.circle.fill" : (i == index ? "circle.dotted" : "circle"))
            .foregroundStyle(i < index ? Color.gainGreen : (i == index ? .primary : .secondary))
            .symbolEffect(.pulse, isActive: i == index)
          Text(step).font(i == index ? .subheadline.weight(.semibold) : .subheadline)
            .foregroundStyle(i == index ? .primary : .secondary)
        }
        .opacity(i == index ? 1 : (i < index ? 0.55 : 0.35))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 24)
    .animation(.easeInOut(duration: 0.3), value: index)
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: interval)
        if index < steps.count - 1 { index += 1 }
      }
    }
  }

  /// Show a window of up to 4 steps around the active one.
  private var visible: [String] {
    guard !steps.isEmpty else { return [] }
    let start = max(0, min(index - 1, steps.count - 4))
    return Array(steps[start..<min(steps.count, start + 4)])
  }
}

/// Lightweight streaming Markdown: paragraphs, headings, bullet lists, inline emphasis/code.
///
/// Parsing is incremental: blocks before the last blank line are final (every block flushes at a
/// blank line) and are kept; only the unfinished tail is re-parsed as chunks stream in.
struct StreamingMarkdownText: View {
  let text: String
  @State private var parser = StreamingMarkdownParser()
  /// Headings carry the structure in full white; body copy sits back at half opacity.
  static let headingColor = Color.white
  static let bodyColor = Color.white.opacity(0.5)
  static let bulletColor = Color.white.opacity(0.3)

  var body: some View {
    let blocks = parser.blocks(for: text)
    VStack(alignment: .leading, spacing: 12) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        switch block {
        case .heading(let level, let s):
          Text(s).font(level <= 2 ? .title3.weight(.semibold) : .headline)
            .foregroundStyle(Self.headingColor)
            .padding(.top, 8)
        case .bullet(let items):
          VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
              HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(Self.bulletColor)
                Text(item).lineSpacing(5).foregroundStyle(Self.bodyColor)
              }
            }
          }
        case .paragraph(let s):
          Text(s).lineSpacing(5).foregroundStyle(Self.bodyColor)
        }
      }
    }
    .font(.body)
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
  }
}

/// Unobserved memo of the parsed report. Inline Markdown is rendered to `AttributedString` once per block.
@MainActor final class StreamingMarkdownParser {
  enum Block { case heading(Int, AttributedString), bullet([AttributedString]), paragraph(AttributedString) }

  private var lastText = ""
  private var lastBlocks: [Block] = []
  /// Text up to and including the last blank line; its blocks are final.
  private var stableText = ""
  private var stableBlocks: [Block] = []

  func blocks(for text: String) -> [Block] {
    if text == lastText { return lastBlocks }
    if !text.hasPrefix(stableText) {
      // A regenerated or replaced report: start over.
      stableText = ""; stableBlocks = []
    }
    let boundary = text.range(of: "\n\n", options: .backwards)?.upperBound ?? text.startIndex
    let stableEnd = text.index(text.startIndex, offsetBy: stableText.count)
    if boundary > stableEnd {
      // Blocks between the old and new boundary are complete; append them once.
      stableBlocks += Self.parse(text[stableEnd..<boundary])
      stableText = String(text[..<boundary])
    }
    lastBlocks = stableBlocks + Self.parse(text[boundary...])
    lastText = text
    return lastBlocks
  }

  nonisolated static func parse(_ text: Substring) -> [Block] {
    var out: [Block] = []
    var bullets: [String] = []
    var para: [String] = []
    func flushPara() { if !para.isEmpty { out.append(.paragraph(inline(para.joined(separator: " ")))); para = [] } }
    func flushBullets() { if !bullets.isEmpty { out.append(.bullet(bullets.map(inline))); bullets = [] } }
    for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.isEmpty { flushPara(); flushBullets(); continue }
      if line.hasPrefix("#") {
        flushPara(); flushBullets()
        let level = line.prefix(while: { $0 == "#" }).count
        out.append(.heading(level, inline(String(line.drop(while: { $0 == "#" || $0 == " " })))))
      } else if line.hasPrefix("- ") || line.hasPrefix("* ") || isOrderedItem(line) {
        flushPara()
        bullets.append(String(line.drop(while: { $0 == "-" || $0 == "*" || $0.isNumber || $0 == "." || $0 == " " })))
      } else {
        flushBullets()
        para.append(line)
      }
    }
    flushPara(); flushBullets()
    return out
  }

  /// `^\d+\.\s` without a regular expression per line.
  private nonisolated static func isOrderedItem(_ line: String) -> Bool {
    var index = line.startIndex
    while index < line.endIndex, line[index].isNumber { index = line.index(after: index) }
    guard index > line.startIndex, index < line.endIndex, line[index] == "." else { return false }
    let next = line.index(after: index)
    return next < line.endIndex && line[next].isWhitespace
  }

  private nonisolated static func inline(_ s: String) -> AttributedString {
    (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
  }
}

#if DEBUG
#Preview("Analysis progress") {
  MultiStepLoader(steps: AnalysisSession.singleSteps).padding().preferredColorScheme(.dark)
}
#Preview("Markdown report") {
  ScrollView { StreamingMarkdownText(text: PreviewData.analysisText).padding() }.preferredColorScheme(.dark)
}
#endif
