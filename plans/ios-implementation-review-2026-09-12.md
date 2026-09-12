# iOS implementation review — September 12, 2026

## Implementation follow-up

The reliability pass is now implemented in the working tree. Findings 1–10 below describe the original review baseline (`483157a`); the changes address them with locale-aware holdings input, cancellable analysis deadlines, bootstrap retries and error/retry UI, membership-based chart invalidation, foreground refresh/pause handling, missing-data checks, a shared market-request budget, cache expiry/cancellation, pre-stream 401 recovery, and freshness-aware spot selection.

Screener sharing is also wired up. Notification settings now explicitly say that they save account preferences and do not yet deliver iOS push notifications or price alerts.

**Validation after implementation:** simulator build/test passed **124 tests** (101 core, 19 API, four app tests), including 24 additional regression tests. Covered scenarios include localized input, fast completion/timeouts/cancellation, failed and retried bootstrap, account changes during bootstrap, cache cancellation/eviction/late responses, shared-token membership changes, null analysis fields, request-budget cancellation, streaming token refresh without replay after text, and stale live-price fallback.

**Still open:** production release values, app icon/signing, the additional login option for release, verification of the backend deletion cascade, native notification delivery, broader accessibility/device acceptance. No production settings or backend data were changed. The original assessment below is retained for context.

The implementation covers all eight planned phases at the screen level. The next milestone should be reliability and release readiness: there are real correctness defects, and passing the current tests does not establish end-to-end parity.

Reviewed the supplied plan, `apps/ios`, the corresponding web screens, Convex contracts, and relevant SDK integration code. The original assessment was a source and automated-test review, not a signed-in physical-device acceptance test. Application changes were made subsequently in the implementation follow-up above.

**Validation:** `swift test --package-path apps/ios/Packages/AggrCore` passed 94 tests. `xcodebuild ... test` on iPhone 17 Pro / iOS 26.1 built successfully and passed 100 tests: 94 core, five API/model tests, and one app test. Two additional standalone Swift probes reproduced the holdings parsing and task-race defects below. Simulator results are in [the xcresult bundle](/Users/stevensarmi/Code/svela-prod/apps/ios/DerivedData/Logs/Test/Test-AggrWatch-2026.09.12_14-03-00--0700.xcresult).

**Priority:** P1 = address before a broad beta or release; P2 = next reliability/parity pass. Deployment-dependent findings are explicitly marked.

| Area | Present in the implementation | Remaining work |
| --- | --- | --- |
| Authentication | Google OAuth, separate HTTP/Convex token providers, refresh bridge, user bootstrap | Recovery, real-device acceptance, App Store login decision |
| Watchlists | Groups, icons/colors, add/search/remove, holdings, grid/chart, selection | Locale-safe holdings, membership invalidation, failure states |
| Token detail | Price/mcap, Hull/projection, metrics, Pyth, volume pane | Freshness semantics, foreground recovery |
| Overview | Holdings value, benchmark, breadth, grouped news | Loading/error separation, partial quote coverage |
| Screener | Browse/search/NL filters, sort, taker batch, lazy trails, URL codec | Share UI, bounded trail requests, refresh behavior |
| Comparison | Group chart, accordion rows, analysis, bulk removal | Membership refresh and analysis task race |
| Indicators/AI/news | Four indicator panes, shared scrub, explain/deep/multi analysis, news badge/settings | Stream authentication recovery and cancellation |
| Account/settings | Clerk profile UI, preferences, sign-out, deletion button | Verify data deletion, distinguish stored preferences from delivered features |

## Confirmed implementation defects

### 1. P1 — Holdings entry can silently multiply a position

[WatchlistDetailSection.swift:252](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Watchlists/WatchlistDetailSection.swift:252) removes every comma before calling `Double`, but the editor populates its text with a locale-sensitive `NumberFormatter` and uses the locale-sensitive decimal keyboard.

**Reproduced:** French formatting turns `1.5` into `1,5`; the current parser saves `15.0`. Simply opening and committing an existing quantity can change its value. Grouping separators in other locales can also cause rejection.

**Fix:** parse with the same locale used to format; reject partially consumed input. Test `en_US`, `fr_FR`, and `de_DE`, including fractional amounts, grouped amounts, blank clearing, and unchanged commits. Do this before cosmetic work.

### 2. P1 — Multi-token analysis always waits at least 30 seconds

[DeepAnalysisSheet.swift:181](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Analysis/DeepAnalysisSheet.swift:181) races gathering against a timeout through [Task.select:211](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Analysis/DeepAnalysisSheet.swift:211). Its task-group children await two separately created tasks. Cancelling those children does not cancel the separately created tasks; leaving the group waits for both children.

**Reproduced:** a 50 ms task racing a 600 ms task returned after 612 ms even though the 50 ms task won. In the app, fast preparation still waits 30 seconds; slow preparation can exceed the supposed 30-second cap. Cancelling the sheet also does not promptly terminate this preparation path.

**Fix:** use a cancellation-aware race with explicit ownership of the actual work and timer. Check cancellation before starting the AI POST. Verify fast completion, timeout with partial results, and dismissal during preparation.

### 3. P1 — Bootstrap and subscription failures can leave a misleading empty or loading screen

[UserBootstrap.swift:35](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Convex/UserBootstrap.swift:35) records failure, but [RootView.swift:24](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/App/RootView.swift:24) only reruns it when user ID or Convex auth status changes. There is no visible bootstrap error/retry, and readiness does not wait for bootstrap success.

Separately, [WatchlistDataStore.swift:82](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Watchlists/WatchlistDataStore.swift:82) keeps its completed subscription-task handle after an error; `start()` then refuses to restart it. Watchlists/Compare show a spinner while bootstrap has not loaded without rendering `bootstrapError`. [OverviewStore.swift:107](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Overview/OverviewStore.swift:107) swallows subscription errors and can show `$0` / “No holdings” instead of a failed load. Failed snapshot refreshes are also suppressed by a key recorded before success.

**Fix:** explicit bootstrap/loading/ready/error state, visible Retry, bounded retries for transient failures, and restartable subscriptions. Test new-account bootstrap failure and server query failure independently; ordinary Convex reconnect behavior is not a replacement for recovering a terminated subscription.

### 4. P2 — Moving/removing a token between existing groups leaves stale aggregate charts

[WatchlistDataStore.swift:124](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Watchlists/WatchlistDataStore.swift:124) invalidates on the union of all coin IDs. [CompareView.swift:50](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Compare/CompareView.swift:50) additionally includes group IDs, but still omits membership.

Example: BTC is in groups A and B; remove it from A. The global coin set and group IDs are unchanged, so A's chart can still include BTC even though its rows no longer do. Watchlist card aggregates eventually refresh on their polling cycle; Compare has no equivalent chart poll.

**Fix:** key derived group series by each group's coin IDs. Reuse cached raw histories and recompute immediately after subscription changes. Also clear comparison series when the last coin is removed.

### 5. P2 — Freshness policy exists in configuration but is only partly implemented

[AppEnvironment.swift:96](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/App/AppEnvironment.swift:96) refreshes auth and watchlist data on foreground, but does not refresh the open token store, overview, screener, or comparison. The stores have independent timers; no shared scene-active gate implements the plan's lifecycle contract. Compare/group charts are primarily task-key driven. TokenChartStore uses a five-minute settled interval although `QueryPolicy.chart` specifies two minutes.

**Fix:** implement the planned resource/lifecycle coordinator or an equivalent explicit lifecycle API. Refresh stale visible data on resume, pause unnecessary work when inactive, and use the declared policy consistently. Test resuming each tab after ten minutes, including a network change. iOS suspension may pause execution, but it does not implement cache invalidation or immediate foreground refresh.

### 6. P2 — Missing data still becomes a real-looking zero

Decoding preserves nulls, but [OverviewStore.swift:47](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Overview/OverviewStore.swift:47) prices unavailable holdings at zero and presents the result as the portfolio total. [AnalysisDataService.swift:59](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Analysis/AnalysisDataService.swift:59) replaces missing price, change, market cap, and volume with zero before constructing AI input. This breaks the plan's explicit missing-versus-zero requirement, even where similar behavior exists on the web.

**Fix:** distinguish loading/unavailable/partial from a complete total. For example, show “8 of 10 positions priced.” Omit unknown analysis fields where the endpoint permits it; otherwise show insufficient-data state instead of supplying fabricated zero observations. Test downstream display/payload behavior, not only decoding.

### 7. P2 — Screener trails lack the planned request budget

[TrailCell:248](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Screener/ScreenerView.swift:248) launches one request per encountered coin. Lazy rows help, but [QueryCache.swift:26](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Cache/QueryCache.swift:26) creates independent tasks that keep running when the row disappears. There is no shared concurrency/rate budget for these requests, and failures remain skeletons.

**Fix:** a shared bounded queue with cancellation/subscriber ownership, a rate budget across chart consumers, and a terminal unavailable state. Verify a fast scroll through 500 coins against the 240/minute market-data budget. A concurrency cap alone does not guarantee that requests stay below a per-minute limit.

### 8. P2 — Cache retention and sign-out cleanup are incomplete

`QueryPolicy.gcTime` is declared but never used by [QueryCache.swift](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Cache/QueryCache.swift). Search strings, screens, and chart histories accumulate for the process lifetime. `removeAll()` clears entries but neither cancels in-flight tasks nor prevents their completion from repopulating the cache.

[AppEnvironment.swift:101](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/App/AppEnvironment.swift:101) also omits the existing router reset and explicit selection reset. Old navigation can carry into the next login. This is a lifecycle defect; this review did not demonstrate disclosure of one user's private backend data to another.

**Fix:** bounded/expiring cache entries, a generation token for invalidation, explicit session teardown, and account-switch tests with requests in flight.

### 9. P2 — AI streaming bypasses HTTP authentication recovery

JSON requests retry a 401 once with a fresh Clerk token. [AIStreamClient.swift:18](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Networking/AIStreamClient.swift:18) directly calls `session.bytes`, and its request builder always uses the cached token. All three analysis surfaces miss that recovery path.

**Fix:** refresh and retry once on a pre-stream 401. Do not automatically replay an AI request after text has already arrived. Test both cases and cancellation using a mock transport.

### 10. P2 — “Fallback” status can still display an old Pyth price

[RealtimePriceCoordinator.swift:100](/Users/stevensarmi/Code/svela-prod/apps/ios/Packages/AggrAPI/Sources/AggrAPI/Realtime/RealtimePriceCoordinator.swift:100) changes the badge status after 7.5 seconds without a tick but retains the spot value. [LivePricing.resolve:109](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/TokenDetail/PriceChartCard.swift:109) checks only a broad price ratio, not age or status, so the retained spot can continue to override a newer quote indefinitely. The web has related behavior; this is a product correctness improvement as well as an iOS hardening task.

**Fix:** resolve display price and source together, explicitly choosing fresh live, dated last-known, or quote fallback. Test Pyth failure while HTTP quotes continue to update.

## Missing product and release work

**Google-only login needs a release decision.** The plan explicitly chose Google only, and [LoginView.swift:25](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Login/LoginView.swift:25) implements that choice. Apple's current guideline 4.8 generally requires an equivalent privacy-preserving login option when a primary account uses social login, subject to listed exceptions. Sign in with Apple is the straightforward option here; this app does not appear to fit an obvious exception. This is an inference from the product and [Apple's login-services guideline](https://developer.apple.com/app-store/review/guidelines/#login-services), not an observed review rejection.

**Account deletion is not verified end to end.** [SettingsView.swift:123](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Settings/SettingsView.swift:123) deletes the Clerk user, while the copy promises deletion of watchlists. I found no account-deletion cascade or `user.deleted` handler in the checked-in app/backend. An externally configured integration could exist; that was not inspected. Verify deletion of Convex user-associated data with a disposable account. [Apple describes deletion as including associated personal data](https://developer.apple.com/support/offering-account-deletion-in-your-app). The “no backend changes” plan constraint may need revisiting if no existing cleanup service exists. The current web deletion flow also relies on Clerk, so do not classify this solely as a port regression.

**Release configuration is unfinished.** [Release.xcconfig:3](/Users/stevensarmi/Code/svela-prod/apps/ios/Config/Release.xcconfig:3) contains `REPLACE_ME` Convex/Clerk values; AppConfig only rejects empty strings. The AppIcon catalog contains no image filename. `project.yml` has empty entitlements, ad-hoc signing configuration, and a local-networking ATS exception shared by all configurations rather than Debug only. Supply real release configuration/assets/signing, reject placeholders at build time, and exercise a signed device build. Dashboard configuration and production OAuth were not verified.

**Notification toggles currently save preferences, not native notification capability.** Settings exposes Push notifications and Price alerts, but there is no notification authorization flow, device-token registration, APNs entitlement, or native delivery handling in the iOS source. Decide whether these are web/account preferences or actual iOS features; label or hide them accordingly. Delivering alerts requires a backend/delivery design beyond porting the settings row.

**Screener sharing has a codec but no user action.** [ScreenerStore.webURLQuery:47](/Users/stevensarmi/Code/svela-prod/apps/ios/AggrWatch/Features/Screener/ScreenerStore.swift:47) exists but is not wired to a Share control. Add ShareLink using the production web origin, then verify web → app and app → web filter/sort/search round trips. Keep Universal Links in the intentional later scope unless promotion/sharing makes them necessary now.

**Preference scope should be explicit.** The model includes cleanup/retention/theme/currency/date format, but the iOS settings UI exposes only six booleans and the repository only writes boolean patches. The app is forced dark and USD-based. The current web settings page mounts account management only: these are plan/model gaps, not missing active web controls. Avoid expanding the parity target to dormant preferences without deciding what they should actually do.

**Native acceptance work is missing from the plan.** Add physical-device OAuth/relaunch/sign-out, VoiceOver access to selection and charts, large Dynamic Type on dense rows/stat strips, and a narrow-screen/iPad pass. Existing accessibility labels provide a starting point, but current tests do not validate these flows. Also add visible privacy/support destinations and review app/SDK privacy declarations for distribution; no app-owned privacy manifest or privacy-policy link was found in the iOS source.

## Suggested next work

1. **Correctness:** holdings locale parsing, analysis task race, bootstrap/query failure states, and missing-data totals. Add focused regression tests around actual failure scenarios.
2. **Reliable live data:** membership-based aggregates, foreground refresh, bounded screener requests, streaming 401 recovery, freshness-aware prices, cache/session cleanup.
3. **Finish the product contract:** screener sharing; decide what notification and preference controls promise; verify deletion and the login option needed for release.
4. **Device/release acceptance:** production configuration, icon/signing, device OAuth, accessibility, and a repeatable signed-in smoke suite.

Keep the native architecture, pure Swift core, and indicator characterization tests. They are useful foundations. The five API tests are model/error checks; the sole app test only counts tabs. None currently exercises the auth bridge, network retries, stream cancellation, bootstrap recovery, deep-link routing, CRUD persistence, account switching, or store lifecycle. Those tests and acceptance checks will provide substantially more confidence than more screen scaffolding.

The floating mini-chart, advanced iPad tables, keyboard shortcuts, and Universal Links were explicitly deferred. Their absence is not a failure to execute the agreed initial scope. The volume pane and shared indicator scrubbing are already implemented and should be marked complete in an updated plan.
