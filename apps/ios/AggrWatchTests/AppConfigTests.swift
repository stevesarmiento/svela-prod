import AggrAPI
import AggrCore
import Foundation
import Testing
@testable import AggrWatch

@Test @MainActor func appTabCases() {
  let tabs: [AppTab] = [.overview, .watchlists, .compare, .screener, .search]
  #expect(Set(tabs).count == 5)
}

@Test @MainActor func stalePythFallsBackToQuoteReference() {
  let now = Date(timeIntervalSince1970: 1000)
  let stale = RealtimePriceCoordinator.LiveSpot(priceUsd: 120, updatedAtMs: 980_000, source: .pyth)
  let result = LivePricing.resolve(quote: nil, spot: stale, alignedPrice: 100, isWarmingUp: false, status: .realtime, now: now)
  #expect(result.livePrice == 100)
  #expect(result.status == .fallback)
  #expect(!result.isLiveSpotTrusted)
}

@Test @MainActor func freshPythUsesMatchingSourceAndPrice() {
  let now = Date(timeIntervalSince1970: 1000)
  let spot = RealtimePriceCoordinator.LiveSpot(priceUsd: 120, updatedAtMs: 999_000, source: .pyth)
  let result = LivePricing.resolve(quote: nil, spot: spot, alignedPrice: 100, isWarmingUp: false, status: .realtime, now: now)
  #expect(result.livePrice == 120)
  #expect(result.status == .realtime)
}

@Test @MainActor func missingPriceIsNotZero() {
  let result = LivePricing.resolve(quote: nil, spot: nil, alignedPrice: nil, isWarmingUp: false)
  #expect(result.livePrice == nil)
}
