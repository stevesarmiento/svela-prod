# Token indicator parity audit

The reference is the web token page in `apps/app/src/app/[locale]/(dashboard)/watchlists/[id]`, including its explicit configs in `token-indicators-section.tsx`. Library defaults alone are not the reference: the token page uses a 20-period RSI Bollinger basis, for example.

## Calculations

`Scripts/generate-indicator-parity.ts` imports the web computation functions and generates `Packages/AggrCore/Tests/AggrCoreTests/Fixtures/indicator-web-parity.json`. Run from the repository root:

```sh
bun --tsconfig-override apps/app/tsconfig.json apps/ios/Scripts/generate-indicator-parity.ts
swift test --package-path apps/ios/Packages/AggrCore
```

The golden test compares every point's timestamp and value, Market Vision event indices and paired divergences, Bollinger breaches, BBWP and its MA, Caretaker pivots/divergences/alerts, signal values, reverse-RSI levels and signal-cross prices. The inputs cover two oscillating 400-bar histories, short history, flat zero-volume history, and empty history. Numeric tolerance is 1e-7. All five cases matched before changing the rendering; no indicator formulas needed replacement.

## Rendering corrections

| Indicator | Differences found on iOS | Updated behavior |
| --- | --- | --- |
| Market Vision | Stacked, overly opaque WT areas; missing fast WT, MFI strip, K/D lines, crossover/divergence dots; unscaled money-flow area; scale excluded RSI, stochastic and signal levels. | Independent zero-based waves in web layer order, matching outlines/opacity, fast WT, money flow at the web's visual-only 0.6 scale, -99/-95 strip, directional K/D band and lines, per-point RSI color, complete signal series and room for the ±108 markers. Removed paired WT segments that the web renderer does not draw. |
| Bollinger | Fixed 0–100 scale, extra 30/70 guides and colored band fill, solid colored band edges, understated breach dots. | Visible-window auto-scale with 10% margins, muted dotted band edges, dashed neutral basis, linear interpolation, rose/emerald breach dots. |
| BBWP | Screen-position RGB gradient, green low-volatility shading, missing 0/100 guides, thinner MA, no scale margins. | Rounded-value five-stop OKLCH colors, web 0/50/100 and 2/98 guide styles, blue low-volatility guide, no extra filled zones, white dashed 2-point MA, 15% margins. |
| Caretaker RSI | Generic RSI/orange signal, red/green zones, alerts only drawn after crossing, identical pivot triangles, hidden divergences styled like regular ones. | Cyan RSI/white signal; cyan/fuchsia control and critical zones; persistent yellow 85/15 guides with conditional highlight; directional white arrows; green/red regular and blue/orange hidden divergence lines and endpoint badges; web 200-marker/segment caps and 12% margins. |

Shared rendering now fits short histories, leaves one sampling interval after the final candle, scales to the visible window while panning, supports pinch zoom, and uses linear interpolation like the web. Axis styling omits vertical grid lines. Rendered paths keep boundary neighbors but exclude distant offscreen samples. Readouts wrap instead of disappearing into a horizontal stats strip.

## Data and interaction corrections

- Explanation charts now have a writable scrub binding, rather than `.constant(nil)`.
- Native readouts show candle-aligned dates and values while scrubbing. Pan/pinch and press-to-scrub are mobile equivalents of desktop drag/wheel/hover.
- The mobile 1D/1W price views already load the same longer indicator history as web 1M. Their explanation snapshots and request timeframe now consistently use that indicator scale.
- Explanation context uses the chart-aligned price, as web does.
- A previous computation cannot overwrite indicators after a timeframe change. Explain stays disabled while history/calculations are pending; a failed warmup request no longer silently retains a previous history buffer.

The numeric fixture tests establish parity for identical OHLCV inputs, not equality of live responses fetched at different times. Desktop pointer behavior and native touch presentation intentionally differ. The web currently filters crossover colors using stale RGB substrings despite emitting OKLCH colors; iOS renders the computed crossover series directly instead of reproducing that web rendering bug.

## Validation

- AggrCore: 109 tests across 24 suites passed, including the web fixture comparisons and scale/color regression tests.
- iOS simulator Debug build succeeded; app and UI test targets also compiled.
- The Xcode test runner stalled before executing app/UI tests. Direct simulator launch succeeded, but preview mode ignores deep links, so that did not provide an indicator-screen visual check. Pan, pinch, scrub, and final visual matching still need verification in Xcode previews or on a device. Each indicator includes a dedicated preview.
