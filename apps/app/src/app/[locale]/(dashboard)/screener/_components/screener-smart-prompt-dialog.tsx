"use client";

import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import { Kbd } from "@v1/ui/kbd";
import * as React from "react";
import { IconArrowTurnDownRight } from "symbols-react";

import { useScreenerContext } from "./screener-context";

const EXAMPLES = [
  "market cap over $1b with buy ratio above 55%",
  "fdv under 200m, volume over $5m",
  "7d return above 25%, sorted by volume",
];

/**
 * NL input for the unified smart-screener endpoint. All queries go to ONE
 * backend (no regex routing between three); the one local shortcut is a
 * single short token, which becomes plain text search. On a failed
 * interpretation the dialog stays open and shows the server's userMessage.
 */
export function ScreenerSmartPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const CLOSE_ANIMATION_MS = 75;

  const { interpret, setQ } = useScreenerContext();
  const [draft, setDraft] = React.useState("");
  const [inlineError, setInlineError] = React.useState<string | null>(null);
  /** Keeps the tree mounted briefly after `open` becomes false so exit CSS can run. */
  const [isVisible, setIsVisible] = React.useState(open);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  const isInterpreting = interpret.status === "interpreting";

  React.useEffect(() => {
    if (open) {
      setIsVisible(true);
      return;
    }
    const id = window.setTimeout(() => setIsVisible(false), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setDraft("");
    setInlineError(null);

    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  // The tree only mounts while visible, so open the native modal (focus trap,
  // scroll lock, Escape) as soon as the <dialog> exists.
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (isVisible && dialog && !dialog.open) dialog.showModal();
  }, [isVisible]);

  const submit = React.useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setInlineError(null);

      // Single short token = plain text search, no LLM.
      if (trimmed.split(/\s+/g).length === 1 && trimmed.length <= 18) {
        setQ(trimmed);
        onOpenChange(false);
        return;
      }

      const response = await interpret.run(trimmed);
      if (response?.ok) {
        onOpenChange(false);
        setDraft("");
        return;
      }

      setInlineError(
        response?.userMessage ??
          "Couldn’t interpret that right now. Try again in a moment.",
      );
    },
    [interpret, onOpenChange, setQ],
  );

  if (!isVisible) return null;

  const dialogState = open ? "open" : "closed";

  return (
    <dialog
      ref={dialogRef}
      aria-label="Smart Search"
      className="fixed inset-0 z-[10000] m-0 h-full max-h-none w-full max-w-none items-start justify-center border-0 bg-transparent p-0 px-4 pt-40 text-foreground open:flex backdrop:bg-transparent"
      onCancel={(event) => {
        // Keep the exit animation: run our controlled close instead of the
        // native instant close (the tree unmounts CLOSE_ANIMATION_MS later).
        event.preventDefault();
        onOpenChange(false);
      }}
    >
      <button
        type="button"
        aria-label="Close smart screener"
        data-state={dialogState}
        className={cn(
          "absolute inset-0 bg-black/20 backdrop-blur-sm",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:duration-75 motion-safe:ease-out motion-safe:data-[state=closed]:ease-in",
        )}
        onClick={() => onOpenChange(false)}
      />

      <div
        data-state={dialogState}
        className={cn(
          "relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-gray-200/50 bg-white/95 shadow-[0_3px_8px_oklch(0_0_0_/_0.1),0_2px_4px_oklch(0_0_0_/_0.06)] backdrop-blur-md dark:border-transparent dark:bg-zinc-900/80 dark:shadow-[inset_0_1px_2px_oklch(1_0_0_/_0.2),inset_0_-4px_30px_oklch(0.2978_0.0083_317.72_/_0.9),0_4px_16px_oklch(0_0_0_/_0.4)]",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95",
          "motion-safe:duration-75 motion-safe:ease-out motion-safe:data-[state=closed]:ease-in",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          id="smart-screener-prompt-form"
          className="pb-16"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <div className="flex min-h-12 items-center gap-3 border-b border-black/60 pb-6 p-6">
            <label htmlFor="smart-screener-prompt-input" className="sr-only">
              Describe what you&apos;re looking for
            </label>
            <input
              id="smart-screener-prompt-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (inlineError) setInlineError(null);
              }}
              placeholder="Describe what you're looking for..."
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              aria-label="Close smart screener"
              className="shrink-0 rounded-md"
              onClick={() => onOpenChange(false)}
            >
              <Kbd className="bg-primary/10 font-mono px-2 w-8 uppercase text-xs">
                esc
              </Kbd>
            </button>
          </div>

          {inlineError ? (
            <p className="px-6 pt-3 text-xs text-rose-400">{inlineError}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 p-5 border-t border-white/5 pt-3">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/20 bg-zinc-600/30 py-0 pl-1.5 pr-2 text-primary/80",
                  "cursor-pointer transition-colors hover:text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
                onClick={() => {
                  setDraft(example);
                  void submit(example);
                }}
              >
                <span className="max-w-[min(100%,20rem)] text-left text-xs text-pretty">
                  {example}
                </span>
              </button>
            ))}
          </div>
        </form>

        <Button
          type="submit"
          size="sm"
          variant="default"
          form="smart-screener-prompt-form"
          aria-label="Run smart screener"
          className="absolute h-7 bottom-4 right-4 !rounded-lg gap-2 inline-flex"
          disabled={draft.trim().length === 0 || isInterpreting}
        >
          <IconArrowTurnDownRight className="size-2.5 fill-primary/70" />
          <span className="text-xs uppercase">
            {isInterpreting ? "Interpreting…" : "Enter"}
          </span>
        </Button>
      </div>
    </dialog>
  );
}
