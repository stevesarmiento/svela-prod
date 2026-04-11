"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "svela:last-runtime-error";
const LOG_STORAGE_KEY = "svela:last-runtime-error-log";

function normalizeErrorPart(value: unknown): string {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join("\n");
  }

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shouldCapture(parts: unknown[]): boolean {
  const text = parts.map(normalizeErrorPart).join("\n");
  return (
    text.includes("Rendered more hooks than during the previous render") ||
    text.includes("Rendered fewer hooks than expected")
  );
}

function readStoredError(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

function writeStoredError(parts: unknown[]): string {
  const text = parts.map(normalizeErrorPart).join("\n\n");
  window.sessionStorage.setItem(STORAGE_KEY, text);
  return text;
}

function readStoredLog(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(LOG_STORAGE_KEY);
}

function appendStoredLog(parts: unknown[]) {
  const nextLine = parts.map(normalizeErrorPart).join("\n\n");
  const previous = readStoredLog();
  const merged = previous ? `${previous}\n\n---\n\n${nextLine}` : nextLine;
  window.sessionStorage.setItem(LOG_STORAGE_KEY, merged);
}

function clearStoredRuntimeError() {
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(LOG_STORAGE_KEY);
}

interface RuntimeErrorBoundaryState {
  errorText: string | null;
}

export class RuntimeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RuntimeErrorBoundaryState
> {
  state: RuntimeErrorBoundaryState = { errorText: null };

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    const errorText = normalizeErrorPart(error);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, errorText);
    }
    return { errorText };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window === "undefined") return;
    const text = [normalizeErrorPart(error), info.componentStack].filter(Boolean).join("\n\n");
    window.sessionStorage.setItem(STORAGE_KEY, text);
    appendStoredLog([error, info.componentStack]);
    this.setState({ errorText: text });
  }

  render() {
    if (process.env.NODE_ENV !== "development") {
      return this.props.children;
    }

    if (!this.state.errorText) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-4xl rounded-xl border border-white/15 bg-black/95 p-4 text-zinc-100 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-wide">
              Captured Runtime Error
            </div>
            <button
              type="button"
              className="rounded-md border border-white/15 px-2 py-1 text-xs"
              onClick={() => {
                clearStoredRuntimeError();
                this.setState({ errorText: null });
                window.location.reload();
              }}
            >
              Clear + Reload
            </button>
          </div>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-[12px] leading-5">
            {this.state.errorText}
          </pre>
        </div>
      </div>
    );
  }
}

export function RuntimeErrorCapture() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    setMessage([readStoredError(), readStoredLog()].filter(Boolean).join("\n\n===\n\n") || null);

    const originalConsoleError = window.console.error;
    window.console.error = (...args: unknown[]) => {
      appendStoredLog(args);
      if (shouldCapture(args)) {
        setMessage(writeStoredError(args));
      }
      originalConsoleError(...args);
    };

    const onError = (event: ErrorEvent) => {
      const payload: unknown[] = [event.message];
      if (event.error) payload.push(event.error);
      appendStoredLog(payload);
      if (shouldCapture(payload)) {
        setMessage(writeStoredError(payload));
      }
    };

    window.addEventListener("error", onError);

    return () => {
      window.console.error = originalConsoleError;
      window.removeEventListener("error", onError);
    };
  }, []);

  if (process.env.NODE_ENV !== "development" || !message) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[2147483647] w-[min(720px,calc(100vw-32px))] rounded-xl border border-white/15 bg-black/95 p-3 text-zinc-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide">
          Captured Runtime Error
        </div>
        <button
          type="button"
          className="rounded-md border border-white/15 px-2 py-1 text-xs"
          onClick={() => {
            clearStoredRuntimeError();
            setMessage(null);
          }}
        >
          Clear
        </button>
      </div>
      <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap text-[12px] leading-5">
        {message}
      </pre>
    </div>
  );
}
