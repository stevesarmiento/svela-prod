#if canImport(UIKit)
import SwiftUI

/// Lays the segments out as one nowrap row per line and does torph's FLIP by hand.
///
/// The layout keeps the last frame it gave every segment. When the generation changes it snapshots
/// those as `from`, computes the new row as `to`, and then places each segment at a blend of the two
/// driven by its animatable progress: persisting segments slide, entering ones arrive beside their
/// anchor, exiting ones sit at their old frame (taking no space) and follow their anchor's move.
/// Wholly-replaced runs converge on their run's centre. Interrupts are free: a new generation just
/// snapshots wherever things are.
struct TorphLayout: Layout {
    var generation: Int
    var progress: Double
    var isEmptyTransition: Bool
    var exitRuns: [[String]]
    var enterRuns: [[String]]

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    final class Cache {
        var generation = -1
        var progressAtUpdate = 0.0
        var from: [String: CGRect] = [:]
        var to: [String: CGRect] = [:]
        var current: [String: CGRect] = [:]
        var fromSize = CGSize.zero
        var toSize = CGSize.zero
        var currentSize = CGSize.zero
        var exitRunCentres: [Int: CGPoint] = [:]
        var enterRunCentres: [Int: CGPoint] = [:]
        var lineHeight: CGFloat = 0
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    // The default re-creates the cache whenever the subviews change, which would drop the frames.
    func updateCache(_ cache: inout Cache, subviews: Subviews) {}

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        sync(cache, subviews)
        let p = torphOvershootProgress(progress, start: cache.progressAtUpdate, generation: generation)
        if isEmptyTransition {
            // An emptied value has nothing left to size to; hold, or the exiting text collapses with it.
            return p < 1 ? cache.fromSize : cache.toSize
        }
        return CGSize(
            width: lerp(cache.fromSize.width, cache.toSize.width, p),
            height: lerp(cache.fromSize.height, cache.toSize.height, p)
        )
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        sync(cache, subviews)
        let p = torphOvershootProgress(progress, start: cache.progressAtUpdate, generation: generation)
        var seen = Set<String>()

        for subview in subviews {
            let info = subview[SegmentInfoKey.self]
            if info.isNewline {
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: .zero)
                continue
            }
            let frame = frame(for: info, cache: cache, progress: p)
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                anchor: .topLeading,
                proposal: .unspecified
            )
            cache.current[info.key] = frame
            seen.insert(info.key)
        }

        cache.current = cache.current.filter { seen.contains($0.key) }
        cache.currentSize = bounds.size
    }

    // MARK: Frames

    private func frame(for info: SegmentInfo, cache: Cache, progress p: Double) -> CGRect {
        let to = cache.to[info.key]
        let from = cache.from[info.key]

        switch info.role {
        case .persist:
            guard let to else { return from ?? .zero }
            guard let from else { return to }
            return lerp(from, to, p)

        case .enter(let anchor):
            guard let to else { return .zero }
            let delta = anchorDelta(anchor, cache: cache)
            return to.offsetBy(dx: delta.x * (1 - p), dy: delta.y * (1 - p))

        case .exit(let anchor):
            guard let from else { return to ?? .zero }
            let delta = anchorDelta(anchor, cache: cache)
            return from.offsetBy(dx: -delta.x * p, dy: -delta.y * p)

        case .groupExit(let run):
            guard let from else { return .zero }
            guard let centre = cache.exitRunCentres[run] else { return from }
            // The run shrinks to 0.8 about its own centre: each member's centre closes in by the same factor.
            let k = 1 - 0.2 * min(p, 1)
            return from.recentred(at: CGPoint(x: centre.x + (from.midX - centre.x) * k, y: centre.y + (from.midY - centre.y) * k))

        case .groupEnter(let run):
            guard let to else { return .zero }
            guard let centre = cache.enterRunCentres[run] else { return to }
            let k = 0.8 + 0.2 * min(p, 1)
            return to.recentred(at: CGPoint(x: centre.x + (to.midX - centre.x) * k, y: centre.y + (to.midY - centre.y) * k))
        }
    }

    /// How far the anchor is from where it was: old origin minus new origin.
    private func anchorDelta(_ anchor: String?, cache: Cache) -> CGPoint {
        guard let anchor, let from = cache.from[anchor], let to = cache.to[anchor] else { return .zero }
        return CGPoint(x: from.minX - to.minX, y: from.minY - to.minY)
    }

    // MARK: Sync

    /// Runs at the top of both passes. A new generation snapshots the on-screen frames as `from` and
    /// lays out the new row as `to`; otherwise `to` is refreshed in case a subview's natural size moved.
    private func sync(_ cache: Cache, _ subviews: Subviews) {
        let (to, size, lineHeight) = flow(subviews)

        if cache.generation != generation {
            cache.from = cache.current
            cache.fromSize = cache.currentSize
            cache.progressAtUpdate = min(progress, Double(generation))
            cache.generation = generation
            cache.to = to
            cache.toSize = size
            cache.lineHeight = lineHeight

            cache.exitRunCentres = [:]
            for (i, run) in exitRuns.enumerated() {
                if let centre = union(of: run, in: cache.from) { cache.exitRunCentres[i] = centre }
            }
            cache.enterRunCentres = [:]
            for (i, run) in enterRuns.enumerated() {
                if let centre = union(of: run, in: cache.to) { cache.enterRunCentres[i] = centre }
            }

            if cache.from.isEmpty {
                // First render: nothing to move from.
                cache.from = to
                cache.fromSize = size
            }
        } else if cache.to != to {
            cache.to = to
            cache.toSize = size
            cache.lineHeight = lineHeight
        }
    }

    /// The nowrap flow of the live (non-exiting) subviews, one line per newline segment.
    private func flow(_ subviews: Subviews) -> (frames: [String: CGRect], size: CGSize, lineHeight: CGFloat) {
        var frames: [String: CGRect] = [:]
        var lineKeys: [(key: String, size: CGSize)] = []
        var lineTop: CGFloat = 0
        var maxWidth: CGFloat = 0
        var lastLineHeight: CGFloat = 0
        var lineCount = 0

        func finishLine() {
            let height = lineKeys.map(\.size.height).max() ?? lastLineHeight
            var x: CGFloat = 0
            for item in lineKeys {
                // Bottom-aligned within the line, which is baseline alignment for a single font.
                frames[item.key] = CGRect(x: x, y: lineTop + (height - item.size.height), width: item.size.width, height: item.size.height)
                x += item.size.width
            }
            maxWidth = max(maxWidth, x)
            lineTop += height
            lastLineHeight = height
            lineCount += 1
            lineKeys = []
        }

        for subview in subviews {
            let info = subview[SegmentInfoKey.self]
            if info.role.isExit { continue }
            if info.isNewline {
                finishLine()
                continue
            }
            lineKeys.append((info.key, subview.sizeThatFits(.unspecified)))
        }
        finishLine()

        let total = CGSize(width: maxWidth, height: lineTop)
        return (frames, total, lineCount > 0 ? lineTop / CGFloat(lineCount) : 0)
    }

    private func union(of keys: [String], in frames: [String: CGRect]) -> CGPoint? {
        let rects = keys.compactMap { frames[$0] }
        guard let first = rects.first else { return nil }
        let box = rects.dropFirst().reduce(first) { $0.union($1) }
        return CGPoint(x: box.midX, y: box.midY)
    }
}

private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: Double) -> CGFloat {
    a + (b - a) * CGFloat(t)
}

private func lerp(_ a: CGRect, _ b: CGRect, _ t: Double) -> CGRect {
    CGRect(
        x: lerp(a.minX, b.minX, t),
        y: lerp(a.minY, b.minY, t),
        width: lerp(a.width, b.width, t),
        height: lerp(a.height, b.height, t)
    )
}

private extension CGRect {
    func recentred(at centre: CGPoint) -> CGRect {
        CGRect(x: centre.x - width / 2, y: centre.y - height / 2, width: width, height: height)
    }
}
#endif
