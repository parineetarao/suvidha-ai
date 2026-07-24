import type { ImageQualityWarning } from './types'

const MIN_DIMENSION = 480

/**
 * Lightweight, browser-side heuristics run before OCR. These only ever produce
 * warnings (never hard failures) because none of them can be certain — lighting,
 * scanners and phone cameras vary too much to claim certainty from pixels alone.
 */
export async function assessImageQuality(bitmap: ImageBitmap): Promise<ImageQualityWarning[]> {
  const warnings: ImageQualityWarning[] = []

  if (bitmap.width < MIN_DIMENSION || bitmap.height < MIN_DIMENSION) {
    warnings.push({ code: 'too_small', messageKey: 'too_small' })
  }

  const canvas = document.createElement('canvas')
  // Downscale for fast pixel analysis — quality signals don't need full resolution.
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return warnings

  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  let sum = 0
  let sumSq = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[p] = l
    sum += l
    sumSq += l * l
  }
  const n = gray.length
  const mean = sum / n
  const variance = sumSq / n - mean * mean
  const stdDev = Math.sqrt(Math.max(0, variance))

  if (mean < 55) warnings.push({ code: 'too_dark', messageKey: 'too_dark' })
  else if (mean > 225) warnings.push({ code: 'too_bright', messageKey: 'too_bright' })

  if (stdDev < 28) warnings.push({ code: 'low_contrast', messageKey: 'low_contrast' })

  // Simple Laplacian-based edge-strength approximation for blur detection.
  let laplacianSumSq = 0
  let laplacianSum = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - w] -
        gray[idx + w]
      laplacianSum += lap
      laplacianSumSq += lap * lap
      count++
    }
  }
  if (count > 0) {
    const lapMean = laplacianSum / count
    const lapVariance = laplacianSumSq / count - lapMean * lapMean
    // Low edge-energy variance across the frame suggests limited fine detail — a soft proxy for blur.
    if (lapVariance < 120) {
      warnings.push({ code: 'possibly_blurry', messageKey: 'possibly_blurry' })
    }
  }

  return warnings
}

export async function loadImageBitmapFromFile(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file)
}
