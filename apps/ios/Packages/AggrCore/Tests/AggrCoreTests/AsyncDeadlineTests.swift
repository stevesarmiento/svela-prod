import Foundation
import Testing
@testable import AggrCore

@Suite struct AsyncDeadlineTests {
  @Test func fastWorkDoesNotWaitForDeadline() async {
    let start = ContinuousClock.now
    let work = Task<Void, Never> {}
    #expect(await AsyncDeadline.wait(for: work, timeout: .seconds(5)))
    #expect(ContinuousClock.now - start < .seconds(1))
  }
  @Test func deadlineReturnsPartialWorkPromptly() async {
    let work = Task<Void, Never> { try? await Task.sleep(for: .seconds(5)) }
    let start = ContinuousClock.now
    #expect(await !AsyncDeadline.wait(for: work, timeout: .milliseconds(40)))
    #expect(ContinuousClock.now - start < .seconds(1))
    #expect(work.isCancelled)
  }
  @Test func dismissalCancelsPreparation() async {
    let work = Task<Void, Never> { try? await Task.sleep(for: .seconds(5)) }
    let caller = Task { await AsyncDeadline.wait(for: work, timeout: .seconds(10)) }
    caller.cancel()
    _ = await caller.value
    #expect(work.isCancelled)
  }
}
