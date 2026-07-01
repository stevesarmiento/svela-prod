import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "../apps/app/node_modules/convex/browser";
import { api } from "../apps/app/convex/_generated/api.js";
import { loadLocalEnv } from "./_env.mjs";

const CLERK_API_BASE = "https://api.clerk.com/v1";
const CONFIRMATION = "MIGRATE_CLERK_USER_IDS";

function getArg(name, fallback = "") {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

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
    cwd: path.resolve("apps/app"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) return "";

  return String(result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

function splitName(fullName) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };

  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts.at(-1),
  };
}

function userEmail(user) {
  const email = String(user.email ?? user.primaryEmail ?? "").trim();
  return email.length > 0 ? email : null;
}

function clerkExternalId(user) {
  return user.external_id ?? user.externalId ?? null;
}

function clerkPrimaryEmail(user) {
  const primaryEmailId =
    user.primary_email_address_id ?? user.primaryEmailAddressId;
  const emails = user.email_addresses ?? user.emailAddresses ?? [];
  const primary = Array.isArray(emails)
    ? emails.find((email) => (email.id ?? "") === primaryEmailId)
    : null;
  const fallback = Array.isArray(emails) ? emails[0] : null;
  return (
    primary?.email_address ??
    primary?.emailAddress ??
    fallback?.email_address ??
    fallback?.emailAddress ??
    null
  );
}

function clerkWeb3Wallets(user) {
  const wallets = user.web3_wallets ?? user.web3Wallets ?? [];
  if (!Array.isArray(wallets)) return [];

  const unique = new Set();

  for (const wallet of wallets) {
    const value =
      wallet?.web3_wallet ??
      wallet?.web3Wallet ??
      wallet?.web3_wallet_address ??
      wallet?.web3WalletAddress;
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed) unique.add(trimmed);
  }

  return Array.from(unique);
}

function addWalletIndexes(index, user) {
  for (const wallet of clerkWeb3Wallets(user)) {
    index.set(wallet.toLowerCase(), user);
  }
}

async function clerkFetch(pathname, { method = "GET", body, secretKey }) {
  const response = await fetch(`${CLERK_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.errors?.[0]?.long_message ??
      data?.errors?.[0]?.message ??
      data?.error?.message ??
      `${method} ${pathname} failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getClerkUser(userId, secretKey) {
  try {
    return await clerkFetch(`/users/${encodeURIComponent(userId)}`, {
      secretKey,
    });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function listProductionUsers(secretKey) {
  const users = [];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const data = await clerkFetch(`/users?${params}`, { secretKey });
    const page = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];
    users.push(...page);

    const totalCount = data?.total_count ?? data?.totalCount;
    if (typeof totalCount === "number" && users.length >= totalCount) break;
    if (page.length < limit) break;
  }

  return users;
}

async function hydrateUsersFromDevelopmentClerk(
  sourceUsers,
  developmentSecretKey,
) {
  if (!developmentSecretKey) {
    return sourceUsers.map((user) => ({ ...user, web3Wallets: [] }));
  }

  const hydrated = [];
  let found = 0;
  let withWallets = 0;

  for (const sourceUser of sourceUsers) {
    const clerkUser = await getClerkUser(
      sourceUser.clerkId,
      developmentSecretKey,
    );
    const web3Wallets = clerkUser ? clerkWeb3Wallets(clerkUser) : [];

    if (clerkUser) found++;
    if (web3Wallets.length > 0) withWallets++;

    hydrated.push({
      ...sourceUser,
      email: sourceUser.email ?? clerkPrimaryEmail(clerkUser ?? {}),
      fullName:
        sourceUser.fullName ??
        [
          clerkUser?.first_name ?? clerkUser?.firstName,
          clerkUser?.last_name ?? clerkUser?.lastName,
        ]
          .filter(Boolean)
          .join(" "),
      web3Wallets,
    });
  }

  console.log(
    `Development Clerk lookup: found=${found} | withWallets=${withWallets}`,
  );
  return hydrated;
}

async function createProductionUser(sourceUser, secretKey) {
  const email = userEmail(sourceUser);
  const web3Wallets = Array.isArray(sourceUser.web3Wallets)
    ? sourceUser.web3Wallets
    : [];
  if (!email && web3Wallets.length === 0) {
    throw new Error(
      `Cannot create ${sourceUser.clerkId}: missing email and web3Wallets`,
    );
  }

  return await clerkFetch("/users", {
    method: "POST",
    secretKey,
    body: {
      external_id: sourceUser.clerkId,
      ...(email ? { email_address: [email] } : {}),
      ...(web3Wallets.length > 0 ? { web3_wallet: web3Wallets } : {}),
      ...splitName(sourceUser.fullName),
      created_at: new Date(sourceUser.createdAt).toISOString(),
      skip_password_requirement: true,
      skip_legal_checks: true,
      private_metadata: {
        migratedFromClerkUserId: sourceUser.clerkId,
        migratedFrom: "svela-convex-clerk-staging",
      },
    },
  });
}

async function adoptExistingProductionUser(userId, oldClerkId, secretKey) {
  return await clerkFetch(`/users/${userId}`, {
    method: "PATCH",
    secretKey,
    body: {
      external_id: oldClerkId,
      private_metadata: {
        migratedFromClerkUserId: oldClerkId,
        migratedFrom: "svela-convex-clerk-staging",
      },
    },
  });
}

async function readJsonFile(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents);
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await fs.rename(`${filePath}.tmp`, filePath);
}

function summarizeMigration(result) {
  return [
    `apply=${result.apply}`,
    `mappings=${result.mappings}`,
    `missingSourceUsers=${result.missingSourceUsers}`,
    `usersPatched=${result.usersPatched}`,
    `usersMerged=${result.usersMerged}`,
    `userReferencesPatched=${result.userReferencesPatched}`,
    `userReferencesDeleted=${result.userReferencesDeleted}`,
  ].join(" | ");
}

await loadLocalEnv();

const convexUrl = requireEnv(
  "CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)",
  process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
);
const migrationSecret = requireEnv(
  "CLERK_MIGRATION_SECRET",
  process.env.CLERK_MIGRATION_SECRET ??
    getConvexEnvValue("CLERK_MIGRATION_SECRET"),
);
const outputFile = path.resolve(
  getArg("output", "migration-output/clerk-production-user-map.json"),
);
const inputFile = getArg("input", "").trim();
const applyClerk = hasFlag("apply-clerk");
const applyConvex = hasFlag("apply-convex");
const adoptExistingEmail = hasFlag("adopt-existing-email");
const allowTestClerk = hasFlag("allow-test-clerk");
const shouldUseClerk = applyClerk || hasFlag("check-clerk");

const clerkSecretKey = String(
  process.env.CLERK_PRODUCTION_SECRET_KEY ??
    process.env.CLERK_PROD_SECRET_KEY ??
    process.env.CLERK_SECRET_KEY ??
    "",
).trim();
const developmentClerkSecretKey = String(
  process.env.CLERK_DEVELOPMENT_SECRET_KEY ??
    process.env.CLERK_DEV_SECRET_KEY ??
    (process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")
      ? process.env.CLERK_SECRET_KEY
      : ""),
).trim();

if (shouldUseClerk) {
  requireEnv(
    "CLERK_PRODUCTION_SECRET_KEY (or CLERK_PROD_SECRET_KEY)",
    clerkSecretKey,
  );
  if (!allowTestClerk && !clerkSecretKey.startsWith("sk_live_")) {
    throw new Error(
      "Refusing to use a non-production Clerk secret. Pass --allow-test-clerk only for a rehearsal.",
    );
  }
}

const client = new ConvexHttpClient(convexUrl);
const sourceUsers = await client.query(
  api.clerkUserMigration.listUsersForProductionImport,
  {
    secret: migrationSecret,
  },
);
const usersWithAuthIdentifiers = await hydrateUsersFromDevelopmentClerk(
  sourceUsers,
  developmentClerkSecretKey,
);

console.log(`Loaded ${sourceUsers.length} Convex users from ${convexUrl}`);

const skipped = usersWithAuthIdentifiers.filter(
  (user) => !userEmail(user) && user.web3Wallets.length === 0,
);
if (skipped.length > 0) {
  console.log(`Skipping ${skipped.length} users without email or web3Wallets`);
}

let mappings = [];

if (inputFile) {
  const input = await readJsonFile(path.resolve(inputFile));
  mappings = Array.isArray(input) ? input : input.mappings;
  if (!Array.isArray(mappings))
    throw new Error(
      'Input mapping file must be an array or { "mappings": [...] }',
    );
  console.log(`Loaded ${mappings.length} mappings from ${inputFile}`);
} else if (applyClerk || hasFlag("check-clerk")) {
  const productionUsers = await listProductionUsers(clerkSecretKey);
  const byExternalId = new Map();
  const byEmail = new Map();
  const byWallet = new Map();

  for (const user of productionUsers) {
    const externalId = clerkExternalId(user);
    const email = clerkPrimaryEmail(user);
    if (externalId) byExternalId.set(externalId, user);
    if (email) byEmail.set(String(email).toLowerCase(), user);
    addWalletIndexes(byWallet, user);
  }

  let created = 0;
  let existing = 0;
  let adopted = 0;
  let adoptableEmail = 0;
  let adoptableWallet = 0;
  let missing = 0;

  for (const sourceUser of usersWithAuthIdentifiers) {
    const email = userEmail(sourceUser);
    if (!email && sourceUser.web3Wallets.length === 0) continue;

    const existingByExternalId = byExternalId.get(sourceUser.clerkId);
    if (existingByExternalId) {
      existing++;
      mappings.push({ from: sourceUser.clerkId, to: existingByExternalId.id });
      continue;
    }

    const existingByEmail = email ? byEmail.get(email.toLowerCase()) : null;
    if (existingByEmail) {
      if (!applyClerk) {
        adoptableEmail++;
        continue;
      }

      if (!adoptExistingEmail) {
        throw new Error(
          `Production user already exists for ${email} (${existingByEmail.id}) without external_id=${sourceUser.clerkId}. Re-run with --adopt-existing-email if this is intentional.`,
        );
      }

      const adoptedUser = await adoptExistingProductionUser(
        existingByEmail.id,
        sourceUser.clerkId,
        clerkSecretKey,
      );
      adopted++;
      mappings.push({ from: sourceUser.clerkId, to: adoptedUser.id });
      continue;
    }

    const existingByWallet = sourceUser.web3Wallets
      .map((wallet) => byWallet.get(wallet.toLowerCase()))
      .find(Boolean);
    if (existingByWallet) {
      if (!applyClerk) {
        adoptableWallet++;
        continue;
      }

      const adoptedUser = await adoptExistingProductionUser(
        existingByWallet.id,
        sourceUser.clerkId,
        clerkSecretKey,
      );
      adopted++;
      mappings.push({ from: sourceUser.clerkId, to: adoptedUser.id });
      continue;
    }

    if (!applyClerk) continue;

    const createdUser = await createProductionUser(sourceUser, clerkSecretKey);
    created++;
    mappings.push({ from: sourceUser.clerkId, to: createdUser.id });
  }

  missing =
    usersWithAuthIdentifiers.length -
    existing -
    adopted -
    created -
    adoptableEmail -
    adoptableWallet -
    skipped.length;
  console.log(
    [
      "Clerk users",
      `productionTotal=${productionUsers.length}`,
      `mappedByExternalId=${existing}`,
      `adopted=${adopted}`,
      `created=${created}`,
      `adoptableByEmail=${adoptableEmail}`,
      `adoptableByWallet=${adoptableWallet}`,
      `missing=${Math.max(0, missing)}`,
    ].join(" | "),
  );
  await writeJsonFile(outputFile, {
    generatedAt: new Date().toISOString(),
    convexUrl,
    mappings,
    skipped,
  });
  console.log(`Wrote ${mappings.length} mappings to ${outputFile}`);
} else {
  const creatable = usersWithAuthIdentifiers.filter(
    (user) => userEmail(user) || user.web3Wallets.length > 0,
  );
  console.log(
    `Dry run only. ${creatable.length} users have email or web3Wallets and can be created in Clerk Production.`,
  );
  await writeJsonFile(
    path.resolve("migration-output/clerk-production-user-import-preview.json"),
    {
      generatedAt: new Date().toISOString(),
      convexUrl,
      creatable,
      skipped,
    },
  );
  console.log(
    "Wrote preview to migration-output/clerk-production-user-import-preview.json",
  );
  console.log(
    "Re-run with --apply-clerk after setting CLERK_PRODUCTION_SECRET_KEY=sk_live_...",
  );
}

if (applyConvex) {
  if (mappings.length === 0)
    throw new Error("No mappings available for Convex migration");

  const dryRun = await client.mutation(
    api.clerkUserMigration.migrateClerkUserIds,
    {
      secret: migrationSecret,
      apply: false,
      mappings,
    },
  );
  console.log(`Convex dry run: ${summarizeMigration(dryRun)}`);

  const applied = await client.mutation(
    api.clerkUserMigration.migrateClerkUserIds,
    {
      secret: migrationSecret,
      apply: true,
      confirmation: CONFIRMATION,
      mappings,
    },
  );
  console.log(`Convex applied: ${summarizeMigration(applied)}`);
} else if (mappings.length > 0) {
  console.log(
    "Convex was not migrated. Re-run with --apply-convex when the mapping looks correct.",
  );
}
