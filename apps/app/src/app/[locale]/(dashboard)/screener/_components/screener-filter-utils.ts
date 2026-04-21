import { SCREENER_RANGE_DEFAULTS } from "./screener-filter-constants"

export type ScreenerNaturalLanguageAction =
  | { kind: "change"; value: "all" | "positive" | "negative" }
  | { kind: "sortBy"; value: "name" | "price" | "change" | "marketCap" | "volume" }
  | { kind: "sortOrder"; value: "asc" | "desc" }
  | { kind: "priceRange"; value: [number, number] }
  | { kind: "marketCapRange"; value: [number, number] }
  | { kind: "volumeRange"; value: [number, number] }

function normalizeFilterQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ")
}

function splitFilterClauses(input: string): Array<string> {
  return input
    .split(/[,;]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseCompactNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replaceAll("_", "")

  if (!cleaned) return null

  const match = cleaned.match(/^([0-9]*\.?[0-9]+)\s*(k|m|b|t|bn)?$/)
  if (!match) return null

  const n = Number(match[1])
  if (!Number.isFinite(n)) return null

  const suffix = match[2] ?? ""
  const mult =
    suffix === "k"
      ? 1e3
      : suffix === "m"
        ? 1e6
        : suffix === "b" || suffix === "bn"
          ? 1e9
          : suffix === "t"
            ? 1e12
            : 1

  const value = n * mult
  return Number.isFinite(value) ? value : null
}

type RangeField = "price" | "marketCap" | "volume"

function parseRangeClause(args: {
  clause: string
  field: RangeField
  max: number
}): [number, number] | null {
  const fieldRe =
    args.field === "price"
      ? /\bprice\b/
      : args.field === "marketCap"
        ? /\bmcap\b|\bmarket\s*cap\b|\bmarketcap\b/
        : /\bvol\b|\bvolume\b/

  if (!fieldRe.test(args.clause)) return null

  const between = args.clause.match(
    new RegExp(
      `${fieldRe.source}\\s*(?:between|from)\\s*([^\\s]+)\\s*(?:and|to|-)\\s*([^\\s]+)`,
    ),
  )
  if (between) {
    const a = parseCompactNumber(between[1] ?? "")
    const b = parseCompactNumber(between[2] ?? "")
    if (a === null || b === null) return null
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return [Math.max(0, lo), Math.min(args.max, hi)]
  }

  const cmp = args.clause.match(
    new RegExp(`${fieldRe.source}\\s*(<=|>=|<|>|under|below|over|above)\\s*([^\\s]+)`),
  )
  if (!cmp) return null

  const op = (cmp[1] ?? "").toLowerCase()
  const v = parseCompactNumber(cmp[2] ?? "")
  if (v === null) return null

  if (op === "<" || op === "<=" || op === "under" || op === "below") {
    return [0, Math.min(args.max, v)]
  }
  if (op === ">" || op === ">=" || op === "over" || op === "above") {
    return [Math.max(0, v), args.max]
  }

  return null
}

export function parseScreenerNaturalLanguageActions(
  rawInput: string,
): Array<ScreenerNaturalLanguageAction> {
  const clauses = splitFilterClauses(rawInput)
  const actions: Array<ScreenerNaturalLanguageAction> = []

  for (const clauseRaw of clauses) {
    const clause = normalizeFilterQuery(clauseRaw)
    if (!clause) continue

    if (["positive", "pos", "up", "+", "green"].includes(clause)) {
      actions.push({ kind: "change", value: "positive" })
      continue
    }
    if (["negative", "neg", "down", "-", "red"].includes(clause)) {
      actions.push({ kind: "change", value: "negative" })
      continue
    }
    if (["all", "any"].includes(clause)) {
      actions.push({ kind: "change", value: "all" })
      continue
    }

    const clauseForSort = clause.replace(/^sort(\s+by)?\s+/, "")

    const sortOrderValue =
      clauseForSort.includes("descending") ||
      clauseForSort.includes("desc") ||
      clauseForSort.includes("decending")
        ? ("desc" as const)
        : clauseForSort.includes("ascending") || clauseForSort.includes("asc")
          ? ("asc" as const)
          : null

    const sortByValue = /\bmarket\s*cap\b|\bmarketcap\b|\bmcap\b/.test(clauseForSort)
      ? ("marketCap" as const)
      : /\bvolume\b|\bvol\b/.test(clauseForSort)
        ? ("volume" as const)
        : /\bprice\b/.test(clauseForSort)
          ? ("price" as const)
          : /\bchange\b|\b24h\b/.test(clauseForSort)
            ? ("change" as const)
            : /\bname\b/.test(clauseForSort)
              ? ("name" as const)
              : null

    if (sortByValue || sortOrderValue) {
      if (sortByValue) actions.push({ kind: "sortBy", value: sortByValue })
      if (sortOrderValue) actions.push({ kind: "sortOrder", value: sortOrderValue })
      continue
    }

    if (/\btop\s+gainers\b|\bgainers\b/.test(clause)) {
      actions.push({ kind: "change", value: "positive" })
      actions.push({ kind: "sortBy", value: "change" })
      actions.push({ kind: "sortOrder", value: "desc" })
      continue
    }

    if (/\btop\s+losers\b|\blosers\b/.test(clause)) {
      actions.push({ kind: "change", value: "negative" })
      actions.push({ kind: "sortBy", value: "change" })
      actions.push({ kind: "sortOrder", value: "asc" })
      continue
    }

    const marketCapRange = parseRangeClause({
      clause,
      field: "marketCap",
      max: SCREENER_RANGE_DEFAULTS.marketCapMax,
    })
    if (marketCapRange) {
      actions.push({ kind: "marketCapRange", value: marketCapRange })
      continue
    }

    const volumeRange = parseRangeClause({
      clause,
      field: "volume",
      max: SCREENER_RANGE_DEFAULTS.volumeMax,
    })
    if (volumeRange) {
      actions.push({ kind: "volumeRange", value: volumeRange })
      continue
    }

    const priceRange = parseRangeClause({
      clause,
      field: "price",
      max: SCREENER_RANGE_DEFAULTS.priceMax,
    })
    if (priceRange) {
      actions.push({ kind: "priceRange", value: priceRange })
    }
  }

  return actions
}

export function doesScreenerQueryLookLikeFilterIntent(raw: string): boolean {
  const s = normalizeFilterQuery(raw)
  if (!s) return false
  if (s.length < 6) return false
  if (
    /\b(sort|top|gainers|losers|market|mcap|volume|price|change|between|under|over|above|below|taker|buy|sell|ratio|net)\b/.test(
      s,
    )
  ) {
    return true
  }
  if (/[<>]=?/.test(s)) return true
  return s.split(" ").length >= 3
}
