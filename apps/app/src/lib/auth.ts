import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

export const getAuthToken = cache(async (): Promise<string | undefined> => {
  const clerkAuth = await auth();
  // Only the "convex" JWT template mints tokens Convex accepts (aud: "convex").
  // The default Clerk session token is always rejected with NoAuthProvider, so
  // if the template token is unavailable (e.g. mid-signout), return undefined
  // and let callers fall back to unauthenticated queries.
  const templated = await clerkAuth
    .getToken({ template: "convex" })
    .catch(() => null);
  return templated ?? undefined;
});