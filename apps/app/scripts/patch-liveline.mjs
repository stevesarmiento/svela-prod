import { createRequire } from "node:module"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

async function patchDistFile(filePath) {
  let text
  try {
    text = await readFile(filePath, "utf8")
  } catch {
    console.warn(`[patch-liveline] Missing file, skipping: ${filePath}`)
    return { ok: false, changed: false }
  }

  let next = text
  let didChange = false
  let ok = true

  // 1) Liveline draws a horizontal dashed "current price" line by default in `drawLine()`.
  // The public API doesn't expose a prop to disable it, so we patch the default.
  if (next.includes("skipDashLine = false")) {
    next = next.replace("skipDashLine = false", "skipDashLine = true")
    didChange = didChange || next !== text
  } else if (!next.includes("skipDashLine = true")) {
    console.warn(`[patch-liveline] Pattern not found (package changed?): ${filePath}`)
    ok = false
  }

  // 1b) Liveline always draws a time-axis baseline even if labels are empty. For tiny inline charts
  // we pass `formatTime={() => ""}`; hide the axis entirely in that case.
  const timeAxisOld = [
    "  for (const key of targets) {",
    "    const text = formatTime(key / 100);",
    "    const existing = state.labels.get(key);",
    "    if (!existing) {",
    "      state.labels.set(key, { alpha: 0, text });",
    "    } else {",
    "      existing.text = text;",
    "    }",
    "  }",
    "  for (const [key, label] of state.labels) {",
  ].join("\n")

  const timeAxisNew = [
    "  for (const key of targets) {",
    "    const text = formatTime(key / 100);",
    "    if (!text) {",
    "      targets.delete(key);",
    "      state.labels.delete(key);",
    "      continue;",
    "    }",
    "    const existing = state.labels.get(key);",
    "    if (!existing) {",
    "      state.labels.set(key, { alpha: 0, text });",
    "    } else {",
    "      existing.text = text;",
    "    }",
    "  }",
    "  if (targets.size === 0) {",
    "    state.labels.clear();",
    "    return;",
    "  }",
    "  for (const [key, label] of state.labels) {",
  ].join("\n")

  if (next.includes(timeAxisNew)) {
    // already patched
  } else if (next.includes(timeAxisOld)) {
    next = next.replace(timeAxisOld, timeAxisNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Time-axis pattern not found: ${filePath}`)
    ok = false
  }

  // 2) Make scrub dots follow the drawn spline curve by using the same monotone cubic
  // interpolation as `drawSpline()` instead of linear `interpolateAtTime()`.
  const splineFnSignature = "function interpolateSplineAtTime(points, time) {"
  const linearFnSignature = "function interpolateAtTime(points, time) {"

  if (!next.includes(splineFnSignature)) {
    if (!next.includes(linearFnSignature)) {
      console.warn(`[patch-liveline] interpolateAtTime signature not found: ${filePath}`)
      ok = false
    } else {
      const splineFn = [
        splineFnSignature,
        "  if (points.length === 0) return null;",
        "  if (points.length === 1) return points[0].value;",
        "  if (time <= points[0].time) return points[0].value;",
        "  if (time >= points[points.length - 1].time) return points[points.length - 1].value;",
        "  const n = points.length;",
        "  if (n === 2) return interpolateAtTime(points, time);",
        "  const h = new Array(n - 1);",
        "  const delta = new Array(n - 1);",
        "  for (let i = 0; i < n - 1; i++) {",
        "    const dx = points[i + 1].time - points[i].time;",
        "    h[i] = dx;",
        "    delta[i] = dx === 0 ? 0 : (points[i + 1].value - points[i].value) / dx;",
        "  }",
        "  const m = new Array(n);",
        "  m[0] = delta[0];",
        "  m[n - 1] = delta[n - 2];",
        "  for (let i = 1; i < n - 1; i++) {",
        "    if (delta[i - 1] * delta[i] <= 0) m[i] = 0;",
        "    else m[i] = (delta[i - 1] + delta[i]) / 2;",
        "  }",
        "  for (let i = 0; i < n - 1; i++) {",
        "    if (delta[i] === 0) {",
        "      m[i] = 0;",
        "      m[i + 1] = 0;",
        "    } else {",
        "      const alpha = m[i] / delta[i];",
        "      const beta = m[i + 1] / delta[i];",
        "      const s2 = alpha * alpha + beta * beta;",
        "      if (s2 > 9) {",
        "        const s = 3 / Math.sqrt(s2);",
        "        m[i] = s * alpha * delta[i];",
        "        m[i + 1] = s * beta * delta[i];",
        "      }",
        "    }",
        "  }",
        "  let lo = 0;",
        "  let hi = n - 1;",
        "  while (hi - lo > 1) {",
        "    const mid = lo + hi >> 1;",
        "    if (points[mid].time <= time) lo = mid;",
        "    else hi = mid;",
        "  }",
        "  const p0 = points[lo];",
        "  const p1 = points[hi];",
        "  const dx = p1.time - p0.time;",
        "  if (dx === 0) return p0.value;",
        "  const t = (time - p0.time) / dx;",
        "  const t2 = t * t;",
        "  const t3 = t2 * t;",
        "  const h00 = 2 * t3 - 3 * t2 + 1;",
        "  const h10 = t3 - 2 * t2 + t;",
        "  const h01 = -2 * t3 + 3 * t2;",
        "  const h11 = t3 - t2;",
        "  return h00 * p0.value + h10 * dx * m[lo] + h01 * p1.value + h11 * dx * m[hi];",
        "}",
        "",
      ].join("\n")

      const inserted = next.replace(linearFnSignature, `${splineFn}${linearFnSignature}`)
      if (inserted === next) {
        console.warn(`[patch-liveline] Failed to insert spline interpolator: ${filePath}`)
        ok = false
      } else {
        next = inserted
        didChange = true
      }
    }
  }

  // Replace hover interpolation in both single-series and multi-series scrub paths.
  const singleOld = "const v = interpolateAtTime(visible, t);"
  const singleNew = "const v = interpolateSplineAtTime(visible, t);"
  const multiOld = "const v = interpolateAtTime(entry.visible, t);"
  const multiNew = "const v = interpolateSplineAtTime(entry.visible, t);"

  if (next.includes(singleNew)) {
    // already patched
  } else if (next.includes(singleOld)) {
    next = next.replace(singleOld, singleNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Hover pattern not found (single-series): ${filePath}`)
    ok = false
  }

  if (next.includes(multiNew)) {
    // already patched
  } else if (next.includes(multiOld)) {
    next = next.replace(multiOld, multiNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Hover pattern not found (multi-series): ${filePath}`)
    ok = false
  }

  // 3) Liveline dims the chart to the right of the scrub cursor by reducing globalAlpha.
  // This looks like a persistent opacity bug when the cursor happens to sit over the chart.
  const scrubDimOld = "ctx.globalAlpha = incomingAlpha * (1 - scrubAmount * 0.6);"
  const scrubDimNew = "ctx.globalAlpha = incomingAlpha;"

  if (next.includes(scrubDimNew)) {
    // already patched
  } else if (next.includes(scrubDimOld)) {
    next = next.replaceAll(scrubDimOld, scrubDimNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Scrub-dim pattern not found: ${filePath}`)
    ok = false
  }

  // 4) Liveline renders built-in multi-series toggle chips when there are 2+ series.
  // We already have a separate legend, so remove this extra UI.
  const seriesToggleOld =
    "const showSeriesToggle = (lastSeriesPropRef.current?.length ?? 0) > 1;"
  const seriesToggleNew = "const showSeriesToggle = false;"

  if (next.includes(seriesToggleNew)) {
    // already patched
  } else if (next.includes(seriesToggleOld)) {
    next = next.replace(seriesToggleOld, seriesToggleNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Series-toggle pattern not found: ${filePath}`)
    ok = false
  }

  if (!didChange) return { ok, changed: false }
  await writeFile(filePath, next, "utf8")
  console.log(`[patch-liveline] Patched: ${filePath}`)
  return { ok, changed: true }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = dirname(dirname(dirname(here)))

  // Resolve `liveline` from the app workspace (it's not a root dependency).
  const requireFromApp = createRequire(join(repoRoot, "apps", "app", "package.json"))

  let pkgJsonPath
  try {
    pkgJsonPath = requireFromApp.resolve("liveline/package.json")
  } catch {
    console.log("[patch-liveline] liveline not installed, skipping")
    return
  }

  const pkgDir = dirname(pkgJsonPath)
  const distIndexJs = join(pkgDir, "dist", "index.js")
  const distIndexCjs = join(pkgDir, "dist", "index.cjs")

  const results = await Promise.all([
    patchDistFile(distIndexJs),
    patchDistFile(distIndexCjs),
  ])
  const okCount = results.filter((r) => r.ok).length
  const changedCount = results.filter((r) => r.changed).length

  if (okCount === results.length) {
    console.log(`[patch-liveline] Done (changed ${changedCount}/${results.length})`)
  } else {
    console.warn(
      `[patch-liveline] Done with issues (changed ${changedCount}/${results.length})`,
    )
  }
}

main().catch((error) => {
  // Best-effort: never block installs/builds on cosmetic chart tweaks.
  console.warn("[patch-liveline] Failed to patch liveline:", error)
})

