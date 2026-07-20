import { createRatelimit } from "@v1/kv/ratelimit";
import { generateText } from "ai";

import { gemini, isGeminiAvailable } from "@/lib/gemini";

import { SmartScreenerScreenInterpretResponseSchema } from "../screen-api";
import type { ScreeningDsl } from "../screening-dsl";
import {
  getCachedInterpretation,
  setCachedInterpretation,
} from "./interpret-cache";
import {
  SMART_SCREENER_PROMPT_VERSION,
  buildSmartScreenerSystemPrompt,
} from "./prompt";

const MODEL_ID = "gemini-2.5-flash";
const LLM_TIMEOUT_MS = 10_000;

/**
 * Strict budget for the money-spending path only: applied on cache MISS,
 * never on cache hits or execute-only requests.
 */
const llmBudget = createRatelimit(20, "60s");

export interface InterpretDebugAttempt {
  rawText: string;
  parsedJson: unknown;
  schemaOk: boolean;
  schemaIssues: Array<{ path: Array<string | number>; message: string }>;
}

export type InterpretOutcome =
  | {
      status: "ok";
      dsl: ScreeningDsl;
      confidence: number;
      source: "llm" | "cache";
      model: string;
      latencyMs: number;
      promptVersion: number;
      attempts?: Array<InterpretDebugAttempt>;
    }
  | { status: "not_configured" }
  | { status: "rate_limited" }
  | { status: "invalid_output"; attempts?: Array<InterpretDebugAttempt> }
  | { status: "timeout" }
  | { status: "error"; message: string };

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  function tryParse(candidate: string): unknown {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const fenceParsed = tryParse(withoutFences);
  if (fenceParsed) return fenceParsed;

  const firstObj = withoutFences.indexOf("{");
  const lastObj = withoutFences.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    const slice = withoutFences.slice(firstObj, lastObj + 1);
    const slicedParsed = tryParse(slice);
    if (slicedParsed) return slicedParsed;
  }

  return null;
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /abort|timeout/i.test(error.message)
  );
}

async function runOnce(args: {
  systemPrompt: string;
  text: string;
  abortSignal: AbortSignal;
}): Promise<InterpretDebugAttempt> {
  const res = await generateText({
    model: gemini!(MODEL_ID),
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.text },
    ],
    temperature: 0.1,
    // gemini-2.5-flash is a THINKING model and its reasoning tokens count
    // against maxOutputTokens — a tight cap let thinking starve the JSON and
    // truncate mid-object (real user prompt: "below 25m marketcap, moved less
    // than $5 in 24h, volume over 20m" died at 600). This is a deterministic
    // parse task: disable thinking entirely and keep a generous ceiling.
    maxOutputTokens: 2000,
    providerOptions: {
      google: { thinkingConfig: { thinkingBudget: 0 } },
    },
    abortSignal: args.abortSignal,
  });
  const rawText = res.text.trim();
  const parsedJson = safeJsonParse(rawText);
  const validated =
    SmartScreenerScreenInterpretResponseSchema.safeParse(parsedJson);
  return {
    rawText,
    parsedJson,
    schemaOk: validated.success,
    schemaIssues: validated.success
      ? []
      : validated.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
  };
}

/**
 * Interpret free text into a screening DSL.
 *
 * Order of operations: cache -> llm budget -> Gemini (one retry on invalid
 * output) -> cache write. `identifier` keys the llm budget (userId or ip).
 */
export async function interpretScreenText(args: {
  text: string;
  identifier: string;
  abortSignal: AbortSignal;
  bypassCache?: boolean;
  /** Dev/eval-only (internal route): eval sweeps must not trip the user budget. */
  bypassBudget?: boolean;
  collectDebug?: boolean;
}): Promise<InterpretOutcome> {
  if (!isGeminiAvailable || !gemini) {
    return { status: "not_configured" };
  }

  const startedAt = Date.now();

  if (!args.bypassCache) {
    const cached = await getCachedInterpretation(args.text);
    if (cached) {
      const validated = SmartScreenerScreenInterpretResponseSchema.safeParse({
        dsl: cached.dsl,
        confidence: cached.confidence,
      });
      if (validated.success) {
        return {
          status: "ok",
          dsl: validated.data.dsl,
          confidence: validated.data.confidence,
          source: "cache",
          model: cached.model,
          latencyMs: Date.now() - startedAt,
          promptVersion: SMART_SCREENER_PROMPT_VERSION,
        };
      }
      // Stale/incompatible cache entry: fall through to a live interpret.
    }
  }

  if (!args.bypassBudget) {
    try {
      const budget = await llmBudget.limit(
        `smart-screener-interpret:${args.identifier}`,
      );
      if (!budget.success) return { status: "rate_limited" };
    } catch {
      // Fail open — rate limiting must never take screening down.
    }
  }

  const systemPrompt = buildSmartScreenerSystemPrompt();
  const signal = AbortSignal.any([
    args.abortSignal,
    AbortSignal.timeout(LLM_TIMEOUT_MS),
  ]);
  const attempts: Array<InterpretDebugAttempt> = [];

  try {
    const first = await runOnce({
      systemPrompt,
      text: args.text,
      abortSignal: signal,
    });
    attempts.push(first);

    let valid = first.schemaOk
      ? SmartScreenerScreenInterpretResponseSchema.parse(first.parsedJson)
      : null;

    if (!valid) {
      const second = await runOnce({
        systemPrompt: `${systemPrompt}\n\nYour previous output was invalid JSON or did not match schema. Return valid JSON only.`,
        text: `User prompt:\n${args.text}`,
        abortSignal: signal,
      });
      attempts.push(second);
      valid = second.schemaOk
        ? SmartScreenerScreenInterpretResponseSchema.parse(second.parsedJson)
        : null;
    }

    if (!valid) {
      return {
        status: "invalid_output",
        attempts: args.collectDebug ? attempts : undefined,
      };
    }

    if (!args.bypassCache) {
      setCachedInterpretation(args.text, {
        dsl: valid.dsl,
        confidence: valid.confidence,
        model: MODEL_ID,
      });
    }

    return {
      status: "ok",
      dsl: valid.dsl,
      confidence: valid.confidence,
      source: "llm",
      model: MODEL_ID,
      latencyMs: Date.now() - startedAt,
      promptVersion: SMART_SCREENER_PROMPT_VERSION,
      attempts: args.collectDebug ? attempts : undefined,
    };
  } catch (error) {
    if (isAbortLikeError(error)) return { status: "timeout" };
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
