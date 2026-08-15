/**
 * Client bindings for MY (Member 3) /applications endpoints.
 * See backend/app/api/v1/applications.py and backend/app/schemas/application.py.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client"

export type ApplicationStatus =
  | "draft"
  | "docs_pending"
  | "letter_generated"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"

export interface ApplicationOut {
  id: string
  scheme_id: string
  status: ApplicationStatus
  reference_number: string | null
  notes: string | null
  created_at: string
  submitted_at: string | null
}

export interface StatusHistoryEntry {
  old_status: ApplicationStatus | null
  new_status: ApplicationStatus
  changed_at: string
  changed_by: string | null
}

export interface ApplicationDetail extends ApplicationOut {
  status_history: StatusHistoryEntry[]
}

export function createApplication(schemeId: string): Promise<ApplicationOut> {
  return apiPost<ApplicationOut>("/applications", { scheme_id: schemeId })
}

export function listApplications(): Promise<ApplicationOut[]> {
  return apiGet<ApplicationOut[]>("/applications")
}

export function getApplication(id: string): Promise<ApplicationDetail> {
  return apiGet<ApplicationDetail>(`/applications/${id}`)
}

export function updateApplication(
  id: string,
  payload: { status?: ApplicationStatus; notes?: string },
): Promise<ApplicationOut> {
  return apiPatch<ApplicationOut>(`/applications/${id}`, payload)
}

export function deleteApplication(id: string): Promise<void> {
  return apiDelete(`/applications/${id}`)
}
