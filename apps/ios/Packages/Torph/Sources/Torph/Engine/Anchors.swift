import Foundation

enum Anchors {
    enum Direction { case backwardFirst, forwardFirst }

    /// Nearest persisting neighbour by id, searching backward first, then forward.
    static func findNearestAnchor(
        targetIndex: Int,
        ids: [String],
        persistent: Set<String>,
        direction: Direction = .backwardFirst
    ) -> String? {
        func backward() -> String? {
            var j = targetIndex - 1
            while j >= 0 {
                if persistent.contains(ids[j]) { return ids[j] }
                j -= 1
            }
            return nil
        }
        func forward() -> String? {
            var j = targetIndex + 1
            while j < ids.count {
                if persistent.contains(ids[j]) { return ids[j] }
                j += 1
            }
            return nil
        }
        switch direction {
        case .backwardFirst: return backward() ?? forward()
        case .forwardFirst: return forward() ?? backward()
        }
    }

    /// For every exiting id, the persisting old neighbour it should travel with (forward first).
    static func resolveExitingAnchors(oldIDs: [String], exiting: Set<String>, newIDs: Set<String>) -> [String: String] {
        let persistentOld = Set(oldIDs.filter { newIDs.contains($0) && !exiting.contains($0) })
        var anchors: [String: String] = [:]
        for (i, id) in oldIDs.enumerated() where exiting.contains(id) {
            if let anchor = findNearestAnchor(targetIndex: i, ids: oldIDs, persistent: persistentOld, direction: .forwardFirst) {
                anchors[id] = anchor
            }
        }
        return anchors
    }
}
