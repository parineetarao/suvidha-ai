/**
 * frontend/lib/api.ts
 *
 * Thin fetch wrappers around the live scheme-discovery backend
 * (backend/app/api/v1/schemes.py). Matches the request/response shapes in
 * backend/app/schemas/scheme.py exactly — no client-side reshaping beyond
 * what's noted inline.
 *
 * Scope: search, scheme detail, compare. Deliberately does NOT touch
 * POST /schemes/match (personalized matching) — that endpoint requires a
 * logged-in user with a saved profile and is still unverified end-to-end.
 */

// Was hardcoded to a stale port (8001) independent of every other API
// client in the app — reuse the same NEXT_PUBLIC_API_URL env var that
// api-client.ts and tts.ts already read, so there's one source of truth
// for the backend URL instead of two that can drift out of sync.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

export type ApiLanguage = 'en' | 'hi' | 'mr' | 'ta' | 'te' | 'kn' | 'ml' | 'bn' | 'gu' | 'pa';

export type MatchReason = {
  factor: string;
  matched: string;
  weight: number;
};

export type SchemeMatch = {
  scheme_id: string;
  name: string;
  match_score: number;
  reasons: MatchReason[];
  warnings: string[];
};

export type EligibilityRules = {
  min_age: number | null;
  max_age: number | null;
  states: string[];
  income_max: number | null;
  categories: string[];
  occupations: string[];
  gender: string | null;
  disability: boolean | null;
};

export type RejectionRisk = {
  risk: string;
  fix: string;
};

export type SchemeDetail = {
  id: string;
  scheme_code: string;
  name: string;
  ministry: string | null;
  category: string | null;
  is_published: boolean;
  description: string | null;
  benefits: string | null;
  eligibility_rules: EligibilityRules;
  documents_required: string[];
  application_modes: string[];
  application_url: string | null;
  source_url: string | null;
  last_verified_at: string | null;
  warning: string | null;
  rejection_risks: RejectionRisk[];
  available_languages: string[];
};

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
    return JSON.stringify(body?.detail ?? body);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** Wraps fetch failures (backend down, network error, CORS) in one message. */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    throw new ApiError(
      'Could not reach the backend at ' + API_BASE_URL + '. Is it running?'
    );
  }
  if (!res.ok) {
    const detail = await parseErrorDetail(res);
    throw new ApiError(detail, res.status);
  }
  return res;
}

export type SchemeOut = {
  id: string;
  scheme_code: string;
  name: string;
  ministry: string | null;
  category: string | null;
  is_published: boolean;
};

export type PaginatedSchemes = {
  items: SchemeOut[];
  total: number;
  page: number;
  limit: number;
};

// GET /schemes/{id} (getScheme, below) looks a scheme up by scheme_code,
// not by its real `id` UUID — but Application.scheme_id (Member 3's table)
// stores that UUID, not the scheme_code. There's no id-keyed detail
// endpoint, so resolving an application's scheme_id back to a display name
// goes through the list endpoint instead, which does return `id` alongside
// `name`. English-only (list_schemes doesn't take a `lang` param), and
// caps at 100 schemes (currently 62 published) — acceptable for a name
// lookup, not attempting to fix the underlying route mismatch here since
// schemes.py isn't mine to change.
export async function listSchemes(limit = 100): Promise<PaginatedSchemes> {
  const res = await apiFetch(`${API_BASE_URL}/schemes?limit=${limit}`);
  return res.json();
}

export async function searchSchemes(
  query: string,
  language: ApiLanguage,
  limit = 10
): Promise<SchemeMatch[]> {
  const res = await apiFetch(`${API_BASE_URL}/schemes/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, language, limit }),
  });
  return res.json();
}

export async function getScheme(schemeId: string, language: ApiLanguage): Promise<SchemeDetail> {
  const res = await apiFetch(
    `${API_BASE_URL}/schemes/${encodeURIComponent(schemeId)}?lang=${encodeURIComponent(language)}`
  );
  return res.json();
}

export async function compareSchemes(
  schemeIds: string[],
  language: ApiLanguage
): Promise<SchemeDetail[]> {
  const res = await apiFetch(`${API_BASE_URL}/schemes/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheme_ids: schemeIds, language }),
  });
  const body = await res.json();
  return body.schemes;
}
