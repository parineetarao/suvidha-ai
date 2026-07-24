import type { DocumentIssue, DocumentType, ExtractedFields, Confidence, ReadinessStatus } from './types'
import { DOCUMENT_KEYWORDS, NAME_LABELS } from './document-config'
import { extractCandidateName } from './name-matching'

const AADHAAR_PATTERN = /\b(\d{4}\s?\d{4}\s?\d{4})\b/
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

function extractAadhaarLastFour(text: string): string | undefined {
  const m = text.match(AADHAAR_PATTERN)
  if (!m) return undefined
  const digits = m[1].replace(/\s/g, '')
  if (digits.length !== 12) return undefined
  return digits.slice(-4)
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

  const name = extractName(text)
  extractedFields.name = name
  if (!name) {
    issues.push(makeIssue('name_unreadable', 'warning', 'nameUnreadable', 'nameUnreadable'))
  }

  switch (documentType) {
    case 'aadhaar': {
      const aadhaarLast4 = extractAadhaarLastFour(text)
      extractedFields.aadhaarLastFour = aadhaarLast4
      if (!aadhaarLast4) issues.push(makeIssue('aadhaar_number_not_found', 'critical', 'aadhaarNumberNotFound', 'aadhaarNumberNotFound'))

      const year = extractLatestYear(text)
      const hasDobWord = /dob|date of birth|जन्म तिथि|जन्म तारीख/i.test(text)
      if (!year && !hasDobWord) issues.push(makeIssue('dob_not_found', 'warning', 'dobNotFound', 'dobNotFound'))
      else extractedFields.dateOfBirth = hasDobWord ? 'present' : String(year)
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
