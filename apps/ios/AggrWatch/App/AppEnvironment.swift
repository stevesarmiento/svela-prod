import AggrAPI
import AggrCore
import ClerkKit
import Foundation
import Observation

/// Composition root. One instance lives for the app's lifetime and is injected via `.environment`.
@Observable
final class AppEnvironment {
  let config: AppConfig
  let convex: ConvexService
  let clerkSession: ClerkSessionStore
  let userBootstrap: UserBootstrap
  let watchlists: WatchlistRepository
  let apiClient: APIClient
  let market: MarketAPI
  let queryCache: QueryCache
  let toasts: ToastCenter
  let router: AppRouter
  let watchlistData: WatchlistDataStore
  let realtime: RealtimePriceCoordinator
  let overview: OverviewRepository
  let screener: ScreenerAPI
  let selection: SelectionStore
  let derivatives: DerivativesAPI
  let analysis: AnalysisDataService
  let news: NewsRepository
  let settings: SettingsRepository
  #if DEBUG
  /// DEBUG only: skip Clerk sign-in to exercise public data (search, token pages, screener browse).
  var debugBypassAuth = false
  /// DEBUG only: open token pages scrolled to the bottom (indicator cards) for screenshots.
  var debugScrollBottom = false
  #endif

  init(config: AppConfig) {
    self.config = config
    self.convex = ConvexService(deploymentUrl: config.convexURL)
    self.clerkSession = ClerkSessionStore()
    self.userBootstrap = UserBootstrap(convex: convex)
    self.watchlists = WatchlistRepository(convex: convex)
    self.apiClient = APIClient(baseURL: config.apiBaseURL, tokenProvider: ClerkDefaultTokenProvider())
    self.market = MarketAPI(client: apiClient)
    self.queryCache = QueryCache()
    self.toasts = ToastCenter()
    self.router = AppRouter()
    self.watchlistData = WatchlistDataStore(repository: watchlists, market: market, cache: queryCache)
    self.realtime = RealtimePriceCoordinator(convex: convex)
    self.overview = OverviewRepository(convex: convex)
    self.screener = ScreenerAPI(client: apiClient)
    self.selection = SelectionStore()
    self.derivatives = DerivativesAPI(client: apiClient)
    self.analysis = AnalysisDataService(market: market, derivatives: derivatives, cache: queryCache)
    self.news = NewsRepository(convex: convex)
    self.settings = SettingsRepository(convex: convex)
  }

  /// True once Clerk has an active user AND Convex accepted its token — the gate for `*My*` queries.
  var isReadyForUserData: Bool {
    clerkSession.isSignedIn && convex.authStatus == .authenticated
  }

  /// DEBUG: `xcrun simctl launch booted watch.aggr.ios --debug-bypass-auth --open-url aggrwatch://watchlists/bitcoin`
  func applyLaunchArguments(_ args: [String] = ProcessInfo.processInfo.arguments) {
    #if DEBUG
    if args.contains("--debug-bypass-auth") { debugBypassAuth = true }
    if args.contains("--debug-scroll-bottom") { debugScrollBottom = true }
    if let i = args.firstIndex(of: "--open-url"), i + 1 < args.count, let url = URL(string: args[i + 1]) {
      Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(600))
        self.handleDeepLink(url)
      }
    }
    #endif
  }

  /// On a physical device `localhost` is the phone itself, so a Debug build pointed at the local
  /// Next.js server silently fails every `/api/*` call. Surface it once instead of a log storm.
  func warnIfAPIHostUnreachableFromDevice() {
    #if !targetEnvironment(simulator)
    let host = config.apiBaseURL.host()?.lowercased() ?? ""
    guard ["localhost", "127.0.0.1", "::1"].contains(host) else { return }
    toasts.error("API points at localhost",
                 "Market data can't load on a device. Set API_BASE_URL in apps/ios/Config/Local.xcconfig to your Mac's LAN IP (ipconfig getifaddr en0), then rebuild.")
    #endif
  }

  func handleDeepLink(_ url: URL) {
    guard let link = DeepLinkParser.parse(url, appOrigin: config.apiBaseURL) else { return }
    #if DEBUG
    if link == .debugBypassAuth { debugBypassAuth = true; return }
    #endif
    router.handle(link, watchlistData: watchlistData)
  }

  func handleForeground() async {
    await convex.refreshAuthNow()
    await watchlistData.refreshOnForeground()
  }

  func signOut() async {
    userBootstrap.reset()
    watchlistData.stop()
    await queryCache.removeAll()
    await clerkSession.signOut()
  }
}
