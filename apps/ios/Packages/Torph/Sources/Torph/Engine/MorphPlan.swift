import Foundation

/// Everything the renderer needs for one update: which segments persist, enter, exit, and how.
///
/// This is the reconcile step of torph's `createTextGroup`/`updateStyles` with the DOM taken out.
public struct MorphPlan: Sendable {
    public enum Role: Hashable, Sendable {
        case persist
        /// Arrives beside `anchor` (a persisting id) and travels with it.
        case enter(anchor: String?)
        /// Leaves from where it was, following `anchor` (a persisting id) as the row reflows.
        case exit(anchor: String?)
        /// Part of a wholly-replaced run: arrives as one shape.
        case groupEnter(run: Int)
        /// Part of a wholly-replaced run: recedes as one shape.
        case groupExit(run: Int)

        public var isExit: Bool {
            switch self {
            case .exit, .groupExit: return true
            default: return false
            }
        }

        public var isEnter: Bool {
            switch self {
            case .enter, .groupEnter: return true
            default: return false
            }
        }
    }

    public struct Item: Hashable, Identifiable, Sendable {
        /// The segment id. Exiters keep theirs, so a revived segment reuses its view.
        public var key: String
        public var segment: Segment
        public var role: Role
        public var id: String { key }
    }

    /// Exiters first so they paint beneath the live row, then the new segments in order.
    public var items: [Item]
    /// The value emptied: the row holds its size while everything leaves.
    public var isEmptyTransition: Bool
    /// One line's worth of the row, for the digit slide distance.
    public var lineCount: Int
    /// Ids of runs that leave/arrive together, by run index.
    public var exitRuns: [[String]]
    public var enterRuns: [[String]]

    /// Segments the renderer shows in flow (everything that is not exiting).
    public var live: [Segment] { items.filter { !$0.role.isExit }.map(\.segment) }

    /// - Parameters:
    ///   - previous: the segments that were in flow before this update.
    ///   - previousExiting: segments still animating out from earlier updates.
    ///   - next: the new value's segments.
    ///   - initial: the first render animates nothing.
    public static func make(previous: [Segment], previousExiting: [Segment], next: [Segment], initial: Bool) -> MorphPlan {
        var segments = next
        let isEmpty = segments.isEmpty
        if isEmpty {
            // A zero-width space keeps in-flow content, preserving line box height during exits.
            segments = [Segment(id: Segment.emptyID, string: Segment.emptyPlaceholder)]
        }

        let newIDs = Set(segments.map(\.id))
        let oldIDs = previous.map(\.id)
        let previousIDSet = Set(oldIDs)

        if initial {
            return MorphPlan(
                items: segments.map { Item(key: $0.id, segment: $0, role: .persist) },
                isEmptyTransition: isEmpty,
                lineCount: lineCount(of: segments),
                exitRuns: [],
                enterRuns: []
            )
        }

        // Leaving now: in the old row, absent from the new one. The stand-in never animates out.
        let exitingNow = previous.filter { !newIDs.contains($0.id) && $0.id != Segment.emptyID }
        let exitingSet = Set(exitingNow.map(\.id))
        let exitAnchors = Anchors.resolveExitingAnchors(oldIDs: oldIDs, exiting: exitingSet, newIDs: newIDs)

        // A run with no survivors inside it recedes as one shape.
        let exitRuns = ReplacedRuns.runs(all: oldIDs, members: exitingSet)
        var exitRunOf: [String: Int] = [:]
        for (i, run) in exitRuns.enumerated() { for id in run { exitRunOf[id] = i } }

        // The arriving half of the same gesture.
        let persistentIDs = Set(segments.map(\.id).filter { previousIDSet.contains($0) })
        let arriving = Set(segments.map(\.id).filter { !previousIDSet.contains($0) && $0 != Segment.emptyID })
        let liveIDs = segments.map(\.id)
        let enterRuns = ReplacedRuns.runs(all: liveIDs.filter { $0 != Segment.emptyID }, members: arriving)
        var enterRunOf: [String: Int] = [:]
        for (i, run) in enterRuns.enumerated() { for id in run { enterRunOf[id] = i } }

        var items: [Item] = []

        // Earlier exiters still on their way out stay, unless the new value revives them.
        for seg in previousExiting where !newIDs.contains(seg.id) && !exitingSet.contains(seg.id) {
            items.append(Item(key: seg.id, segment: seg, role: .exit(anchor: nil)))
        }
        for seg in exitingNow {
            if let run = exitRunOf[seg.id] {
                items.append(Item(key: seg.id, segment: seg, role: .groupExit(run: run)))
            } else {
                items.append(Item(key: seg.id, segment: seg, role: .exit(anchor: exitAnchors[seg.id])))
            }
        }

        for (index, seg) in segments.enumerated() {
            let role: Role
            if seg.id == Segment.emptyID {
                role = .persist
            } else if persistentIDs.contains(seg.id) {
                role = .persist
            } else if let run = enterRunOf[seg.id] {
                role = .groupEnter(run: run)
            } else {
                role = .enter(anchor: Anchors.findNearestAnchor(targetIndex: index, ids: liveIDs, persistent: persistentIDs))
            }
            items.append(Item(key: seg.id, segment: seg, role: role))
        }

        return MorphPlan(
            items: items,
            isEmptyTransition: isEmpty,
            lineCount: lineCount(of: segments),
            exitRuns: exitRuns,
            enterRuns: enterRuns
        )
    }

    private static func lineCount(of segments: [Segment]) -> Int {
        segments.reduce(1) { $0 + ($1.isNewline ? 1 : 0) }
    }
}

/// UI-agnostic morph state: the previous segmentation plus whatever is still exiting.
public struct TorphMorphState: Sendable {
    public private(set) var previousSegments: [Segment] = []
    public private(set) var exiting: [Segment] = []
    public private(set) var isInitial = true

    public init() {}

    /// Diff `value` against the current state and advance it. Returns the plan for this update.
    public mutating func update(_ value: String, cursorIndex: Int? = nil, locale: Locale, numbers: Bool = true) -> MorphPlan {
        let next: [Segment]
        if previousSegments.isEmpty {
            next = TextSegmenter.segmentText(value, locale: locale, numbers: numbers)
        } else {
            next = SegmentDiff.diffSegments(
                previousSegments,
                newText: value,
                locale: locale,
                options: DiffOptions(numbers: numbers, cursorIndex: cursorIndex)
            ).segments
        }

        let plan = MorphPlan.make(previous: previousSegments, previousExiting: exiting, next: next, initial: isInitial)
        isInitial = false
        previousSegments = next
        exiting = plan.items.filter { $0.role.isExit }.map(\.segment)
        return plan
    }

    /// An exiter finished leaving.
    public mutating func removeExited(_ ids: Set<String>) {
        exiting.removeAll { ids.contains($0.id) }
    }

    /// Everything on screen was replaced by plain text (disabled / reduced motion).
    public mutating func reset() {
        previousSegments = []
        exiting = []
        isInitial = true
    }
}
