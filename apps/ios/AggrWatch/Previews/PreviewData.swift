#if DEBUG
import AggrAPI
import AggrCore
import ClerkKit
import SwiftUI

/// Synthetic, local data shared by every canvas. Never use production credentials in previews.
enum PreviewData {
  /// The CLI flag allows smoke-testing the same fixtures without Xcode's preview-agent launch mode.
  static var isRunning: Bool {
    ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
      || ProcessInfo.processInfo.arguments.contains("--preview-fixtures")
  }
  enum State { case populated, empty, loading, error }

  static let user = User(
    backupCodeEnabled: false, createdAt: Date(timeIntervalSince1970: 1_700_000_000),
    createOrganizationEnabled: false, deleteSelfEnabled: false, emailAddresses: [.init(id: "preview-email", emailAddress: "alex@example.com")],
    externalAccounts: [], firstName: "Alex", hasImage: false, id: "preview-user", imageUrl: "",
    lastName: "Morgan", organizationMemberships: [], passkeys: [], passwordEnabled: false,
    phoneNumbers: [], primaryEmailAddressId: "preview-email", totpEnabled: false, twoFactorEnabled: false, updatedAt: .now
  )
  static let analysisText = """
  ## Sample analysis
  This is fictional preview content for checking typography and layout.

  **Momentum** is improving while price consolidates above its recent average. Volume is steady, with a few larger sessions visible in the chart.

  - Watch whether price holds the recent range.
  - Compare momentum with the broader market.
  - A move outside the range may change the picture.

  ### Volatility and context
  The indicators show mixed signals. This longer paragraph helps check line wrapping, spacing, and scrolling at different Dynamic Type sizes.
  """

  static func environment(state: State = .populated, signedIn: Bool = true, tab: AppTab = .overview) -> AppEnvironment {
    let responses = state == .error ? [:] : PreviewFixtures.subscriptions(empty: state == .empty)
    let convex = ConvexService(previewResponses: responses, suspendSubscriptions: state == .loading)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PreviewURLProtocol.self]
    let client = APIClient(baseURL: URL(string: "https://preview.invalid")!, tokenProvider: nil,
                           session: URLSession(configuration: configuration))
    let env = AppEnvironment(config: AppConfig(convexURL: "https://preview.invalid", clerkPublishableKey: "", apiBaseURL: URL(string: "https://preview.invalid")!),
                             convex: convex, clerkSession: ClerkSessionStore(previewUser: signedIn ? user : nil), apiClient: client)
    env.router.tab = tab
    if state == .populated { env.watchlistData.seedPreview() }
    return env
  }

  static func tokenStore(_ env: AppEnvironment, loading: Bool = false) -> TokenChartStore {
    let store = TokenChartStore(coinId: "bitcoin", market: env.market, cache: env.queryCache, initialQuote: PreviewFixtures.quotes[0])
    if !loading { store.seedPreview() }
    return store
  }

  static func overviewStore(_ env: AppEnvironment) -> OverviewStore {
    let store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: env.market, cache: env.queryCache)
    store.seedPreview()
    return store
  }
}

/// Owns one environment per canvas, supplies navigation/toasts, and starts only local fixture reads.
struct PreviewHost<Content: View>: View {
  @State private var env: AppEnvironment
  private let navigation: Bool
  private let content: (AppEnvironment) -> Content

  init(state: PreviewData.State = .populated, signedIn: Bool = true, tab: AppTab = .overview,
       navigation: Bool = true, @ViewBuilder content: @escaping (AppEnvironment) -> Content) {
    AppTypography.configureNavigation()
    _env = State(initialValue: PreviewData.environment(state: state, signedIn: signedIn, tab: tab))
    self.navigation = navigation
    self.content = content
  }

  var body: some View {
    Group {
      if navigation { NavigationStack { content(env) } }
      else { content(env) }
    }
    .environment(env)
    .environment(env.toasts)
    .preferredColorScheme(.dark)
    .fontDesign(.rounded)
    .tint(Color("AccentColor"))
    .task { env.watchlistData.start() }
    .onDisappear { env.watchlistData.pause(); env.realtime.stopAll() }
  }
}

/// Stateful bindings for controls; unlike `.constant`, buttons and pickers remain interactive.
struct PreviewValue<Value, Content: View>: View {
  @State private var value: Value
  private let content: (Binding<Value>) -> Content
  init(_ initialValue: Value, @ViewBuilder content: @escaping (Binding<Value>) -> Content) {
    _value = State(initialValue: initialValue); self.content = content
  }
  var body: some View { content($value) }
}
#endif
