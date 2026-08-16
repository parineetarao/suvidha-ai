/**
 * Client binding for MY (Member 3) POST /voice/transcribe endpoint. See
 * backend/app/api/v1/voice.py and backend/app/schemas/voice.py.
 */

import { apiPostForm } from "@/lib/api-client"

export const SUPPORTED_VOICE_LANGUAGES = ["en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"] as const
export type VoiceLanguage = (typeof SUPPORTED_VOICE_LANGUAGES)[number]

export interface TranscribeOut {
  text: string
  language: string
  duration: number
  confidence: number
}

export function transcribeAudio(audio: Blob, lang: VoiceLanguage): Promise<TranscribeOut> {
  const formData = new FormData()
  formData.append("file", audio, "recording.webm")
  formData.append("lang", lang)
  return apiPostForm<TranscribeOut>("/voice/transcribe", formData)
}
