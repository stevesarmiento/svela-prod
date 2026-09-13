import Combine
import Foundation
import Observation
@preconcurrency import ConvexMobile

public enum ConvexAuthStatus: Sendable, Equatable {
  case loading
  case unauthenticated
  case authenticated
}

public enum ConvexServiceError: LocalizedError, Sendable {
  case client(String)
  case server(String)
  case convex(String)

  public var errorDescription: String? {
    switch self {
    case .client(let m), .server(let m), .convex(let m): m
    }
  }

  static func map(_ error: ClientError) -> ConvexServiceError {
    switch error {
    case .InternalError(let msg): .client(msg)
    case .ServerError(let msg): .server(msg)
    case .ConvexError(let data): .convex(data)
    }
  }
}

/// Main-actor wrapper over `ConvexClientWithAuth<String>` exposing async/await + AsyncThrowingStream APIs.
///
/// Convex sends every `v.number()` as Float64 → decode as `Double`. Ids are `String`.
@MainActor
@Observable
public final class ConvexService {
  private let liveClient: ConvexClientWithAuth<String>?
  public var client: ConvexClientWithAuth<String> {
    guard let liveClient else { preconditionFailure("Offline previews have no Convex client") }
    return liveClient
  }
  #if DEBUG
  private var suspendPreviewSubscriptions = false
  private var previewResponses: [String: Data]?
  public var isPreview: Bool { previewResponses != nil }

  /// Local, read-only fixtures. Does not construct a socket or bind a Clerk session.
  public init(previewResponses: [String: Data], suspendSubscriptions: Bool = false) {
    self.liveClient = nil
    self.authProvider = ClerkConvexAuthProvider()
    self.previewResponses = previewResponses
    self.suspendPreviewSubscriptions = suspendSubscriptions
    self.authStatus = .authenticated
  }
  #endif
  public private(set) var authStatus: ConvexAuthStatus = .loading

  private let authProvider: ClerkConvexAuthProvider
  private var authObservation: Task<Void, Never>?

  public init(deploymentUrl: String, authProvider: ClerkConvexAuthProvider = ClerkConvexAuthProvider()) {
    self.authProvider = authProvider
    self.liveClient = ConvexClientWithAuth(deploymentUrl: deploymentUrl, authProvider: authProvider)
    authProvider.bind(client: client)
    let publisher = client.authState
    authObservation = Task { @MainActor [weak self] in
      for await state in publisher.values {
        guard let self else { break }
        switch state {
        case .loading: self.authStatus = .loading
        case .unauthenticated: self.authStatus = .unauthenticated
        case .authenticated: self.authStatus = .authenticated
        }
      }
    }
  }

  public func retryAuthentication() async {
    guard let liveClient else { return }
    _ = await liveClient.loginFromCache()
  }

  /// Push a fresh token to Convex right away (e.g. on app foreground).
  public func refreshAuthNow() async {
    guard liveClient != nil else { return }
    await authProvider.refreshNow()
  }

  /// Reactive subscription. Cancel the consuming Task to end the upstream Convex subscription.
  public func subscribe<T: Decodable & Sendable>(
    _ name: String,
    args: ConvexArgs? = nil,
    as type: T.Type = T.self
  ) -> AsyncThrowingStream<T, Error> {
    #if DEBUG
    if let previewResponses {
      if suspendPreviewSubscriptions { return AsyncThrowingStream { _ in } }
      return AsyncThrowingStream { continuation in
        do {
          guard let data = previewResponses[name] else { throw ConvexServiceError.client("No preview fixture for \(name)") }
          continuation.yield(try JSONDecoder().decode(T.self, from: data))
          continuation.finish()
        } catch { continuation.finish(throwing: error) }
      }
    }
    #endif
    return Self.bridge(client.subscribe(to: name, with: args?.toSDKArgs(), yielding: T.self))
  }

  /// Combine → AsyncThrowingStream. `nonisolated` on purpose: the Convex FFI delivers values on a tokio
  /// thread, so the sink closures must not inherit main-actor isolation (Swift 6 asserts on it).
  nonisolated private static func bridge<T: Decodable & Sendable>(_ publisher: AnyPublisher<T, ClientError>) -> AsyncThrowingStream<T, Error> {
    AsyncThrowingStream { continuation in
      let box = CancellableBox()
      box.cancellable = publisher.sink(
        receiveCompletion: { completion in
          switch completion {
          case .finished: continuation.finish()
          case .failure(let error): continuation.finish(throwing: ConvexServiceError.map(error))
          }
        },
        receiveValue: { value in
          continuation.yield(value)
        }
      )
      continuation.onTermination = { _ in box.cancel() }
    }
  }

  public func mutation<T: Decodable & Sendable>(_ name: String, args: ConvexArgs? = nil) async throws -> T {
    guard liveClient != nil else { throw ConvexServiceError.client("This action is unavailable in an offline preview.") }
    let raw = args?.toSDKArgs()
    do { return try await client.mutation(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func mutation(_ name: String, args: ConvexArgs? = nil) async throws {
    guard liveClient != nil else { throw ConvexServiceError.client("This action is unavailable in an offline preview.") }
    let raw = args?.toSDKArgs()
    do { try await client.mutation(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func action<T: Decodable & Sendable>(_ name: String, args: ConvexArgs? = nil) async throws -> T {
    guard liveClient != nil else { throw ConvexServiceError.client("This action is unavailable in an offline preview.") }
    let raw = args?.toSDKArgs()
    do { return try await client.action(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func action(_ name: String, args: ConvexArgs? = nil) async throws {
    guard liveClient != nil else { throw ConvexServiceError.client("This action is unavailable in an offline preview.") }
    let raw = args?.toSDKArgs()
    do { try await client.action(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }
}

/// Holds a Combine cancellable so it can be released from a `@Sendable` termination handler.
private final class CancellableBox: @unchecked Sendable {
  var cancellable: AnyCancellable?
  func cancel() { cancellable?.cancel(); cancellable = nil }
}
