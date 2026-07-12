import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

/**
 * Resolve a user by Clerk ID, matching either the primary (production)
 * `clerkId` or the linked development-instance `devClerkId`. This lets the
 * same Convex user row serve both production sessions (prod Clerk) and
 * local-dev sessions (development Clerk) against the shared deployment.
 */
export async function getUserByClerkId(
  db: DatabaseReader,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  const byPrimary = await db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  if (byPrimary) return byPrimary;

  return await db
    .query("users")
    .withIndex("by_dev_clerk_id", (q) => q.eq("devClerkId", clerkId))
    .first();
}

/**
 * Map any session Clerk ID (prod or linked dev) to the user's canonical
 * primary `clerkId`. Use this when building per-user cache keys so prod and
 * local-dev sessions share the same cached data.
 */
export async function getCanonicalClerkId(
  db: DatabaseReader,
  clerkId: string,
): Promise<string> {
  const user = await getUserByClerkId(db, clerkId);
  return user?.clerkId ?? clerkId;
}
