'use client'

import type { DocLang, OCRStageUpdate } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'

interface OCRProgressProps {
  lang: DocLang
  stageKey: OCRStageUpdate['stageKey']
  progress: number
}

export function OCRProgress({ lang, stageKey, progress }: OCRProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const stageLabel = drt(DR.stages[stageKey], lang)

  return (
    <div className="w-full" aria-live="polite">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-[#57534E]">{stageLabel}</span>
        <span className="text-[11px] font-bold text-[#E8690B]" aria-hidden="true">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={drt(DR.a11y.progressLabel, lang)}
        className="w-full h-2 rounded-full bg-[#F4F1EC] overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-[#E8690B] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
