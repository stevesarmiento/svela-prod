import XCTest
@testable import Torph

final class MorphPlanTests: XCTestCase {
    private func roles(_ plan: MorphPlan) -> [String: MorphPlan.Role] {
        Dictionary(uniqueKeysWithValues: plan.items.map { ($0.key, $0.role) })
    }

    func testInitialRenderPersistsEverything() {
        var state = TorphMorphState()
        let plan = state.update("$4.20", locale: L)
        XCTAssertTrue(plan.items.allSatisfy { $0.role == .persist })
        XCTAssertEqual(plan.items.map(\.segment.string).joined(), "$4.20")
        XCTAssertFalse(plan.isEmptyTransition)
    }

    func testTypingSequenceRolesAndAnchors() {
        var state = TorphMorphState()
        _ = state.update("$", cursorIndex: 1, locale: L)
        let plan = state.update("$2", cursorIndex: 2, locale: L)
        let byString = Dictionary(plan.items.map { ($0.segment.string, $0.role) }, uniquingKeysWith: { a, _ in a })
        XCTAssertEqual(byString["$"], .persist)
        guard case .enter(let anchor)? = byString["2"] else { return XCTFail("2 should enter, got \(String(describing: byString["2"]))") }
        XCTAssertEqual(anchor, plan.items.first { $0.segment.string == "$" }?.key)
    }

    func testExitersFollowTheirForwardAnchorAndPaintFirst() {
        var state = TorphMorphState()
        _ = state.update("$4.20", cursorIndex: 5, locale: L)
        let plan = state.update("$4.2", cursorIndex: 4, locale: L)
        let exiters = plan.items.filter { $0.role.isExit }
        XCTAssertEqual(exiters.map(\.segment.string), ["0"])
        XCTAssertEqual(plan.items.first?.role.isExit, true)
        if case .exit(let anchor) = exiters[0].role {
            // Nothing after "0" survives, so the backward neighbour "2" is the anchor.
            XCTAssertEqual(anchor, plan.items.first { $0.segment.string == "2" }?.key)
        } else {
            XCTFail("expected exit role")
        }
        XCTAssertEqual(plan.live.map(\.string).joined(), "$4.2")
        XCTAssertEqual(state.exiting.map(\.string), ["0"])
    }

    func testEarlierExitersAreKeptUntilRemoved() {
        var state = TorphMorphState()
        _ = state.update("$4.20", cursorIndex: 5, locale: L)
        _ = state.update("$4.2", cursorIndex: 4, locale: L)
        let plan = state.update("$4", cursorIndex: 2, locale: L)
        XCTAssertEqual(Set(plan.items.filter { $0.role.isExit }.map(\.segment.string)), ["0", ".", "2"])
        state.removeExited(["\(plan.items.first { $0.segment.string == "0" }!.key)"])
        XCTAssertEqual(Set(state.exiting.map(\.string)), [".", "2"])
    }

    func testRevivedSegmentIsNotDuplicated() {
        var state = TorphMorphState()
        // Multi-word values segment by word; a lone word segments by grapheme (as torph).
        _ = state.update("Continue now", locale: L)
        let leaving = state.update("Preparing… now", locale: L)
        XCTAssertTrue(leaving.items.contains { $0.segment.string == "Continue" && $0.role.isExit })
        let back = state.update("Continue now", locale: L)
        let keys = back.items.map(\.key)
        XCTAssertEqual(Set(keys).count, keys.count, "duplicate keys: \(keys)")
        let continues = back.items.filter { $0.segment.string == "Continue" }
        XCTAssertEqual(continues.count, 1)
        XCTAssertTrue(continues[0].role.isEnter)
    }

    func testEmptyTransitionHoldsAPlaceholder() {
        var state = TorphMorphState()
        _ = state.update("hello world", locale: L)
        let plan = state.update("", locale: L)
        XCTAssertTrue(plan.isEmptyTransition)
        XCTAssertEqual(plan.live.map(\.id), [Segment.emptyID])
        XCTAssertEqual(plan.items.filter { $0.role.isExit }.count, 3)
        let back = state.update("hi", locale: L)
        XCTAssertFalse(back.isEmptyTransition)
        XCTAssertFalse(back.items.contains { $0.key == Segment.emptyID && $0.role.isExit })
    }

    func testWhollyReplacedRunsLeaveAndArriveTogether() {
        var state = TorphMorphState()
        _ = state.update("abcdefgh", locale: L)
        let plan = state.update("stuvwxyz", locale: L)
        XCTAssertEqual(plan.exitRuns.count, 1)
        XCTAssertEqual(plan.exitRuns[0].count, 8)
        XCTAssertEqual(plan.enterRuns.count, 1)
        XCTAssertTrue(plan.items.filter { $0.role.isExit }.allSatisfy { if case .groupExit = $0.role { return true } else { return false } })
        XCTAssertTrue(plan.items.filter { !$0.role.isExit }.allSatisfy { if case .groupEnter = $0.role { return true } else { return false } })
    }

    func testShortReplacementsStayIndividual() {
        var state = TorphMorphState()
        _ = state.update("cat", locale: L)
        let plan = state.update("dog", locale: L)
        XCTAssertTrue(plan.exitRuns.isEmpty)
        XCTAssertTrue(plan.items.allSatisfy { if case .groupExit = $0.role { return false } else { return true } })
    }

    func testLineCount() {
        var state = TorphMorphState()
        let plan = state.update("a\n1,234\nb", locale: L)
        XCTAssertEqual(plan.lineCount, 3)
    }
}
