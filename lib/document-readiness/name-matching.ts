import type { NameMatchLabel } from './types'

const HONORIFICS = [
  'shri', 'smt', 'mr', 'mrs', 'ms', 'dr', 'kumari', 'sau',
  'श्री', 'श्रीमती', 'सौ', 'कुमारी', 'डॉ',
]

/** Normalize a name for comparison: lowercase, strip punctuation (incl. Devanagari), collapse spaces, drop honorifics. */
export function normalizeName(raw: string): string {
  if (!raw) return ''
  let s = raw
    .toLowerCase()
    .normalize('NFC')
    // Latin + Devanagari punctuation (danda, double danda, common marks)
    .replace(/[.,।॥'"()\-_/\\|:;!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = s.split(' ').filter(Boolean).filter((t) => !HONORIFICS.includes(t))
  return tokens.join(' ')
}

export function nameTokens(raw: string): string[] {
  return normalizeName(raw).split(' ').filter(Boolean)
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/** Normalized edit similarity in [0, 1], 1 = identical. */
export function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function tokenOverlapScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  let matched = 0
  const poolB = [...tokensB]
  for (const t of tokensA) {
    const idx = poolB.findIndex((b) => b === t || isInitialOf(t, b) || isInitialOf(b, t))
    if (idx !== -1) {
      matched++
      poolB.splice(idx, 1)
    }
  }
  return matched / Math.max(tokensA.length, tokensB.length)
}

/** True when `short` is a single-letter initial that matches the first letter of `full`. */
function isInitialOf(short: string, full: string): boolean {
  return short.length === 1 && full.length > 1 && short[0] === full[0]
}

function hasInitials(tokens: string[]): boolean {
  return tokens.some((t) => t.length === 1)
}

export interface NameComparisonResult {
  label: NameMatchLabel
  similarity: number
  usesInitials: boolean
}

/**
 * Compare two names and classify the relationship.
 * Not a legal identity check — a best-effort heuristic to flag likely rejections.
 */
export function compareNames(nameA: string | undefined, nameB: string | undefined): NameComparisonResult {
  const a = normalizeName(nameA ?? '')
  const b = normalizeName(nameB ?? '')

  if (!a || !b) {
    return { label: 'insufficient', similarity: 0, usesInitials: false }
  }

  if (a === b) {
    return { label: 'match', similarity: 1, usesInitials: hasInitials(nameTokens(a)) || hasInitials(nameTokens(b)) }
  }

  const tokensA = a.split(' ').filter(Boolean)
  const tokensB = b.split(' ').filter(Boolean)
  const overlap = tokenOverlapScore(tokensA, tokensB)
  const edit = editSimilarity(a, b)
  const similarity = Math.max(overlap, edit)
  const usesInitials = hasInitials(tokensA) || hasInitials(tokensB)

  if (similarity >= 0.92) {
    return { label: 'match', similarity, usesInitials }
  }
  if (similarity >= 0.55) {
    return { label: 'minor_variation', similarity, usesInitials }
  }
  return { label: 'mismatch', similarity, usesInitials }
}

/**
 * Attempt to extract a candidate name from OCR text using label-based extraction
 * ("Name:", "नाम", "नाव") followed by heuristic candidate-line extraction.
 * This is intentionally approximate; the UI always allows manual correction.
 */
export function extractCandidateName(text: string, labels: string[]): string | undefined {
  if (!text) return undefined
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // 1) Label-based: "Name: X" or "नाम X" on the same line
  for (const line of lines) {
    const lower = line.toLowerCase()
    for (const label of labels) {
      const labelLower = label.toLowerCase()
      const idx = lower.indexOf(labelLower)
      if (idx !== -1) {
        const after = line.slice(idx + label.length).replace(/^[:：\-\s]+/, '').trim()
        const cleaned = cleanCandidateLine(after)
        if (isPlausibleName(cleaned)) return cleaned
      }
    }
  }

  // 2) Label on its own line, name on the next line
  for (let i = 0; i < lines.length - 1; i++) {
    const lower = lines[i].toLowerCase()
    if (labels.some((label) => lower === label.toLowerCase() || lower.includes(label.toLowerCase()))) {
      const cleaned = cleanCandidateLine(lines[i + 1])
      if (isPlausibleName(cleaned)) return cleaned
    }
  }

  // 3) Fallback: first plausible all-alphabetic line that isn't a known heading/number-heavy line
  for (const line of lines) {
    const cleaned = cleanCandidateLine(line)
    if (isPlausibleName(cleaned) && !isKnownNonName(cleaned)) return cleaned
  }

  return undefined
}

function cleanCandidateLine(line: string): string {
  return line.replace(/[^A-Za-zऀ-ॿ\s.]/g, '').replace(/\s+/g, ' ').trim()
}

const NON_NAME_HEADINGS = [
  'government of india', 'unique identification authority', 'income certificate', 'ration card',
  'bank', 'branch', 'ifsc', 'account', 'caste certificate', 'domicile certificate', 'residence certificate',
  'date of birth', 'dob', 'male', 'female', 'address', 'भारत सरकार', 'सरकार', 'जन्म तिथि', 'पता',
]

function isKnownNonName(line: string): boolean {
  const lower = line.toLowerCase()
  return NON_NAME_HEADINGS.some((h) => lower.includes(h))
}

function isPlausibleName(line: string): boolean {
  if (!line) return false
  if (line.length < 3 || line.length > 60) return false
  const digitCount = (line.match(/\d/g) || []).length
  if (digitCount > 0) return false
  const words = line.split(' ').filter(Boolean)
  if (words.length < 1 || words.length > 6) return false
  return true
}
