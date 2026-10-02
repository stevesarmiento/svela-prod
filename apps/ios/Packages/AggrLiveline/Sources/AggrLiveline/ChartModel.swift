import CoreGraphics
import Foundation

public struct LivelinePoint: Sendable, Hashable, Codable {
  public var time: Double
  public var value: Double
  public init(time: Double, value: Double) { self.time = time; self.value = value }
}

public struct LivelineColor: Sendable, Hashable {
  public var red: Double, green: Double, blue: Double, alpha: Double
  public init(_ red: Double, _ green: Double, _ blue: Double, _ alpha: Double = 1) {
    self.red = red; self.green = green; self.blue = blue; self.alpha = alpha
  }
  public static let white = Self(1, 1, 1)
}

public struct LivelineSeries: Sendable, Equatable {
  public var id: String
  public var points: [LivelinePoint]
  public var color: LivelineColor
  public var width: Double
  public var dash: [Double]
  public var visible: Bool
  /// Visual emphasis without excluding the series from the range or scrubbing.
  public var opacity: Double
  var targetOpacity: Double { visible ? min(1, max(0, opacity)) : 0 }
  /// Data stays in its original units; rendering and range use this multiplier.
  public var multiplier: Double
  public init(id: String, points: [LivelinePoint], color: LivelineColor = .white,
              width: Double = 1.5, dash: [Double] = [], visible: Bool = true, multiplier: Double = 1, opacity: Double = 1) {
    self.id = id; self.points = points; self.color = color; self.width = width
    self.dash = dash; self.visible = visible; self.multiplier = multiplier; self.opacity = opacity
  }
}

public struct LivelineObservation: Sendable, Equatable {
  public var time: Double, value: Double
  public init(time: Double, value: Double) { self.time = time; self.value = value }
}

public enum LivelineViewport: Sendable, Equatable {
  case historical(ClosedRange<Double>)
  case liveWindow(seconds: Double)
}

public enum LivelineDataState: Sendable { case loading, ready, empty, placeholder }
public enum LivelineProfile: Sendable { case reference, aggr }
public enum LivelineHighlight: Sendable { case none, month, quarter }

public struct LivelineInput: Sendable, Equatable {
  /// Dataset identity includes token and committed timeframe; changing it clears inspection.
  public var id: String
  public var series: [LivelineSeries]
  public var primaryID: String
  public var viewport: LivelineViewport
  public var observation: LivelineObservation?
  public var volume: [LivelinePoint]
  public var band: (lower: String, upper: String)?
  public var projectionID: String?
  public var state: LivelineDataState
  public init(id: String, series: [LivelineSeries], primaryID: String = "price",
              viewport: LivelineViewport, observation: LivelineObservation? = nil,
              volume: [LivelinePoint] = [], band: (lower: String, upper: String)? = nil,
              projectionID: String? = nil, state: LivelineDataState = .ready) {
    self.id = id; self.series = series; self.primaryID = primaryID; self.viewport = viewport
    self.observation = observation; self.volume = volume; self.band = band
    self.projectionID = projectionID; self.state = state
  }
  public static func == (a: Self, b: Self) -> Bool {
    a.id == b.id && a.series == b.series && a.primaryID == b.primaryID && a.viewport == b.viewport
      && a.observation == b.observation && a.volume == b.volume && a.band?.lower == b.band?.lower
      && a.band?.upper == b.band?.upper && a.projectionID == b.projectionID && a.state == b.state
  }

  /// How one input differs from another, classified in a single pass over the series so hosts that
  /// re-send a snapshot every observation tick never pay for more than one point-array comparison.
  public enum Change: Sendable, Equatable {
    case none
    /// Only the live observation moved; history, overlays and viewport are unchanged.
    case observation
    /// Only series opacity (comparison emphasis) changed; geometry and the accessible data are unchanged.
    case emphasis
    case data
  }

  public func change(from other: Self) -> Change {
    guard id == other.id, primaryID == other.primaryID, viewport == other.viewport, state == other.state,
          projectionID == other.projectionID, band?.lower == other.band?.lower, band?.upper == other.band?.upper,
          series.count == other.series.count else { return .data }
    var opacityDiffers = false
    for (a, b) in zip(series, other.series) {
      guard a.id == b.id, a.color == b.color, a.width == b.width, a.dash == b.dash, a.visible == b.visible,
            a.multiplier == b.multiplier, a.points == b.points else { return .data }
      if a.opacity != b.opacity { opacityDiffers = true }
    }
    guard volume == other.volume else { return .data }
    let observationDiffers = observation != other.observation
    if opacityDiffers { return observationDiffers ? .data : .emphasis }
    return observationDiffers ? .observation : .none
  }
}

public struct LivelineConfiguration: Sendable, Equatable {
  /// Minimal plot insets for small, decorative charts embedded in cards.
  public var compact = false
  public var profile: LivelineProfile = .aggr
  public var fill = true
  public var grid = true
  public var timeAxis = true
  public var badge = true
  public var badgeTail = true
  public var minimalBadge = true
  public var dot = true
  public var pulse = true
  public var momentum = false
  public var scrub = true
  /// The engine's own scrub-start tick. Hosts that run per-point selection haptics
  /// (the token page) turn this off to avoid doubling up.
  public var scrubStartHaptic = true
  public var currentPriceGuide = false
  public var extrema = true
  public var referenceValue: Double?
  /// Series names for comparison crosshairs and multi-series accessibility.
  public var seriesLabels: [String: String] = [:]
  public var highlight: LivelineHighlight = .none
  public var paused = false
  public var reduceMotion = false
  public var exaggerate = false
  public var emptyText = "No chart data"
  public var lerpSpeed = 0.08
  public init() {}

  public static var sparkline: Self {
    var config = Self()
    config.compact = true
    config.fill = false
    config.grid = false
    config.timeAxis = false
    config.badge = false
    config.dot = false
    config.pulse = false
    config.scrub = false
    config.extrema = false
    return config
  }
}

public struct LivelineSelection: Sendable, Equatable {
  public var time: Double
  public var value: Double
  public var values: [String: Double]
  public var isProjection: Bool
  public var nearestObservation: LivelinePoint?
  /// Screen x of the crosshair in the chart view's coordinate space (the same x the renderer
  /// draws it at), so hosts can pin readouts to the drawn line instead of recomputing plot insets.
  /// Not part of equality: a layout-only change must not republish an unchanged readout.
  public var x: CGFloat?
  public init(time: Double, value: Double, values: [String: Double], isProjection: Bool,
              nearestObservation: LivelinePoint?, x: CGFloat? = nil) {
    self.time = time; self.value = value; self.values = values
    self.isProjection = isProjection; self.nearestObservation = nearestObservation; self.x = x
  }
  public static func == (a: Self, b: Self) -> Bool {
    a.time == b.time && a.value == b.value && a.values == b.values
      && a.isProjection == b.isProjection && a.nearestObservation == b.nearestObservation
  }
}
