# Analysis UI parity audit

Audited September 14, 2026 against the current local web source. Scope: single-token deep analysis, multi-token comparison analysis, and all indicator explanation modes. The news feed's sentiment analysis and Smart Screener are separate features.

## Web-to-native coverage

| Web source / feature | Previous native behavior | Native implementation |
| --- | --- | --- |
| `navigation/analysis-dialog.tsx` | Header and streamed text only | Header, analysis date, chart, full metrics, report |
| `navigation/mini-price-chart.tsx` | Missing | Independent seven-day market-chart fetch, gain/loss price line, volume bars, EHMA 55 Hull overlay, crosshair with price/return/date |
| `market-metrics-sidebar.tsx`: market metrics | Missing | Chart-aligned spot price, market cap, 24h volume and volume trend |
| Price levels | Missing | Latest 21 observations' support and resistance |
| Technical indicators | Missing | Hull posture/strength, RSI value/meter/state, RSI bands, divergence signal, money flow value/meter/direction, wave trend value/meter/posture |
| Market structure | Missing | Available open interest/change, taker buy/sell split and meter, liquidation total/bias, 24h trend |
| `navigation/multi-analysis-dialog.tsx` | Token chips, small statistics grid, text | Chart and all comparative sections, preparation count, analysis date, explicit omitted-token notice |
| `navigation/multi-mini-price-chart.tsx` | Missing | Seven-day percentage lines on common four-hour buckets, daily fallback, common baseline/end, pastel legend updating on scrub |
| `comparative-stats-panel.tsx`: returns | Two numbers | 7d/30d returns with a shared meter domain across assets and benchmark identification |
| Risk | Two numbers | Annualized 30d volatility meters, beta, benchmark label and definition |
| Correlation | Missing | Full pairwise 30d matrix; horizontally scrollable for larger selections; accessible row/column names |
| Indicators | RSI/BBWP numbers only | Wave trend, money flow, RSI-band %B, BBWP, squeeze/expansion states and definitions |
| Momentum & flow | Missing | RSI meter and hot/oversold state, optional OI change/taker buy, excess 7d/30d return vs benchmark |
| `indicator-explain-dialog.tsx` | Existing native chart, badges, report | Retained all four charts (Market Vision, RSI bands, BBWP, RSI divergences); added timeframe context, horizontally scrollable badges, request-aligned quote, matching regenerate icon |
| Streaming lifecycle | Existing requests and cancellation | Same endpoints/protocols; data remains available while streaming or on report failure; generation guards prevent cancelled runs updating reopened sheets |
| History readiness | Native could send undersized history | Requires at least 30 valid price and volume observations, matching the web readiness rule |

## Mobile adaptations and deliberate corrections

- On iPhone, Report / Market data switches between the article and sidebar details, with the chart available in both. Switching never regenerates the report. At widths of 760 points or more, the sidebar and report have independent scrolling, as on the web.
- Charts remain native, borderless and touch-scrubbable. They use Swift Charts for these compact analytical plots. The main token price chart's AggrLiveline implementation is unchanged. The fixed seven-day mini-chart does not reproduce the desktop mini-chart's free mouse-wheel pan/zoom.
- The web's support/resistance label says “21d” but its code uses 21 observations from an intraday series. Native preserves the calculation and labels the actual window.
- The web sidebar's Hull status uses the sign of the 24h change, whereas the analysis payload uses recent-price momentum. Native uses the report payload's trend/strength so the sidebar and report do not disagree; the plotted Hull itself is the real EHMA 55 calculation.
- Missing derivatives are omitted or marked unavailable; native does not copy the web's `buyRatio || 50` fallback, which turns a valid zero into a neutral reading. Partial comparisons disclose exactly which tokens were omitted.
- The existing server-side AI prompts and providers are unchanged. Pyth/authentication and live-price availability remain outside this change.

## Data and validation

Single-token metrics use the retained `AnalysisDataService.Bundle`; comparative panels use the exact `ComparativeStats.Result` encoded into the comparison request. Price-chart history is fetched independently so chart availability does not depend on an AI response. Hull preparation is performed once when chart data arrives, not for every text chunk.

Tests cover shared timeline/baseline/end, daily fallback, no overlap, invalid/duplicate observations, actual preview data flowing through the analysis service, optional derivatives, and the two sheet flows including all metrics sections and panel switching. Offline previews use real analysis-data preparation, with only the AI report replaced by fixture text. Production AI network responses are not exercised by preview tests.

Verified results: 149 unit tests (AggrWatch, AggrCore, AggrAPI), two iPhone UI flows and the iPad sidebar UI flow passed. Simulator screenshots were reviewed for price/volume/Hull, comparative lines, returns/risk, correlation, indicator meters and populated derivatives. Result bundles: `/tmp/aggr-analysis-wide.xcresult` and `/tmp/aggr-analysis-phone-verified.xcresult`.

The wide presentation uses SwiftUI's [presentation sizing](https://developer.apple.com/documentation/SwiftUI/PresentationSizing) with a preferred width; compact windows retain the phone layout.
