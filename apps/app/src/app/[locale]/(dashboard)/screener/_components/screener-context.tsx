"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  type TakerFlowMetrics,
  useScreenerTakerFlow,
} from "@/hooks/use-screener-taker-flow";
import {
  type SmartScreenerScreenResponse,
  SmartScreenerScreenResponseSchema,
} from "@/lib/smart-screener/screen-api";
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
        const response = await fetch("/api/smart-screener/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({ text: trimmed, surface: "screener" }),
        });

        const json: unknown = await response.json().catch(() => null);
        const parsed = SmartScreenerScreenResponseSchema.safeParse(json);
        if (!parsed.success) return null;

        const data = parsed.data;
        if (data.ok) {
          // Seed BEFORE flipping URL state so the execute query mounts warm
          // (applyScreen resets sort/q, so the key is the DSL's own sort).
          queryClient.setQueryData(screenerExecuteQueryKey(data.dsl), data);
          applyScreen(data.dsl);
        }
        return data;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return null;
        return null;
      } finally {
        setInterpretStatus("idle");
      }
    },
    [applyScreen, queryClient],
  );

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
