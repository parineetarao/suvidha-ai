'use client'

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { DocLang } from '@/lib/document-readiness/types'
import type { ReadinessScoreOutput } from '@/lib/document-readiness/readiness-score'
import { DR, drt } from '@/lib/document-readiness/translations'

interface ReadinessSummaryProps {
  lang: DocLang
  score: ReadinessScoreOutput
  compact?: boolean
}

function bandVisual(band: ReadinessScoreOutput['band']) {
  switch (band) {
    case 'ready':
      return { Icon: CheckCircle2, color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' }
    case 'review':
      return { Icon: AlertTriangle, color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' }
    default:
      return { Icon: XCircle, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
  }
}

export function ReadinessSummary({ lang, score, compact }: ReadinessSummaryProps) {
  const { Icon, color, bg, border } = bandVisual(score.band)
  const bandLabel = score.band === 'ready' ? drt(DR.score.readyToProceed, lang) : score.band === 'review' ? drt(DR.score.reviewIssues, lang) : drt(DR.score.fixIssues, lang)
  const nextAction =
    score.documentsChecked < score.documentsRequired
      ? drt(DR.score.nextActionUpload, lang)
      : score.documentsNeedingAttention > 0
      ? drt(DR.score.nextActionFix, lang)
      : drt(DR.score.nextActionDone, lang)

  if (compact) {
    return (
      <div className="rounded-[10px] border p-4 text-center" style={{ background: bg, borderColor: border }}>
        <Icon size={28} style={{ color }} className="mx-auto mb-2" aria-hidden="true" />
        <div className="text-[16px] font-bold" style={{ color, fontFamily: 'var(--font-libre-baskerville)' }}>
          {bandLabel}
        </div>
        <div className="text-[10px] text-[#78716C] mt-1">{drt(DR.score.title, lang)}: {score.score}/100</div>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border bg-white overflow-hidden" style={{ borderColor: border }}>
      <div className="p-4 flex items-center gap-3.5" style={{ background: bg }}>
        <Icon size={30} style={{ color }} className="flex-shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-[10px] uppercase font-bold tracking-wide" style={{ color }}>
            {drt(DR.score.applicationReadiness, lang)}
          </div>
          <div className="text-[17px] font-bold" style={{ color, fontFamily: 'var(--font-libre-baskerville)' }}>
            {bandLabel}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[26px] font-bold" style={{ color, fontFamily: 'var(--font-libre-baskerville)' }}>
            {score.score}
          </div>
          <div className="text-[9px] text-[#78716C] uppercase tracking-wide">{drt(DR.score.title, lang)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#F0EDE8] border-t border-[#F0EDE8]">
        <StatCell label={drt(DR.score.documentsRequired, lang)} value={score.documentsRequired} />
        <StatCell label={drt(DR.score.documentsChecked, lang)} value={score.documentsChecked} />
        <StatCell label={drt(DR.score.documentsReady, lang)} value={score.documentsReady} color="#15803D" />
        <StatCell label={drt(DR.score.documentsAttention, lang)} value={score.documentsNeedingAttention} color={score.documentsNeedingAttention > 0 ? '#B45309' : undefined} />
      </div>
      <div className="px-4 py-2.5 border-t border-[#F0EDE8] bg-[#FAF7F2]">
        <span className="text-[9px] uppercase font-bold text-[#A8A29E] tracking-wide">{drt(DR.score.nextAction, lang)}: </span>
        <span className="text-[11px] font-semibold text-[#1C1917]">{nextAction}</span>
      </div>
    </div>
  )
}

function StatCell({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-3 text-center">
      <div className="text-[18px] font-bold" style={{ color: color ?? '#1C1917', fontFamily: 'var(--font-libre-baskerville)' }}>
        {value}
      </div>
      <div className="text-[9px] text-[#78716C] leading-tight mt-0.5">{label}</div>
    </div>
  )
}
