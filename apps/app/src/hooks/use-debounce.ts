"use client";

import { useDebouncedValue } from "@tanstack/react-pacer";

/** Debounces a value after `delay` ms of stability via TanStack Pacer (same API as before). */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue] = useDebouncedValue(value, { wait: delay });
  return debouncedValue;
}
