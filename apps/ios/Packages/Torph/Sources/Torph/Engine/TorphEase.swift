import Foundation
import Synchronization

/// The curve a morph runs on. Bezier curves take the caller's duration; a spring settles on its own physics.
public enum TorphEase: Hashable, Sendable {
    case cubicBezier(Double, Double, Double, Double)
    case spring(stiffness: Double, damping: Double, mass: Double)
    case linear

    /// torph's default: `cubic-bezier(0.19, 1, 0.22, 1)`.
    public static let standard = TorphEase.cubicBezier(0.19, 1, 0.22, 1)

    public static func spring(stiffness: Double = 100, damping: Double = 10) -> TorphEase {
        .spring(stiffness: stiffness, damping: damping, mass: 1)
    }

    /// Duration the morph actually runs: the caller's for a curve, the settle time for a spring.
    public func resolvedDuration(fallback: TimeInterval) -> TimeInterval {
        switch self {
        case .cubicBezier, .linear:
            return fallback
        case .spring(let stiffness, let damping, let mass):
            return SpringMath.curve(stiffness: stiffness, damping: damping, mass: mass).duration
        }
    }

    /// Eased progress at a fraction of the duration.
    public func progress(atTimeFraction f: Double) -> Double {
        switch self {
        case .linear:
            return min(max(f, 0), 1)
        case .cubicBezier(let x1, let y1, let x2, let y2):
            return CubicBezier(x1: x1, y1: y1, x2: x2, y2: y2).value(f)
        case .spring(let stiffness, let damping, let mass):
            return SpringMath.curve(stiffness: stiffness, damping: damping, mass: mass).progress(atTimeFraction: f)
        }
    }

    /// The fraction of the duration at which the curve reaches `p`. torph runs its fades on the
    /// clock, not on the eased value, so a fade window is a time window and the renderer needs to
    /// know how far into it the eased progress has come. Monotone curves invert exactly; a spring
    /// that overshoots is approximated by its first crossing.
    public func timeFraction(atProgress p: Double) -> Double {
        let p = min(max(p, 0), 1)
        if p <= 0 { return 0 }
        if p >= 1 { return 1 }
        switch self {
        case .linear:
            return p
        case .cubicBezier(let x1, let y1, let x2, let y2) where (0...1).contains(y1) && (0...1).contains(y2):
            // With both control points inside the unit square y(t) never decreases, so the curve
            // inverts in one search along t. The renderer asks this once per segment per frame; the
            // search-around-a-search below cost 768 curve evaluations each time.
            return CubicBezier(x1: x1, y1: y1, x2: x2, y2: y2).time(atValue: p)
        case .spring(let stiffness, let damping, let mass):
            // The spring's inversion is tabulated once per parameter set (see `SpringCurve`).
            return SpringMath.curve(stiffness: stiffness, damping: damping, mass: mass).timeFraction(atProgress: p)
        case .cubicBezier:
            var lo = 0.0
            var hi = 1.0
            for _ in 0..<32 {
                let mid = (lo + hi) / 2
                if progress(atTimeFraction: mid) < p { lo = mid } else { hi = mid }
            }
            return (lo + hi) / 2
        }
    }
}

struct CubicBezier {
    let x1: Double, y1: Double, x2: Double, y2: Double

    private static func axis(_ p1: Double, _ p2: Double, _ t: Double) -> Double {
        let u = 1 - t
        return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
    }

    /// y at a given x, by bisection on the (monotone) x axis — torph's `cubicBezier`.
    func value(_ t: Double) -> Double {
        if t <= 0 { return 0 }
        if t >= 1 { return 1 }
        var lo = 0.0
        var hi = 1.0
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if Self.axis(x1, x2, mid) < t { lo = mid } else { hi = mid }
        }
        return Self.axis(y1, y2, (lo + hi) / 2)
    }

    /// x at a given y, for curves whose y axis is monotone: the parameter where y(t) = `value`,
    /// read back on the x axis.
    func time(atValue value: Double) -> Double {
        if value <= 0 { return 0 }
        if value >= 1 { return 1 }
        var lo = 0.0
        var hi = 1.0
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if Self.axis(y1, y2, mid) < value { lo = mid } else { hi = mid }
        }
        return Self.axis(x1, x2, (lo + hi) / 2)
    }
}

/// A spring's settle time and first-crossing table, computed once per parameter set. The renderer
/// asks for the eased progress and its inverse once per segment per frame; settling alone walks
/// up to 10 000 steps, and inverting it bisected 32 times over that.
struct SpringCurve: Sendable {
    let duration: TimeInterval
    let omega0: Double
    let zeta: Double
    /// The running maximum of the position at evenly spaced time fractions: the first time the
    /// spring reaches each progress, so an overshoot inverts to its first crossing.
    let envelope: [Double]

    static let samples = 512

    init(stiffness: Double, damping: Double, mass: Double, precision: Double) {
        omega0 = (stiffness / mass).squareRoot()
        zeta = damping / (2 * (stiffness * mass).squareRoot())
        duration = SpringMath.computeSettlingDuration(omega0: omega0, zeta: zeta, precision: precision)
        var envelope = [Double]()
        envelope.reserveCapacity(Self.samples + 1)
        var peak = 0.0
        for i in 0...Self.samples {
            let f = Double(i) / Double(Self.samples)
            let value = f >= 1 ? 1 : SpringMath.position(t: f * duration, omega0: omega0, zeta: zeta)
            peak = max(peak, value)
            envelope.append(peak)
        }
        self.envelope = envelope
    }

    func progress(atTimeFraction f: Double) -> Double {
        f >= 1 ? 1 : SpringMath.position(t: f * duration, omega0: omega0, zeta: zeta)
    }

    /// The time fraction at which the spring first reaches `p` (0 < p < 1), interpolated in the table.
    func timeFraction(atProgress p: Double) -> Double {
        var lo = 0
        var hi = envelope.count - 1
        while lo < hi {
            let mid = (lo + hi) / 2
            if envelope[mid] < p { lo = mid + 1 } else { hi = mid }
        }
        guard lo > 0 else { return 0 }
        let a = envelope[lo - 1]
        let b = envelope[lo]
        let within = b > a ? (p - a) / (b - a) : 1
        return (Double(lo - 1) + within) / Double(Self.samples)
    }
}

enum SpringMath {
    private struct Key: Hashable {
        let stiffness: Double
        let damping: Double
        let mass: Double
        let precision: Double
    }

    private static let curves = Mutex<[Key: SpringCurve]>([:])

    /// The memoised curve for a parameter set. An app uses a handful of springs; the table is
    /// emptied rather than evicted if it ever grows past that.
    static func curve(stiffness: Double, damping: Double, mass: Double, precision: Double = 0.001) -> SpringCurve {
        let key = Key(stiffness: stiffness, damping: damping, mass: mass, precision: precision)
        if let hit = curves.withLock({ $0[key] }) { return hit }
        let curve = SpringCurve(stiffness: stiffness, damping: damping, mass: mass, precision: precision)
        curves.withLock {
            if $0.count >= 64 { $0.removeAll(keepingCapacity: true) }
            $0[key] = curve
        }
        return curve
    }

    static func position(t: Double, omega0: Double, zeta: Double) -> Double {
        if zeta < 1 {
            let omegaD = omega0 * (1 - zeta * zeta).squareRoot()
            return 1 - exp(-zeta * omega0 * t) * (cos(omegaD * t) + ((zeta * omega0) / omegaD) * sin(omegaD * t))
        }
        // Overdamped (includes near-critically-damped)
        let s = (zeta * zeta - 1).squareRoot()
        let r1 = -omega0 * (zeta + s)
        let r2 = -omega0 * (zeta - s)
        let b = -r1 / (r2 - r1)
        let a = 1 - b
        return 1 - a * exp(r1 * t) - b * exp(r2 * t)
    }

    /// Seconds until the spring stays within `precision` of rest for 100 ms — torph's `computeDuration`.
    static func settlingDuration(stiffness: Double, damping: Double, mass: Double, precision: Double = 0.001) -> TimeInterval {
        curve(stiffness: stiffness, damping: damping, mass: mass, precision: precision).duration
    }

    static func computeSettlingDuration(omega0: Double, zeta: Double, precision: Double) -> TimeInterval {
        let step = 0.001
        let maxDuration = 10.0
        var settledSince = 0.0
        var t = 0.0
        while t < maxDuration {
            if abs(position(t: t, omega0: omega0, zeta: zeta) - 1) > precision {
                settledSince = 0
            } else {
                settledSince += step
                if settledSince > 0.1 {
                    return (ceil((t - settledSince + step) * 1000)) / 1000
                }
            }
            t += step
        }
        return maxDuration
    }
}
