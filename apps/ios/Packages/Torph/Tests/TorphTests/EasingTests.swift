import XCTest
@testable import Torph

final class EasingTests: XCTestCase {
    func testStandardBezierEndpointsAndShape() {
        let ease = TorphEase.standard
        XCTAssertEqual(ease.progress(atTimeFraction: 0), 0)
        XCTAssertEqual(ease.progress(atTimeFraction: 1), 1)
        // An ease-out: past half way well before half time.
        XCTAssertGreaterThan(ease.progress(atTimeFraction: 0.25), 0.7)
        XCTAssertLessThan(ease.progress(atTimeFraction: 0.05), 0.5)
    }

    func testTimeFractionInvertsProgress() {
        let ease = TorphEase.standard
        for f in stride(from: 0.05, through: 0.95, by: 0.15) {
            let p = ease.progress(atTimeFraction: f)
            XCTAssertEqual(ease.timeFraction(atProgress: p), f, accuracy: 1e-4)
        }
        XCTAssertEqual(TorphEase.linear.timeFraction(atProgress: 0.3), 0.3, accuracy: 1e-6)
    }

    func testTimeFractionInvertsAnyCurveInsideTheUnitSquare() {
        // Ease-in, ease-out, an S-curve, and a flat spot at t = 0.5 (y1 = 1, y2 = 0) all stay monotone.
        for ease in [TorphEase.cubicBezier(0.42, 0, 1, 1), .cubicBezier(0, 0, 0.58, 1), .cubicBezier(0.9, 0.1, 0.1, 0.9), .cubicBezier(0.3, 1, 0.7, 0)] {
            var last = 0.0
            for f in stride(from: 0.02, through: 0.98, by: 0.04) {
                let p = ease.progress(atTimeFraction: f)
                let back = ease.timeFraction(atProgress: p)
                XCTAssertEqual(ease.progress(atTimeFraction: back), p, accuracy: 1e-4, "\(ease) at \(f)")
                XCTAssertGreaterThanOrEqual(back + 1e-9, last)
                last = back
            }
        }
    }

    func testOvershootingCurveStillReportsFirstCrossing() {
        let ease = TorphEase.cubicBezier(0.3, 1.6, 0.6, 1)
        let t = ease.timeFraction(atProgress: 0.95)
        XCTAssertEqual(ease.progress(atTimeFraction: t), 0.95, accuracy: 1e-3)
        XCTAssertLessThan(t, 0.5, "the first crossing comes before the overshoot")
    }

    func testSpringSettlingDurationMatchesTorphDefaults() {
        // torph: stiffness 100, damping 10, mass 1, precision 0.001 settles in roughly 1.3 s.
        let d = SpringMath.settlingDuration(stiffness: 100, damping: 10, mass: 1)
        XCTAssertGreaterThan(d, 1.0)
        XCTAssertLessThan(d, 2.0)
        // Stiffer and better damped settles sooner.
        let quick = SpringMath.settlingDuration(stiffness: 200, damping: 20, mass: 1)
        XCTAssertLessThan(quick, d)
        XCTAssertEqual(TorphEase.spring(stiffness: 200, damping: 20).resolvedDuration(fallback: 0.4), quick)
        XCTAssertEqual(TorphEase.standard.resolvedDuration(fallback: 0.4), 0.4)
    }

    func testOverdampedSpringIsMonotone() {
        let ease = TorphEase.spring(stiffness: 100, damping: 40)
        var last = 0.0
        for f in stride(from: 0.0, through: 1.0, by: 0.05) {
            let p = ease.progress(atTimeFraction: f)
            XCTAssertGreaterThanOrEqual(p + 1e-9, last)
            last = p
        }
        XCTAssertEqual(ease.progress(atTimeFraction: 1), 1)
    }
}
