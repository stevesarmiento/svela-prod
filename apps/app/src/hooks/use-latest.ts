import { useEffect, useRef } from "react";

/**
 * Keep a stable ref pointing at the latest value. Synced after commit, so
 * read it from event handlers/effects only — never during render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

