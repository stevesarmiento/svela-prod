"use client";

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Polling must be opt-in per query; otherwise tables thrash.
      staleTime: 30 * 1000, // 30 seconds
      refetchInterval: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});