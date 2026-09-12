import Foundation

/// Streaming client for the Gemini-backed routes.
/// - `/api/analyze`, `/api/analyze/compare`: `streamText` raw text chunks (`streamProtocol: "text"`).
/// - `/api/analyze-indicator`: AI SDK UI-message SSE (`data: {"type":"text-delta","delta":…}`).
/// All three accept a raw JSON body. Cancel the consuming Task to abort the request.
public struct AIStreamClient: Sendable {
  public let client: APIClient
  public init(client: APIClient) { self.client = client }

  public enum Protocol_: Sendable { case text, uiMessageSSE }

  public func stream(path: String, body: Data, protocol proto: Protocol_) -> AsyncThrowingStream<String, Error> {
    let client = self.client
    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          let bytes = try await client.openAuthenticatedStream(path: path, body: body)
          switch proto {
          case .text:
            var buffer = Data()
            for try await byte in bytes {
              buffer.append(byte)
              if buffer.count >= 64 || byte == 0x0A {
                if let s = String(data: buffer, encoding: .utf8) { continuation.yield(s); buffer.removeAll(keepingCapacity: true) }
              }
              try Task.checkCancellation()
            }
            if !buffer.isEmpty, let s = String(data: buffer, encoding: .utf8) { continuation.yield(s) }
          case .uiMessageSSE:
            for try await line in bytes.lines {
              try Task.checkCancellation()
              guard line.hasPrefix("data:") else { continue }
              let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
              guard payload != "[DONE]", let data = payload.data(using: .utf8),
                    let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
              if obj["type"] as? String == "text-delta", let delta = obj["delta"] as? String { continuation.yield(delta) }
              else if obj["type"] as? String == "error", let msg = obj["errorText"] as? String { throw APIError.status(endpoint: path, status: 500, message: msg) }
            }
          }
          continuation.finish()
        } catch is CancellationError {
          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}

extension APIClient {
  /// Builds an authenticated POST request for streaming (90s timeout) plus the session to run it on.
  func makeStreamingRequest(path: String, body: Data, skipTokenCache: Bool = false) async throws -> (URLRequest, URLSession) {
    var request = Request(method: "POST", path: path, body: body, timeout: 90, retries: 0, requiresAuth: true)
    request.retries = 0
    let (req, session) = try await buildURLRequest(request, skipTokenCache: skipTokenCache)
    return (req, session)
  }
}

extension APIClient {
  /// Only a rejected request may be replayed. Once successful bytes are returned, callers never retry.
  func openAuthenticatedStream(path: String, body: Data) async throws -> URLSession.AsyncBytes {
    for attempt in 0...1 {
      try Task.checkCancellation()
      let (request, session) = try await makeStreamingRequest(path: path, body: body, skipTokenCache: attempt == 1)
      let (bytes, response) = try await session.bytes(for: request)
      guard let http = response as? HTTPURLResponse else { throw APIError.transport(endpoint: path, message: "Non-HTTP response") }
      if (200..<300).contains(http.statusCode) { return bytes }
      var data = Data()
      for try await byte in bytes { data.append(byte); if data.count >= 4096 { break } }
      if http.statusCode == 401 && attempt == 0 { continue }
      throw APIError.fromStatus(http.statusCode, endpoint: path, message: APIClient.errorMessage(from: data) ?? "Request failed: \(http.statusCode)")
    }
    throw APIError.fromStatus(401, endpoint: path, message: "Please sign in again.")
  }
}
