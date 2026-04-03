export function promptLooksLikeConstraints(text: string): boolean {
  const s = text.toLowerCase()
  if (/[<>]=?/.test(s)) return true
  if (/\b(under|below|over|above|between|from|to|at\s+least|at\s+most|>=|<=)\b/.test(s)) return true
  return false
}

