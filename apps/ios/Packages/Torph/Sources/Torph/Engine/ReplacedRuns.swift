import Foundation

enum ReplacedRuns {
    // Where characters moving becomes one thing swapped for another. Past this, nothing
    // that survived is near enough to animate from, and the run smears.
    static let groupMin = 6

    /// Maximal stretches of `members` adjacent in `all`. A run broken by a survivor is no
    /// replacement — that survivor is right there to move relative to.
    static func runs(all: [String], members: Set<String>) -> [[String]] {
        var runs: [[String]] = []
        var run: [String] = []
        func flush() {
            if run.count >= groupMin { runs.append(run) }
            run = []
        }
        for id in all {
            if members.contains(id) { run.append(id) } else { flush() }
        }
        flush()
        return runs
    }
}
