import { useRef } from "react";

/**
 * Keep a stable ref pointing at the latest value (no effects needed).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

