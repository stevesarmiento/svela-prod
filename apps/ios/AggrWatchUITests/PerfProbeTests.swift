import XCTest

/// Throwaway reproduction for comparison-chart load and scrub cost with many watchlists.
final class PerfProbeTests: XCTestCase {
  @MainActor func testCompareLoadsAndScrubsWithManyWatchlists() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-large-watchlists", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Compare"].tap()
    let chart = app.descendants(matching: .any)["watchlists-comparison-chart"].firstMatch
    let appeared = chart.waitForExistence(timeout: 3)
    capture("compare \(appeared ? "chart" : "NO CHART") after 3s")
    XCTAssertTrue(chart.waitForExistence(timeout: 15))
    capture("compare after load")
    // Scrub slowly back and forth for ~8s while the main thread is sampled from outside.
    let left = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5))
    let right = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
    left.press(forDuration: 0.6, thenDragTo: right, withVelocity: 60, thenHoldForDuration: 0.2)
    right.press(forDuration: 0.3, thenDragTo: left, withVelocity: 60, thenHoldForDuration: 0.2)
    capture("compare after scrub")
  }

  @MainActor func testWatchlistGridAndDetailDragWithManyTokens() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-large-watchlists", "--preview-large-token-list", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let first = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(first.waitForExistence(timeout: 5))
    // ~6s of grid drags (sampled from outside).
    for _ in 0..<3 {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
      from.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: 900, thenHoldForDuration: 0.1)
      let back = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
      back.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)), withVelocity: 900, thenHoldForDuration: 0.1)
    }
    capture("grid after drags")
    XCTAssertTrue(first.waitForExistence(timeout: 5)); first.tap()
    let token = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(token.waitForExistence(timeout: 5))
    // ~6s of detail-list drags, then a horizontal row swipe.
    for _ in 0..<3 {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
      from.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: 900, thenHoldForDuration: 0.1)
      let back = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
      back.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)), withVelocity: 900, thenHoldForDuration: 0.1)
    }
    if token.exists { token.swipeLeft(); token.swipeRight() }
    capture("detail after drags")
  }

  @MainActor private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIApplication().screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
}
