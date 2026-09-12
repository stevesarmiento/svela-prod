import Foundation
@preconcurrency import ConvexMobile

/// Sendable argument dictionary for Convex calls. `String`, `Double`, `Bool`, `Int` all qualify;
/// use ``ConvexArray`` / ``ConvexObject`` for nested values.
public typealias ConvexArgs = [String: (any ConvexEncodable & Sendable)?]

extension ConvexArgs {
  /// Converts to the exact dictionary type the ConvexMobile SDK extends.
  func toSDKArgs() -> [String: ConvexEncodable?] {
    var out: [String: ConvexEncodable?] = [:]
    for (k, v) in self { out[k] = v.map { $0 as ConvexEncodable } }
    return out
  }
}

/// A Sendable array argument (e.g. `coinIds: [String]`).
public struct ConvexArray: ConvexEncodable, Sendable {
  public var values: [(any ConvexEncodable & Sendable)?]
  public init(_ values: [(any ConvexEncodable & Sendable)?]) { self.values = values }
  public init(strings: [String]) { self.values = strings.map { $0 } }
  public init(doubles: [Double]) { self.values = doubles.map { $0 } }
  public func convexEncode() throws -> String {
    try values.map { $0.map { $0 as ConvexEncodable } }.convexEncode()
  }
}

/// A Sendable nested object argument.
public struct ConvexObject: ConvexEncodable, Sendable {
  public var fields: ConvexArgs
  public init(_ fields: ConvexArgs) { self.fields = fields }
  public func convexEncode() throws -> String {
    try fields.toSDKArgs().convexEncode()
  }
}
