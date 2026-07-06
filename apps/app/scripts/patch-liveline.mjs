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

  // 5) Allow consumers to disable the live endpoint dot (sparkline mode).
  // Liveline doesn't expose this in 0.0.7; we add `dot?: boolean` defaulting true.
  // This keeps interactive charts (scrub) unchanged while letting tiny inline charts be line-only.
  const dotPropOld = "  pulse = true,"
  const dotPropNew = ["  pulse = true,", "  dot = true,"].join("\n")

  if (next.includes(dotPropNew)) {
    // already patched
  } else if (next.includes(dotPropOld)) {
    next = next.replace(dotPropOld, dotPropNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Dot-prop pattern not found: ${filePath}`)
    ok = false
  }

  const engineDotOld = "    showPulse: pulse,"
  const engineDotNew = ["    showPulse: pulse,", "    showDot: dot,"].join("\n")

  if (next.includes(engineDotNew)) {
    // already patched
  } else if (next.includes(engineDotOld)) {
    next = next.replace(engineDotOld, engineDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Engine dot config pattern not found: ${filePath}`)
    ok = false
  }

  const cfgDotOld = "        showPulse: cfg.showPulse,"
  const cfgDotNew = ["        showPulse: cfg.showPulse,", "        showDot: cfg.showDot,"].join("\n")

  if (next.includes(cfgDotNew)) {
    // already patched
  } else if (next.includes(cfgDotOld)) {
    // There are multiple frames (single + multi), patch all.
    next = next.replaceAll(cfgDotOld, cfgDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Cfg dot pattern not found: ${filePath}`)
    ok = false
  }

  const drawDotOld =
    "      drawDot(ctx, lastPt[0], lastPt[1], palette, showPulse, dotScrub, opts.now_ms);"
  const drawDotNew =
    "      if (opts.showDot !== false) drawDot(ctx, lastPt[0], lastPt[1], palette, showPulse, dotScrub, opts.now_ms);"

  if (next.includes(drawDotNew)) {
    // already patched
  } else if (next.includes(drawDotOld)) {
    next = next.replaceAll(drawDotOld, drawDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Live-dot draw pattern not found: ${filePath}`)
    ok = false
  }

  const drawCandleDotOld =
    "      drawDot(ctx, lastPt[0], lastPt[1], palette, showPulse, opts.scrubAmount, opts.now_ms);"
  const drawCandleDotNew =
    "      if (opts.showDot !== false) drawDot(ctx, lastPt[0], lastPt[1], palette, showPulse, opts.scrubAmount, opts.now_ms);"

  if (next.includes(drawCandleDotNew)) {
    // already patched
  } else if (next.includes(drawCandleDotOld)) {
    next = next.replaceAll(drawCandleDotOld, drawCandleDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Candle live-dot draw pattern not found: ${filePath}`)
    ok = false
  }

  const drawMultiDotOld =
    "        drawMultiDot(ctx, lastPt[0], lastPt[1], entry.palette.line, true, opts.now_ms, 3);"
  const drawMultiDotNew =
    "        if (opts.showDot !== false) drawMultiDot(ctx, lastPt[0], lastPt[1], entry.palette.line, true, opts.now_ms, 3);"

  if (next.includes(drawMultiDotNew)) {
    // already patched
  } else if (next.includes(drawMultiDotOld)) {
    next = next.replaceAll(drawMultiDotOld, drawMultiDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Multi live-dot draw pattern not found: ${filePath}`)
    ok = false
  }

  const drawSimpleDotOld =
    "        drawSimpleDot(ctx, lastPt[0], lastPt[1], entry.palette.line, 3);"
  const drawSimpleDotNew =
    "        if (opts.showDot !== false) drawSimpleDot(ctx, lastPt[0], lastPt[1], entry.palette.line, 3);"

  if (next.includes(drawSimpleDotNew)) {
    // already patched
  } else if (next.includes(drawSimpleDotOld)) {
    next = next.replaceAll(drawSimpleDotOld, drawSimpleDotNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Simple live-dot draw pattern not found: ${filePath}`)
    ok = false
  }

  // 6) Line-mode-style full crosshair for single-series charts (horizontal + vertical).
  const crosshairHorizontalOld = [
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.restore();",
    "  const dotRadius = 4 * Math.min(scrubOpacity * 3, 1);",
    "  if (dotRadius > 0.5) {",
    "    ctx.globalAlpha = 1;",
    "    ctx.beginPath();",
    "    ctx.arc(hoverX, y, dotRadius, 0, Math.PI * 2);",
  ].join("\n")

  const crosshairHorizontalNew = [
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.globalAlpha = scrubOpacity * 0.3;",
    "  ctx.beginPath();",
    "  ctx.moveTo(pad.left, y);",
    "  ctx.lineTo(layout.w - pad.right, y);",
    "  ctx.stroke();",
    "  ctx.restore();",
    "  const dotRadius = 4 * Math.min(scrubOpacity * 3, 1);",
    "  if (dotRadius > 0.5) {",
    "    ctx.globalAlpha = 1;",
    "    ctx.beginPath();",
    "    ctx.arc(hoverX, y, dotRadius, 0, Math.PI * 2);",
  ].join("\n")

  // Idempotency: the follow-up "crosshair stroke restyle" patch rewrites
  // this block again (0.3 → 0.68 alpha, dashed strokes), so on an
  // already-fully-patched dist neither this patch's old nor new form
  // exists anymore. Detect that final form via its unique 0.68 alpha —
  // do NOT match generic strings like `moveTo(pad.left, y)`, which also
  // appear in unrelated gridline code in the pristine dist and would
  // wrongly skip this patch on a fresh install (breaking the follow-up
  // patch that depends on this one's output).
  const hasFinalRestyledCrosshair = next.includes(
    "ctx.globalAlpha = scrubOpacity * 0.68;",
  )

  if (next.includes(crosshairHorizontalNew) || hasFinalRestyledCrosshair) {
    // already patched (directly, or through the follow-up restyle)
  } else if (next.includes(crosshairHorizontalOld)) {
    next = next.replace(crosshairHorizontalOld, crosshairHorizontalNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Crosshair horizontal pattern not found: ${filePath}`)
    ok = false
  }

  // 7) Crosshair was fully hidden within CROSSHAIR_FADE_MIN_PX of the live point; keep it visible while scrubbing.
  const scrubOpacityNearLiveOld = "const scrubOpacity = distToLive < CROSSHAIR_FADE_MIN_PX ? 0 :"
  const scrubOpacityNearLiveNew =
    "const scrubOpacity = distToLive < CROSSHAIR_FADE_MIN_PX ? opts.scrubAmount :"

  if (next.includes(scrubOpacityNearLiveNew)) {
    // already patched
  } else if (next.includes(scrubOpacityNearLiveOld)) {
    next = next.replaceAll(scrubOpacityNearLiveOld, scrubOpacityNearLiveNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Scrub-opacity-near-live pattern not found: ${filePath}`)
    ok = false
  }

  // 8) Crosshair: dashed strokes + higher contrast (vertical + horizontal in drawCrosshair).
  const crosshairStrokesSolidOld = [
    "  ctx.save();",
    "  ctx.globalAlpha = scrubOpacity * 0.5;",
    "  ctx.strokeStyle = palette.crosshairLine;",
    "  ctx.lineWidth = 1;",
    "  ctx.beginPath();",
    "  ctx.moveTo(hoverX, pad.top);",
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.globalAlpha = scrubOpacity * 0.3;",
    "  ctx.beginPath();",
    "  ctx.moveTo(pad.left, y);",
    "  ctx.lineTo(layout.w - pad.right, y);",
    "  ctx.stroke();",
    "  ctx.restore();",
  ].join("\n")

  const crosshairStrokesDashedNew = [
    "  ctx.save();",
    "  ctx.globalAlpha = scrubOpacity * 0.82;",
    "  ctx.strokeStyle = palette.crosshairLine;",
    "  ctx.lineWidth = 1.5;",
    "  ctx.setLineDash([5, 5]);",
    "  ctx.beginPath();",
    "  ctx.moveTo(hoverX, pad.top);",
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.globalAlpha = scrubOpacity * 0.68;",
    "  ctx.beginPath();",
    "  ctx.moveTo(pad.left, y);",
    "  ctx.lineTo(layout.w - pad.right, y);",
    "  ctx.stroke();",
    "  ctx.setLineDash([]);",
    "  ctx.restore();",
  ].join("\n")

  if (next.includes(crosshairStrokesDashedNew)) {
    // already patched
  } else if (next.includes(crosshairStrokesSolidOld)) {
    next = next.replace(crosshairStrokesSolidOld, crosshairStrokesDashedNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Crosshair stroke restyle pattern not found: ${filePath}`)
    ok = false
  }

  // 8b) Multi-series crosshair vertical line: match dashed style.
  const multiCrosshairVerticalSolidOld = [
    "  ctx.save();",
    "  ctx.globalAlpha = scrubOpacity * 0.5;",
    "  ctx.strokeStyle = palette.crosshairLine;",
    "  ctx.lineWidth = 1;",
    "  ctx.beginPath();",
    "  ctx.moveTo(hoverX, pad.top);",
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.restore();",
    "  const dotRadius = 4 * Math.min(scrubOpacity * 3, 1);",
    "  if (dotRadius > 0.5) {",
    "    ctx.globalAlpha = 1;",
    "    for (const entry of entries) {",
  ].join("\n")

  const multiCrosshairVerticalDashedNew = [
    "  ctx.save();",
    "  ctx.globalAlpha = scrubOpacity * 0.82;",
    "  ctx.strokeStyle = palette.crosshairLine;",
    "  ctx.lineWidth = 1.5;",
    "  ctx.setLineDash([5, 5]);",
    "  ctx.beginPath();",
    "  ctx.moveTo(hoverX, pad.top);",
    "  ctx.lineTo(hoverX, h - pad.bottom);",
    "  ctx.stroke();",
    "  ctx.setLineDash([]);",
    "  ctx.restore();",
    "  const dotRadius = 4 * Math.min(scrubOpacity * 3, 1);",
    "  if (dotRadius > 0.5) {",
    "    ctx.globalAlpha = 1;",
    "    for (const entry of entries) {",
  ].join("\n")

  if (next.includes(multiCrosshairVerticalDashedNew)) {
    // already patched
  } else if (next.includes(multiCrosshairVerticalSolidOld)) {
    next = next.replace(multiCrosshairVerticalSolidOld, multiCrosshairVerticalDashedNew)
    didChange = true
  } else {
    console.warn(`[patch-liveline] Multi crosshair stroke pattern not found: ${filePath}`)
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
    // Fail the install loudly: a liveline upgrade that shifts these patterns
    // would otherwise silently un-patch the charts (dashed price line and
    // time axis reappear) with no signal until someone eyeballs the UI.
    console.error(
      `[patch-liveline] Pattern mismatch (changed ${changedCount}/${results.length}). ` +
        "liveline's dist output changed — update scripts/patch-liveline.mjs or pin the previous version.",
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("[patch-liveline] Failed to patch liveline:", error)
  process.exit(1)
})

