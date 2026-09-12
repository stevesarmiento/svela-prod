import Foundation

public enum AsyncDeadline {
  /// Wait for work, a deadline, or caller cancellation. Owns and cancels the work on exit.
  /// A stream lets the deadline return even if the underlying operation is slow to cancel.
  public static func wait(for work: Task<Void, Never>, timeout: Duration) async -> Bool {
    let (events, continuation) = AsyncStream<Bool>.makeStream(bufferingPolicy: .bufferingOldest(1))
    let completion = Task { await work.value; continuation.yield(true) }
    let timer = Task {
      do { try await Task.sleep(for: timeout); continuation.yield(false) } catch {}
    }
    defer {
      work.cancel(); completion.cancel(); timer.cancel(); continuation.finish()
    }
    return await withTaskCancellationHandler {
      var iterator = events.makeAsyncIterator()
      return await iterator.next() ?? false
    } onCancel: {
      work.cancel(); continuation.finish()
    }
  }
}
