import AggrCore
import AggrLiveline
import Foundation
import Observation
import SwiftUI

/// Scrub selection shared by a chart and the readouts that follow it (the token header, the
/// comparison rows). Liveline reports selections from inside its render pass, so the write is
/// deduped and deferred out of the current view update.
///
/// Only horizontal movement counts as a new selection: a finger held still keeps the number and
/// the haptic stays quiet. Every point the scrub lands on ticks, like a picker wheel; release is
/// silent.
@Observable
class ChartScrubStore {
  var selection: LivelineSelection?
  /// Actual renderer coordinate, so a readout aligns with the crosshair and chart padding.
  private(set) var selectionX: CGFloat?
  /// Increments each time `selection` actually changes; lets tests prove the dedupe.
  private(set) var selectionRevision = 0
  /// A scrub has to travel this far before it counts as landing on a new point.
  static let scrubStepPoints: CGFloat = 1

  @ObservationIgnored private var pendingSelection: LivelineSelection?
  @ObservationIgnored private var pendingSelectionX: CGFloat?

  var isScrubbing: Bool { selection != nil }

  func setSelection(_ next: LivelineSelection?) {
    if let next, let x = next.x, let currentX = pendingSelectionX, abs(x - currentX) < Self.scrubStepPoints { return }
    pendingSelectionX = next?.x
    guard next != pendingSelection else { return }
    pendingSelection = next
    Task { @MainActor [weak self] in
      guard let self, self.pendingSelection == next, self.selection != next else { return }
      if next != nil { Haptics.selection() }
      self.selection = next
      self.selectionX = next?.x
      self.selectionRevision += 1
    }
  }

  /// The inspected value of one series, when that series is on the chart.
  func value(for id: String) -> Double? {
    guard let value = selection?.values[id], value.isFinite else { return nil }
    return value
  }
}

/// Scrub state for comparison charts, whose rows show a price and a return at the inspected
/// time instead of a tooltip that cannot fit many lines on a phone.
@Observable
final class ComparisonScrubStore: ChartScrubStore {
  /// Raw price history per row id, registered by the chart host; not observed, since rows only
  /// re-read it when the selection moves.
  @ObservationIgnored var prices: [String: [TimePoint]] = [:]
  /// Start of the charted window; row returns are measured from here.
  @ObservationIgnored var windowStart: Double?

  /// The price of `id` at the inspected time, linearly interpolated between samples.
  func price(for id: String) -> Double? {
    guard let time = selection?.time else { return nil }
    return Self.interpolate(prices[id] ?? [], at: time)
  }

  /// Return from the window start to the inspected time, for rows that are not chart series.
  func change(for id: String) -> Double? {
    guard let time = selection?.time, let start = windowStart, let points = prices[id],
          let base = Self.interpolate(points, at: start), base > 0,
          let current = Self.interpolate(points, at: time) else { return nil }
    return (current / base - 1) * 100
  }

  nonisolated static func interpolate(_ points: [TimePoint], at time: Double) -> Double? {
    guard let first = points.first, let last = points.last else { return nil }
    if time <= Double(first.epochSeconds) { return first.value }
    if time >= Double(last.epochSeconds) { return last.value }
    var low = 0, high = points.count - 1
    while high - low > 1 {
      let mid = (low + high) / 2
      if Double(points[mid].epochSeconds) <= time { low = mid } else { high = mid }
    }
    let a = points[low], b = points[high]
    let span = Double(b.epochSeconds - a.epochSeconds)
    guard span > 0 else { return b.value }
    let fraction = (time - Double(a.epochSeconds)) / span
    return a.value + (b.value - a.value) * fraction
  }
}
