import Foundation

/// Mirrors the tagged error taxonomy in `apps/app/src/lib/effect/*-api.ts` / `http-errors.ts`.
public enum APIError: LocalizedError, Sendable, Equatable {
  case transport(endpoint: String, message: String)
  case invalidParams(endpoint: String, message: String)   // 400
  case unauthorized(endpoint: String, message: String)    // 401
  case notFound(endpoint: String, message: String)        // 404
  case rateLimited(endpoint: String, message: String)     // 429
  case status(endpoint: String, status: Int, message: String)
  case decode(endpoint: String, message: String)
  case timeout(endpoint: String)                          // 408

  public var errorDescription: String? {
    switch self {
    case .transport(_, let m): m
    case .invalidParams(_, let m): m
    case .unauthorized: "Please sign in again."
    case .notFound(_, let m): m
    case .rateLimited: "Too many requests. Please wait a moment."
    case .status(_, let s, let m): m.isEmpty ? "Request failed: \(s)" : m
    case .decode(_, let m): "Unexpected response: \(m)"
    case .timeout: "Request timed out"
    }
  }

  public var endpoint: String {
    switch self {
    case .transport(let e, _), .invalidParams(let e, _), .unauthorized(let e, _), .notFound(let e, _),
         .rateLimited(let e, _), .status(let e, _, _), .decode(let e, _), .timeout(let e): e
    }
  }

  /// `isRetryableQueryError`: transport / 408 / 5xx retry; 4xx + decode never; 429 already retried internally.
  public var isRetryable: Bool {
    switch self {
    case .transport, .timeout: true
    case .status(_, let s, _): s == 0 || s >= 500
    default: false
    }
  }

  /// Transient per `requestJson` retry predicate: 429, network, 5xx.
  var isTransient: Bool {
    switch self {
    case .transport, .rateLimited, .timeout: true
    case .status(_, let s, _): s == 0 || s >= 500
    default: false
    }
  }

  static func fromStatus(_ status: Int, endpoint: String, message: String) -> APIError {
    switch status {
    case 400: .invalidParams(endpoint: endpoint, message: message)
    case 401: .unauthorized(endpoint: endpoint, message: message)
    case 404: .notFound(endpoint: endpoint, message: message)
    case 429: .rateLimited(endpoint: endpoint, message: message)
    default: .status(endpoint: endpoint, status: status, message: message)
    }
  }
}
