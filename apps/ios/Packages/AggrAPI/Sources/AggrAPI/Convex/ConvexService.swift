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
  public let client: ConvexClientWithAuth<String>
  public private(set) var authStatus: ConvexAuthStatus = .loading

  private let authProvider: ClerkConvexAuthProvider
  private var authObservation: Task<Void, Never>?

  public init(deploymentUrl: String, authProvider: ClerkConvexAuthProvider = ClerkConvexAuthProvider()) {
    self.authProvider = authProvider
    self.client = ConvexClientWithAuth(deploymentUrl: deploymentUrl, authProvider: authProvider)
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

  public func retryAuthentication() async { _ = await client.loginFromCache() }

  /// Push a fresh token to Convex right away (e.g. on app foreground).
  public func refreshAuthNow() async {
    await authProvider.refreshNow()
  }

  /// Reactive subscription. Cancel the consuming Task to end the upstream Convex subscription.
  public func subscribe<T: Decodable & Sendable>(
    _ name: String,
    args: ConvexArgs? = nil,
    as type: T.Type = T.self
  ) -> AsyncThrowingStream<T, Error> {
    Self.bridge(client.subscribe(to: name, with: args?.toSDKArgs(), yielding: T.self))
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
    let raw = args?.toSDKArgs()
    do { return try await client.mutation(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func mutation(_ name: String, args: ConvexArgs? = nil) async throws {
    let raw = args?.toSDKArgs()
    do { try await client.mutation(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func action<T: Decodable & Sendable>(_ name: String, args: ConvexArgs? = nil) async throws -> T {
    let raw = args?.toSDKArgs()
    do { return try await client.action(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }

  public func action(_ name: String, args: ConvexArgs? = nil) async throws {
    let raw = args?.toSDKArgs()
    do { try await client.action(name, with: raw) } catch let e as ClientError { throw ConvexServiceError.map(e) }
  }
}

/// Holds a Combine cancellable so it can be released from a `@Sendable` termination handler.
private final class CancellableBox: @unchecked Sendable {
  var cancellable: AnyCancellable?
  func cancel() { cancellable?.cancel(); cancellable = nil }
}
