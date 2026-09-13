# Token page: a simpler mobile chart

Proposed design following IMG_9087.PNG and IMG_9088.jpg. Source inspection and an unauthenticated Hermes request performed September 13, 2026. The visual cleanup is now implemented. Pyth authentication and backend changes are explicitly deferred by the user.

## What changes

- One identity header: large token artwork, full token name, price, and change for the selected period. Remove the duplicate logo/name in PriceChartCard and the decorative current-date subtitle in the toolbar.
- On upward scroll, the expanded identity gives way to a compact sticky identity and price readout. The two screenshots establish the expanded and compact states; exact transition timing cannot be inferred from still images.
- Keep the existing soft fading header background, status bar, drag indicator, and UIKit row-to-page dismissal. Keep one accessible token-logo close action as the identity compacts. Avoid changing the dismissal transform or its guards while implementing scroll behavior.
- Collapse news, analysis, and bookmark actions into a compact overflow menu if the compact header needs space. Preserve those working actions.
- A price-only white line with its endpoint dot is the default chart. Remove predictive paths and band, Hull lines, market-cap overlay, and volume pane from this surface. Retain volume and market-cap values in the metrics section and technical indicators further down the page.
- Hide resting grid, axis labels, high/low labels, current-price badge, and fill for this minimal chart. Show the inspected price and date in the shared header while scrubbing; retain crosshair feedback during inspection.
- Keep the larger centered timeframe buttons below the chart. Start with 1D, 1W, 1M, 1Y, with 1D as the mobile default. Add 1H only after we have a verified historical data source with sufficient resolution; a live SSE connection alone cannot populate the previous hour.
- Replace LIVE/WARM/CACHED pills with a quiet live indicator only when a fresh trusted tick exists. On stale or unavailable data, offer a readable last-update time; removing jargon must not imply an old price is live.

## Findings in current code

TokenDetailView has a permanent logo/symbol/date toolbar; PriceChartCard repeats logo/name and independently resolves the visible price. A single shared presentation state should supply both expanded and compact headers, including scrub state.

AggrPriceChart sends seven possible series, a prediction band, and volume to the renderer. Its viewport extends through the projection. Removing only their colors or visibility would leave unwanted future space; the minimal adapter must use a historical-price-only domain too.

LivelineConfiguration already supports disabling grid, badge, fill, extrema, and period highlight. Inspect renderer layout before adding separate x/y axis visibility options: disabling labels must also reclaim their reserved margins. Preserve hit testing, VoiceOver, and the pure renderer's existing default configuration for other consumers.

The current headline change is always based on the quote's 24-hour change, even when 1M/1Y/2Y is selected. Calculate period change using the first valid price at the visible range boundary and the latest trusted price (or inspected price while scrubbing). Handle unavailable or partial history explicitly.

TimeScale.tokenChartDaysParam fetches 90 days for 1M to support indicator warmup. The native adapter currently uses the whole supplied series as its domain. Separate fetched history from the visible price window so a 1M label actually shows one month, while indicators retain their warmup data. Keep observed timestamps unchanged.

## Real-time feed problem

PythHermesStream uses native URLSession.bytes SSE and reconnects on errors. RealtimePriceCoordinator subscribes when a token opens, throttles UI updates to one second, and falls back after 7.5 seconds without a tick. Preview fixtures deliberately disable streaming.

The production stream and dynamic feed resolver send no Authorization header. A request matching the app's BTC stream request returned HTTP 401 with body `unauthorized`. Errors are swallowed/retried and the UI labels its fallback price CACHED.

Pyth's current upgrade documentation says Hermes requires API-key authentication after August 26, 2026:
https://docs.pyth.network/price-feeds/core/upgrade/preparing
https://docs.pyth.network/price-feeds/core/fetch-price-updates

Recommended integration: a server-side authenticated price relay, retaining the Pyth credential on the server and protecting the app-facing endpoint with the existing app auth. Support both curated feed IDs and dynamic feed resolution. First inspect the web backend for a reusable relay and available configuration; do not embed a shared provider secret in the app or assume a key is already provisioned. This requires backend work beyond the original native-only port constraint, so keep it distinct from the independently implementable visual changes.

## Implementation order and validation

1. Add the minimal price-chart presentation and correct visible range/period-change calculations. Retain advanced package capability, but remove those layers from the default token-page input. Match both native and temporary legacy renderer paths.
2. Consolidate header/readout state and implement expanded-to-compact scroll behavior, preserving the existing close action and presentation lifecycle.
3. Repair the production data path through an authenticated relay once credential/backend setup is resolved. Make unauthorized, unsupported-feed, disconnected, and stale states diagnosable rather than indistinguishable silent retries.
4. Verify real published timestamps progress for BTC/ETH/SOL and test an unsupported asset, reconnect, background/foreground, and stale fallback. A Mac endpoint probe confirms today's authentication failure, not end-to-end iPhone streaming.
5. Test range boundaries, period-change math, scrubbing, timeframe replacement, and absence of future projection padding. Update the existing chart UI test when removed overlay buttons are no longer part of the product.
6. Visually review expanded/compact/scrolled states, long names, small screens, and large text. Exercise row open, logo close, drag dismissal, reopen, vertical chart scrolling, horizontal inspection, and Reduce Motion.

## Implemented cleanup

- Consolidated artwork/name/price into one header that compacts with scrolling; one logo-close control, a bookmark action, and an overflow menu for news, analysis, and bookmarking.
- Extended the fading header material through the status-bar area and constrained action layout to the visible width.
- Price-only native chart and matching Swift Charts fallback, without default prediction, volume, market-cap, Hull, grid, axis, or repeated price-label layers.
- 1D/1W/1M/1Y controls, default 1D; price-window trimming and period-change math use observed data and label materially partial histories.
- Cached 90-day history continues to warm indicators for the newly available short ranges.
- Added compact-header previews, range/adapter/layout tests, and UI coverage for range changes, scrubbing, compact actions, repeated logo dismissal, and the legacy renderer with larger text.
- No changes to the Pyth transport, authentication, or web backend.
