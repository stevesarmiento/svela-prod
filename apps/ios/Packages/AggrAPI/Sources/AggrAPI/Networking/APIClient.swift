import Foundation

/// JSON client for the Next.js `/api/*` routes. Attaches the DEFAULT Clerk session token as
/// `Authorization: Bearer …` (see `apps/app/src/lib/api/with-auth-ratelimit.ts`).
///
/// Policy (from `requestJson` in the Effect services): 8s timeout, bounded retry (2×, 500ms exponential)
/// only for transport / 429 / 5xx; on 401 refetch the token once with `skipCache` and retry.
public actor APIClient {
  public let baseURL: URL
  private let tokenProvider: (any BearerTokenProvider)?
  private let session: URLSession
  private let decoder: JSONDecoder
  private let marketBudget = RequestBudget()

  public init(baseURL: URL, tokenProvider: (any BearerTokenProvider)?, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.tokenProvider = tokenProvider
    self.session = session
    self.decoder = JSONDecoder()
  }

  public struct Request: Sendable {
    public var method: String
    public var path: String
    public var query: [URLQueryItem]
    public var body: Data?
    public var timeout: TimeInterval
    public var retries: Int
    public var requiresAuth: Bool

    public init(method: String = "GET", path: String, query: [URLQueryItem] = [], body: Data? = nil,
                timeout: TimeInterval = 8, retries: Int = 2, requiresAuth: Bool = true) {
      self.method = method; self.path = path; self.query = query; self.body = body
      self.timeout = timeout; self.retries = retries; self.requiresAuth = requiresAuth
    }

    var endpoint: String {
      var comps = URLComponents()
      comps.path = path
      comps.queryItems = query.isEmpty ? nil : query
      return comps.string ?? path
    }
  }

  // MARK: Public API

  public func get<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = [], timeout: TimeInterval = 8, requiresAuth: Bool = true) async throws -> T {
    try await send(Request(path: path, query: query, timeout: timeout, requiresAuth: requiresAuth))
  }

  public func post<T: Decodable & Sendable, B: Encodable & Sendable>(_ path: String, body: B, timeout: TimeInterval = 8, retries: Int = 0, requiresAuth: Bool = true) async throws -> T {
    let data = try JSONEncoder().encode(body)
    return try await send(Request(method: "POST", path: path, body: data, timeout: timeout, retries: retries, requiresAuth: requiresAuth))
  }

  /// Raw response bytes (for non-JSON or custom decoding).
  public func data(for request: Request) async throws -> (Data, HTTPURLResponse) {
    try await perform(request)
  }

  // MARK: Internals

  func send<T: Decodable & Sendable>(_ request: Request) async throws -> T {
    let (data, _) = try await perform(request)
    do {
      return try decoder.decode(T.self, from: data)
    } catch {
      throw APIError.decode(endpoint: request.endpoint, message: describeDecodingError(error))
    }
  }

  func perform(_ request: Request) async throws -> (Data, HTTPURLResponse) {
    var attempt = 0
    var delay: Duration = .milliseconds(500)
    var didRetryAuth = false
    while true {
      try Task.checkCancellation()
      do {
        return try await performOnce(request, skipTokenCache: didRetryAuth)
      } catch let error as APIError {
        if case .unauthorized = error, !didRetryAuth, request.requiresAuth, tokenProvider != nil {
          didRetryAuth = true
          continue
        }
        guard error.isTransient, attempt < request.retries else { throw error }
        attempt += 1
        try await Task.sleep(for: delay)
        delay *= 2
      }
    }
  }

  func buildURLRequest(_ request: Request, skipTokenCache: Bool) async throws -> (URLRequest, URLSession) {
    guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw APIError.transport(endpoint: request.endpoint, message: "Bad base URL")
    }
    comps.path = (comps.path.hasSuffix("/") ? String(comps.path.dropLast()) : comps.path) + request.path
    comps.queryItems = request.query.isEmpty ? nil : request.query
    guard let url = comps.url else { throw APIError.transport(endpoint: request.endpoint, message: "Bad URL") }
    var req = URLRequest(url: url)
    req.httpMethod = request.method
    req.timeoutInterval = request.timeout
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if let body = request.body {
      req.httpBody = body
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    if request.requiresAuth, let tokenProvider {
      if let token = try? await tokenProvider.token(skipCache: skipTokenCache) {
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      }
    }
    return (req, session)
  }

  private func performOnce(_ request: Request, skipTokenCache: Bool) async throws -> (Data, HTTPURLResponse) {
    let budget = request.path.hasPrefix("/api/coingecko/") || request.path.hasPrefix("/api/coinglass/") ? marketBudget : nil
    if let budget { try await budget.acquire() }
    defer { if let budget { Task { await budget.release() } } }
    try Task.checkCancellation()
    guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw APIError.transport(endpoint: request.endpoint, message: "Bad base URL")
    }
    comps.path = (comps.path.hasSuffix("/") ? String(comps.path.dropLast()) : comps.path) + request.path
    comps.queryItems = request.query.isEmpty ? nil : request.query
    guard let url = comps.url else { throw APIError.transport(endpoint: request.endpoint, message: "Bad URL") }

    var req = URLRequest(url: url)
    req.httpMethod = request.method
    req.timeoutInterval = request.timeout
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if let body = request.body {
      req.httpBody = body
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    if request.requiresAuth, let tokenProvider {
      if let token = try? await tokenProvider.token(skipCache: skipTokenCache) {
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      }
    }

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: req)
    } catch let urlError as URLError where urlError.code == .cancelled {
      throw CancellationError()
    } catch let urlError as URLError where urlError.code == .timedOut {
      throw APIError.timeout(endpoint: request.endpoint)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw APIError.transport(endpoint: request.endpoint, message: error.localizedDescription)
    }

    guard let http = response as? HTTPURLResponse else {
      throw APIError.transport(endpoint: request.endpoint, message: "Non-HTTP response")
    }
    guard (200..<300).contains(http.statusCode) else {
      let message = Self.errorMessage(from: data) ?? "Request failed: \(http.statusCode)"
      throw APIError.fromStatus(http.statusCode, endpoint: request.endpoint, message: message)
    }
    return (data, http)
  }

  /// `getErrorMessage`: `{error}` / `{message}` / `{details}` / raw text.
  static func errorMessage(from data: Data) -> String? {
    guard !data.isEmpty else { return nil }
    if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      for key in ["error", "message", "details"] {
        if let s = obj[key] as? String { return s }
      }
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private func describeDecodingError(_ error: Error) -> String {
    guard let d = error as? DecodingError else { return error.localizedDescription }
    switch d {
    case .keyNotFound(let k, let c): return "missing key '\(k.stringValue)' at \(c.codingPath.map(\.stringValue).joined(separator: "."))"
    case .typeMismatch(let t, let c): return "type mismatch \(t) at \(c.codingPath.map(\.stringValue).joined(separator: "."))"
    case .valueNotFound(let t, let c): return "null for \(t) at \(c.codingPath.map(\.stringValue).joined(separator: "."))"
    case .dataCorrupted(let c): return "corrupted at \(c.codingPath.map(\.stringValue).joined(separator: ".")): \(c.debugDescription)"
    @unknown default: return error.localizedDescription
    }
  }
}
