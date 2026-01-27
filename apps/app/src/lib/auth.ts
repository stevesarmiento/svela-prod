import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

export const getAuthToken = cache(async (): Promise<string | undefined> => {
  const clerkAuth = await auth();
  return (await clerkAuth.getToken({ template: "convex" })) ?? undefined;
});