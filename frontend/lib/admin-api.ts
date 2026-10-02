/**
 * Client for the /admin/* API. Admins are a separate identity from
 * citizens (email + password, own JWT with an "admin" role), so this keeps
 * its own token instead of sharing api-client.ts's citizen token — being
 * logged in as an admin and as a citizen in the same browser can't mix.
 *
 * The token lives in sessionStorage so a page refresh doesn't log the admin
 * out; it's gone when the tab closes, and the backend expires it after
 * JWT_ACCESS_TTL_MIN (15 min by default) regardless.
 */

import { ApiError } from "./api-client"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
const TOKEN_KEY = "suvidha_admin_token"

export type AdminRole = "super_admin" | "scheme_editor" | "viewer"

export interface AdminMe {
  id: string
  email: string
  role: AdminRole
  is_active: boolean
  created_at: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface UserSummary {
  id: string
  mobile_number: string | null
  email: string | null
  full_name: string | null
  is_verified: boolean
  created_at: string
  last_login_at: string | null
}

export interface AuditLog {
  id: number
  actor_type: string
  actor_id: string
  action: string
  target_type: string
  target_id: string | null
  extra_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface RecoveryRequest {
  id: string
  full_name: string | null
  registered_contact: string
  new_contact: string
  details: string | null
  matched_user_id: string | null
  status: "pending" | "approved" | "rejected"
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

export interface AnalyticsOverview {
  users_total: number
  admin_actions_by_type: Record<string, number>
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked (private mode etc.) — the admin just re-logs in on refresh.
  }
}

export function hasAdminToken(): boolean {
  return !!readToken()
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const token = readToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      const json = await res.json()
      detail = json?.detail ?? json
    } catch {}
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("POST", "/admin/auth/login", { email, password }, false),
  forgotPassword: (email: string) =>
    request<{ message: string }>("POST", "/admin/auth/forgot-password", { email }, false),
  resetPassword: (email: string, code: string, new_password: string) =>
    request<void>("POST", "/admin/auth/reset-password", { email, code, new_password }, false),

  me: () => request<AdminMe>("GET", "/admin/me"),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("POST", "/admin/me/change-password", { current_password, new_password }),

  overview: () => request<AnalyticsOverview>("GET", "/admin/analytics/overview"),
  users: (page: number, search: string) =>
    request<Paginated<UserSummary>>(
      "GET",
      `/admin/users?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`
    ),
  auditLogs: (page: number) => request<Paginated<AuditLog>>("GET", `/admin/audit-logs?page=${page}`),

  recoveryRequests: (status: string) =>
    request<Paginated<RecoveryRequest>>("GET", `/admin/recovery-requests?status=${encodeURIComponent(status)}`),
  approveRecovery: (id: string, note: string) =>
    request<RecoveryRequest>("POST", `/admin/recovery-requests/${id}/approve`, { note: note || null }),
  rejectRecovery: (id: string, note: string) =>
    request<RecoveryRequest>("POST", `/admin/recovery-requests/${id}/reject`, { note: note || null }),

  admins: () => request<AdminMe[]>("GET", "/admin/admins"),
  createAdmin: (email: string, role: AdminRole, password: string) =>
    request<AdminMe>("POST", "/admin/admins", { email, role, password }),
  updateAdmin: (id: string, patch: { role?: AdminRole; is_active?: boolean }) =>
    request<AdminMe>("PATCH", `/admin/admins/${id}`, patch),
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  scheme_editor: "Scheme editor",
  viewer: "Viewer",
}

// Mirrors the backend's admin_account_service.validate_new_password so the
// form can say what's wrong before submitting.
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters."
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers."
  return null
}
