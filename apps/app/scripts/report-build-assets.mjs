import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const staticDir = join(root, ".next", "static");
const cssBudgetKb = Number(process.env.APP_MAIN_CSS_GZIP_BUDGET_KB ?? "40");

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
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

if (mainCss && mainCss.gzipBytes > cssBudgetKb * 1024) {
  console.error(
    `Main CSS gzip ${formatKb(mainCss.gzipBytes)} exceeds budget ${cssBudgetKb.toFixed(1)}KB.`,
  );
  process.exit(1);
}
