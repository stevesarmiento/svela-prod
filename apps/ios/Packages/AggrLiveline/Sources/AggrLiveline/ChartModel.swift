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
  /// Data stays in its original units; rendering and range use this multiplier.
  public var multiplier: Double
  public init(id: String, points: [LivelinePoint], color: LivelineColor = .white,
              width: Double = 1.5, dash: [Double] = [], visible: Bool = true, multiplier: Double = 1) {
    self.id = id; self.points = points; self.color = color; self.width = width
    self.dash = dash; self.visible = visible; self.multiplier = multiplier
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
  public var dimAfterScrub = false
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
  public init(time: Double, value: Double, values: [String: Double], isProjection: Bool, nearestObservation: LivelinePoint?) {
    self.time = time; self.value = value; self.values = values
    self.isProjection = isProjection; self.nearestObservation = nearestObservation
  }
}
