# AggrLiveline provenance and implementation status

Upstream: [benjitaylor/liveline](https://github.com/benjitaylor/liveline), version 0.0.7, commit `069899598a11e00094ea1eb6b838404825f828be`.

The original MIT notice is copied without modification into `Sources/AggrLiveline/Resources/Liveline-MIT.txt`. Swift Package Manager includes that resource bundle in the app. The TypeScript files in `Reference/` come from the pinned upstream `src/math/` directory, except `loadingShape.ts`, which comes from `src/draw/`. `generate-fixtures.ts` is our harness. `Reference/SHA256SUMS` records the reference files; they are test inputs, not an app JavaScript dependency.

The September 13 fidelity pass also adapts rendering behavior from `/Users/stevensarmi/Code/native/Sources/Liveline` at commit `08fff99ed1cf7d649319c3b0942a8d09de498542`: the screen-space reveal spline, retracting tip, curved badge tail, dark endpoint ring/shadow, and animated chevrons. Its MIT attribution is bundled in `Resources/Native-MIT.txt`. Aggr keeps original market timestamps and evaluates inspection against its rendered spline; it does not adopt that app's timestamp shifting or linear inspection interpolation.

Regenerate the independent expected values from this directory:

```sh
bun Reference/generate-fixtures.ts
swift test
```

The Swift source is a native adaptation using UIKit/Core Graphics and CADisplayLink, with SwiftUI integration. The package owns no network requests, market calculations, authentication, or persistence. Public time values are Unix seconds. Inputs require unique series IDs. Samples are sanitized and sorted, with the last duplicate winning. Rendering and inspection evaluate the same monotone cubic coefficients.

## Current scope

The token page is the first integrated screen. Debug builds use this renderer by default. Release builds retain the previous renderer until the physical-device motion, power, and regression gates in the main plan pass. The temporary UserDefaults key `charts.useLegacyPriceRenderer` can override either default. No two price renderers run concurrently.

| Capability | State |
| --- | --- |
| Monotone spline, interpolation, reference range, momentum detection, loading waveform, time intervals | Ported; numerical comparisons against original TypeScript fixtures |
| Price line/fill, endpoint/pulse, badge and tail, axes/grid, range/window interpolation | Implemented natively; token screenshots and interactions checked in simulator |
| Center-out loading/reveal, empty/placeholder, pause/resume | Implemented; temporal pixel parity with the browser remains to be measured |
| Touch inspection, horizontal intent, vertical-scroll handoff, pointer | Implemented; scroll and repeated page-close integration tested |
| Reduced Motion, accessibility chart descriptor and adjustable inspection | Implemented; VoiceOver audio-graph behavior still needs a device pass |
| Market cap rebasing, MHULL/SHULL, bull/base/bear and band, anchor, extrema, period highlight, volume | Integrated into the token chart; original AggrCore calculations retained |
| Trusted live observations and committed timeframe identity | Integrated; stale observations and obsolete requests rejected; synthetic fallback lines are not treated as price history |
| Multi-series drawing, visibility and widths | Available for token overlays; upstream multi-series label collision/legend behavior and other screen migrations remain pending |
| Momentum decoration | Animated chevrons adapted from the native port, disabled in Aggr; upstream glow/color choreography remains pending |
| Candles, line/candle morph, order book, particles/shake, LivelineTransition | Not implemented; no corresponding product controls are exposed |

`profile: .reference` currently selects reference numerical behavior, especially the fixed flat-series span. It does **not** certify complete visual or animation parity. Aggr uses a relative span for tiny prices, SF Rounded, custom formatting, a historical viewport extended for projections, shared price/volume insets, no automatic current-price guide, and a full dashed crosshair without cursor-side dimming. A provisional live point is separate from the immutable supplied history. The white price-line styling matches the existing app.

The engine caches spline geometry and static range calculations. UIKit owns frame updates; SwiftUI receives inspection changes, not every animation tick. Display links stop when inactive, detached, clipped offscreen, or settled; active pulse/loading effects intentionally continue while visible. The initial display cadence is capped at 60 Hz. Hardware frame time, thermal behavior, Low Power Mode, and 120 Hz have not been certified.

## Verification

- 16 numerical/state tests: upstream control points and curve samples, frame-rate-independent lerp, loading waveform, range/momentum/time interval fixtures, tiny prices, invalid samples, live/history consistency, stale observations, pause/resume, projection range, identity changes, Reduced Motion, placeholder inspection, static large-series settling, interruptible historical refreshes, retained scrub exit position, and clearing that position on token changes.
- Two UIKit geometry tests check that the revealing spline and endpoint remain attached throughout the transition, including with a future projection viewport, and that the continuous badge outline fits its bounds.
- A UIKit rendering test saves deterministic reveal/held-scrub/exit frames while advancing the full renderer at 60 Hz. The token UI test waits for the scrub fade to finish, rather than requiring immediate disappearance. The final 41-test simulator run is recorded in `/tmp/aggr-liveline-fidelity-verified.xcresult`; animation frame captures are also in `/tmp/aggr-liveline-motion-frames.xcresult`. The signed iPhone build succeeded inside Xcode after this pass.
- A 10,000-point static-engine exercise runs 1,200 settled frames and reports elapsed time. This excludes Core Graphics drawing and is not a device frame-rate claim.
- App tests cover the existing pricing trust policy and preview transport.
- `testNativePriceChartOverlaysScrubScrollAndReopen` exercises the actual token page with deterministic data, visibility toggles, all three timeframe buttons, horizontal inspection, vertical scrolling, and repeated closing/reopening.
- Xcode previews in `AggrPriceChart.swift`: token overlays, deterministic live replay with pause/loading/restart, and tiny prices. The replay uses synthetic data only in DEBUG preview code.

Remaining release gate: matched browser/native motion recordings, physical-device scroll/dismiss/VoiceOver checks, foreground/background energy profiling, and live-source recovery under network interruption. Full-library parity is a subsequent milestone, not a claim made by this first token integration.

The fidelity pass smooths the visible endpoint on history refresh as well as trusted live observations, preserves a released cursor through its fade, keeps loading-line and tip geometry coordinated, uses a 2-point primary stroke, and reserves readout height so scrubbing does not move the plot. The left edge fades through to the glass. Axis labels near the badge are omitted to avoid collisions. Live pulse still requires a trusted live observation.
