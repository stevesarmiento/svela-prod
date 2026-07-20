import { randomUUID } from "node:crypto";

import { shouldApplySmartScreenerResult } from "../client-result";
import { promptLooksLikeConstraints } from "../prompt-gating";
import {
  type SmartScreenerErrorCode,
  type SmartScreenerScreenRequest,
  type SmartScreenerScreenResponse,
  SmartScreenerScreenResponseSchema,
} from "../screen-api";
import {
  type ScreeningDsl,
  ScreeningDslSchema,
  formatDslSummary,
} from "../screening-dsl";
import {
  type ExecuteResult,
  ExecuteTimeoutError,
  executeScreeningDsl,
} from "./execute";
import {
  type InterpretDebugAttempt,
  type InterpretOutcome,
  interpretScreenText,
} from "./interpret";
import { type ScreenerEventSurface, recordScreenerEvent } from "./telemetry";

const INTENT_CONFIDENCE_THRESHOLD = 0.6;

const EMPTY_DSL: ScreeningDsl = ScreeningDslSchema.parse({});

function emptyCoverage(): SmartScreenerScreenResponse["coverage"] {
  return {
    scanned: 0,
    matched: 0,
    maxRankScanned: null,
    missingByMetricId: {},
    warmupScheduled: false,
    warmupTopN: null,
    marketChartWarmupRequestedCount: 0,
    marketChartWarmupDays: [],
    takerCoinsRequested: 0,
    takerCoinsMissing: 0,
    takerWarmupRequestedCount: 0,
  };
}

function failure(args: {
  requestId: string;
  code: SmartScreenerErrorCode;
  message: string;
  userMessage: string;
  confidence?: number;
  dsl?: ScreeningDsl;
  interpretation?: SmartScreenerScreenResponse["interpretation"];
}): SmartScreenerScreenResponse {
  const dsl = args.dsl ?? EMPTY_DSL;
  return {
    ok: false,
    confidence: args.confidence ?? 0,
    dsl,
    summary: args.dsl ? formatDslSummary(dsl) : "",
    resultIds: [],
    rows: [],
    coverage: emptyCoverage(),
    userMessage: args.userMessage,
    requestId: args.requestId,
    interpretation: args.interpretation,
    error: { code: args.code, message: args.message },
  };
}

export interface RunScreenOptions {
  request: SmartScreenerScreenRequest;
  /** Keys the LLM rate budget — Clerk userId or client ip. */
  identifier: string;
  abortSignal: AbortSignal;
  surfaceOverride?: ScreenerEventSurface;
  bypassCache?: boolean;
  /** Dev/eval-only (internal route): skip the per-user LLM budget. */
  bypassBudget?: boolean;
  collectDebug?: boolean;
}

export interface RunScreenOutcome {
  response: SmartScreenerScreenResponse;
  debugAttempts?: Array<InterpretDebugAttempt>;
}

/**
 * The one smart-screener entry point.
 *
 * - `request.text`  -> interpret (cache -> llm budget -> Gemini) then execute
 * - `request.dsl`   -> execute only; never touches the LLM or its budget
 * - `interpretOnly` -> skip execution (eval harness)
 *
 * Interpretation-level failures return `ok: false` + typed `error` at HTTP
 * 200 (client renders `userMessage`); every path records telemetry.
 */
export async function runSmartScreenerScreen(
  options: RunScreenOptions,
): Promise<RunScreenOutcome> {
  const requestId = randomUUID();
  const { request } = options;
  const surface: ScreenerEventSurface =
    options.surfaceOverride ?? request.surface;

  // ---------- Execute-only path ----------
  if (request.dsl) {
    const response = await executeAndRespond({
      requestId,
      surface,
      dsl: request.dsl,
      confidence: 1,
      current: request.current,
      interpretation: { source: "provided" },
    });
    return { response };
  }

  // ---------- Interpret path ----------
  const text = request.text ?? "";
  const interpreted = await interpretScreenText({
    text,
    identifier: options.identifier,
    abortSignal: options.abortSignal,
    bypassCache: options.bypassCache,
    bypassBudget: options.bypassBudget,
    collectDebug: options.collectDebug,
  });

  const outcome = handleInterpretFailure({
    interpreted,
    requestId,
    surface,
    text,
  });
  if (outcome) return outcome;

  // interpreted.status === "ok" past this point
  const ok = interpreted as Extract<InterpretOutcome, { status: "ok" }>;
  const interpretation: SmartScreenerScreenResponse["interpretation"] = {
    source: ok.source,
    model: ok.model,
    latencyMs: ok.latencyMs,
    promptVersion: ok.promptVersion,
  };

  recordScreenerEvent({
    surface,
    kind: ok.source === "cache" ? "interpret_cache_hit" : "interpret_success",
    requestId,
    confidence: ok.confidence,
    prompt: text,
    dslJson: JSON.stringify(ok.dsl),
    latencyMs: ok.latencyMs,
    model: ok.model,
    promptVersion: ok.promptVersion,
  });

  // Gating: an empty-filters parse of a constraints-looking prompt, or a
  // low-confidence parse, is a bail — never silently show wrong results.
  if (ok.dsl.filters.length === 0 && promptLooksLikeConstraints(text)) {
    recordScreenerEvent({
      surface,
      kind: "interpret_low_confidence",
      requestId,
      confidence: ok.confidence,
      prompt: text,
      errorType: "constraints_unmapped",
    });
    return {
      response: failure({
        requestId,
        code: "low_confidence",
        message: "Constraints query could not be mapped to supported metrics.",
        userMessage:
          "That looks like a constraints query, but I couldn’t map it to supported metrics. Try rephrasing.",
        confidence: Math.min(ok.confidence, 0.4),
        dsl: ok.dsl,
        interpretation,
      }),
      debugAttempts: ok.attempts,
    };
  }

  const shouldApply = shouldApplySmartScreenerResult({
    ok: true,
    confidence: ok.confidence,
    actionsCount: ok.dsl.filters.length + (ok.dsl.sort ? 1 : 0),
    threshold: INTENT_CONFIDENCE_THRESHOLD,
  });

  if (!shouldApply) {
    recordScreenerEvent({
      surface,
      kind: "interpret_low_confidence",
      requestId,
      confidence: ok.confidence,
      prompt: text,
      errorType: "below_threshold",
    });
    return {
      response: failure({
        requestId,
        code: "low_confidence",
        message: "Interpretation confidence below threshold.",
        userMessage: "Couldn’t confidently interpret that. Try rephrasing.",
        confidence: ok.confidence,
        dsl: ok.dsl,
        interpretation,
      }),
      debugAttempts: ok.attempts,
    };
  }

  if (request.interpretOnly) {
    const response: SmartScreenerScreenResponse = {
      ok: true,
      confidence: ok.confidence,
      dsl: ok.dsl,
      summary: formatDslSummary(ok.dsl),
      resultIds: [],
      rows: [],
      coverage: emptyCoverage(),
      userMessage: null,
      requestId,
      interpretation,
    };
    return { response, debugAttempts: ok.attempts };
  }

  const response = await executeAndRespond({
    requestId,
    surface,
    dsl: ok.dsl,
    confidence: ok.confidence,
    current: request.current,
    interpretation,
    prompt: text,
  });
  return { response, debugAttempts: ok.attempts };
}

function handleInterpretFailure(args: {
  interpreted: InterpretOutcome;
  requestId: string;
  surface: ScreenerEventSurface;
  text: string;
}): RunScreenOutcome | null {
  const { interpreted, requestId, surface, text } = args;

  switch (interpreted.status) {
    case "ok":
      return null;
    case "not_configured":
      return {
        response: failure({
          requestId,
          code: "not_configured",
          message: "GEMINI_API_KEY is not configured.",
          userMessage: "Smart screener is not configured yet.",
        }),
      };
    case "rate_limited":
      recordScreenerEvent({
        surface,
        kind: "interpret_error",
        requestId,
        confidence: 0,
        prompt: text,
        errorType: "rate_limited",
      });
      return {
        response: failure({
          requestId,
          code: "rate_limited",
          message: "LLM budget exceeded — try again shortly.",
          userMessage:
            "Too many smart-screener requests. Try again in a minute.",
        }),
      };
    case "invalid_output":
      recordScreenerEvent({
        surface,
        kind: "interpret_invalid_output",
        requestId,
        confidence: 0,
        prompt: text,
        errorType: "invalid_output",
      });
      return {
        response: failure({
          requestId,
          code: "interpretation_failed",
          message: "Model output did not match the DSL schema after retry.",
          userMessage:
            "Couldn’t interpret that. Try rephrasing with concrete metrics (e.g. “fdv under 200m”).",
        }),
        debugAttempts: interpreted.attempts,
      };
    case "timeout":
      recordScreenerEvent({
        surface,
        kind: "interpret_error",
        requestId,
        confidence: 0,
        prompt: text,
        errorType: "timeout",
      });
      return {
        response: failure({
          requestId,
          code: "upstream_timeout",
          message: "Interpretation timed out.",
          userMessage: "That took too long to interpret. Try again.",
        }),
      };
    case "error":
      recordScreenerEvent({
        surface,
        kind: "interpret_error",
        requestId,
        confidence: 0,
        prompt: text,
        errorType: "exception",
      });
      return {
        response: failure({
          requestId,
          code: "internal",
          message: interpreted.message,
          userMessage: "Something went wrong interpreting that. Try again.",
        }),
      };
  }
}

async function executeAndRespond(args: {
  requestId: string;
  surface: ScreenerEventSurface;
  dsl: ScreeningDsl;
  confidence: number;
  current: SmartScreenerScreenRequest["current"];
  interpretation: SmartScreenerScreenResponse["interpretation"];
  prompt?: string;
}): Promise<SmartScreenerScreenResponse> {
  const restrictIds =
    Array.isArray(args.current?.coingeckoIds) &&
    args.current.coingeckoIds.length > 0
      ? new Set(args.current.coingeckoIds)
      : null;

  // `universe: "current" | "watchlist"` both mean "restrict to the ids the
  // client sent"; with no ids we degrade to "all" and say so.
  const universeUnsatisfied = args.dsl.universe !== "all" && !restrictIds;

  let executed: ExecuteResult;
  try {
    executed = await executeScreeningDsl({ dsl: args.dsl, restrictIds });
  } catch (error) {
    recordScreenerEvent({
      surface: args.surface,
      kind: "execute_error",
      requestId: args.requestId,
      confidence: args.confidence,
      prompt: args.prompt,
      dslJson: JSON.stringify(args.dsl),
      errorType: error instanceof ExecuteTimeoutError ? "timeout" : "exception",
    });
    return failure({
      requestId: args.requestId,
      code:
        error instanceof ExecuteTimeoutError ? "upstream_timeout" : "internal",
      message: error instanceof Error ? error.message : String(error),
      userMessage: "Screening the market took too long. Try again in a moment.",
      confidence: args.confidence,
      dsl: args.dsl,
      interpretation: args.interpretation,
    });
  }

  recordScreenerEvent({
    surface: args.surface,
    kind: executed.resultIds.length === 0 ? "execute_empty" : "execute_success",
    requestId: args.requestId,
    confidence: args.confidence,
    prompt: args.prompt,
    dslJson: JSON.stringify(args.dsl),
    scanned: executed.coverage.scanned,
    matched: executed.coverage.matched,
  });

  const userMessage = universeUnsatisfied
    ? [
        `Screened the full market (no ${args.dsl.universe} list was provided).`,
        executed.userMessage,
      ]
        .filter(Boolean)
        .join(" ")
    : executed.userMessage;

  const response: SmartScreenerScreenResponse = {
    ok: true,
    confidence: args.confidence,
    dsl: args.dsl,
    summary: formatDslSummary(args.dsl),
    resultIds: executed.resultIds,
    rows: executed.rows,
    coverage: executed.coverage,
    userMessage,
    requestId: args.requestId,
    interpretation: args.interpretation,
  };

  const final = SmartScreenerScreenResponseSchema.safeParse(response);
  return final.success ? final.data : response;
}
