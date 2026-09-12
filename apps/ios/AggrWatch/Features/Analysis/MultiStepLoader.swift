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
struct StreamingMarkdownText: View {
  let text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        switch block {
        case .heading(let level, let s):
          Text(inline(s)).font(level <= 2 ? .headline : .subheadline.weight(.semibold)).padding(.top, 4)
        case .bullet(let items):
          VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
              HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(.secondary)
                Text(inline(item))
              }
            }
          }
        case .paragraph(let s):
          Text(inline(s))
        }
      }
    }
    .font(.body)
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
  }

  private enum Block { case heading(Int, String), bullet([String]), paragraph(String) }

  private var blocks: [Block] {
    var out: [Block] = []
    var bullets: [String] = []
    var para: [String] = []
    func flushPara() { if !para.isEmpty { out.append(.paragraph(para.joined(separator: " "))); para = [] } }
    func flushBullets() { if !bullets.isEmpty { out.append(.bullet(bullets)); bullets = [] } }
    for raw in text.components(separatedBy: "\n") {
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.isEmpty { flushPara(); flushBullets(); continue }
      if line.hasPrefix("#") {
        flushPara(); flushBullets()
        let level = line.prefix(while: { $0 == "#" }).count
        out.append(.heading(level, String(line.drop(while: { $0 == "#" || $0 == " " }))))
      } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
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

  private func inline(_ s: String) -> AttributedString {
    (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
  }
}
