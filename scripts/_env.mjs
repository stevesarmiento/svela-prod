import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getArg(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function parseDotEnv(contents) {
  const env = {};

  for (const rawLine of String(contents).split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1);
    const valueStart = rawValue.trimStart();

    if (!key) continue;

    let value;
    // Support inline comments after values, e.g. `KEY=value  # comment`.
    // Treat `KEY=  # comment` as an empty value.
    if (valueStart.startsWith("#") && rawValue.length > 0 && rawValue[0] !== "#") {
      value = "";
    } else {
      const quotedMatch = valueStart.match(/^(['"])(.*)\1(?:\s+#.*)?\s*$/);
      if (quotedMatch) {
        value = quotedMatch[2];
      } else {
        value = valueStart.replace(/\s+#.*$/, "").trim();
      }
    }

    env[key] = value;
  }

  return env;
}

async function loadEnvFile(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return parseDotEnv(contents);
  } catch {
    return null;
  }
}

function getRepoRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..");
}

function defaultEnvCandidates(repoRoot) {
  const envFile = getArg("env-file", "").trim();
  return [
    // Allow a script-local override first.
    ...(envFile ? [envFile] : []),

    // Typical monorepo locations (Next loads these automatically for each app).
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env"),
    path.join(repoRoot, "apps/app/.env.local"),
    path.join(repoRoot, "apps/app/.env"),
    path.join(repoRoot, "apps/web/.env.local"),
    path.join(repoRoot, "apps/web/.env"),
  ];
}

/**
 * Best-effort env loader for local scripts:
 * - Does NOT override existing `process.env` values
 * - Reads common `.env*` files if present
 */
export async function loadLocalEnv() {
  const repoRoot = getRepoRoot();
  const candidates = defaultEnvCandidates(repoRoot);

  const loadedFrom = {};

  for (const candidate of candidates) {
    const env = await loadEnvFile(candidate);
    if (!env) continue;

    for (const [key, value] of Object.entries(env)) {
      const existing = process.env[key];
      // Don't override already-set values, but do fill in missing/empty ones.
      if (typeof existing === "string" && existing.trim().length > 0) continue;
      process.env[key] = value;
      loadedFrom[key] = candidate;
    }
  }

  return { loadedFrom };
}
