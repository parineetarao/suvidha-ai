import type { DocumentReadinessResult, DocumentType, StoredDocumentReadiness } from './types'

const STORAGE_KEY = 'suvidha_document_readiness_v1'

/** Strip anything sensitive (raw image, full OCR text, full numbers) before persisting. */
export function toStoredResult(result: DocumentReadinessResult, readinessScore?: number): StoredDocumentReadiness {
  return {
    documentType: result.documentType,
    status: result.status,
    confidence: result.confidence,
    issueCodes: result.issues.map((i) => i.code),
    suggestionKeys: Array.from(new Set(result.issues.map((i) => i.suggestionKey))),
    maskedFields: {
      aadhaarLastFour: result.extractedFields.aadhaarLastFour,
      accountNumberLastFour: result.extractedFields.accountNumberLastFour,
    },
    extractedName: result.extractedName,
    completedAt: result.completedAt,
    readinessScore,
  }
}

export function loadStoredResults(): Partial<Record<DocumentType, StoredDocumentReadiness>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Partial<Record<DocumentType, StoredDocumentReadiness>>
  } catch {
    // Corrupt or unreadable storage should never crash the feature.
    return {}
  }
}

export function saveStoredResult(result: DocumentReadinessResult, readinessScore?: number): void {
  if (typeof window === 'undefined') return
  try {
    const all = loadStoredResults()
    all[result.documentType] = toStoredResult(result, readinessScore)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage can fail (quota, privacy mode) — the feature must keep working from in-memory state.
  }
}

export function clearStoredResults(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
