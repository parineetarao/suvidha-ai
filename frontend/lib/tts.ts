/**
 * Client binding for POST /voice/speak — server-side TTS (gTTS), added
 * because the browser's own window.speechSynthesis only speaks languages
 * that have a voice installed on the LISTENER's OS/browser. On a typical
 * Windows Chrome install that's Hindi/English at best — Tamil, Telugu,
 * Kannada, Malayalam, Bengali, Gujarati, and Punjabi silently produce no
 * audio at all (no matching voice, no error, nothing to debug client-side).
 * Generating the audio server-side means every listener hears the same real
 * audio regardless of what's installed on their machine.
 */

import type { VoiceLanguage } from "@/lib/voice"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
const TEMP_JWT = process.env.NEXT_PUBLIC_TEMP_JWT ?? ""

export async function synthesizeSpeech(text: string, lang: VoiceLanguage): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/voice/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TEMP_JWT ? { Authorization: `Bearer ${TEMP_JWT}` } : {}),
    },
    body: JSON.stringify({ text, lang }),
  })
  if (!res.ok) {
    throw new Error(`TTS request failed with status ${res.status}`)
  }
  return res.blob()
}
