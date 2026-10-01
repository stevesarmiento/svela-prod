// Torph for Swift — a port of torph (https://github.com/lochie/torph).
//
// The engine (segmentation, place-value number matching, word diff) is a 1:1 port of the
// TypeScript library so its test corpus applies unchanged. The SwiftUI renderer is new.
//
// MIT License
//
// Copyright (c) 2025 Lochie Axon
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import Foundation

/// Namespace for the engine entry points that mirror torph's exports.
public enum Torph {
    /// Split a value into segments. Numeric words are cut per character with a `kind` when `numbers` is on.
    public static func segmentText(_ value: String, locale: Locale = Locale(identifier: "en"), numbers: Bool = true) -> [Segment] {
        TextSegmenter.segmentText(value, locale: locale, numbers: numbers)
    }

    /// Match a new value against existing segments, returning the segments that persist, enter and exit.
    public static func diffSegments(
        _ oldSegments: [Segment],
        newText: String,
        locale: Locale = Locale(identifier: "en"),
        options: DiffOptions = DiffOptions()
    ) -> DiffResult {
        SegmentDiff.diffSegments(oldSegments, newText: newText, locale: locale, options: options)
    }
}
