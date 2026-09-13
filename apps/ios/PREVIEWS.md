# Xcode previews

Open `AggrWatch.xcodeproj`, select the **AggrWatch** scheme and an iOS 26 simulator, then open a SwiftUI view file. Choose **Editor → Canvas** and **Resume**. Select a named preview in the canvas to switch states. Use the interactive canvas to try controls, chart scrubbing, and swipe selection.

If the project is missing a newly added file, run `xcodegen generate` from `apps/ios` and reopen the project. The generated project is intentionally not tracked in Git.

## Useful starting points

- `Navigation/MainTabView.swift`: icon-only navigation and selection replacing the tab bar.
- `Navigation/TokenPresentationView.swift`: an interactive comparison where tapping a token expands its full-screen detail page; pull down from the header or tap the token logo to return, and tap the watchlist icon to open the card chooser. The page opens from its token row. Header pulls scale the rounded page around its center, then collapse it into the original row at 80% size; shorter pulls reset. Horizontal gestures and content scrolling stay independent.
- `Features/Watchlists/WatchlistsView.swift`: populated, empty, loading, error, and grid views.
- `Features/Watchlists/WatchlistDetailSection.swift`: separate token cards, holdings, and group charts.
- `Features/Selection/TokenSwipeCard.swift`: interactive right-select and left-remove gestures.
- `Features/Selection/TokenSelectionActionBar.swift`: removal, analysis-only, and disabled-analysis variants.
- `Features/Overview/OverviewView.swift`: dashboard states, portfolio value, breadth, and news cards.
- `Features/TokenDetail/TokenDetailView.swift`: full token screen; adjacent files preview chart cards, metrics, and indicators individually.
- `Features/Screener/ScreenerView.swift`: results, loading, empty, error, filter editor, prompt sheet, and row controls.
- `Features/Settings/SettingsView.swift`: settings and profile cards.
- `Features/Analysis`, `Features/NewsFeed`, `Features/Search`, and `Features/Login`: sheets and screens.
- `Charts` and `Components`: individual reusable views with sample values and stateful controls.

Change the canvas device and Dynamic Type settings to check smaller phones, iPad, and larger text. Previews use the app's dark appearance.

## Preview data and boundaries

`Previews/PreviewData.swift` owns each canvas's environment. `Previews/PreviewFixtures.swift` supplies fictional holdings, prices, chart histories, news, and an example account. Price shapes are deterministic; timestamps are anchored to the preview process's current time so date-sensitive charts still display.

Previews do not require credentials, sign-in, or a running backend. A session-local URL protocol supplies market responses, and a Convex fixture initializer avoids constructing a live client. Unknown endpoints and all Convex mutations/actions fail locally. OAuth and live Pyth subscriptions are disabled. AI sheets show clearly labeled sample prose. Token logos use their letter fallback in the canvas.

The app's own settings/profile UI is previewable. Clerk-hosted account management requires the running, signed-in app; opening it in a preview displays an explanation. Backend create/delete/save operations are not simulated as successful. Pickers, disclosure controls, chart scrubbing, selection, and navigation can still be exercised locally.

All preview declarations, fixtures, and offline service initializers are compiled only in Debug. Normal launches keep their existing live configuration; only the Xcode preview process (or an explicit Debug `--preview-fixtures` launch) skips Clerk setup at launch. The latter uses the same offline data for simulator smoke tests without requiring the canvas agent.
