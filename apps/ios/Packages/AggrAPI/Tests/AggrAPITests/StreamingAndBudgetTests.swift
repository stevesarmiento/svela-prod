import Foundation
import Synchronization
import Testing
@testable import AggrAPI

private final class MockStreamProtocol: URLProtocol, @unchecked Sendable {
  typealias Handler = @Sendable (URLRequest) -> (Int, String)
  static let handlers = Mutex<[String: Handler]>([:])
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    guard let url = request.url, let handler = Self.handlers.withLock({ $0[url.host ?? ""] }) else { return }
    let (status, body) = handler(request)
    let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(body.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
private actor TestTokenProvider: BearerTokenProvider {
  var calls: [Bool] = []
  func token(skipCache: Bool) async throws -> String? { calls.append(skipCache); return skipCache ? "fresh" : "expired" }
}

@Suite struct StreamAuthenticationTests {
  @Test func refreshesTokenOnceBeforeStreaming() async throws {
    let host = UUID().uuidString.lowercased() + ".test"
    MockStreamProtocol.handlers.withLock { handlers in handlers[host] = { request in
      request.value(forHTTPHeaderField: "Authorization") == "Bearer fresh" ? (200, "A streamed answer\n") : (401, "Expired")
    } }
    defer { MockStreamProtocol.handlers.withLock { $0[host] = nil } }
    let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [MockStreamProtocol.self]
    let session = URLSession(configuration: configuration); defer { session.invalidateAndCancel() }
    let tokens = TestTokenProvider()
    let api = APIClient(baseURL: URL(string: "https://" + host)!, tokenProvider: tokens, session: session)
    var output = ""
    for try await chunk in AIStreamClient(client: api).stream(path: "/api/analyze", body: Data("{}".utf8), protocol: .text) { output += chunk }
    #expect(output == "A streamed answer\n")
    #expect(await tokens.calls == [false, true])
  }

  @Test func doesNotReplayAfterTextArrives() async {
    let host = UUID().uuidString.lowercased() + ".test", requests = Mutex(0)
    MockStreamProtocol.handlers.withLock { handlers in handlers[host] = { _ in
      requests.withLock { $0 += 1 }
      return (200, "data: {\"type\":\"text-delta\",\"delta\":\"partial\"}\n\ndata: {\"type\":\"error\",\"errorText\":\"failed\"}\n\n")
    } }
    defer { MockStreamProtocol.handlers.withLock { $0[host] = nil } }
    let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [MockStreamProtocol.self]
    let session = URLSession(configuration: configuration); defer { session.invalidateAndCancel() }
    let api = APIClient(baseURL: URL(string: "https://" + host)!, tokenProvider: TestTokenProvider(), session: session)
    var output = ""
    do {
      for try await chunk in AIStreamClient(client: api).stream(path: "/api/analyze-indicator", body: Data("{}".utf8), protocol: .uiMessageSSE) { output += chunk }
      Issue.record("Expected stream failure")
    } catch { #expect(output == "partial") }
    #expect(requests.withLock { $0 } == 1)
  }
}

@Suite struct RequestBudgetTests {
  @Test func rateWindowDelaysAdditionalStarts() async throws {
    let budget = RequestBudget(concurrency: 2, limit: 1, window: .milliseconds(100))
    try await budget.acquire(); await budget.release()
    let start = ContinuousClock.now
    try await budget.acquire()
    #expect(ContinuousClock.now - start >= .milliseconds(70))
    await budget.release()
  }
  @Test func queuedRequestCanBeCancelled() async throws {
    let budget = RequestBudget(concurrency: 1)
    try await budget.acquire()
    let next = Task { try await budget.acquire() }
    next.cancel()
    do { try await next.value; Issue.record("Expected cancellation") } catch { #expect(error is CancellationError) }
    await budget.release()
    try await budget.acquire(); await budget.release()
  }
}
