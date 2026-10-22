import type { OCRStageUpdate } from './types'

export interface OcrRunResult {
  text: string
  confidence: number
  usedFallbackLang: boolean
}

export interface RunOcrOptions {
  includeMarathi: boolean
  onStage: (update: OCRStageUpdate) => void
  /**
   * Called with the first pass's text. Returning true runs a second, English-only pass and
   * appends its text. The Hindi model often misreads Latin digits, so a field like the Aadhaar
   * number can be missing from a mixed-language pass but clear in an English-only one.
   */
  needsEnglishPass?: (text: string) => boolean
}

const RELIABLE_DEFAULT_LANGS = 'eng+hin'
const WITH_MARATHI_LANGS = 'eng+hin+mar'
const ENGLISH_ONLY = 'eng'

// Tesseract reads best when text is roughly 25-40px tall. Card photos are usually either
// small screenshots or very large phone photos, so normalize the longer side into this range.
const TARGET_MIN_LONG_SIDE = 1800
const TARGET_MAX_LONG_SIDE = 2600

/**
 * Prepares an image for OCR: applies EXIF orientation (via createImageBitmap), rescales to a
 * text size Tesseract handles well, converts to grayscale and stretches contrast so the
 * printed text stands out from the patterned background of cards like Aadhaar.
 * Binarization is left to Tesseract, whose own thresholding copes better with uneven lighting.
 * Falls back to the original file if anything about canvas processing fails.
 */
async function preprocessImage(file: File | Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longSide = Math.max(bitmap.width, bitmap.height)
    let scale = 1
    if (longSide < TARGET_MIN_LONG_SIDE) scale = Math.min(3, TARGET_MIN_LONG_SIDE / longSide)
    else if (longSide > TARGET_MAX_LONG_SIDE) scale = TARGET_MAX_LONG_SIDE / longSide

    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return file
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const img = ctx.getImageData(0, 0, w, h)
    const { data } = img
    const gray = new Uint8ClampedArray(w * h)
    const histogram = new Uint32Array(256)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      gray[p] = l
      histogram[l]++
    }

    // Contrast stretch between the 1st and 99th percentile, ignoring stray dark/bright pixels.
    const total = w * h
    let lo = 0
    let hi = 255
    for (let acc = 0, v = 0; v < 256; v++) {
      acc += histogram[v]
      if (acc >= total * 0.01) { lo = v; break }
    }
    for (let acc = 0, v = 255; v >= 0; v--) {
      acc += histogram[v]
      if (acc >= total * 0.01) { hi = v; break }
    }
    const range = Math.max(1, hi - lo)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const v = ((gray[p] - lo) * 255) / range
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ?? file
  } catch {
    return file
  }
}

/**
 * Runs OCR entirely in the browser via a dynamic import of tesseract.js.
 * The interface language and the OCR recognition language are separate —
 * this module never decides what language to show UI text in.
 */
export async function runOcr(file: File | Blob, opts: RunOcrOptions): Promise<OcrRunResult> {
  opts.onStage({ stageKey: 'preparing_image', progress: 5 })

  const Tesseract = await import('tesseract.js')
  const image = await preprocessImage(file)

  const langs = opts.includeMarathi ? WITH_MARATHI_LANGS : RELIABLE_DEFAULT_LANGS

  const makeLogger = (from: number, span: number) => (m: { status?: string; progress?: number }) => {
    const status = (m.status ?? '').toLowerCase()
    const pct = typeof m.progress === 'number' ? m.progress : 0
    if (status.includes('recognizing')) {
      opts.onStage({ stageKey: 'reading_document', progress: from + Math.round(pct * span) })
    } else if (status.includes('loading') || status.includes('initializ')) {
      opts.onStage({ stageKey: 'loading_language_model', progress: 10 + Math.round(pct * 30) })
    } else {
      opts.onStage({ stageKey: 'preparing_image', progress: 8 })
    }
  }

  let first: { text: string; confidence: number }
  let usedFallbackLang = false
  try {
    const { data } = await Tesseract.recognize(image, langs, { logger: makeLogger(40, 35) })
    first = { text: data.text ?? '', confidence: data.confidence ?? 0 }
  } catch (err) {
    if (!opts.includeMarathi) throw err
    // Marathi trained data could not load — fall back to the reliable default and let the caller
    // surface a non-blocking notice rather than failing the whole check.
    const { data } = await Tesseract.recognize(image, RELIABLE_DEFAULT_LANGS, { logger: makeLogger(40, 35) })
    first = { text: data.text ?? '', confidence: data.confidence ?? 0 }
    usedFallbackLang = true
  }

  if (opts.needsEnglishPass?.(first.text)) {
    try {
      const { data } = await Tesseract.recognize(image, ENGLISH_ONLY, { logger: makeLogger(75, 15) })
      return {
        text: `${first.text}\n${data.text ?? ''}`,
        confidence: Math.max(first.confidence, data.confidence ?? 0),
        usedFallbackLang,
      }
    } catch {
      // The first pass is still usable on its own.
    }
  }

  return { ...first, usedFallbackLang }
}
