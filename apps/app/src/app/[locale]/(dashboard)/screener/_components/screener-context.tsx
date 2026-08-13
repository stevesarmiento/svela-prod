"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Effect } from "effect";
import * as React from "react";

import {
  type TakerFlowMetrics,
  useScreenerTakerFlow,
} from "@/hooks/use-screener-taker-flow";
import { runPromise as runScreenerPromise } from "@/lib/effect/runtime-screener";
import { ScreenerApi, screenFailedResponse } from "@/lib/effect/screener-api";
import type { SmartScreenerScreenResponse } from "@/lib/smart-screener/screen-api";
import {
  type ScreenerResults,
  screenerExecuteQueryKey,
  useScreenerResults,
} from "./use-screener-results";
import {
  type ScreenerUrlState,
  useScreenerUrlState,
} from "./use-screener-url-state";

export type InterpretStatus = "idle" | "interpreting";

export interface ScreenerInterpret {
  status: InterpretStatus;
  /**
   * Interpret free text via the unified endpoint. On success the parsed DSL
   * becomes the page state (URL) and the response seeds the execute-query
   * cache so results render without a second fetch. Returns the response so
   * the dialog can render `userMessage` inline on failures.
   */
  run: (text: string) => Promise<SmartScreenerScreenResponse | null>;
}

export interface ScreenerTakerFlow {
  byId: Record<string, TakerFlowMetrics | null>;
  isLoading: boolean;
}

export interface ScreenerContextValue extends ScreenerUrlState {
  results: ScreenerResults;
  interpret: ScreenerInterpret;
}

const ScreenerContext = React.createContext<ScreenerContextValue | null>(null);

/**
 * Separate context: order-flow data updates independently of filter/sort
 * state, and table cells subscribe to THIS one only — a main-context change
 * must not re-render every visible row cell.
 */
const ScreenerTakerFlowContext = React.createContext<ScreenerTakerFlow>({
  byId: {},
  isLoading: false,
});

export function useScreenerTakerFlowContext(): ScreenerTakerFlow {
  return React.useContext(ScreenerTakerFlowContext);
}

export function useScreenerContext(): ScreenerContextValue {
  const value = React.useContext(ScreenerContext);
  if (!value)
    throw new Error("useScreenerContext must be used within ScreenerProvider");
  return value;
}

export function ScreenerProvider({ children }: { children: React.ReactNode }) {
  const urlState = useScreenerUrlState();
  const queryClient = useQueryClient();
  const [interpretStatus, setInterpretStatus] =
    React.useState<InterpretStatus>("idle");
  const interpretAbortRef = React.useRef<AbortController | null>(null);

  const results = useScreenerResults({
    dsl: urlState.dsl,
    sort: urlState.sort,
    q: urlState.q,
  });

  const takerFlowCoins = React.useMemo(
    () => results.coins.map((c) => ({ id: c.id, symbol: c.symbol })),
    [results.coins],
  );
  const takerFlow = useScreenerTakerFlow({ coins: takerFlowCoins });

  const { applyScreen } = urlState;
  const run = React.useCallback(
    async (text: string): Promise<SmartScreenerScreenResponse | null> => {
      const trimmed = text.trim();
      if (!trimmed) return null;

      interpretAbortRef.current?.abort();
      const abortController = new AbortController();
      interpretAbortRef.current = abortController;

      setInterpretStatus("interpreting");
      try {
        const data = await runScreenerPromise(
          ScreenerApi.use((api) =>
            api.screen({ text: trimmed, surface: "screener" }),
          ).pipe(
            Effect.catchTags({
              // Structured `ok: false` — surface the payload so the dialog
              // can render the server's `userMessage` inline.
              ScreenerScreenFailedError: (error) => {
                console.error("smart-screener interpret rejected:", error);
                return Effect.succeed(screenFailedResponse(error));
              },
              // Transport/infra failures (rate limit, 500, malformed body).
              HttpTransportError: (error) => {
                console.error("smart-screener interpret failed:", error);
                return Effect.succeed(null);
              },
              HttpStatusError: (error) => {
                console.error("smart-screener interpret failed:", error);
                return Effect.succeed(null);
              },
              HttpDecodeError: (error) => {
                console.error("smart-screener interpret failed:", error);
                return Effect.succeed(null);
              },
            }),
          ),
          { signal: abortController.signal },
        );

        if (data?.ok) {
          // Seed BEFORE flipping URL state so the execute query mounts warm
          // (applyScreen resets sort/q, so the key is the DSL's own sort).
          queryClient.setQueryData(screenerExecuteQueryKey(data.dsl), data);
          applyScreen(data.dsl);
        }
        return data;
      } catch {
        // Interruption (cancel-previous abort / unmount) — silent null.
        return null;
      } finally {
        setInterpretStatus("idle");
      }
    },
    [applyScreen, queryClient],
  );

  // Cancel any in-flight interpretation when the provider unmounts.
  React.useEffect(() => {
    return () => {
      interpretAbortRef.current?.abort();
    };
  }, []);

  const interpret = React.useMemo<ScreenerInterpret>(
    () => ({ status: interpretStatus, run }),
    [interpretStatus, run],
  );

  const value = React.useMemo<ScreenerContextValue>(
    () => ({ ...urlState, results, interpret }),
    [urlState, results, interpret],
  );

  return (
    <ScreenerContext.Provider value={value}>
      <ScreenerTakerFlowContext.Provider value={takerFlow}>
        {children}
      </ScreenerTakerFlowContext.Provider>
    </ScreenerContext.Provider>
  );
}
