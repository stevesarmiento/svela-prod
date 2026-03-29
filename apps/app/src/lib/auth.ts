import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

export const getAuthToken = cache(async (): Promise<string | undefined> => {
  const clerkAuth = await auth();
  // Prefer a dedicated Convex JWT template if configured, but fall back to the
  // default Clerk session token so SSR preloading doesn't hard-fail.
  const templated = await clerkAuth
    .getToken({ template: "convex" })
    .catch(() => null);
  if (templated) return templated;
  return (await clerkAuth.getToken().catch(() => null)) ?? undefined;
});