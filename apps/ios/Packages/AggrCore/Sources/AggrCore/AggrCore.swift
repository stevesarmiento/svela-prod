/// AggrCore: pure, Foundation-only logic ported from `apps/app` (indicators, formatting, DSL, chart math).
/// Semantics preserved from the TypeScript sources:
/// - Pine `na` → `Double.nan` inside full-length series arrays.
/// - JSON `null` → `Optional<Double>`; `nil` is never coalesced to 0 (render "—", exclude from aggregates).
public enum AggrCore {
  public static let version = "0.1.0"
}
