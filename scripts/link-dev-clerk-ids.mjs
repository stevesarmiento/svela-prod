/**
 * Link development Clerk IDs to migrated Convex users so the shared Convex
 * deployment resolves the same user row for both prod sessions (prod Clerk)
 * and local-dev sessions (development Clerk).
 *
 * The dev<->prod ID mapping comes from Clerk Production `external_id`, which
 * the migration set to each user's old development Clerk ID.
 *
 * Usage:
 *   bun scripts/link-dev-clerk-ids.mjs           # dry run
 *   bun scripts/link-dev-clerk-ids.mjs --apply
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "../apps/app/node_modules/convex/dist/esm/browser/index.js";
import { api } from "../apps/app/convex/_generated/api.js";
import { loadLocalEnv } from "./_env.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name, value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error(`Missing ${name}`);
  return trimmed;
}

function getConvexEnvValue(name) {
  const result = spawnSync("bunx", ["convex", "env", "get", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: path.join(repoRoot, "apps/app"),
  });
  if (result.status !== 0) return "";
  return String(result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

await loadLocalEnv();

const apply = hasFlag("apply");

const prodKey = requireEnv(
  "CLERK_PRODUCTION_SECRET_KEY (or CLERK_PROD_SECRET_KEY)",
  process.env.CLERK_PRODUCTION_SECRET_KEY ?? process.env.CLERK_PROD_SECRET_KEY,
);
if (!prodKey.startsWith("sk_live_")) {
  throw new Error("CLERK_PRODUCTION_SECRET_KEY must be an sk_live_ key");
}

const prodUsers = [];
for (let offset = 0; ; offset += 100) {
  const response = await fetch(
    `https://api.clerk.com/v1/users?limit=100&offset=${offset}`,
    { headers: { Authorization: `Bearer ${prodKey}` } },
  );
  if (!response.ok) throw new Error(`Clerk list users failed: ${response.status}`);
  const page = await response.json();
  prodUsers.push(...page);
  if (page.length < 100) break;
}

const links = prodUsers
  .filter((user) => user.external_id)
  .map((user) => ({ devClerkId: user.external_id, prodClerkId: user.id }));

console.log(`Prod Clerk users: ${prodUsers.length} | with external_id: ${links.length}`);

const convexUrl = requireEnv(
  "CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)",
  process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
);
const migrationSecret = requireEnv(
  "CLERK_MIGRATION_SECRET",
  process.env.CLERK_MIGRATION_SECRET ?? getConvexEnvValue("CLERK_MIGRATION_SECRET"),
);

const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.clerkUserMigration.linkDevClerkIds, {
  secret: migrationSecret,
  apply,
  links,
});

console.log(
  [
    apply ? "Applied" : "Dry run",
    `linked=${result.linked}`,
    `alreadyLinked=${result.alreadyLinked}`,
    `missingProdUsers=${result.missingProdUsers}`,
    `duplicatesMerged=${result.duplicatesMerged}`,
    `rowsReassigned=${result.rowsReassigned}`,
    `rowsDeleted=${result.rowsDeleted}`,
  ].join(" | "),
);
