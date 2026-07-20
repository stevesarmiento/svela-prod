/**
 * Golden-prompt eval harness for the smart-screener interpreter.
 *
 * Replays SMART_SCREENER_EVAL_CASES through the internal debug route
 * (interpretOnly + cache bypass, so we measure the MODEL, not Redis) against
 * a RUNNING dev server, and scores the parsed DSLs against expectations.
 *
 * Usage:
 *   bun run eval:smart-screener                       # all cases
 *   bun run eval:smart-screener -- --tag units        # one tag
 *   bun run eval:smart-screener -- --id units-small-percent
 *   EVAL_BASE_URL=http://localhost:3001 bun run eval:smart-screener
 *
 * Requires SMART_SCREENER_DEV_TOKEN in the environment (same value the dev
 * server was started with). NOT wired into PR CI — spends Gemini quota.
 */

import {
  type ExpectedFilter,
  SMART_SCREENER_EVAL_CASES,
  type SmartScreenerEvalCase,
} from "../lib/smart-screener/screening-evals";

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const DEV_TOKEN = process.env.SMART_SCREENER_DEV_TOKEN;

interface ParsedDsl {
  filters: Array<{ metricId: string; op: string; value: number }>;
  sort: { metricId: string; order: string } | null;
  limit: number;
  universe: string;
  takerContext: { range: string; exchange: string | null } | null;
}

interface ScreenResponse {
  ok: boolean;
  confidence: number;
  dsl: ParsedDsl;
  error?: { code: string; message: string };
}

function filterMatches(
  expected: ExpectedFilter,
  actual: ParsedDsl["filters"][number],
): boolean {
  if (expected.metricId !== actual.metricId) return false;
  const acceptedOps = expected.opAnyOf ?? [expected.op];
  if (!acceptedOps.includes(actual.op as (typeof acceptedOps)[number]))
    return false;
  const tolerance = expected.tolerancePct ?? 1; // default 1% wiggle
  if (expected.value === 0) return actual.value === 0;
  const deviationPct =
    Math.abs((actual.value - expected.value) / expected.value) * 100;
  return deviationPct <= tolerance;
}

function scoreCase(
  c: SmartScreenerEvalCase,
  res: ScreenResponse,
): Array<string> {
  // Alternative encodings: pass when ANY variant scores clean.
  if (c.expectAnyOf && c.expectAnyOf.length > 0) {
    const variantFailures = c.expectAnyOf.map((exp) =>
      scoreExpectation(exp, res),
    );
    if (variantFailures.some((f) => f.length === 0)) return [];
    return variantFailures.map((f, i) => `variant ${i + 1}: ${f.join("; ")}`);
  }
  return scoreExpectation(c.expect, res);
}

function scoreExpectation(
  exp: SmartScreenerEvalCase["expect"],
  res: ScreenResponse,
): Array<string> {
  const failures: Array<string> = [];

  if (exp.maxConfidence !== undefined) {
    // Ambiguous prompts must NOT confidently apply: either a low-confidence
    // bail (ok:false + low_confidence) or a low confidence score.
    const bailed = !res.ok && res.error?.code === "low_confidence";
    if (!bailed && res.confidence > exp.maxConfidence) {
      failures.push(
        `expected confidence <= ${exp.maxConfidence} or a low-confidence bail, got ok=${res.ok} confidence=${res.confidence}`,
      );
    }
    return failures; // ambiguous cases assert nothing else
  }

  if (!res.ok) {
    failures.push(
      `expected ok, got error=${res.error?.code}: ${res.error?.message}`,
    );
    return failures;
  }

  if (exp.minConfidence !== undefined && res.confidence < exp.minConfidence) {
    failures.push(`confidence ${res.confidence} < min ${exp.minConfidence}`);
  }

  for (const expected of exp.filters ?? []) {
    const found = res.dsl.filters.some((actual) =>
      filterMatches(expected, actual),
    );
    if (!found) {
      failures.push(
        `missing filter ${expected.metricId} ${expected.op} ${expected.value} (got: ${JSON.stringify(res.dsl.filters)})`,
      );
    }
  }

  if (
    exp.filtersExact &&
    (exp.filters?.length ?? 0) !== res.dsl.filters.length
  ) {
    failures.push(
      `expected exactly ${exp.filters?.length ?? 0} filters, got ${res.dsl.filters.length}`,
    );
  }

  if (exp.sort !== undefined) {
    const actual = res.dsl.sort;
    if (exp.sort === null) {
      if (actual !== null)
        failures.push(`expected sort null, got ${JSON.stringify(actual)}`);
    } else if (
      !actual ||
      actual.metricId !== exp.sort.metricId ||
      actual.order !== exp.sort.order
    ) {
      failures.push(
        `expected sort ${JSON.stringify(exp.sort)}, got ${JSON.stringify(actual)}`,
      );
    }
  }

  if (exp.limit !== undefined && res.dsl.limit !== exp.limit) {
    failures.push(`expected limit ${exp.limit}, got ${res.dsl.limit}`);
  }

  if (exp.universe !== undefined && res.dsl.universe !== exp.universe) {
    failures.push(`expected universe ${exp.universe}, got ${res.dsl.universe}`);
  }

  if (exp.takerContext !== undefined) {
    const actual = res.dsl.takerContext;
    if (!actual) {
      failures.push(
        `expected takerContext ${JSON.stringify(exp.takerContext)}, got null`,
      );
    } else {
      if (
        exp.takerContext.range !== undefined &&
        actual.range !== exp.takerContext.range
      ) {
        failures.push(
          `expected taker range ${exp.takerContext.range}, got ${actual.range}`,
        );
      }
      if (
        exp.takerContext.exchange !== undefined &&
        (actual.exchange ?? "").toLowerCase() !==
          (exp.takerContext.exchange ?? "").toLowerCase()
      ) {
        failures.push(
          `expected taker exchange ${exp.takerContext.exchange}, got ${actual.exchange}`,
        );
      }
    }
  }

  return failures;
}

async function runCase(
  c: SmartScreenerEvalCase,
): Promise<{ failures: Array<string>; latencyMs: number }> {
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/api/internal/smart-screener/screen`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-smart-screener-dev-token": DEV_TOKEN ?? "",
    },
    body: JSON.stringify({
      text: c.prompt,
      interpretOnly: true,
      noCache: true,
    }),
  });
  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      failures: [`HTTP ${res.status}: ${body.slice(0, 200)}`],
      latencyMs,
    };
  }

  const json = (await res.json()) as ScreenResponse;
  return { failures: scoreCase(c, json), latencyMs };
}

function parseArgs(): { tag: string | null; id: string | null } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] ?? null : null;
  };
  return { tag: get("--tag"), id: get("--id") };
}

async function main(): Promise<void> {
  if (!DEV_TOKEN) {
    console.error(
      "SMART_SCREENER_DEV_TOKEN is not set — required to call the internal route.",
    );
    process.exit(1);
  }

  const { tag, id } = parseArgs();
  const cases = SMART_SCREENER_EVAL_CASES.filter((c) => {
    if (id) return c.id === id;
    if (tag) return c.tags.includes(tag as (typeof c.tags)[number]);
    return true;
  });

  if (cases.length === 0) {
    console.error("No eval cases matched the filter.");
    process.exit(1);
  }

  console.log(`Running ${cases.length} eval case(s) against ${BASE_URL}\n`);

  const byTag: Record<string, { pass: number; total: number }> = {};
  let passed = 0;
  const failedCases: Array<{
    id: string;
    prompt: string;
    failures: Array<string>;
  }> = [];

  for (const c of cases) {
    const { failures, latencyMs } = await runCase(c);
    const ok = failures.length === 0;
    if (ok) passed += 1;
    else failedCases.push({ id: c.id, prompt: c.prompt, failures });

    for (const t of c.tags) {
      byTag[t] = byTag[t] ?? { pass: 0, total: 0 };
      byTag[t].total += 1;
      if (ok) byTag[t].pass += 1;
    }

    console.log(
      `${ok ? "✅" : "❌"} ${c.id.padEnd(28)} ${String(latencyMs).padStart(5)}ms  ${c.prompt}`,
    );
    for (const f of failures) console.log(`     ↳ ${f}`);
  }

  console.log(
    `\n— Pass rate: ${passed}/${cases.length} (${Math.round((passed / cases.length) * 100)}%)`,
  );
  console.log("— By tag:");
  for (const [t, s] of Object.entries(byTag).sort()) {
    console.log(`   ${t.padEnd(10)} ${s.pass}/${s.total}`);
  }

  if (failedCases.length > 0) {
    console.log("\n— Failing case details (JSON):");
    console.log(JSON.stringify(failedCases, null, 2));
    process.exit(1);
  }
}

void main();
