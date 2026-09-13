import AggrCore
import SwiftUI

/// Port of `components/tick-meter.tsx`: 1.5pt ticks every 4pt; dim base (0.25) + bright fill clipped to
/// [min(origin, value), max(origin, value)]. Decorative — always show the value as text beside it.
struct TickMeter: View {
  enum Origin { case min, value(Double) }
  let value: Double
  let min: Double
  let max: Double
  var origin: Origin = .min
  var color: Color = .primary

  var body: some View {
    Canvas { ctx, size in
      guard value.isFinite, max > min else { return }
      func pct(_ v: Double) -> Double { Swift.min(100, Swift.max(0, (v - min) / (max - min) * 100)) }
      let originPct: Double = { if case .value(let o) = origin { return pct(o) } else { return 0 } }()
      let valuePct = pct(value)
      let left = Swift.min(originPct, valuePct) / 100 * size.width
      let right = Swift.max(originPct, valuePct) / 100 * size.width
      var x: CGFloat = 0
      while x < size.width {
        let tick = Path(CGRect(x: x, y: 0, width: 1.5, height: size.height))
        ctx.fill(tick, with: .color(color.opacity(0.25)))
        if x + 1.5 > left && x < right { ctx.fill(tick, with: .color(color)) }
        x += 4
      }
    }
    .frame(width: 64, height: 10)
    .accessibilityHidden(true)
  }
}

/// Advancers / flat / decliners split in the tick-meter idiom.
struct TickSplitBar: View {
  let breadth: BreadthStats
  var body: some View {
    let total = Double(Swift.max(1, breadth.total))
    GeometryReader { geo in
      HStack(spacing: 0) {
        segment(count: breadth.advancers, total: total, width: geo.size.width, color: Color.gainGreen.opacity(0.9))
        segment(count: breadth.flat, total: total, width: geo.size.width, color: Color.white.opacity(0.25))
        segment(count: breadth.decliners, total: total, width: geo.size.width, color: Color.lossRed.opacity(0.9))
      }
    }
    .frame(height: 8)
    .accessibilityLabel("\(breadth.advancers) advancing, \(breadth.flat) flat, \(breadth.decliners) declining")
  }

  @ViewBuilder
  private func segment(count: Int, total: Double, width: CGFloat, color: Color) -> some View {
    let w = width * CGFloat(Double(count) / total)
    Canvas { ctx, size in
      var x: CGFloat = 0
      while x < size.width { ctx.fill(Path(CGRect(x: x, y: 0, width: 1.5, height: size.height)), with: .color(color)); x += 4 }
    }
    .frame(width: w, height: 8)
  }
}

struct StatTile: View {
  let value: String
  let label: String
  var tint: Color = .primary
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value).font(.system(.subheadline, design: .rounded).monospacedDigit().weight(.semibold)).foregroundStyle(tint).lineLimit(1)
      Text(label.uppercased()).font(.system(size: 10)).tracking(0.6).foregroundStyle(.secondary).lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

#if DEBUG
#Preview("Meters and breadth") {
  VStack(spacing: 24) {
    TickMeter(value: 68, min: 0, max: 100, origin: .value(50), color: .gainGreen).frame(height: 12)
    TickMeter(value: -4, min: -10, max: 10, origin: .value(0), color: .lossRed).frame(height: 12)
    TickSplitBar(breadth: BreadthStats.compute([2.84, -1.32, 6.12, 0])!)
    HStack { StatTile(value: "24", label: "Up", tint: .gainGreen); StatTile(value: "8", label: "Down", tint: .lossRed) }
  }.padding().preferredColorScheme(.dark)
}
#endif
