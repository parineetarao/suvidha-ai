import type { OCRStageUpdate } from './types'

export interface OcrRunResult {
  text: string
  confidence: number
  usedFallbackLang: boolean
}

export interface RunOcrOptions {
  includeMarathi: boolean
  onStage: (update: OCRStageUpdate) => void
}

const RELIABLE_DEFAULT_LANGS = 'eng+hin'
const WITH_MARATHI_LANGS = 'eng+hin+mar'

/**
 * Runs OCR entirely in the browser via a dynamic import of tesseract.js.
 * The interface language and the OCR recognition language are separate —
 * this module never decides what language to show UI text in.
 */
export async function runOcr(file: File | Blob, opts: RunOcrOptions): Promise<OcrRunResult> {
  opts.onStage({ stageKey: 'preparing_image', progress: 5 })

  const Tesseract = await import('tesseract.js')

  const langs = opts.includeMarathi ? WITH_MARATHI_LANGS : RELIABLE_DEFAULT_LANGS

  const logger = (m: { status?: string; progress?: number }) => {
    const status = (m.status ?? '').toLowerCase()
    const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0
    if (status.includes('recognizing')) {
      opts.onStage({ stageKey: 'reading_document', progress: 40 + Math.round(pct * 0.5) })
    } else if (status.includes('loading') || status.includes('initializ')) {
      opts.onStage({ stageKey: 'loading_language_model', progress: 10 + Math.round(pct * 0.3) })
    } else {
      opts.onStage({ stageKey: 'preparing_image', progress: 8 })
    }
  }

  try {
    const { data } = await Tesseract.recognize(file, langs, { logger })
    return { text: data.text ?? '', confidence: data.confidence ?? 0, usedFallbackLang: false }
  } catch (err) {
    if (!opts.includeMarathi) throw err
    // Marathi trained data could not load — fall back to the reliable default and let the caller
    // surface a non-blocking notice rather than failing the whole check.
    const { data } = await Tesseract.recognize(file, RELIABLE_DEFAULT_LANGS, { logger })
    return { text: data.text ?? '', confidence: data.confidence ?? 0, usedFallbackLang: true }
  }
}
