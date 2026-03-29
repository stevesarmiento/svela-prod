/**
 * This repo treats Convex as server-only. Do not create a browser Convex client.
 * Use Next.js route handlers (`/api/internal/*`) instead.
 */
export const convex: never = (() => {
  throw new Error(
    "Browser Convex client is disabled (server-only Convex mode).",
  );
})();
