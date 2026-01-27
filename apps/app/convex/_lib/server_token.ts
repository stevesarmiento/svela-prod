/**
 * Server-only guard for Convex public functions.
 *
 * Goal: prevent direct calls to Convex functions from the public internet.
 * Next.js server routes/actions must pass `serverToken` from their env.
 */

export function requireServerToken(serverToken: string): void {
  const expected = process.env.INTERNAL_CONVEX_SERVER_TOKEN;
  if (!expected) {
    throw new Error(
      "Missing INTERNAL_CONVEX_SERVER_TOKEN in Convex environment. " +
        "Set it in the Convex deployment environment variables.",
    );
  }
  if (serverToken !== expected) {
    throw new Error("Unauthorized");
  }
}
