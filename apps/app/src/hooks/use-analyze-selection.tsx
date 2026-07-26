"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AnalyzeToken } from "@/components/navigation/multi-analysis-dialog";
import { MAX_ANALYZE_TOKENS } from "@/lib/analyze-constants";

export type { AnalyzeToken };

const LazyAnalysisDialog = dynamic(
  () =>
    import("@/components/navigation/analysis-dialog").then(
      (module) => module.AnalysisDialog,
    ),
  { ssr: false, loading: () => null },
);

const LazyMultiAnalysisDialog = dynamic(
  () =>
    import("@/components/navigation/multi-analysis-dialog").then(
      (module) => module.MultiAnalysisDialog,
    ),
  { ssr: false, loading: () => null },
);

/**
 * Table-side host for the selection dock's Analyze action: resolves the
 * currently selected tokens on click and mounts the single-token
 * AnalysisDialog (n === 1) or the MultiAnalysisDialog (n > 1).
 *
 * The dialog lives with the table (not the dock) so the bottom nav's
 * retained-selection fade-out can never unmount an open dialog. Pass
 * `onAnalyzeSelected` into `useBottomNavSelectionBridge` options and render
 * `analyzeDialog` in the table's JSX.
 */
export function useAnalyzeSelection(getSelectedTokens: () => AnalyzeToken[]) {
  const [request, setRequest] = useState<{
    tokens: AnalyzeToken[];
    nonce: number;
  } | null>(null);

  // The resolver's identity may be unstable — route it through a ref so
  // onAnalyzeSelected stays stable for the bridge.
  const getTokensRef = useRef(getSelectedTokens);
  useEffect(() => {
    getTokensRef.current = getSelectedTokens;
  }, [getSelectedTokens]);

  const onAnalyzeSelected = useCallback(() => {
    const seen = new Set<string>();
    const tokens = getTokensRef.current().filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    // The dock button already guards these; defensive re-check.
    if (tokens.length === 0 || tokens.length > MAX_ANALYZE_TOKENS) return;
    setRequest((prev) => ({ tokens, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const close = useCallback(() => setRequest(null), []);

  const analyzeDialog = request ? (
    request.tokens.length === 1 ? (
      <LazyAnalysisDialog
        // Remount per click so `defaultOpen` refires for repeat analyses.
        key={request.nonce}
        coinId={request.tokens[0]!.id}
        tokenData={request.tokens[0]!}
        defaultOpen
        hideTrigger
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    ) : (
      <LazyMultiAnalysisDialog
        key={request.nonce}
        tokens={request.tokens}
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    )
  ) : null;

  return { onAnalyzeSelected, analyzeDialog };
}
