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
      } else if let title = boldLineTitle(line) {
        // Reports title their sections with a bold line ("**Signal Hierarchy**"), not `#` headings.
        flushPara(); flushBullets()
        out.append(.heading(2, inline(title)))
      } else if let item = bulletItem(line) {
        flushPara()
        bullets.append(item)
      } else {
        flushBullets()
        para.append(line)
      }
    }
    flushPara(); flushBullets()
    return out
  }

  /// The item text after one bullet marker ("- ", "* ", "• ", "– " or "1. "). Only the marker is
  /// removed, so a bold label that follows it ("**Primary Signal**: …") keeps its asterisks.
  private nonisolated static func bulletItem(_ line: String) -> String? {
    for marker in ["- ", "* ", "• ", "– "] where line.hasPrefix(marker) {
      return String(line.dropFirst(marker.count)).trimmingCharacters(in: .whitespaces)
    }
    guard isOrderedItem(line), let dot = line.firstIndex(of: ".") else { return nil }
    return String(line[line.index(after: dot)...]).trimmingCharacters(in: .whitespaces)
  }

  /// `^\d+\.\s` without a regular expression per line.
  private nonisolated static func isOrderedItem(_ line: String) -> Bool {
    var index = line.startIndex
    while index < line.endIndex, line[index].isNumber { index = line.index(after: index) }
    guard index > line.startIndex, index < line.endIndex, line[index] == "." else { return false }
    let next = line.index(after: index)
    return next < line.endIndex && line[next].isWhitespace
  }

  /// A line that is one bold run and nothing else (an optional trailing colon allowed).
  private nonisolated static func boldLineTitle(_ line: String) -> String? {
    guard line.hasPrefix("**"), line.count > 4 else { return nil }
    var body = line.dropFirst(2)
    if body.hasSuffix(":") { body = body.dropLast() }
    guard body.hasSuffix("**") else { return nil }
    body = body.dropLast(2)
    if body.hasSuffix(":") { body = body.dropLast() }
    guard !body.isEmpty, !body.contains("**") else { return nil }
    return String(body)
  }

  private nonisolated static func inline(_ s: String) -> AttributedString {
    guard var attributed = try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) else {
      return AttributedString(s)
    }
    // Bold labels inside body copy carry the hierarchy (the web renders `strong` in white);
    // an explicit color beats the half-opacity style the paragraph applies.
    for run in attributed.runs where run.inlinePresentationIntent?.contains(.stronglyEmphasized) == true {
      attributed[run.range].foregroundColor = StreamingMarkdownText.headingColor
    }
    return attributed
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
