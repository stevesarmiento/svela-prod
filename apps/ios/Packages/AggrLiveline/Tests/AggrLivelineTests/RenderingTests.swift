#if canImport(UIKit)
import UIKit
import Testing
@testable import AggrLiveline

@MainActor @Test func revealCurveAndEndpointStayAttachedAtEveryStage() {
  let renderer = LivelineRenderer()
  let spline = LivelineSpline([.init(time: 0, value: 10), .init(time: 15, value: 16), .init(time: 50, value: 12), .init(time: 100, value: 18)])
  // Forward projection makes the history endpoint sit inside the plot, not on its right edge.
  let layout = LivelineLayout(plot: CGRect(x: 8, y: 14, width: 260, height: 240), volume: nil, x: 0...130, y: 8...20)
  for progress in [0.0, 0.1, 0.3, 0.6, 0.9, 0.999, 1.0] {
    let path = renderer.curve(spline, id: "price", multiplier: 1, layout: layout, reveal: progress, elapsed: 1200)
    let tip = renderer.endpoint(spline, layout: layout, reveal: progress, elapsed: 1200)
    #expect(abs(path.currentPoint.x - tip.x) < 0.001)
    #expect(abs(path.currentPoint.y - tip.y) < 0.001)
    #expect(tip.x >= layout.toX(100) && tip.x <= layout.plot.maxX)
  }
  // When a sudden price update outruns the easing Y range, clamp the curve and
  // its marker together; clipping a data-space path alone detaches the marker.
  let catchingUp = LivelineLayout(plot: layout.plot, volume: nil, x: 0...130, y: 8...16)
  let clipped = renderer.curve(spline, id: "price", multiplier: 1, layout: catchingUp, reveal: 1, elapsed: 1200)
  let clippedTip = renderer.endpoint(spline, layout: catchingUp, reveal: 1, elapsed: 1200)
  #expect(abs(clipped.currentPoint.y - clippedTip.y) < 0.001)
  #expect(clippedTip.y == catchingUp.plot.minY)
}

@MainActor @Test func curvedBadgeTailFitsItsReservedBounds() {
  for tail in [CGFloat(0), CGFloat(5)] {
    let path = LivelineRenderer.badgePath(width: 80, height: 22, tail: tail)
    #expect(abs(path.boundingBoxOfPath.width - (80 + tail)) < 0.001)
    #expect(abs(path.boundingBoxOfPath.height - 22) < 0.001)
  }
}
@MainActor @Test func minimalChartReclaimsAxisSpaceAndKeepsScrubbingAligned() {
  let engine = LivelineEngine()
  let renderer = LivelineRenderer()
  let input = LivelineInput(id: "minimal", series: [.init(id: "price", points: [.init(time: 0, value: 100), .init(time: 60, value: 110)])],
                            viewport: .historical(0...60))
  var config = LivelineConfiguration()
  engine.update(input, configuration: config, marketTime: 60)
  let full = renderer.layout(size: .init(width: 360, height: 260), engine: engine)
  config.grid = false; config.badge = false; config.timeAxis = false
  engine.update(input, configuration: config, marketTime: 60)
  let minimal = renderer.layout(size: .init(width: 360, height: 260), engine: engine)
  #expect(minimal.plot.width > full.plot.width)
  #expect(minimal.plot.height > full.plot.height)
  #expect(abs(minimal.time(minimal.toX(30)) - 30) < 0.001)
}
#endif

#if canImport(UIKit)
import XCTest

final class LivelineMotionSnapshotTests: XCTestCase {
  @MainActor func testRevealAndScrubFrames() {
    let engine = LivelineEngine()
    let renderer = LivelineRenderer()
    renderer.formatValue = { String(format: "$%.2f", $0) }
    renderer.formatTime = { "\(Int($0))s" }
    let points = (0...40).map { i in LivelinePoint(time: Double(i) * 3, value: 100 + sin(Double(i) / 3) * 5 + Double(i) / 2) }
    let input = LivelineInput(id: "motion", series: [.init(id: "price", points: points, width: 2)], viewport: .historical(0...150))
    var cfg = LivelineConfiguration(); cfg.pulse = false
    engine.update(input, configuration: cfg, marketTime: 120)
    let size = CGSize(width: 360, height: 280)
    func renderFrame(_ name: String? = nil) {
      autoreleasepool {
        var result: UIImage?
        UITraitCollection(userInterfaceStyle: .dark).performAsCurrent {
          result = UIGraphicsImageRenderer(size: size).image { context in
            UIColor.black.setFill(); context.fill(CGRect(origin: .zero, size: size))
            renderer.draw(context.cgContext, size: size, engine: engine, frameMilliseconds: 16.67)
          }
        }
        if let name {
          let attachment = XCTAttachment(image: result!)
          attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        }
      }
    }
    for frame in 0...90 {
      engine.advance(monotonicTime: Double(frame) / 60, marketTime: 120)
      renderFrame([0, 5, 15, 40, 90].contains(frame) ? "Reveal frame \(frame)" : nil)
    }
    engine.selectedTime = 70
    for frame in 91...150 {
      engine.advance(monotonicTime: Double(frame) / 60, marketTime: 120)
      renderFrame(frame == 150 ? "Scrub held" : nil)
    }
    engine.selectedTime = nil
    for frame in 151...210 {
      engine.advance(monotonicTime: Double(frame) / 60, marketTime: 120)
      renderFrame([154, 160, 175, 210].contains(frame) ? "Scrub exit frame \(frame - 150)" : nil)
    }
    XCTAssertNil(engine.inspectionTime)
    XCTAssertEqual(engine.scrubAmount, 0)
  }
}
#endif
