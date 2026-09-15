import XCTest
import UIKit

final class WatchlistNavigationTests: XCTestCase {
  @MainActor func testLivelineComparisonTogglesRangesAndScroll() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Compare"].tap()
    let chart = app.descendants(matching: .any)["watchlists-comparison-chart"].firstMatch
    XCTAssertTrue(chart.waitForExistence(timeout: 10))
    let core = app.buttons["comparison-series-preview-core"]
    XCTAssertTrue(core.waitForExistence(timeout: 5))
    core.tap()
    XCTAssertEqual(core.value as? String, "Hidden")
    app.buttons["comparison-show-all"].tap()
    XCTAssertEqual(core.value as? String, "Visible")
    let picker = app.segmentedControls["chart-time-range"].firstMatch
    picker.buttons["1Y"].tap()
    XCTAssertTrue(picker.buttons["1Y"].isSelected)
    let start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.5))
    start.press(forDuration: 0.25, thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.5)))
    capture("Liveline comparison after range and scrub")
    let before = chart.frame.minY
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -130)))
    XCTAssertLessThan(chart.frame.minY, before - 20)
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let tokens = app.descendants(matching: .any)["watchlist-coins-comparison-chart"].firstMatch
    XCTAssertTrue(tokens.waitForExistence(timeout: 10))
    let btc = app.buttons["comparison-series-bitcoin"]
    XCTAssertTrue(btc.waitForExistence(timeout: 5)); btc.tap()
    XCTAssertEqual(btc.value as? String, "Hidden")
    app.buttons["comparison-show-all"].tap()
    XCTAssertEqual(btc.value as? String, "Visible")
    capture("Liveline individual token comparison")
  }

  @MainActor func testWatchlistCardsFinishLoadingIndependently() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-progressive-charts", "-watchlists.wt", "grid"]
    app.launch()
    let slow = app.buttons["watchlist-card-preview-core"]
    let fast = app.buttons["watchlist-card-preview-growth"]
    XCTAssertTrue(slow.waitForExistence(timeout: 5))
    let fastFinished = NSPredicate { _, _ in fast.exists && fast.value as? String != "Loading prices" }
    expectation(for: fastFinished, evaluatedWith: nil)
    waitForExpectations(timeout: 5)
    XCTAssertEqual(slow.value as? String, "Loading prices")
    XCTAssertFalse(fast.label.contains("≈"))
    XCTAssertTrue(slow.label.contains("≈"))
    capture("Fast watchlist ready while slow watchlist still loads")
    let slowFinished = NSPredicate { _, _ in slow.value as? String != "Loading prices" }
    expectation(for: slowFinished, evaluatedWith: nil)
    waitForExpectations(timeout: 15)
    XCTAssertFalse(slow.label.contains("≈"))
    slow.tap()
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
  }

  @MainActor func testLoadingShineWithPartiallyCachedWatchlists() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-delayed-charts", "-watchlists.wt", "grid"]
    app.launch()
    let loading = app.buttons["watchlist-card-preview-core"]
    let cached = app.buttons["watchlist-card-preview-growth"]
    XCTAssertTrue(loading.waitForExistence(timeout: 5))
    XCTAssertEqual(loading.value as? String, "Loading prices")
    XCTAssertNotEqual(cached.value as? String, "Loading prices")
    capture("One loading watchlist beside a cached chart")
    // Check rendered pixels too: a correct loading flag can still be covered by glass.
    var brightness: [Double] = []
    for frame in 0..<4 {
      let shot = app.screenshot()
      brightness.append(cardSurfaceBrightness(shot, card: loading.frame, screenWidth: app.frame.width))
      let attachment = XCTAttachment(screenshot: shot)
      attachment.name = "Loading shine frame \(frame)"; attachment.lifetime = .keepAlways
      add(attachment)
    }
    XCTAssertGreaterThan((brightness.max() ?? 0) - (brightness.min() ?? 0), 0.5,
                         "The loading sweep must visibly move above the glass card")
    let finished = NSPredicate { _, _ in loading.value as? String != "Loading prices" }
    expectation(for: finished, evaluatedWith: nil)
    waitForExpectations(timeout: 25)
    XCTAssertTrue(loading.isHittable)
    XCTAssertFalse(loading.label.contains("≈"), "The loaded chart should replace the quote estimate")
    capture("Watchlist chart after delayed load")
    loading.tap()
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
  }

  private func cardSurfaceBrightness(_ shot: XCUIScreenshot, card: CGRect, screenWidth: CGFloat) -> Double {
    guard let image = shot.image.cgImage else { return 0 }
    let scale = CGFloat(image.width) / screenWidth
    let area = CGRect(x: (card.minX + card.width * 0.15) * scale,
                      y: (card.minY + card.height * 0.48) * scale,
                      width: card.width * 0.7 * scale, height: card.height * 0.2 * scale)
    guard let surface = image.cropping(to: area) else { return 0 }
    var pixels = [UInt8](repeating: 0, count: 8 * 8 * 4)
    pixels.withUnsafeMutableBytes { bytes in
      guard let context = CGContext(data: bytes.baseAddress, width: 8, height: 8, bitsPerComponent: 8,
                                    bytesPerRow: 32, space: CGColorSpaceCreateDeviceRGB(),
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
      context.draw(surface, in: CGRect(x: 0, y: 0, width: 8, height: 8))
    }
    return stride(from: 0, to: pixels.count, by: 4).reduce(0.0) {
      $0 + Double(pixels[$1]) + Double(pixels[$1 + 1]) + Double(pixels[$1 + 2])
    } / (64 * 3)
  }

  @MainActor func testIllustratedEmptyStatesKeepWorkingActions() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-empty", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    XCTAssertTrue(app.staticTexts["Build your first watchlist"].waitForExistence(timeout: 10))
    capture("Illustrated empty watchlists")
    app.buttons["Create Watchlist"].tap()
    XCTAssertTrue(app.navigationBars["New Watchlist"].waitForExistence(timeout: 5))
    app.buttons["Cancel"].tap()
    app.tabBars.buttons["Compare"].tap()
    XCTAssertTrue(app.staticTexts["No watchlists to compare"].waitForExistence(timeout: 5))
    capture("Illustrated empty comparison")
    app.buttons["Create Watchlist"].tap()
    XCTAssertTrue(app.navigationBars["New Watchlist"].waitForExistence(timeout: 5))
    app.buttons["Cancel"].tap()
    app.tabBars.buttons["Overview"].tap()
    XCTAssertTrue(app.staticTexts["Your holdings overview"].waitForExistence(timeout: 5))
    capture("Illustrated empty overview")
    app.buttons["Go to Watchlists"].tap()
    XCTAssertTrue(app.staticTexts["Build your first watchlist"].waitForExistence(timeout: 5))
  }

  @MainActor func testOverviewLivelineMarketCapRangesAndScroll() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures"]
    app.launch()
    app.tabBars.buttons["Overview"].tap()
    let chart = app.descendants(matching: .any)["overview-performance-chart"].firstMatch
    XCTAssertTrue(chart.waitForExistence(timeout: 10))
    let cap = app.staticTexts["overview-total-market-cap"]
    XCTAssertTrue(cap.exists)
    XCTAssertNotEqual(cap.label, "—")
    capture("Overview Liveline and total market cap")
    let start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5))
    start.press(forDuration: 0.3, thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5)))
    XCTAssertTrue(chart.isHittable)
    for range in ["1W", "1M", "1D"] {
      app.buttons[range].tap()
      XCTAssertTrue(chart.waitForExistence(timeout: 5))
      XCTAssertNotEqual(cap.label, "—")
    }
    let y = chart.frame.minY
    let scroll = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.8))
    scroll.press(forDuration: 0.01, thenDragTo: scroll.withOffset(CGVector(dx: 0, dy: -160)))
    XCTAssertLessThan(chart.frame.minY, y - 30)
    app.tabBars.buttons["Watchlists"].tap()
    app.tabBars.buttons["Overview"].tap()
    XCTAssertTrue(cap.waitForExistence(timeout: 5))
  }

  @MainActor func testWatchlistSortMenuReordersCardsAndPreservesSelection() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let core = app.buttons["watchlist-card-preview-core"]
    let growth = app.buttons["watchlist-card-preview-growth"]
    let sort = app.buttons["watchlist-sort"]
    XCTAssertTrue(core.waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Your Watchlists"].exists)
    XCTAssertTrue(sort.isHittable)
    capture("Your Watchlists section header")
    for (option, first) in [("Name: Z–A", growth), ("24h change: high to low", core),
                             ("Fewest tokens", growth), ("Oldest first (default)", core)] {
      sort.tap()
      let choice = app.buttons[option]
      XCTAssertTrue(choice.waitForExistence(timeout: 3))
      if option == "Name: Z–A" { capture("Watchlist sort options") }
      choice.tap()
      XCTAssertEqual(sort.value as? String, option)
      XCTAssertLessThan(first.frame.minX, first == core ? growth.frame.minX : core.frame.minX)
    }
    core.tap()
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
    app.buttons["watchlist-chooser"].tap()
    XCTAssertTrue(core.waitForExistence(timeout: 5))
    sort.tap()
    app.buttons["Name: Z–A"].tap()
    XCTAssertTrue(core.isSelected)
    XCTAssertFalse(growth.isSelected)
    capture("Watchlists sorted with selected card retained")
    sort.tap()
    app.buttons["Oldest first (default)"].tap()
  }

  @MainActor func testComparisonSelectionHeaderRestoresWithoutMovingToolbar() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    let title = app.buttons["comparison-title"]
    let chooser = app.buttons["watchlist-chooser"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    let originalTitleFrame = title.frame
    let originalLeading = chooser.frame.minX
    let row = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    let count = app.staticTexts["watchlist-selection-title"]
    let cancel = app.buttons["Cancel selection"]

    for _ in 0..<2 {
      row.swipeRight()
      XCTAssertTrue(count.waitForExistence(timeout: 5))
      XCTAssertEqual(count.label, "1 Selected")
      XCTAssertFalse(title.isHittable)
      XCTAssertFalse(chooser.isHittable)
      XCTAssertEqual(count.frame.minX, originalLeading, accuracy: 1)
      XCTAssertEqual(count.frame.midY, originalTitleFrame.midY, accuracy: 1)
      let selectAll = app.buttons["Select all"]
      XCTAssertTrue(selectAll.isHittable)
      capture("Comparison selection header")
      selectAll.tap()
      XCTAssertEqual(count.label, "3 Selected")
      let deselectAll = app.buttons["Deselect all"]
      XCTAssertTrue(deselectAll.isHittable)
      deselectAll.tap()
      XCTAssertTrue(count.waitForNonExistence(timeout: 5))
      XCTAssertTrue(title.isHittable)
      XCTAssertEqual(title.frame.minX, originalTitleFrame.minX, accuracy: 1)
      XCTAssertEqual(title.frame.midY, originalTitleFrame.midY, accuracy: 1)
      row.swipeRight()
      XCTAssertTrue(count.waitForExistence(timeout: 5))
      XCTAssertTrue(cancel.waitForExistence(timeout: 5))
      cancel.tap()
      XCTAssertTrue(count.waitForNonExistence(timeout: 5))
      XCTAssertTrue(chooser.isHittable)
      XCTAssertTrue(app.buttons["Add token"].isHittable)
      XCTAssertFalse(app.buttons["Select all"].exists)
    }
    capture("Comparison header restored after selection")
  }

  @MainActor func testColdFirstTapShowsWatchlistHeader() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    // Exercise both the restored watchlist and a different first selection.
    for (id, name) in [("preview-core", "Core holdings"), ("preview-growth", "On my radar")] {
      app.launch()
      app.tabBars.buttons["Watchlists"].tap()
      let card = app.buttons["watchlist-card-\(id)"]
      XCTAssertTrue(card.waitForExistence(timeout: 5))
      card.tap()
      let title = app.buttons["comparison-title"]
      XCTAssertTrue(title.waitForExistence(timeout: 5))
      XCTAssertTrue(title.isHittable)
      XCTAssertTrue(title.label.contains(name))
      XCTAssertGreaterThan(title.frame.width, 40)
      XCTAssertTrue(app.buttons["watchlist-chooser"].isHittable)
      XCTAssertTrue(app.buttons["Add token"].isHittable)
      XCTAssertTrue(app.buttons["Watchlist actions"].isHittable)
      capture("First tap header \(id)")
      app.buttons["watchlist-chooser"].tap()
      XCTAssertTrue(card.waitForExistence(timeout: 5))
      XCTAssertTrue(app.buttons["settings-profile"].isHittable)
      app.terminate()
    }
  }

  @MainActor func testWideAnalysisShowsSidebarBesideReport() throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "Wide-layout check runs on iPad")
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-analysis-derivatives", "-watchlists.wt", "grid"]
    app.launch()
    app.buttons["Watchlists"].firstMatch.tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let token = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(token.waitForExistence(timeout: 5)); token.swipeRight()
    app.buttons["Analyze selected"].tap()
    let report = app.staticTexts["Market overview"]
    let metrics = app.staticTexts["Market metrics"]
    XCTAssertTrue(report.waitForExistence(timeout: 10))
    XCTAssertTrue(metrics.waitForExistence(timeout: 10))
    XCTAssertTrue(report.isHittable && metrics.isHittable)
    XCTAssertLessThan(metrics.frame.maxX, report.frame.minX)
    XCTAssertFalse(app.segmentedControls["analysis-content-picker"].exists)
    capture("Wide analysis sidebar and report")
    app.buttons["Done"].tap()
  }

  @MainActor func testSingleAnalysisIncludesChartAndMarketSidebar() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-analysis-derivatives", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    app.buttons["watchlist-card-preview-core"].tap()
    let token = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(token.waitForExistence(timeout: 5))
    token.swipeRight()
    app.buttons["Analyze selected"].tap()
    XCTAssertTrue(app.staticTexts["Market overview"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Price · 7 days"].waitForExistence(timeout: 10))
    capture("Single analysis report and price-volume-Hull chart")
    let picker = app.segmentedControls["analysis-content-picker"]
    picker.buttons["Market data"].tap()
    XCTAssertTrue(app.staticTexts["Market metrics"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Current price"].exists)
    capture("Single analysis market metrics")
    let scroll = app.scrollViews["analysis-data-scroll"]
    for _ in 0..<5 {
      if app.staticTexts["Technical indicators"].isHittable { break }
      scroll.swipeUp()
    }
    XCTAssertTrue(app.staticTexts["Technical indicators"].isHittable)
    capture("Single analysis technical indicators and meters")
    for _ in 0..<5 {
      if app.staticTexts["Market structure"].isHittable { break }
      scroll.swipeUp()
    }
    XCTAssertTrue(app.staticTexts["Market structure"].isHittable)
    XCTAssertTrue(app.staticTexts["Open interest"].exists)
    XCTAssertTrue(app.staticTexts["Order flow"].exists)
    capture("Single analysis market structure")
    picker.buttons["Report"].tap()
    XCTAssertTrue(app.staticTexts["Market overview"].exists)
    XCTAssertFalse(app.staticTexts["Analysis unavailable"].exists)
    app.buttons["Regenerate"].tap()
    XCTAssertTrue(app.staticTexts["Market overview"].waitForExistence(timeout: 10))
    app.buttons["Done"].tap()
    XCTAssertTrue(token.waitForExistence(timeout: 5))
  }

  @MainActor func testComparisonAnalysisIncludesChartsRiskCorrelationAndFlow() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-analysis-derivatives", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    app.buttons["watchlist-card-preview-core"].tap()
    let btc = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(btc.waitForExistence(timeout: 5))
    btc.swipeRight()
    app.buttons["watchlist-token-ethereum"].tap()
    app.buttons["Analyze selected"].tap()
    XCTAssertTrue(app.staticTexts["Relative performance · 7 days"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts["Not enough overlapping history to chart these tokens."].exists)
    capture("Comparison analysis report and aligned chart")
    let picker = app.segmentedControls["analysis-content-picker"]
    picker.buttons["Market data"].tap()
    XCTAssertTrue(app.staticTexts["Returns"].waitForExistence(timeout: 5))
    let scroll = app.scrollViews["analysis-data-scroll"]
    capture("Comparison analysis returns and risk meters")
    for _ in 0..<5 {
      if app.staticTexts["Correlation · 30 days"].isHittable { break }
      scroll.swipeUp()
    }
    XCTAssertTrue(app.staticTexts["Correlation · 30 days"].isHittable)
    capture("Comparison analysis correlation matrix")
    for _ in 0..<6 {
      if app.staticTexts["Indicators"].isHittable { break }
      scroll.swipeUp()
    }
    XCTAssertTrue(app.staticTexts["Indicators"].isHittable)
    capture("Comparison analysis indicator posture")
    for _ in 0..<8 {
      if app.staticTexts["Momentum & flow"].isHittable { break }
      scroll.swipeUp()
    }
    XCTAssertTrue(app.staticTexts["Momentum & flow"].isHittable)
    XCTAssertTrue(app.staticTexts["Taker buy"].firstMatch.exists)
    capture("Comparison analysis momentum flow and excess returns")
    picker.buttons["Report"].tap()
    XCTAssertTrue(app.staticTexts["Market overview"].exists)
    app.buttons["Done"].tap()
    XCTAssertTrue(btc.waitForExistence(timeout: 5))
  }

  @MainActor func testWebActionIconsInGlassControls() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let create = app.buttons["Create watchlist"]
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    capture("Web create-watchlist icon")
    create.tap()
    XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 3))
    app.buttons["Cancel"].tap()
    app.buttons["watchlist-card-preview-core"].tap()
    XCTAssertTrue(app.buttons["Add token"].waitForExistence(timeout: 5))
    app.buttons["Add token"].tap()
    XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
    app.buttons["Done"].tap()
    let token = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(token.waitForExistence(timeout: 5))
    token.swipeRight()
    XCTAssertTrue(app.buttons["Analyze selected"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Analyze selected"].isHittable)
    capture("Web Analyze icon in selection glass pill")
    app.buttons["Cancel selection"].tap()
    token.tap()
    XCTAssertTrue(app.buttons["token-actions"].waitForExistence(timeout: 5))
    app.buttons["token-actions"].tap()
    XCTAssertTrue(app.buttons["Deep analysis"].waitForExistence(timeout: 3))
    capture("Web Analyze icon in token menu")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.65)).tap()
    app.buttons["token-page-close"].tap()
    app.tabBars.buttons["Compare"].tap()
    let collapse = app.buttons["Collapse all"]
    XCTAssertTrue(collapse.waitForExistence(timeout: 5))
    capture("Web collapse-watchlists and add icons")
    collapse.tap()
    let expand = app.buttons["Expand all"]
    XCTAssertTrue(expand.waitForExistence(timeout: 3))
    capture("Web expand-watchlists icon")
    expand.tap()
    XCTAssertTrue(collapse.waitForExistence(timeout: 3))
  }

  @MainActor func testHoldingsRowHeightStaysFixedDuringSelection() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let identity = app.buttons["watchlist-token-bitcoin"]
    let price = app.buttons["watchlist-price-bitcoin"]
    let holdings = app.buttons["edit-holdings-bitcoin"]
    let row = app.otherElements["watchlist-row-bitcoin"]
    XCTAssertTrue(identity.waitForExistence(timeout: 5))
    XCTAssertTrue(row.exists)
    let originalRowHeight = row.frame.height
    let originalFrames = [identity.frame, price.frame, holdings.frame]
    capture("Token identity and inline holdings")
    identity.swipeRight()
    let cancel = app.buttons["Cancel selection"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    XCTAssertEqual(row.frame.height, originalRowHeight, accuracy: 1)
    XCTAssertGreaterThan(identity.frame.minX, originalFrames[0].minX + 15)
    XCTAssertGreaterThan(holdings.frame.minX, originalFrames[2].minX + 15)
    XCTAssertEqual(identity.frame.height, originalFrames[0].height, accuracy: 1)
    XCTAssertEqual(price.frame, originalFrames[1])
    capture("Separate selection circle with unchanged row height")
    cancel.tap()
    XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
    XCTAssertEqual(row.frame.height, originalRowHeight, accuracy: 1)
    XCTAssertEqual(identity.frame.minX, originalFrames[0].minX, accuracy: 1)
    holdings.tap()
    XCTAssertTrue(app.textFields["0"].waitForExistence(timeout: 3))
    XCTAssertEqual(app.textFields["0"].value as? String, "0.65")
    XCTAssertFalse(app.buttons["token-page-close"].exists)
    capture("Inline holdings amount editor")
  }

  @MainActor func testGlassWatchlistGridScrollAndResume() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "--preview-large-watchlists", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let first = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(first.waitForExistence(timeout: 5))
    let size = first.frame.size
    capture("Grouped glass cards before scrolling")
    // A press that becomes a scroll must cancel card activation and restore its size.
    let press = first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    press.press(forDuration: 0.08, thenDragTo: press.withOffset(CGVector(dx: 0, dy: -100)))
    XCTAssertFalse(app.buttons["comparison-title"].isHittable)
    XCTAssertTrue(app.buttons["settings-profile"].isHittable)
    let last = app.buttons["watchlist-card-preview-list-18"]
    for _ in 0..<8 {
      if last.exists && last.isHittable { break }
      app.swipeUp()
    }
    XCTAssertTrue(last.isHittable)
    XCTAssertEqual(last.frame.width, size.width, accuracy: 1)
    XCTAssertEqual(last.frame.height, size.height, accuracy: 1)
    let beforeResume = last.frame
    XCUIDevice.shared.press(.home)
    app.activate()
    XCTAssertTrue(last.waitForExistence(timeout: 5))
    XCTAssertTrue(last.isHittable)
    XCTAssertEqual(last.frame.minY, beforeResume.minY, accuracy: 1)
    capture("Grouped glass cards after app resume")
    for _ in 0..<8 {
      if first.exists && first.isHittable { break }
      app.swipeDown()
    }
    XCTAssertTrue(first.isHittable)
    XCTAssertEqual(first.frame.size.width, size.width, accuracy: 1)
    XCTAssertEqual(first.frame.size.height, size.height, accuracy: 1)
    capture("Grouped glass cards after scrolling back")
    first.tap()
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
  }

  @MainActor func testWatchlistGlassContextMenuPreservesSelectionRing() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let selected = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(selected.waitForExistence(timeout: 5))
    selected.tap()
    let chooser = app.buttons["watchlist-chooser"]
    XCTAssertTrue(chooser.waitForExistence(timeout: 5)); chooser.tap()
    XCTAssertTrue(selected.waitForExistence(timeout: 5))
    XCTAssertTrue(selected.isSelected)
    selected.press(forDuration: 1)
    XCTAssertTrue(app.buttons["Edit"].waitForExistence(timeout: 3))
    capture("Selected glass card full selection ring")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)).tap()
    XCTAssertTrue(app.buttons["Edit"].waitForNonExistence(timeout: 3))
    let other = app.buttons["watchlist-card-preview-growth"]
    other.press(forDuration: 1)
    XCTAssertTrue(app.buttons["Edit"].waitForExistence(timeout: 3))
    capture("Unselected glass card context menu")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)).tap()
    XCTAssertTrue(app.buttons["Edit"].waitForNonExistence(timeout: 3))
    selected.tap()
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
  }

  @MainActor func testTokenPullDismissalRespectsContentScroll() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid", "-charts.useLegacyPriceRenderer", "NO"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let row = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    let close = app.buttons["token-page-close"]
    let chart = app.descendants(matching: .any)["native-price-chart"].firstMatch
    XCTAssertTrue(chart.waitForExistence(timeout: 5))
    // The content itself can dismiss when its scroll starts at the top.
    var start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.4))
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 160)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    row.tap()
    XCTAssertTrue(chart.waitForExistence(timeout: 5))
    // A short pull cancels cleanly and leaves the page interactive.
    start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.4))
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 20)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(close.isHittable)
    // Upward motion scrolls, and downward motion within scrolled content stays scrolling.
    let originalY = chart.frame.minY
    start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.8))
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -150)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertLessThan(chart.frame.minY, originalY - 50)
    let scrolledY = chart.frame.minY
    start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.85))
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 70)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(close.isHittable)
    XCTAssertGreaterThan(chart.frame.minY, scrolledY + 15)
    capture("Token header with dollar change after content scroll")
    // The fixed header remains a dismissal surface at any scroll position.
    start = close.coordinate(withNormalizedOffset: CGVector(dx: 1.5, dy: 0.5))
    start.press(forDuration: 0.01, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 160)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    row.tap()
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
  }

  @MainActor func testMinimalPriceChartRangesScrubScrollAndReopen() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid", "-charts.useLegacyPriceRenderer", "NO"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let row = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    let close = app.buttons["token-page-close"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    let chart = app.descendants(matching: .any)["native-price-chart"].firstMatch
    XCTAssertTrue(chart.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["MKT CAP"].exists)
    XCTAssertFalse(app.staticTexts["CACHED"].exists)
    XCTAssertTrue(app.buttons["token-bookmark"].isHittable)
    capture("Simple token chart expanded")
    let start = chart.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.35))
    start.press(forDuration: 0.25, thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.35)))
    XCTAssertTrue(close.exists)
    XCTAssertTrue(app.descendants(matching: .any)["price-chart-inspection"].firstMatch.waitForNonExistence(timeout: 3))
    for timeframe in ["1W", "1M", "1Y", "1D"] {
      app.buttons[timeframe].tap()
      XCTAssertTrue(chart.waitForExistence(timeout: 5))
      XCTAssertTrue(close.exists)
    }
    let oldY = chart.frame.minY
    chart.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.6)).press(forDuration: 0.01,
      thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.1)))
    XCTAssertLessThan(chart.frame.minY, oldY - 20, "Vertical dragging on the chart must scroll the page")
    capture("Simple token chart compact header")
    XCTAssertFalse(app.staticTexts["token-header-name"].exists)
    XCTAssertTrue(app.staticTexts["token-header-price"].exists)
    XCTAssertTrue(app.buttons["token-actions"].isHittable)
    XCTAssertTrue(app.buttons["token-bookmark"].isHittable)
    XCTAssertLessThanOrEqual(app.buttons["token-actions"].frame.maxX, app.frame.maxX)
    app.buttons["token-actions"].tap()
    XCTAssertTrue(app.buttons["Deep analysis"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["Deep analysis"].isHittable)
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.65)).tap()
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    row.tap()
    XCTAssertTrue(chart.waitForExistence(timeout: 5))
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
  }

  @MainActor func testMinimalLegacyChartWithLargeText() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid", "-charts.useLegacyPriceRenderer", "YES",
                           "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXXL"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5)); card.tap()
    let row = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    let chart = app.descendants(matching: .any)["legacy-price-chart"].firstMatch
    XCTAssertTrue(chart.waitForExistence(timeout: 5))
    capture("Simple token legacy chart large text")
    app.buttons["1W"].tap()
    chart.swipeUp()
    XCTAssertTrue(app.buttons["token-page-close"].isHittable)
    XCTAssertTrue(app.buttons["token-actions"].isHittable)
    XCTAssertTrue(app.buttons["token-bookmark"].isHittable)
    capture("Simple token legacy compact large text")
    app.buttons["token-page-close"].tap()
    XCTAssertTrue(chart.waitForNonExistence(timeout: 5))
  }

  @MainActor func testAddTokenSheetSelectionReturnsToWatchlist() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-growth"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    app.buttons["Add token"].tap()
    let bitcoin = app.buttons["search-token-bitcoin"]
    XCTAssertTrue(bitcoin.waitForExistence(timeout: 5))
    bitcoin.swipeLeft()
    // Adding should commit directly, whereas removing an existing bookmark confirms.
    // Offline fixtures reject writes; verify the action reaches the real mutation path
    // and reports its error rather than pretending to save the bookmark.
    XCTAssertTrue(app.staticTexts["Could not update watchlist"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.alerts.firstMatch.exists)
    bitcoin.swipeRight()
    let cancel = app.buttons["Cancel selection"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    capture("Add token sheet selection")
    cancel.tap()
    app.buttons["Done"].tap()
    let solana = app.buttons["watchlist-token-solana"]
    XCTAssertTrue(solana.waitForExistence(timeout: 5))
    solana.swipeRight()
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    cancel.tap()
  }

  @MainActor func testSearchCardsSelectionBookmarkAndNavigation() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    // Pick a known target watchlist before opening search.
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    app.tabBars.buttons["Search"].tap()
    let row = app.buttons["search-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    capture("Search token cards on black")
    row.swipeRight()
    let cancel = app.buttons["Cancel selection"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Analyze selected"].exists)
    capture("Search selection controls")
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
    XCTAssertFalse(app.buttons["token-page-close"].exists)
    row.swipeLeft()
    XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
    app.alerts.buttons["Cancel"].tap()
    row.tap()
    let close = app.buttons["token-page-close"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("Solana")
    let solana = app.buttons["search-token-solana"]
    XCTAssertTrue(row.waitForNonExistence(timeout: 5))
    XCTAssertTrue(solana.waitForExistence(timeout: 5))
    solana.swipeRight()
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    cancel.tap()
    XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
  }

  @MainActor func testTokenChromeWhileScrolled() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons["watchlist-card-preview-core"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    let row = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.tap()
    let close = app.buttons["token-page-close"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.75))
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -220)))
    capture("Scrolled token with soft header blur")
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.buttons["comparison-title"].waitForExistence(timeout: 5))
    capture("Comparison after token close")
  }

  @MainActor func testTapDeselectThenSelectInAnotherWatchlist() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    for (group, coin) in [("preview-core", "bitcoin"), ("preview-growth", "solana"),
                          ("preview-core", "ethereum"), ("preview-growth", "solana")] {
      let card = app.buttons["watchlist-card-\(group)"]
      XCTAssertTrue(card.waitForExistence(timeout: 5))
      if group == "preview-core" && coin == "bitcoin" { capture("Liquid Glass watchlist cards") }
      card.tap()
      let row = app.buttons["watchlist-token-\(coin)"]
      XCTAssertTrue(row.waitForExistence(timeout: 5))
      row.swipeRight()
      let cancel = app.buttons["Cancel selection"]
      XCTAssertTrue(cancel.waitForExistence(timeout: 5))
      // Tap the physical row overlay: its content button is disabled in selection mode.
      row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
      XCTAssertFalse(app.buttons["token-page-close"].exists)
      let chooser = app.buttons["watchlist-chooser"]
      XCTAssertTrue(chooser.waitForExistence(timeout: 5))
      chooser.tap()
    }
  }

  @MainActor func testChooserTokenDismissalAndComparisonState() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "grid"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "watchlist-card-")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 10))
    capture("Watchlist chooser")
    // A short hold exercises press feedback and opens only when released.
    card.press(forDuration: 0.2)
    let chooser = app.buttons["watchlist-chooser"]
    XCTAssertTrue(chooser.waitForExistence(timeout: 5))
    let title = app.buttons["comparison-title"]
    XCTAssertTrue(title.exists)
    title.tap()
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    XCTAssertTrue(chooser.waitForExistence(timeout: 5))
    let week = app.buttons["1W"]
    week.tap()
    XCTAssertTrue(week.isSelected)
    let token = app.buttons["watchlist-token-bitcoin"]
    XCTAssertTrue(token.waitForExistence(timeout: 5))
    capture("Selected comparison")
    token.tap()
    let close = app.buttons["token-page-close"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    capture("Expanded token")
    // Child presentations must return to the token, without clearing its UIKit route.
    app.buttons["token-actions"].tap()
    app.buttons["Deep analysis"].tap()
    let done = app.buttons["Done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    // Pull from the page header rather than scrolling its chart/content.
    let start = close.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 150, dy: 0)))
    XCTAssertTrue(close.exists)
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 20, dy: 60)),
                withVelocity: .slow, thenHoldForDuration: 0.5)
    XCTAssertTrue(close.exists)
    let end = start.withOffset(CGVector(dx: 40, dy: 150))
    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 1)
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    XCTAssertTrue(week.isSelected)
    chooser.tap()
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    XCTAssertTrue(week.isSelected)
    // Reopening catches disappearing matched-source views after dismissal.
    token.tap()
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5))
    XCTAssertTrue(token.isHittable)
    token.swipeRight()
    let cancel = app.buttons["Cancel selection"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5))
    XCTAssertFalse(close.exists)
    cancel.tap()
    XCTAssertTrue(chooser.waitForExistence(timeout: 5))
  }

  @MainActor func testLogoCloseStaysDismissedAcrossRepeatedOpenings() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["--preview-fixtures", "-watchlists.wt", "chart"]
    app.launch()
    app.tabBars.buttons["Watchlists"].tap()
    let title = app.buttons["comparison-title"]
    XCTAssertTrue(title.waitForExistence(timeout: 10))
    let close = app.buttons["token-page-close"]
    for (index, coin) in ["bitcoin", "ethereum", "bitcoin"].enumerated() {
      let row = app.buttons["watchlist-token-\(coin)"]
      XCTAssertTrue(row.waitForExistence(timeout: 5))
      row.tap()
      XCTAssertTrue(close.waitForExistence(timeout: 5))
      if index == 1 { close.doubleTap() } else { close.tap() }
      XCTAssertTrue(close.waitForNonExistence(timeout: 5))
      XCTAssertTrue(title.waitForExistence(timeout: 5))
      // Checking only the first disappearing frame misses a page that comes back later.
      let reappeared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true"), object: close)
      reappeared.isInverted = true
      wait(for: [reappeared], timeout: 1)
      XCTAssertTrue(row.isHittable)
    }
  }

  @MainActor private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIApplication().screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
