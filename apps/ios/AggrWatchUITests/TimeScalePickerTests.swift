import XCTest

final class TimeScalePickerTests: XCTestCase {
  @MainActor func testGlassThumbDragsInBothDirectionsAndStillAcceptsTaps() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures"]
    app.launch()

    let picker = app.segmentedControls["chart-time-range"].firstMatch
    let day = picker.buttons["1D"]
    let week = picker.buttons["1W"]
    let month = picker.buttons["1M"]
    let year = picker.buttons["1Y"]
    XCTAssertTrue(day.waitForExistence(timeout: 10))
    day.tap()
    XCTAssertTrue(day.isSelected)

    day.press(forDuration: 0.1, thenDragTo: year, withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertTrue(year.isSelected)
    XCTAssertFalse(day.isSelected)

    year.press(forDuration: 0.1, thenDragTo: week)
    XCTAssertTrue(week.isSelected)
    XCTAssertFalse(year.isSelected)

    month.tap()
    XCTAssertTrue(month.isSelected)

    // Starting on an inactive range also supports scrubbing across the control.
    day.press(forDuration: 0.1, thenDragTo: year, withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertTrue(year.isSelected)

    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Draggable glass chart range"
    screenshot.lifetime = .keepAlways
    add(screenshot)

    // The native control owns touches inside its bounds; the page scrolls beside it.
    let originalY = year.frame.midY
    let start = app.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: picker.frame.minX - 24, dy: originalY))
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -160)))
    XCTAssertTrue(year.isSelected)
    XCTAssertLessThan(year.frame.midY, originalY - 40)
  }
}
