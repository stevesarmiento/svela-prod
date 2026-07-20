import { convex, getServerToken } from "@/lib/convex-server";
import { api } from "../../../../convex/_generated/api";

export type ScreenerEventKind =
  | "interpret_cache_hit"
  | "interpret_success"
  | "interpret_invalid_output"
  | "interpret_low_confidence"
  | "interpret_error"
  | "execute_success"
  | "execute_empty"
  | "execute_error";

export type ScreenerEventSurface = "watchlist" | "screener" | "internal";

export interface ScreenerEvent {
  surface: ScreenerEventSurface;
  kind: ScreenerEventKind;
  requestId: string;
  confidence: number;
  prompt?: string;
  dslJson?: string;
  latencyMs?: number;
  model?: string;
  promptVersion?: number;
  errorType?: string;
  scanned?: number;
  matched?: number;
}

function isTelemetryDisabled(): boolean {
  return process.env.SMART_SCREENER_TELEMETRY_DISABLED === "1";
}

/**
 * Fire-and-forget: telemetry must never add latency to or fail a screen
 * request. Prompt scrubbing happens Convex-side (recordEvent -> scrubPrompt).
 */
export function recordScreenerEvent(event: ScreenerEvent): void {
  if (isTelemetryDisabled()) return;
  void convex
    .mutation(api.smartScreenerTelemetry.recordEvent, {
      serverToken: getServerToken(),
      createdAtMs: Date.now(),
      surface: event.surface,
      kind: event.kind,
      prompt: event.prompt,
      dslJson: event.dslJson,
      confidence: event.confidence,
      requestId: event.requestId,
      latencyMs: event.latencyMs,
      model: event.model,
      promptVersion: event.promptVersion,
      errorType: event.errorType,
      scanned: event.scanned,
      matched: event.matched,
    })
    .catch(() => null);
}
