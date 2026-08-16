/**
 * Client binding for MY (Member 3) POST /documents/verify endpoint.
 * See backend/app/api/v1/documents.py and backend/app/schemas/application.py
 * (DocumentVerifyIn / VerificationResult).
 *
 * Builds its payload from the document-readiness checker's existing masked
 * result (see lib/document-readiness/storage.ts's toStoredResult, same
 * "never send raw OCR text or full numbers" rule) — does not touch any
 * OCR/validation logic itself.
 */

import { apiPost } from "@/lib/api-client"
import type { DocumentReadinessResult } from "@/lib/document-readiness/types"

export interface DocumentVerifyIn {
  doc_type: string
  checks: Record<string, boolean>
  masked_id?: string | null
}

export interface VerificationResult {
  id: string
  document_type: string
  verification_status: string
  masked_identifier: string | null
  checked_at: string
}

export function toVerifyPayload(result: DocumentReadinessResult): DocumentVerifyIn {
  const hasCriticalIssue = result.issues.some((issue) => issue.severity === "critical")
  const hasNameMismatch = result.issues.some((issue) => issue.code === "name_mismatch")
  const lastFour = result.extractedFields.aadhaarLastFour ?? result.extractedFields.accountNumberLastFour

  return {
    doc_type: result.documentType,
    checks: {
      ocr_readable: result.status !== "unclear" && result.status !== "error",
      no_critical_issues: !hasCriticalIssue,
      name_matches: !hasNameMismatch,
    },
    masked_id: lastFour ? `••••${lastFour}` : null,
  }
}

export function verifyDocument(result: DocumentReadinessResult): Promise<VerificationResult> {
  return apiPost<VerificationResult>("/documents/verify", toVerifyPayload(result))
}
