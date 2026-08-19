/**
 * Client binding for POST /schemes/voice-search — the real, unauthenticated
 * voice -> scheme pipeline. Takes the full transcribed sentence (not a
 * keyword), parses gender/age server-side, and returns real published
 * schemes from the DB, hard-filtered + scored against those parsed fields.
 * See backend/app/api/v1/schemes.py's voice_search_schemes.
 */

import { apiPost } from "@/lib/api-client"
import type { VoiceLanguage } from "@/lib/voice"

export interface MatchReasonOut {
  factor: string
  matched: string
  weight: number
}

export interface RealSchemeMatch {
  scheme_id: string
  name: string
  match_score: number
  reasons: MatchReasonOut[]
  warnings: string[]
}

export interface ParsedVoiceProfile {
  gender: string | null
  age: number | null
}

export interface VoiceSchemeSearchOut {
  parsed_profile: ParsedVoiceProfile
  results: RealSchemeMatch[]
}

export function searchSchemesFromVoiceText(
  text: string,
  lang: VoiceLanguage,
  limit = 10
): Promise<VoiceSchemeSearchOut> {
  return apiPost<VoiceSchemeSearchOut>("/schemes/voice-search", { text, language: lang, limit })
}
