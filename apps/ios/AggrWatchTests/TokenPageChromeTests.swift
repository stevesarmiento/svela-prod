import AggrLiveline
import Charts
import Foundation
import SwiftUI
import UIKit
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

/// `IndicatorScrubRule` draws the crosshair in a `chartOverlay` from `ChartProxy.position(forX:)`.
/// That is only correct if the proxy reports positions relative to the *visible* plot once the
/// chart has been scrolled under `.chartScrollableAxes`, which this pins down with a real layout.
@MainActor
struct IndicatorScrubRuleGeometryTests {
  private final class Probe { var read: (() -> (x: CGFloat?, plot: CGRect?))? }

  @Test func chartProxyPositionIsVisiblePlotRelativeAfterScrolling() async throws {
    let day = 86_400.0
    let base = Date(timeIntervalSince1970: 1_700_000_000)
    let domain = base...base.addingTimeInterval(100 * day)
    let start = base.addingTimeInterval(50 * day)        // scrolled to days 50…80
    let probe = base.addingTimeInterval(65 * day)        // middle of the visible window
    let box = Probe()
    let chart = Chart {
      ForEach(0..<101, id: \.self) { i in
        LineMark(x: .value("t", base.addingTimeInterval(Double(i) * day)), y: .value("v", Double(i % 7)))
      }
    }
    .chartXScale(domain: domain)
    .chartScrollableAxes(.horizontal)
    .chartXVisibleDomain(length: 30 * day)
    .chartScrollPosition(x: .constant(start))
    .chartXAxis(.hidden).chartYAxis(.hidden)
    .chartOverlay { proxy in
      GeometryReader { geo in
        Color.clear.onAppear {
          box.read = { (proxy.position(forX: probe), proxy.plotFrame.map { geo[$0] }) }
        }
      }
    }
    .frame(width: 300, height: 200)
    let host = UIHostingController(rootView: chart)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 200))
    window.rootViewController = host
    window.makeKeyAndVisible()
    host.view.layoutIfNeeded()
    for _ in 0..<10 { await Task.yield(); try await Task.sleep(for: .milliseconds(50)) }
    let result = try #require(box.read?())
    let x = try #require(result.x), plot = try #require(result.plot)
    // The proxy reports x against the full 100-day content (65% of 1000pt) while the plot anchor
    // carries the scroll offset (minX ≈ -500pt), so `frame.minX + x` is the visible position:
    // day 65 sits halfway across the 300pt visible window. IndicatorScrubRule relies on this.
    #expect(abs(plot.minX + x - 150) < 4, "x=\(x) plot=\(plot)")
    #expect(plot.width > 300, "content frame spans the whole scrollable domain")
    window.isHidden = true
  }
}
