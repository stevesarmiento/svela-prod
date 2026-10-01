import Foundation

enum SegmentDiff {
    // Numbers share too few characters to pair with each other, so they all collapse to one token.
    private static let numberToken = "\u{0}#"
    private static let minSimilarity = 0.4
    // The diff runs before the first frame, so past these it degrades rather than blocks.
    private static let maxMorphPairings = 2_500
    private static let maxLCSCells = 1_000_000

    /// How a new word gets its segments — the id pre-pass and the build loop must agree.
    private enum WordPlan {
        case fresh
        case reuse(oi: Int)
        case morph(oi: Int)
        case number(oi: Int)

        var isNumber: Bool { if case .number = self { return true } else { return false } }
    }

    /// Per-character segments of an old word, cutting it up first if it is still one span.
    private static func splitIfWhole(_ oldGroup: WordGroup, splits: inout [String: [Segment]]) -> [Segment] {
        // Cutting a one-character word mints a new id for a character that never moved.
        if oldGroup.segments.count != 1 || oldGroup.word.count <= 1 {
            return oldGroup.segments
        }
        let wordSeg = oldGroup.segments[0]
        let charSegs = oldGroup.word.enumerated().map { i, char in
            Segment(id: "\(wordSeg.id):\(i)", string: String(char))
        }
        splits[wordSeg.id] = charSegs
        return charSegs
    }

    /// Fills in kinds an older, non-numeric segmentation of the same word lacked.
    private static func asNumberSegments(_ segments: [Segment]) -> [Segment] {
        segments.map { seg in
            var copy = seg
            copy.kind = seg.kind ?? NumberSegmenter.classifyKind(seg.string.first ?? " ")
            return copy
        }
    }

    private static func charSimilarity(_ a: String, _ b: String) -> Double {
        if a.isEmpty || b.isEmpty { return 0 }
        let (matched, _) = LCS.indices(Array(a), Array(b))
        return Double(matched.count) / Double(max(a.count, b.count))
    }

    /// How many LCS matches sit before each word — the index of the gap it occupies.
    private static func gapIndices(count: Int, matched: Set<Int>) -> [Int] {
        var gaps: [Int] = []
        var anchors = 0
        for i in 0..<count {
            gaps.append(anchors)
            if matched.contains(i) { anchors += 1 }
        }
        return gaps
    }

    /// An old word's claim on a new one. A matching numeric skeleton beats shared characters.
    private static func pairAffinity(_ a: String, _ b: String) -> Double {
        if (NumberSegmenter.hasDigit(a) || NumberSegmenter.hasDigit(b)),
           NumberSegmenter.numericSkeleton(a) == NumberSegmenter.numericSkeleton(b) {
            return 1
        }
        return charSimilarity(a, b)
    }

    static func diffSegments(
        _ oldSegments: [Segment],
        newText: String,
        locale: Locale,
        options: DiffOptions
    ) -> DiffResult {
        let newHasSpaces = newText.contains(" ")
        let newHasNewlines = newText.contains("\n")
        let oldWords = TextSegmenter.groupIntoWords(oldSegments)

        let numbersOn = options.numbers
        func isNum(_ word: String) -> Bool { numbersOn && NumberSegmenter.isNumericWord(word) }
        func token(_ word: String) -> String { isNum(word) ? numberToken : word }

        // Text ids are derived from the text and survive re-segmentation; minted numeric ids don't.
        let digitsInvolved = numbersOn && (NumberSegmenter.hasDigit(newText) || oldWords.contains { NumberSegmenter.hasDigit($0.word) })

        if oldWords.count <= 1 && !newHasSpaces && !newHasNewlines && !digitsInvolved {
            return DiffResult(segments: TextSegmenter.segmentText(newText, locale: locale, numbers: numbersOn), splits: [:])
        }

        // Words and the separators BEFORE each word, like `newText.split(/( |\n)/)`.
        var newWordStrings: [String] = []
        var newSeparators: [[Character]] = []
        var pendingSeps: [Character] = []
        var current = ""
        func flushWord() {
            if !current.isEmpty {
                newSeparators.append(pendingSeps)
                newWordStrings.append(current)
                pendingSeps = []
                current = ""
            }
        }
        for char in newText {
            if char == " " || char == "\n" {
                flushWord()
                pendingSeps.append(char)
            } else {
                current.append(char)
            }
        }
        flushWord()
        let trailingSeparators = pendingSeps

        let oldWordStrings = oldWords.map(\.word)

        if oldWordStrings.count * newWordStrings.count > maxLCSCells {
            return DiffResult(segments: TextSegmenter.segmentText(newText, locale: locale, numbers: numbersOn), splits: [:])
        }

        let (oldLcsIdx, newLcsIdx) = LCS.indices(oldWordStrings.map(token), newWordStrings.map(token))
        let oldMatchedSet = Set(oldLcsIdx)
        let newMatchedSet = Set(newLcsIdx)

        var newToOldWord: [Int: Int] = [:]
        for k in 0..<newLcsIdx.count { newToOldWord[newLcsIdx[k]] = oldLcsIdx[k] }

        var oldUnmatched = oldWordStrings.indices.filter { !oldMatchedSet.contains($0) }
        var newUnmatched = newWordStrings.indices.filter { !newMatchedSet.contains($0) }

        // Exact-match reordered words that LCS couldn't capture (order-preserving)
        var exactUsed = Set<Int>()
        for ni in newUnmatched {
            for oi in oldUnmatched where !exactUsed.contains(oi) {
                if token(newWordStrings[ni]) == token(oldWordStrings[oi]) {
                    newToOldWord[ni] = oi
                    exactUsed.insert(oi)
                    break
                }
            }
        }
        if !exactUsed.isEmpty {
            oldUnmatched = oldUnmatched.filter { !exactUsed.contains($0) }
            newUnmatched = newUnmatched.filter { newToOldWord[$0] == nil }
        }

        var morphPairs: [Int: Int] = [:]
        var usedOld = Set<Int>()

        // From the LCS alone: the exact-match pass reorders, so its pairs anchor nothing.
        let oldGaps = gapIndices(count: oldWordStrings.count, matched: oldMatchedSet)
        let newGaps = gapIndices(count: newWordStrings.count, matched: newMatchedSet)

        if oldUnmatched.count * newUnmatched.count <= maxMorphPairings {
            for ni in newUnmatched {
                var bestOi = -1
                var bestSim = minSimilarity
                for oi in oldUnmatched where !usedOld.contains(oi) {
                    // A pairing that crosses a surviving word drags its characters the width of the value.
                    if oldGaps[oi] != newGaps[ni] { continue }
                    // Numbers and words pair freely; minSimilarity keeps a number off a real word.
                    let sim = pairAffinity(oldWordStrings[oi], newWordStrings[ni])
                    if sim > bestSim {
                        bestSim = sim
                        bestOi = oi
                    }
                }
                if bestOi >= 0 {
                    morphPairs[ni] = bestOi
                    usedOld.insert(bestOi)
                }
            }
        }

        // Keyed on what the word is becoming, not on what it was.
        let plans: [WordPlan] = newWordStrings.enumerated().map { ni, newWord in
            let lcsOi = newToOldWord[ni]
            guard let oi = lcsOi ?? morphPairs[ni] else { return .fresh }
            if isNum(newWord) { return .number(oi: oi) }
            return lcsOi != nil ? .reuse(oi: oi) : .morph(oi: oi)
        }

        // Meaningless once a value holds several figures.
        let cursorIndex = plans.filter(\.isNumber).count == 1 ? options.cursorIndex : nil
        let decimalChar = NumberSegmenter.decimalSeparator(locale)

        let alloc = IDAllocator()

        // Reserved up front: an id inherited later would otherwise go to an earlier segment.
        for plan in plans {
            let oi: Int
            let willSplit: Bool
            switch plan {
            case .fresh: continue
            case .reuse(let i): oi = i; willSplit = false
            case .morph(let i), .number(let i): oi = i; willSplit = true
            }
            let oldGroup = oldWords[oi]
            if willSplit && oldGroup.segments.count == 1 {
                // About to be split into per-character spans
                let wordSeg = oldGroup.segments[0]
                for i in 0..<oldGroup.word.count { alloc.reserve("\(wordSeg.id):\(i)") }
            } else {
                for seg in oldGroup.segments { alloc.reserve(seg.id) }
            }
        }

        var segments: [Segment] = []
        var splits: [String: [Segment]] = [:]
        var charOffset = 0

        // Includes the edges — segmentText keeps leading and trailing whitespace on first render.
        func pushSeparators(_ seps: [Character]) {
            for sep in seps {
                if sep == "\n" {
                    segments.append(Segment(id: alloc.take("newline-\(charOffset)"), string: Segment.newline))
                } else {
                    segments.append(Segment(id: alloc.take("space-\(charOffset)"), string: Segment.nbsp))
                }
                charOffset += 1
            }
        }

        for ni in 0..<newWordStrings.count {
            pushSeparators(ni < newSeparators.count ? newSeparators[ni] : (ni > 0 ? [" "] : []))

            let plan = plans[ni]
            let newWord = newWordStrings[ni]

            switch plan {
            case .reuse(let oi):
                segments.append(contentsOf: oldWords[oi].segments)

            case .number(let oi):
                let oldGroup = oldWords[oi]
                segments.append(contentsOf: NumberSegmenter.segmentNumber(
                    newWord,
                    prevSegments: asNumberSegments(splitIfWhole(oldGroup, splits: &splits)),
                    cursorIndex: cursorIndex.map { $0 - charOffset },
                    decimalChar: decimalChar
                ))

            case .morph(let oi):
                let oldGroup = oldWords[oi]
                let oldCharSegs = splitIfWhole(oldGroup, splits: &splits)
                let oldChars = Array(oldGroup.word)
                let newChars = Array(newWord)
                let (oldCharLcs, newCharLcs) = LCS.indices(oldChars, newChars)

                var newCharToOldSeg: [Int: Segment] = [:]
                for k in 0..<newCharLcs.count where oldCharLcs[k] < oldCharSegs.count {
                    newCharToOldSeg[newCharLcs[k]] = oldCharSegs[oldCharLcs[k]]
                }

                for (ci, char) in newChars.enumerated() {
                    if let oldSeg = newCharToOldSeg[ci] {
                        segments.append(Segment(id: oldSeg.id, string: String(char)))
                    } else {
                        segments.append(Segment(id: alloc.take("\(newWord)~\(ci)"), string: String(char)))
                    }
                }

            case .fresh:
                if isNum(newWord) {
                    segments.append(contentsOf: NumberSegmenter.segmentNumber(newWord))
                } else {
                    segments.append(Segment(id: alloc.take(newWord), string: newWord))
                }
            }

            charOffset += newWord.count
        }

        pushSeparators(trailingSeparators)

        return DiffResult(segments: segments, splits: splits)
    }
}
