import XCTest

final class WatchlistNavigationTests: XCTestCase {
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
    card.tap()
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
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Show")).firstMatch.tap()
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
