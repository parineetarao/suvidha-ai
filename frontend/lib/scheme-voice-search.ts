/**
 * Client binding for POST /schemes/voice-search — the real, unauthenticated
 * voice -> scheme pipeline. Takes the full transcribed sentence (not a
 * keyword), parses the user's eligibility profile server-side, and returns
 * only the published schemes they are eligible for, scored by fit.
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
  state: string | null
  occupations: string[]
  caste: string | null // SC / ST / OBC / General
  bpl: boolean | null
  annual_income: number | null
  disability: boolean | null
}

export interface VoiceSchemeSearchOut {
  parsed_profile: ParsedVoiceProfile
  // Only schemes whose every eligibility rule the sentence satisfies.
  results: RealSchemeMatch[]
  // Details the user didn't mention that would unlock more schemes
  // (state / occupation / category / income / age / gender / disability).
  missing_fields: string[]
}

export function searchSchemesFromVoiceText(
  text: string,
  lang: VoiceLanguage,
  limit = 10
): Promise<VoiceSchemeSearchOut> {
  return apiPost<VoiceSchemeSearchOut>("/schemes/voice-search", { text, language: lang, limit })
}
