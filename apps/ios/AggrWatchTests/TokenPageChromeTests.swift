import AggrLiveline
import Foundation
import Testing
@testable import AggrWatch

@MainActor
struct TokenPageChromeTests {
  private func selection(time: Double, value: Double = 1, x: CGFloat) -> LivelineSelection {
    LivelineSelection(time: time, value: value, values: ["price": value], isProjection: false, nearestObservation: nil, x: x)
  }

  private func settle() async {
    for _ in 0..<3 { await Task.yield() }
    try? await Task.sleep(for: .milliseconds(10))
  }

  @Test func scrubIgnoresSubPointDrift() async {
    let chrome = TokenPageChrome()
    chrome.setSelection(selection(time: 1, x: 100))
    await settle()
    #expect(chrome.selectionRevision == 1)
    #expect(chrome.selectionX == 100)
    chrome.setSelection(selection(time: 2, x: 100.5))
    await settle()
    #expect(chrome.selectionRevision == 1)
    #expect(chrome.selection?.time == 1)
    chrome.setSelection(selection(time: 3, x: 102))
    await settle()
    #expect(chrome.selectionRevision == 2)
    #expect(chrome.selection?.time == 3)
    #expect(chrome.selectionX == 102)
  }

  @Test func releaseIsPublishedOnceAndClearsX() async {
    let chrome = TokenPageChrome()
    chrome.setSelection(selection(time: 1, x: 100))
    await settle()
    chrome.setSelection(nil)
    chrome.setSelection(nil)
    await settle()
    #expect(chrome.selectionRevision == 2)
    #expect(chrome.selection == nil)
    #expect(chrome.selectionX == nil)
  }

  @Test func identicalPointIsNotRepublished() async {
    let chrome = TokenPageChrome()
    chrome.setSelection(selection(time: 1, x: 110))
    await settle()
    chrome.setSelection(selection(time: 1, x: 125))
    await settle()
    #expect(chrome.selectionRevision == 1)
  }
}
