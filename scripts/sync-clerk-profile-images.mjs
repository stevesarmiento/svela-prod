/**
 * Copy user profile images from the development Clerk instance to Clerk
 * Production (matched via external_id = old dev Clerk user ID), then update
 * Convex users.avatarUrl to the new production image URL.
 *
 * Usage:
 *   bun scripts/sync-clerk-profile-images.mjs            # dry run
 *   bun scripts/sync-clerk-profile-images.mjs --apply
 *
 * Required env:
 *   CLERK_PRODUCTION_SECRET_KEY (sk_live_...)
 *   CLERK_DEVELOPMENT_SECRET_KEY / CLERK_DEV_SECRET_KEY / CLERK_SECRET_KEY (sk_test_...)
 *   NEXT_PUBLIC_CONVEX_URL + CLERK_MIGRATION_SECRET (for --apply Convex avatar update)
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "../apps/app/node_modules/convex/dist/esm/browser/index.js";
import { api } from "../apps/app/convex/_generated/api.js";
import { loadLocalEnv } from "./_env.mjs";

const CLERK_API_BASE = "https://api.clerk.com/v1";
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

async function clerkFetch(pathname, { method = "GET", body, secretKey }) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${CLERK_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
    },
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.errors?.[0]?.long_message ??
      data?.errors?.[0]?.message ??
      `${method} ${pathname} failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function listAllUsers(secretKey) {
  const users = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await clerkFetch(`/users?limit=${limit}&offset=${offset}`, { secretKey });
    const rows = Array.isArray(page) ? page : (page?.data ?? []);
    users.push(...rows);
    if (rows.length < limit) break;
  }
  return users;
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
const devKey = requireEnv(
  "CLERK_DEVELOPMENT_SECRET_KEY (or CLERK_SECRET_KEY=sk_test_...)",
  process.env.CLERK_DEVELOPMENT_SECRET_KEY ??
    process.env.CLERK_DEV_SECRET_KEY ??
    (process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ? process.env.CLERK_SECRET_KEY : ""),
);

const [prodUsers, devUsers] = await Promise.all([listAllUsers(prodKey), listAllUsers(devKey)]);
const devById = new Map(devUsers.map((u) => [u.id, u]));

console.log(`Prod users: ${prodUsers.length} | Dev users: ${devUsers.length}`);

let copied = 0;
let noDevImage = 0;
let noExternalId = 0;
let alreadyHasImage = 0;
let failed = 0;
const avatarUpdates = [];

for (const prodUser of prodUsers) {
  const externalId = prodUser.external_id;
  if (!externalId) {
    noExternalId++;
    continue;
  }

  const devUser = devById.get(externalId);
  if (!devUser?.has_image || !devUser.image_url) {
    noDevImage++;
    continue;
  }

  if (prodUser.has_image) {
    alreadyHasImage++;
    // Still make sure Convex points at the prod image.
    avatarUpdates.push({ clerkId: prodUser.id, avatarUrl: prodUser.image_url });
    continue;
  }

  if (!apply) {
    copied++;
    continue;
  }

  try {
    const imageResponse = await fetch(devUser.image_url);
    if (!imageResponse.ok) throw new Error(`image fetch failed: ${imageResponse.status}`);
    const blob = await imageResponse.blob();

    const form = new FormData();
    form.append("file", blob, "avatar.jpg");
    await clerkFetch(`/users/${prodUser.id}/profile_image`, {
      method: "POST",
      body: form,
      secretKey: prodKey,
    });

    const refreshed = await clerkFetch(`/users/${prodUser.id}`, { secretKey: prodKey });
    avatarUpdates.push({ clerkId: prodUser.id, avatarUrl: refreshed.image_url });
    copied++;
    console.log(`Copied image for ${prodUser.id} (from ${externalId})`);
  } catch (error) {
    failed++;
    console.error(`Failed for ${prodUser.id} (from ${externalId}): ${error.message}`);
  }
}

console.log(
  [
    apply ? "Applied" : "Dry run",
    `copied=${copied}`,
    `alreadyHasImage=${alreadyHasImage}`,
    `noDevImage=${noDevImage}`,
    `noExternalId=${noExternalId}`,
    `failed=${failed}`,
  ].join(" | "),
);

if (apply && avatarUpdates.length > 0) {
  const convexUrl = requireEnv(
    "CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)",
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
  );
  const migrationSecret = requireEnv(
    "CLERK_MIGRATION_SECRET",
    process.env.CLERK_MIGRATION_SECRET ?? getConvexEnvValue("CLERK_MIGRATION_SECRET"),
  );
  const client = new ConvexHttpClient(convexUrl);
  const result = await client.mutation(api.clerkUserMigration.updateAvatarUrls, {
    secret: migrationSecret,
    updates: avatarUpdates,
  });
  console.log(`Convex avatarUrl updates: patched=${result.patched} | missing=${result.missing}`);
}
