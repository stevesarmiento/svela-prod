import XCTest

final class AppIconTests: XCTestCase {
  @MainActor func testPickerShowsAllThreeIcons() {
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures"]
    app.launch()
    openPicker(app)
    for name in ["AppIcon", "aggr-blueprint", "aggr-testflight"] {
      XCTAssertTrue(app.buttons["app-icon-\(name)"].isHittable)
    }
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "App icon picker"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor func testSettingsChangesRealIconAndRestoresDefault() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures"]
    app.launch()
    openPicker(app)
    try select("aggr-blueprint", in: app)
    try select("aggr-testflight", in: app)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "App icon picker"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    XCUIDevice.shared.press(.home)
    let home = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    home.name = "TestFlight icon on Home Screen"
    home.lifetime = .keepAlways
    add(home)

    app.terminate()
    app.launch()
    openPicker(app)
    XCTAssertTrue(app.buttons["app-icon-aggr-testflight"].isSelected)
    try select("AppIcon", in: app)
  }

  @MainActor private func openPicker(_ app: XCUIApplication) {
    app.tabBars.buttons["Overview"].tap()
    app.buttons["Settings"].tap()
    let link = app.buttons["settings-app-icon"]
    XCTAssertTrue(link.waitForExistence(timeout: 5))
    link.tap()
    XCTAssertTrue(app.buttons["app-icon-AppIcon"].waitForExistence(timeout: 5))
  }

  @MainActor private func select(_ name: String, in app: XCUIApplication) throws {
    let button = app.buttons["app-icon-\(name)"]
    button.tap()
    let confirmation = app.alerts.buttons["OK"].firstMatch
    if confirmation.waitForExistence(timeout: 2) { confirmation.tap() }
    let failure = app.staticTexts["app-icon-error"]
    if failure.exists {
      // iOS 26.1 Simulator updates the icon but its confirmation service can fail to
      // load CoreServicesUIUpcallEmbedded's principal class (NSPOSIXErrorDomain 5).
      // Further changes then fail with EAGAIN until the simulator service restarts.
      #if targetEnvironment(simulator)
      if failure.label.contains("Input/output error") || failure.label.contains("Resource temporarily unavailable") {
        throw XCTSkip("Simulator icon confirmation service unavailable: \(failure.label)")
      }
      #endif
      XCTFail(failure.label)
    }
    let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: button)
    wait(for: [selected], timeout: 5)
  }
}
