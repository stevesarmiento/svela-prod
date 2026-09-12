import Foundation

/// Port of `convex/_lib/breadth.ts`.
public struct BreadthStats: Sendable, Hashable, Codable {
  public var advancers: Int
  public var decliners: Int
  public var flat: Int
  public var medianChangePct: Double
  public var spreadPct: Double
  public var bigMovers: Int

  public init(advancers: Int, decliners: Int, flat: Int, medianChangePct: Double, spreadPct: Double, bigMovers: Int) {
    self.advancers = advancers; self.decliners = decliners; self.flat = flat
    self.medianChangePct = medianChangePct; self.spreadPct = spreadPct; self.bigMovers = bigMovers
  }

  enum CodingKeys: String, CodingKey { case advancers, decliners, flat, medianChangePct, spreadPct, bigMovers }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    advancers = Int(try c.decode(Double.self, forKey: .advancers))
    decliners = Int(try c.decode(Double.self, forKey: .decliners))
    flat = Int(try c.decode(Double.self, forKey: .flat))
    medianChangePct = try c.decode(Double.self, forKey: .medianChangePct)
    spreadPct = try c.decode(Double.self, forKey: .spreadPct)
    bigMovers = Int(try c.decode(Double.self, forKey: .bigMovers))
  }

  public var total: Int { advancers + decliners + flat }

  static let flatBandPct = 0.5
  static let bigMovePct = 5.0

  public static func compute(_ changePcts: [Double]) -> BreadthStats? {
    let values = changePcts.filter { $0.isFinite }
    guard !values.isEmpty else { return nil }
    let sorted = values.sorted()
    func quantile(_ p: Double) -> Double {
      let idx = Double(sorted.count - 1) * p
      let lo = Int(idx.rounded(.down)), hi = Int(idx.rounded(.up))
      let loVal = sorted[lo], hiVal = sorted[hi]
      return loVal + (hiVal - loVal) * (idx - Double(lo))
    }
    var adv = 0, dec = 0, flat = 0
    for x in values {
      if x > flatBandPct { adv += 1 } else if x < -flatBandPct { dec += 1 } else { flat += 1 }
    }
    return BreadthStats(advancers: adv, decliners: dec, flat: flat, medianChangePct: quantile(0.5),
                        spreadPct: quantile(0.9) - quantile(0.1), bigMovers: values.filter { abs($0) >= bigMovePct }.count)
  }
}
