import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const staticDir = join(root, ".next", "static");
const routeStatsPath = join(root, ".next", "diagnostics", "route-bundle-stats.json");
const cssBudgetKb = Number(process.env.APP_MAIN_CSS_GZIP_BUDGET_KB ?? "40");
const routeBudgetsBytes = {
  "/[locale]": 1.75 * 1024 * 1024,
  "/[locale]/settings": 1.75 * 1024 * 1024,
  "/[locale]/watchlist": 1.75 * 1024 * 1024,
  "/[locale]/overview": 2.35 * 1024 * 1024,
  "/[locale]/charts/[id]": 2.10 * 1024 * 1024,
  "/[locale]/watchlists": 2.10 * 1024 * 1024,
  "/[locale]/screener": 1.75 * 1024 * 1024,
};
const reportedRoutes = [
  "/[locale]",
  "/[locale]/settings",
  "/[locale]/watchlist",
  "/[locale]/overview",
  "/[locale]/charts/[id]",
  "/[locale]/watchlists",
  "/[locale]/screener",
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

if (!statSync(staticDir, { throwIfNoEntry: false })) {
  console.error("Missing .next/static. Run `bun run build` first.");
  process.exit(1);
}

const files = walk(staticDir)
  .filter((file) => [".css", ".js"].includes(extname(file)))
  .map((file) => {
    const contents = readFileSync(file);
    const rawBytes = contents.byteLength;
    const gzipBytes = gzipSync(contents).byteLength;
    return {
      file: relative(root, file),
      ext: extname(file),
      rawBytes,
      gzipBytes,
    };
  });

const cssFiles = files
  .filter((file) => file.ext === ".css")
  .sort((a, b) => b.gzipBytes - a.gzipBytes);
const jsFiles = files
  .filter((file) => file.ext === ".js")
  .sort((a, b) => b.gzipBytes - a.gzipBytes);

const mainCss = cssFiles[0] ?? null;
const hasRouteStats = Boolean(statSync(routeStatsPath, { throwIfNoEntry: false }));
const routeStats = hasRouteStats
  ? JSON.parse(readFileSync(routeStatsPath, "utf8"))
  : [];
const routeStatsByRoute = new Map(
  routeStats.map((entry) => [entry.route, entry]),
);

console.log("Build asset report");
if (mainCss) {
  console.log(
    `main-css ${mainCss.file} raw=${formatKb(mainCss.rawBytes)} gzip=${formatKb(mainCss.gzipBytes)}`,
  );
} else {
  console.log("main-css none");
}

for (const file of jsFiles.slice(0, 5)) {
  console.log(
    `js ${file.file} raw=${formatKb(file.rawBytes)} gzip=${formatKb(file.gzipBytes)}`,
  );
}

if (hasRouteStats) {
  for (const route of reportedRoutes) {
    const stat = routeStatsByRoute.get(route);
    if (!stat) {
      console.log(`route ${route} missing`);
      continue;
    }

    console.log(
      `route ${route} first-load=${formatMb(stat.firstLoadUncompressedJsBytes)}`,
    );
  }
}

if (mainCss && mainCss.gzipBytes > cssBudgetKb * 1024) {
  console.error(
    `Main CSS gzip ${formatKb(mainCss.gzipBytes)} exceeds budget ${cssBudgetKb.toFixed(1)}KB.`,
  );
  process.exit(1);
}

if (hasRouteStats) {
  let routeBudgetExceeded = false;

  for (const [route, budgetBytes] of Object.entries(routeBudgetsBytes)) {
    const stat = routeStatsByRoute.get(route);
    if (!stat) {
      console.error(`Missing route bundle stats for ${route}.`);
      routeBudgetExceeded = true;
      continue;
    }

    if (stat.firstLoadUncompressedJsBytes > budgetBytes) {
      console.error(
        `Route ${route} first-load ${formatMb(stat.firstLoadUncompressedJsBytes)} exceeds budget ${formatMb(budgetBytes)}.`,
      );
      routeBudgetExceeded = true;
    }
  }

  if (routeBudgetExceeded) {
    process.exit(1);
  }
}
