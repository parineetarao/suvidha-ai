/**
 * Minimal fetch wrapper for MY (Member 3) backend endpoints: applications,
 * documents, voice, csc. Base URL from NEXT_PUBLIC_API_URL.
 *
 * TEMP: replace once real login exists. Auth wires up via a hardcoded temp
 * token (NEXT_PUBLIC_TEMP_JWT) instead of a real session — no login/OTP UI
 * exists yet, that's someone else's area.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

// Real auth token, set by AuthContext after a successful login.
// Falls back to the old TEMP_JWT only if no real session exists yet —
// keeps any other code still relying on the temp token working during
// the transition, without needing to touch it.
const TEMP_JWT = process.env.NEXT_PUBLIC_TEMP_JWT ?? ""
let currentAccessToken: string | null = null

export function setAccessToken(token: string | null) {
  currentAccessToken = token
}

export function getAccessToken(): string | null {
  return currentAccessToken
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed with status ${status}`)
    this.status = status
    this.detail = detail
  }
}

function authHeaders(): HeadersInit {
  const token = currentAccessToken || TEMP_JWT
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorDetail(res: Response): Promise<unknown> {
  try {
    const body = await res.json()
    return body?.detail ?? body
  } catch {
    return res.statusText
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res))
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res))
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  })
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res))
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res))
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res))
}
