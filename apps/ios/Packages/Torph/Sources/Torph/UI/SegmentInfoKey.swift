#if canImport(UIKit)
import SwiftUI

/// What the layout needs to know about a segment subview.
struct SegmentInfo: Equatable {
    var key: String
    var role: MorphPlan.Role
    var kind: SegmentKind?
    var isNewline: Bool
}

struct SegmentInfoKey: LayoutValueKey {
    static let defaultValue = SegmentInfo(key: "", role: .persist, kind: nil, isNewline: false)
}
#endif
