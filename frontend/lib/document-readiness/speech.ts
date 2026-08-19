import type { DocLang } from '@/lib/document-readiness/types'

/** Mirrors the speech-synthesis approach already used in Simple Mode (cancel-then-speak). */
export function speakText(text: string, lang: DocLang): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = lang === 'en-IN' ? 0.95 : 0.82
  utterance.pitch = 1
  utterance.volume = 1
  window.speechSynthesis.speak(utterance)
}

export function stopSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}
