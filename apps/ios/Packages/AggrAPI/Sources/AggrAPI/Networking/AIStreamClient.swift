import Foundation
import Synchronization

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
            // Coalesce: bytes land in a buffer and a 40ms ticker flushes the complete UTF-8 prefix,
            // so the UI sees a few yields per second instead of one per 64 bytes, and a multi-byte
            // character split across chunks is never decoded as a lossy partial.
            let pending = Mutex(Data())
            let flush: @Sendable (_ final: Bool) -> Void = { final in
              pending.withLock { buffer in
                guard !buffer.isEmpty else { return }
                let count = final ? buffer.count : Self.completeUTF8PrefixLength(buffer)
                guard count > 0 else { return }
                continuation.yield(String(decoding: buffer.prefix(count), as: UTF8.self))
                buffer.removeSubrange(buffer.startIndex..<buffer.startIndex + count)
              }
            }
            let ticker = Task {
              while !Task.isCancelled {
                try await Task.sleep(for: .milliseconds(40))
                flush(false)
              }
            }
            do {
              for try await byte in bytes {
                pending.withLock { $0.append(byte) }
                try Task.checkCancellation()
              }
            } catch {
              ticker.cancel()
              throw error
            }
            ticker.cancel()
            flush(true)
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

  /// Length of the longest prefix that ends on a complete UTF-8 scalar (a trailing partial
  /// sequence of up to 3 bytes is held back for the next flush).
  static func completeUTF8PrefixLength(_ data: Data) -> Int {
    let count = data.count
    guard count > 0 else { return 0 }
    var back = 0
    var index = count - 1
    while index >= 0, back < 4 {
      let byte = data[data.startIndex + index]
      if byte & 0xC0 != 0x80 {
        let need: Int
        if byte & 0x80 == 0 { need = 1 }
        else if byte & 0xE0 == 0xC0 { need = 2 }
        else if byte & 0xF0 == 0xE0 { need = 3 }
        else if byte & 0xF8 == 0xF0 { need = 4 }
        else { need = 1 }
        return count - index >= need ? count : index
      }
      index -= 1; back += 1
    }
    return count
  }
}

extension APIClient {
  /// Builds an authenticated POST request for streaming (90s timeout) plus the session to run it on.
  nonisolated func makeStreamingRequest(path: String, body: Data, skipTokenCache: Bool = false) async throws -> (URLRequest, URLSession) {
    var request = Request(method: "POST", path: path, body: body, timeout: 90, retries: 0, requiresAuth: true)
    request.retries = 0
    let (req, session) = try await buildURLRequest(request, skipTokenCache: skipTokenCache)
    return (req, session)
  }
}

extension APIClient {
  /// Only a rejected request may be replayed. Once successful bytes are returned, callers never retry.
  nonisolated func openAuthenticatedStream(path: String, body: Data) async throws -> URLSession.AsyncBytes {
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
