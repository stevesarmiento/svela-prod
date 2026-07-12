#!/usr/bin/env bun
/**
 * One-off migration script: rewrites hex / rgb(a) / hsl(a) color literals to
 * `oklch()` in .css/.ts/.tsx files. Every emitted value round-trips exactly
 * back to the source 8-bit sRGB triplet (precision bumps automatically).
 *
 * Usage:
 *   bun scripts/convert-colors-to-oklch.ts <file-or-dir> [...more] [--write]
 *
 * Default is a dry run printing `old -> new` per file; pass --write to apply.
 *
 * Skip rules:
 *  - lines containing data:image (SVG data-URIs stay rgba; oklch needs URL-encoding)
 *  - lines containing colorPrimary / brandColor / themeColor / recharts (documented exceptions)
 *  - matches preceded by `url(` (fragment ids like url(#gradient))
 *  - hsl(var(...)) never matches (regex requires a leading digit)
 *  - named colors / transparent / currentColor untouched
 *
 * Inside Tailwind arbitrary values (bg-[#111], shadow-[..._rgba(...)]) the
 * output uses underscores instead of spaces.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { srgbToOklchString } from "../packages/ui/src/lib/oklch";

const args = process.argv.slice(2);
const write = args.includes("--write");
const targets = args.filter((a) => !a.startsWith("--"));
if (targets.length === 0) {
  console.error("usage: bun scripts/convert-colors-to-oklch.ts <file-or-dir> [...] [--write]");
  process.exit(1);
}

const EXT_RE = /\.(css|ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".turbo", ".git"]);
const SKIP_LINE = /(data:image|colorPrimary|brandColor|themeColor|recharts)/;

// Longest-first hex, then rgb(a), then hsl(a) with numeric first arg.
const COLOR_RE =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)|hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/g;

function parseAlpha(raw: string | undefined): number {
  if (raw == null) return 1;
  return raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
}

function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = [...h].map((ch) => ch + ch).join("");
  }
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

/** True when the match sits inside a Tailwind arbitrary value (`[...]` token). */
function inArbitraryValue(line: string, matchStart: number): boolean {
  let i = matchStart - 1;
  while (i >= 0) {
    const ch = line[i] as string;
    if (ch === " " || ch === "\t" || ch === '"' || ch === "'" || ch === "`") break;
    if (ch === "]") return false; // a bracket already closed before us
    if (ch === "[") return true;
    i--;
  }
  return false;
}

function convertLine(line: string, changes: string[]): string {
  if (SKIP_LINE.test(line)) return line;
  return line.replace(COLOR_RE, (match, r, g, b, a, hh, hs, hl, ha, offset: number) => {
    // Skip url(#gradient) style fragment references.
    const before = line.slice(Math.max(0, offset - 4), offset);
    if (match.startsWith("#") && before.endsWith("url(")) return match;

    let rgb: [number, number, number];
    let alpha = 1;
    if (match.startsWith("#")) {
      const [hr, hg, hb, hAlpha] = hexToRgba(match);
      rgb = [hr, hg, hb];
      alpha = hAlpha;
    } else if (match.toLowerCase().startsWith("rgb")) {
      rgb = [Number(r), Number(g), Number(b)];
      alpha = parseAlpha(a);
    } else {
      rgb = hslToRgb(Number(hh), Number(hs), Number(hl));
      alpha = parseAlpha(ha);
    }
    alpha = Math.round(alpha * 10000) / 10000;

    let out = srgbToOklchString(rgb[0], rgb[1], rgb[2], alpha);
    if (inArbitraryValue(line, offset)) out = out.replace(/ /g, "_");
    changes.push(`  ${match} -> ${out}`);
    return out;
  });
}

function processFile(path: string): void {
  const src = readFileSync(path, "utf8");
  const changes: string[] = [];
  const out = src
    .split("\n")
    .map((line) => convertLine(line, changes))
    .join("\n");
  if (changes.length === 0) return;
  console.log(`\n${path} (${changes.length} conversions)`);
  for (const c of changes) console.log(c);
  if (write) writeFileSync(path, out);
}

function walk(path: string): void {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(join(path, entry));
    }
  } else if (EXT_RE.test(path) && !path.endsWith("oklch.ts") && !/\.test\.tsx?$/.test(path)) {
    processFile(path);
  }
}

for (const t of targets) walk(resolve(t));
console.log(write ? "\nApplied." : "\nDry run — pass --write to apply.");
