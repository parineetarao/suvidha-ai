// Deliberately its own 3-value type, not app-wide Lang from '@/lib/strings'
// (which now spans 10 languages after the landing-page i18n expansion).
// This subsystem's translations are Hindi/Marathi/English only by design —
// see app/simple/page.tsx's toDocCheckLang, which maps any of the 10 UI
// languages down to one of these 3 before calling into this subsystem.
export type DocLang = 'hi-IN' | 'mr-IN' | 'en-IN'

export type DocumentType =
  | 'aadhaar'
  | 'bank_passbook'
  | 'income_certificate'
  | 'ration_card'
  | 'land_record'
  | 'caste_certificate'
  | 'domicile_certificate'
  | 'passport_photo'
  | 'other'

export type ReadinessStatus =
  | 'not_uploaded'
  | 'processing'
  | 'ready'
  | 'warning'
  | 'unclear'
  | 'error'

export type Confidence = 'high' | 'medium' | 'low'

export interface DocumentIssue {
  code: string
  severity: 'warning' | 'critical'
  messageKey: string
  suggestionKey: string
  /** Optional dynamic detail to interpolate into the translated message (already-safe plain text, e.g. a year or masked value). */
  detail?: string
}

export interface ExtractedFields {
  name?: string
  dateOfBirth?: string
  issueDate?: string
  expiryDate?: string
  year?: number
  aadhaarLastFour?: string
  accountNumberLastFour?: string
  ifsc?: string
  incomeAmount?: string
  issuingAuthority?: string
  documentTypeDetected?: DocumentType
}

export interface DocumentReadinessResult {
  documentType: DocumentType
  status: ReadinessStatus
  confidence: Confidence
  ocrConfidence?: number
  extractedText: string
  extractedFields: ExtractedFields
  issues: DocumentIssue[]
  completedAt?: string
  /** Name as read from the document (may be user-corrected). */
  extractedName?: string
  /** True once the user has manually corrected the extracted name. */
  nameManuallyCorrected?: boolean
  /** True when this result came from a demonstration sample, never real OCR. */
  isDemo?: boolean
}

export type NameMatchLabel = 'match' | 'minor_variation' | 'mismatch' | 'insufficient'

export interface NameComparison {
  documentType: DocumentType
  extractedName: string
  label: NameMatchLabel
  similarity: number
}

export interface ImageQualityWarning {
  code: 'too_small' | 'too_dark' | 'too_bright' | 'low_contrast' | 'possibly_blurry'
  messageKey: string
}

export interface OCRStageUpdate {
  stageKey:
    | 'preparing_image'
    | 'loading_language_model'
    | 'reading_document'
    | 'extracting_fields'
    | 'checking_issues'
    | 'preparing_result'
  progress: number // 0-100
}

export interface RequiredDocumentRef {
  type: DocumentType
  required: boolean
  labelKey: string
  reasonKey: string
}

export interface StoredDocumentReadiness {
  documentType: DocumentType
  status: ReadinessStatus
  confidence: Confidence
  issueCodes: string[]
  suggestionKeys: string[]
  maskedFields: Partial<Record<'aadhaarLastFour' | 'accountNumberLastFour', string>>
  extractedName?: string
  completedAt?: string
  readinessScore?: number
}

