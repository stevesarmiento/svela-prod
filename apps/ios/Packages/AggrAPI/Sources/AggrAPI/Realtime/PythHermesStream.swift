import AggrCore
import Foundation

/// SSE client for `https://hermes.pyth.network/v2/updates/price/stream?ids[]=…&parsed=true`.
/// Reconnect on failure with jittered exponential backoff (1s doubling, cap 30s); on graceful close
/// resubscribe after 3s. A single frame may carry multiple feeds — all are emitted.
public actor PythHermesStream {
  public static let defaultBaseURL = URL(string: "https://hermes.pyth.network")!
  private let baseURL: URL
  private let session: URLSession

  public init(baseURL: URL = PythHermesStream.defaultBaseURL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  public nonisolated func ticks(feedIds: [String]) -> AsyncStream<PythHermes.Tick> {
    let ids = Array(Set(feedIds.map { PythHermes.normalizeFeedId($0.trimmingCharacters(in: .whitespaces)) }.filter { !$0.isEmpty })).sorted()
    let baseURL = self.baseURL
    let session = self.session
    return AsyncStream { continuation in
      guard !ids.isEmpty else { continuation.finish(); return }
      let task = Task {
        var backoff: Duration = .seconds(1)
        while !Task.isCancelled {
          var comps = URLComponents(url: baseURL.appending(path: "v2/updates/price/stream"), resolvingAgainstBaseURL: false)!
          comps.percentEncodedQueryItems = ids.map { URLQueryItem(name: "ids%5B%5D", value: $0) } + [URLQueryItem(name: "parsed", value: "true")]
          guard let url = comps.url else { continuation.finish(); return }
          var request = URLRequest(url: url)
          request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
          request.timeoutInterval = 60
          do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
              throw URLError(.badServerResponse)
            }
            backoff = .seconds(1)
            for try await line in bytes.lines {
              if Task.isCancelled { break }
              guard let entries = PythHermes.parseSseDataLine(line) else { continue }
              for entry in entries {
                if let tick = PythHermes.normalize(entry) { continuation.yield(tick) }
              }
            }
            if Task.isCancelled { break }
            // Graceful close → resubscribe on a fixed 3s cadence.
            try? await Task.sleep(for: .seconds(3))
          } catch is CancellationError {
            break
          } catch {
            if Task.isCancelled { break }
            let jitter = Double.random(in: 0.7...1.3)
            let delay = min(backoff * jitter, .seconds(30))
            try? await Task.sleep(for: delay)
            backoff = min(backoff * 2, .seconds(30))
          }
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}

/// `resolveHermesCryptoUsdFeedId`: `GET /v2/price_feeds?query=SYM/USD`, exact base-symbol match only,
/// 7-day UserDefaults cache. Never throws — nil on any failure.
public actor PythFeedResolver {
  private let baseURL: URL
  private let session: URLSession
  private let cacheKeyPrefix = "SVELA_PYTH_HERMES_FEED_ID_BY_SYMBOL:v2:"
  private let cacheTTL: TimeInterval = 7 * 24 * 60 * 60

  public init(baseURL: URL = PythHermesStream.defaultBaseURL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  private struct Cached: Codable { var feedId: String; var cachedAtMs: Double }
  private struct FeedRow: Decodable {
    struct Attributes: Decodable {
      var asset_type: String?; var base: String?; var quote_currency: String?; var display_symbol: String?
    }
    var id: String?
    var attributes: Attributes?
  }

  public func resolveCryptoUsdFeedId(symbol: String) async -> String? {
    let upper = symbol.trimmingCharacters(in: .whitespaces).uppercased()
    guard !upper.isEmpty else { return nil }
    let key = cacheKeyPrefix + upper
    if let data = UserDefaults.standard.data(forKey: key), let cached = try? JSONDecoder().decode(Cached.self, from: data),
       Date().timeIntervalSince1970 * 1000 - cached.cachedAtMs < cacheTTL * 1000, !cached.feedId.isEmpty {
      return cached.feedId
    }
    var comps = URLComponents(url: baseURL.appending(path: "v2/price_feeds"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [URLQueryItem(name: "query", value: "\(upper)/USD")]
    guard let url = comps.url else { return nil }
    var request = URLRequest(url: url)
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 10
    guard let (data, response) = try? await session.data(for: request),
          let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
          let rows = try? JSONDecoder().decode([FeedRow].self, from: data) else { return nil }
    let cryptoUsd = rows.filter { $0.attributes?.asset_type == "Crypto" && $0.attributes?.quote_currency == "USD" && ($0.attributes?.base?.isEmpty == false) }
    let exact = cryptoUsd.first { $0.attributes?.base == upper && $0.attributes?.display_symbol == "\(upper)/USD" }
      ?? cryptoUsd.first { $0.attributes?.base == upper }
    guard let id = exact?.id, !id.isEmpty else { return nil }
    let normalized = PythHermes.normalizeFeedId(id)
    if let encoded = try? JSONEncoder().encode(Cached(feedId: normalized, cachedAtMs: Date().timeIntervalSince1970 * 1000)) {
      UserDefaults.standard.set(encoded, forKey: key)
    }
    return normalized
  }
}
