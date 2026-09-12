import Foundation

/// One shared budget for market endpoints, including retries and requests started by lazy rows.
actor RequestBudget {
  private struct Waiter {
    let id: UUID
    let continuation: CheckedContinuation<Void, Error>
  }
  private let concurrency: Int
  private let limit: Int
  private let window: Duration
  private var active = 0
  private var starts: [ContinuousClock.Instant] = []
  private var queue: [Waiter] = []
  private var wakeup: Task<Void, Never>?

  init(concurrency: Int = 6, limit: Int = 220, window: Duration = .seconds(60)) {
    self.concurrency = max(1, concurrency); self.limit = max(1, limit); self.window = window
  }
  func acquire() async throws {
    try Task.checkCancellation()
    let id = UUID()
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        guard !Task.isCancelled else { continuation.resume(throwing: CancellationError()); return }
        queue.append(Waiter(id: id, continuation: continuation))
        drain()
      }
    } onCancel: {
      Task { await self.cancel(id) }
    }
  }
  func release() { active = max(0, active - 1); drain() }
  private func cancel(_ id: UUID) {
    guard let index = queue.firstIndex(where: { $0.id == id }) else { return }
    queue.remove(at: index).continuation.resume(throwing: CancellationError())
    drain()
  }
  private func drain() {
    wakeup?.cancel(); wakeup = nil
    let now = ContinuousClock.now
    starts.removeAll { now - $0 >= window }
    while active < concurrency, starts.count < limit, !queue.isEmpty {
      active += 1; starts.append(now)
      queue.removeFirst().continuation.resume()
    }
    if !queue.isEmpty, active < concurrency, let first = starts.first {
      let deadline = first + window
      wakeup = Task { [weak self] in
        do { try await Task.sleep(until: deadline, clock: .continuous) } catch { return }
        await self?.drain()
      }
    }
  }
}
