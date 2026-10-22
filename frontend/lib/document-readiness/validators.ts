import type { DocumentIssue, DocumentType, ExtractedFields, Confidence, ReadinessStatus } from './types'
import { DOCUMENT_KEYWORDS, NAME_LABELS } from './document-config'
import { extractCandidateName, isKnownNonName } from './name-matching'

const IFSC_PATTERN = /\b[A-Z]{4}0[A-Z0-9]{6}\b/
const ACCOUNT_NUMBER_PATTERN = /\b\d{9,18}\b/
const YEAR_PATTERN = /\b(19|20)\d{2}\b/g
const INCOME_AMOUNT_PATTERN = /(?:rs\.?|₹|inr)\s?[\d,]{3,}/i
const SURVEY_PATTERN = /\b(survey|gat|gut|khata|khasra)\s?(no\.?|number|नंबर|क्रमांक)?\s?[:\-]?\s?\d+[a-z\/\d]*/i

export interface DetectionResult {
  detectedType: DocumentType | null
  matchedExpected: boolean
  conflictsWithExpected: boolean
  keywordHits: number
}

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  return keywords.reduce((acc, k) => (lower.includes(k.toLowerCase()) ? acc + 1 : acc), 0)
}

/** Estimate which document type the OCR text looks like, and whether it conflicts with what was expected. */
export function detectDocumentType(text: string, expected: DocumentType): DetectionResult {
  const scores: Partial<Record<DocumentType, number>> = {}
  ;(Object.keys(DOCUMENT_KEYWORDS) as DocumentType[]).forEach((type) => {
    if (type === 'other' || type === 'passport_photo') return
    scores[type] = countKeywordHits(text, DOCUMENT_KEYWORDS[type])
  })

  const expectedHits = scores[expected] ?? 0
  let bestType: DocumentType | null = null
  let bestScore = 0
  ;(Object.keys(scores) as DocumentType[]).forEach((type) => {
    const score = scores[type] ?? 0
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  })

  const conflictsWithExpected = bestType !== null && bestType !== expected && bestScore >= 2 && expectedHits === 0

  return {
    detectedType: bestType,
    matchedExpected: expectedHits > 0,
    conflictsWithExpected,
    keywordHits: expectedHits,
  }
}

function maskLastFour(digits: string): string {
  const clean = digits.replace(/\s/g, '')
  if (clean.length < 4) return ''
  return `XXXX-XXXX-${clean.slice(-4)}`
}

/** Converts Devanagari digits (०-९), which the Hindi OCR model sometimes emits, to ASCII digits. */
export function normalizeOcrDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
}

// Verhoeff checksum tables. Every real Aadhaar number's last digit is a Verhoeff check digit,
// which catches any single misread digit and any swap of two adjacent digits.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

/** True for a 12-digit number that could be a real Aadhaar: starts with 2-9 and passes Verhoeff. */
export function isValidAadhaarNumber(digits: string): boolean {
  if (!/^[2-9]\d{11}$/.test(digits)) return false
  let c = 0
  const reversed = digits.split('').reverse()
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]]
  }
  return c === 0
}

// Characters OCR commonly returns in place of digits on Aadhaar's printed number.
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', I: '1', i: '1', l: '1', '|': '1', '!': '1',
  Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9',
}
const DIGIT_GROUP = '[0-9OoDQIil|!ZzSsBGbgq]{4}'
// Three 4-character groups not glued to more digits on either side, so the first or last
// 12 digits of the 16-digit VID ("VID: 9123 4567 8901 2345") are never taken as the Aadhaar.
const AADHAAR_CANDIDATE = new RegExp(
  `(?<![0-9][ \\t]{0,3})(?<![A-Za-z])(${DIGIT_GROUP})[ \\t]{0,3}(${DIGIT_GROUP})[ \\t]{0,3}(${DIGIT_GROUP})(?![ \\t]{0,3}[0-9])(?![A-Za-z])`,
  'g',
)
const MASKED_AADHAAR = /(?:[xX*]{4})[ \t]{0,3}(?:[xX*]{4})[ \t]{0,3}([0-9]{4})(?![ \t]{0,3}[0-9])/
const NON_AADHAAR_LINE = /\bvid\b|virtual\s*id|enrol|enroll|नामांकन|mobile|phone|pin\s*code/i

export interface AadhaarNumberResult {
  lastFour: string
  /** The full number passed the Verhoeff checksum, so it was very likely read correctly. */
  checksumValid: boolean
  /** The card is a masked Aadhaar (XXXX XXXX 1234), so only the last four digits exist. */
  masked: boolean
}

/**
 * Finds the Aadhaar number in OCR text. Tolerates common OCR digit confusions and Devanagari
 * digits, ignores the VID and enrolment numbers, and prefers a checksum-valid candidate.
 * The number is often printed more than once (front and back, or twice on e-Aadhaar), so
 * repeated readings of the same number win over one-off misreads.
 */
export function extractAadhaarNumber(rawText: string): AadhaarNumberResult | undefined {
  const text = normalizeOcrDigits(rawText)
  const votes = new Map<string, number>()

  for (const line of text.split(/\r?\n/)) {
    if (NON_AADHAAR_LINE.test(line)) continue
    for (const m of line.matchAll(AADHAAR_CANDIDATE)) {
      const raw = m[1] + m[2] + m[3]
      if ((raw.match(/[0-9]/g) ?? []).length < 10) continue
      const digits = raw.replace(/[^0-9]/g, (ch) => DIGIT_LOOKALIKES[ch] ?? ch)
      if (/^\d{12}$/.test(digits)) votes.set(digits, (votes.get(digits) ?? 0) + 1)
    }
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
  const valid = ranked.find(([digits]) => isValidAadhaarNumber(digits))
  if (valid) return { lastFour: valid[0].slice(-4), checksumValid: true, masked: false }

  const masked = text.match(MASKED_AADHAAR)
  if (masked) return { lastFour: masked[1], checksumValid: true, masked: true }

  const plausible = ranked.find(([digits]) => /^[2-9]/.test(digits))
  if (plausible) return { lastFour: plausible[0].slice(-4), checksumValid: false, masked: false }

  return undefined
}

const DATE_PART = String.raw`([0-3]?\d)\s?[\/\-.]\s?([01]?\d)\s?[\/\-.]\s?((?:19|20)\d{2})`
const DOB_LABEL = String.raw`(?:d\s?[o0]\s?b|date\s*of\s*birth|birth\s*date|जन्म\s*तिथि|जन्म\s*तारीख|जन्मतारीख|जन्म\s*दिनांक)`
const LABELLED_DOB = new RegExp(`${DOB_LABEL}[^0-9\\n]{0,15}${DATE_PART}`, 'i')
const YEAR_OF_BIRTH = /(?:year\s*of\s*birth|y\s?[o0]\s?b|जन्म\s*वर्ष)[^0-9\n]{0,15}((?:19|20)\d{2})/i
const ANY_DATE = new RegExp(DATE_PART, 'g')
// Lines carrying dates that are not the date of birth.
const NON_DOB_DATE_LINE = /issue|download|generat|print|valid|जारी|डाउनलोड/i

function formatDate(d: string, m: string, y: string): string | undefined {
  const day = Number(d)
  const month = Number(m)
  const year = Number(y)
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined
  if (year < 1900 || year > new Date().getFullYear()) return undefined
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/** Reads the date of birth (DD/MM/YYYY) or year of birth from Aadhaar OCR text. */
export function extractAadhaarDob(rawText: string): string | undefined {
  const text = normalizeOcrDigits(rawText)

  const labelled = text.match(LABELLED_DOB)
  if (labelled) {
    const date = formatDate(labelled[1], labelled[2], labelled[3])
    if (date) return date
  }

  const yob = text.match(YEAR_OF_BIRTH)
  if (yob && Number(yob[1]) <= new Date().getFullYear()) return yob[1]

  // Label misread: fall back to the first plausible date not on an issue/download-date line.
  for (const line of text.split(/\r?\n/)) {
    if (NON_DOB_DATE_LINE.test(line)) continue
    for (const m of line.matchAll(ANY_DATE)) {
      const date = formatDate(m[1], m[2], m[3])
      if (date) return date
    }
  }
  return undefined
}

const AADHAAR_ANCHOR_LINE = new RegExp(`${DOB_LABEL}|year\\s*of\\s*birth|\\bmale\\b|\\bfemale\\b|पुरुष|महिला`, 'i')

const LATIN = 'A-Za-z'
const DEVANAGARI = 'ऀ-ॿ'

function looksLikeName(line: string, letterClass: string): string | undefined {
  const letters = (line.match(new RegExp(`[${letterClass}]`, 'g')) ?? []).length
  const nonSpace = line.replace(/\s/g, '').length
  // Mostly real letters: OCR noise lines are full of symbols and stray digits.
  if (nonSpace === 0 || letters / nonSpace < 0.8) return undefined
  const cleaned = line.replace(new RegExp(`[^${letterClass}\\s.]`, 'g'), '').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length < 1 || words.length > 5) return undefined
  if (!words.some((w) => w.replace('.', '').length >= 3)) return undefined
  if (words.filter((w) => w.length === 1).length > 1) return undefined
  if (isKnownNonName(cleaned) || /government|india|authority|aadhaar|aadhar|सरकार|आधार/i.test(cleaned)) return undefined
  return cleaned
}

/**
 * Aadhaar cards have no "Name:" label. The name sits directly above the DOB line, usually
 * as a Hindi line followed by an English line, so look upward from the DOB/gender line and
 * prefer the English (Latin-script) name since that is what profiles are stored in.
 */
function extractAadhaarName(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const anchor = lines.findIndex((l) => AADHAAR_ANCHOR_LINE.test(l))
  if (anchor > 0) {
    const above = lines.slice(Math.max(0, anchor - 3), anchor).reverse()
    for (const line of above) {
      const latin = looksLikeName(line, LATIN)
      if (latin) return latin
    }
    for (const line of above) {
      const devanagari = looksLikeName(line, DEVANAGARI)
      if (devanagari) return devanagari
    }
  }
  return extractName(text)
}

function extractAccountLastFour(text: string): string | undefined {
  const matches = text.match(new RegExp(ACCOUNT_NUMBER_PATTERN, 'g'))
  if (!matches || matches.length === 0) return undefined
  const best = matches.sort((a, b) => b.length - a.length)[0]
  return best.slice(-4)
}

function extractIfsc(text: string): string | undefined {
  const m = text.match(IFSC_PATTERN)
  return m ? m[0] : undefined
}

function extractLatestYear(text: string): number | undefined {
  const matches = text.match(YEAR_PATTERN)
  if (!matches || matches.length === 0) return undefined
  const years = matches.map((y) => parseInt(y, 10)).filter((y) => y >= 1950 && y <= new Date().getFullYear())
  if (years.length === 0) return undefined
  return Math.max(...years)
}

function extractIncomeAmount(text: string): string | undefined {
  const m = text.match(INCOME_AMOUNT_PATTERN)
  return m ? m[0].trim() : undefined
}

function hasSurveyIdentifier(text: string): boolean {
  return SURVEY_PATTERN.test(text)
}

function textLength(text: string): number {
  return text.replace(/\s/g, '').length
}

function makeIssue(code: string, severity: 'warning' | 'critical', messageKey: string, suggestionKey: string): DocumentIssue {
  return { code, severity, messageKey, suggestionKey }
}

function baseConfidence(issues: DocumentIssue[], ocrConfidence: number | undefined): Confidence {
  const critical = issues.filter((i) => i.severity === 'critical').length
  if (critical > 0) return 'low'
  if (issues.length >= 2) return 'medium'
  if (typeof ocrConfidence === 'number' && ocrConfidence < 55) return 'medium'
  return 'high'
}

function statusFromIssues(issues: DocumentIssue[], text: string): ReadinessStatus {
  if (textLength(text) < 15) return 'unclear'
  if (issues.some((i) => i.severity === 'critical')) return 'warning'
  if (issues.length > 0) return 'warning'
  return 'ready'
}

export interface ValidationInput {
  documentType: DocumentType
  text: string
  ocrConfidence?: number
  profileName?: string
}

export interface ValidationOutput {
  status: ReadinessStatus
  confidence: Confidence
  issues: DocumentIssue[]
  extractedFields: ExtractedFields
  extractedName?: string
}

function extractName(text: string): string | undefined {
  return extractCandidateName(text, NAME_LABELS)
}

export function validateDocument(input: ValidationInput): ValidationOutput {
  const { documentType, text, ocrConfidence } = input
  const issues: DocumentIssue[] = []
  const extractedFields: ExtractedFields = {}

  if (textLength(text) < 15) {
    issues.push(makeIssue('text_too_short', 'critical', 'textTooShort', 'textTooShort'))
    return { status: 'unclear', confidence: 'low', issues, extractedFields }
  }

  const detection = detectDocumentType(text, documentType)
  extractedFields.documentTypeDetected = detection.detectedType ?? undefined
  if (detection.conflictsWithExpected) {
    issues.push(makeIssue('doc_type_mismatch', 'critical', 'docTypeMismatch', 'docTypeMismatch'))
  }

  const name = documentType === 'aadhaar' ? extractAadhaarName(text) : extractName(text)
  extractedFields.name = name
  if (!name) {
    issues.push(makeIssue('name_unreadable', 'warning', 'nameUnreadable', 'nameUnreadable'))
  }

  switch (documentType) {
    case 'aadhaar': {
      const aadhaar = extractAadhaarNumber(text)
      extractedFields.aadhaarLastFour = aadhaar?.lastFour
      if (!aadhaar) {
        issues.push(makeIssue('aadhaar_number_not_found', 'critical', 'aadhaarNumberNotFound', 'aadhaarNumberNotFound'))
      } else if (!aadhaar.checksumValid) {
        issues.push(makeIssue('aadhaar_number_unclear', 'warning', 'aadhaarNumberUnclear', 'aadhaarNumberUnclear'))
      }

      const dob = extractAadhaarDob(text)
      extractedFields.dateOfBirth = dob
      if (!dob) issues.push(makeIssue('dob_not_found', 'warning', 'dobNotFound', 'dobNotFound'))
      break
    }
    case 'bank_passbook': {
      const acctLast4 = extractAccountLastFour(text)
      extractedFields.accountNumberLastFour = acctLast4
      if (!acctLast4) issues.push(makeIssue('account_number_not_found', 'critical', 'accountNumberNotFound', 'accountNumberNotFound'))

      const ifsc = extractIfsc(text)
      extractedFields.ifsc = ifsc
      if (!ifsc) issues.push(makeIssue('ifsc_not_found', 'warning', 'ifscNotFound', 'ifscNotFound'))

      const looksLikeDetailsPage = /branch|ifsc|bank|खाते|बँक|बैंक/i.test(text)
      if (!looksLikeDetailsPage) issues.push(makeIssue('not_details_page', 'warning', 'notDetailsPage', 'notDetailsPage'))
      break
    }
    case 'income_certificate': {
      const amount = extractIncomeAmount(text)
      extractedFields.incomeAmount = amount
      if (!amount) issues.push(makeIssue('income_amount_not_found', 'warning', 'incomeAmountNotFound', 'incomeAmountNotFound'))

      const hasAuthority = /tehsildar|mamlatdar|collector|तहसीलदार/i.test(text)
      if (!hasAuthority) issues.push(makeIssue('issuing_authority_not_found', 'warning', 'issuingAuthorityNotFound', 'issuingAuthorityNotFound'))
      else extractedFields.issuingAuthority = 'present'

      const year = extractLatestYear(text)
      extractedFields.year = year
      if (year) {
        const currentYear = new Date().getFullYear()
        if (currentYear - year > 1) {
          issues.push(makeIssue('certificate_outdated', 'warning', 'certificateOutdated', 'certificateOutdated'))
        }
      }
      break
    }
    case 'ration_card': {
      const hasRationTerms = countKeywordHits(text, DOCUMENT_KEYWORDS.ration_card) > 0
      if (!hasRationTerms) issues.push(makeIssue('ration_terms_not_found', 'warning', 'rationTermsNotFound', 'rationTermsNotFound'))

      const hasFamilyInfo = /member|family|परिवार|सदस्य/i.test(text)
      if (!hasFamilyInfo) issues.push(makeIssue('family_info_not_found', 'warning', 'familyInfoNotFound', 'familyInfoNotFound'))
      break
    }
    case 'land_record': {
      const hasIdentifier = hasSurveyIdentifier(text)
      if (!hasIdentifier) issues.push(makeIssue('land_identifier_not_found', 'critical', 'landIdentifierNotFound', 'landIdentifierNotFound'))

      if (name) {
        const tokens = name.split(' ')
        if (tokens.some((t) => t.length <= 2)) {
          issues.push(makeIssue('owner_name_initials', 'warning', 'ownerNameInitials', 'ownerNameInitials'))
        }
      }
      break
    }
    case 'caste_certificate': {
      const hasCasteTerms = countKeywordHits(text, DOCUMENT_KEYWORDS.caste_certificate) > 0
      if (!hasCasteTerms) issues.push(makeIssue('caste_terms_not_found', 'warning', 'casteTermsNotFound', 'casteTermsNotFound'))

      const hasAuthority = /tehsildar|collector|deputy commissioner|sdo|तहसीलदार/i.test(text)
      if (!hasAuthority) issues.push(makeIssue('issuing_authority_not_found', 'warning', 'issuingAuthorityNotFound', 'issuingAuthorityNotFound'))

      const hasRefNumber = /\b[A-Z0-9]{5,}\b/.test(text.replace(/\s/g, ''))
      if (!hasRefNumber) issues.push(makeIssue('reference_number_not_found', 'warning', 'referenceNumberNotFound', 'referenceNumberNotFound'))
      break
    }
    case 'domicile_certificate': {
      const hasDomicileTerms = countKeywordHits(text, DOCUMENT_KEYWORDS.domicile_certificate) > 0
      if (!hasDomicileTerms) issues.push(makeIssue('domicile_terms_not_found', 'warning', 'domicileTermsNotFound', 'domicileTermsNotFound'))

      const hasAuthority = /tehsildar|collector|sdo|तहसीलदार/i.test(text)
      if (!hasAuthority) issues.push(makeIssue('issuing_authority_not_found', 'warning', 'issuingAuthorityNotFound', 'issuingAuthorityNotFound'))

      const year = extractLatestYear(text)
      const hasRefNumber = /\b[A-Z0-9]{5,}\b/.test(text.replace(/\s/g, ''))
      if (!year && !hasRefNumber) issues.push(makeIssue('date_or_ref_not_found', 'warning', 'dateOrRefNotFound', 'dateOrRefNotFound'))
      break
    }
    case 'passport_photo':
    case 'other':
    default:
      break
  }

  const status = statusFromIssues(issues, text)
  const confidence = baseConfidence(issues, ocrConfidence)

  return { status, confidence, issues, extractedFields, extractedName: name }
}

export { maskLastFour }
