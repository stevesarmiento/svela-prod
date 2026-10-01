#if canImport(UIKit)
import SwiftUI

extension EnvironmentValues {
    /// The morph clock: the model's `generation`, interpolated. Segments read it every frame.
    @Entry var torphProgress: Double = 0
}

/// One animatable at the root of a `TorphText`. Its body runs once per frame with the interpolated
/// generation, so every segment — including ones inserted by this very update, which have no
/// animation history of their own — reads the same clock.
struct TorphClock: ViewModifier, Animatable {
    var animatableData: Double

    func body(content: Content) -> some View {
        content.environment(\.torphProgress, animatableData)
    }
}

/// Normalises the clock into 0…1 for the update that began at `start` and targets `generation`.
/// Robust to SwiftUI retargeting the clock mid-flight: the span simply shrinks.
func torphNormalizedProgress(_ progress: Double, start: Double, generation: Int) -> Double {
    let target = Double(generation)
    let span = target - start
    guard span > 1e-6 else { return 1 }
    return min(max((progress - start) / span, 0), 1)
}

/// Like `torphNormalizedProgress`, but lets a spring carry past 1 so positions can overshoot.
func torphOvershootProgress(_ progress: Double, start: Double, generation: Int) -> Double {
    let target = Double(generation)
    let span = target - start
    guard span > 1e-6 else { return 1 }
    return min(max((progress - start) / span, 0), 1.5)
}
#endif
