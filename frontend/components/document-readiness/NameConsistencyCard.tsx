'use client'

import { AlertTriangle } from 'lucide-react'
import type { DocLang, NameComparison, DocumentType } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'

interface NameConsistencyCardProps {
  lang: DocLang
  profileName: string
  comparisons: NameComparison[]
  compact?: boolean
  onGoToDocument?: (type: DocumentType) => void
}

function labelColor(label: NameComparison['label']) {
  switch (label) {
    case 'match':
      return { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' }
    case 'minor_variation':
      return { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' }
    case 'mismatch':
      return { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' }
    default:
      return { bg: '#F4F1EC', color: '#78716C', border: '#E7E0D8' }
  }
}

export function NameConsistencyCard({ lang, profileName, comparisons, compact, onGoToDocument }: NameConsistencyCardProps) {
  if (comparisons.length === 0) return null

  const hasIssue = comparisons.some((c) => c.label === 'mismatch' || c.label === 'minor_variation')
  if (!hasIssue && compact) return null

  if (compact) {
    return (
      <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
        <div className="flex items-start gap-2">
          <AlertTriangle size={17} className="text-[#B45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-[13px] font-bold text-[#92400E] mb-1.5">{drt(DR.nameMatch.simpleFoundDifferent, lang)}</div>
            <ul className="space-y-1 mb-2">
              {comparisons.map((c) => (
                <li key={c.documentType} className="text-[12px] text-[#78716C]">
                  <span className="font-semibold text-[#1C1917]">{drt(DR.documentTypes[c.documentType], lang)}:</span> {c.extractedName}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[#92400E] leading-[1.5]">{drt(DR.nameMatch.simpleCheckPrompt, lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-[#E7E0D8] bg-white overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#E7E0D8] bg-[#FAF7F2]">
        <span className="text-[12px] font-bold text-[#1C1917]">{drt(DR.nameMatch.crossDocTitle, lang)}</span>
        <span className="text-[10px] text-[#A8A29E] ml-2">({drt(DR.common.yourName, lang)}: {profileName})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: 480 }}>
          <thead>
            <tr className="text-[9px] uppercase font-bold text-[#A8A29E] tracking-wide">
              <th className="px-3.5 py-2">{drt(DR.nameMatch.tableHeaderDocument, lang)}</th>
              <th className="px-3.5 py-2">{drt(DR.nameMatch.tableHeaderName, lang)}</th>
              <th className="px-3.5 py-2">{drt(DR.nameMatch.tableHeaderComparison, lang)}</th>
              <th className="px-3.5 py-2">{drt(DR.nameMatch.tableHeaderAction, lang)}</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => {
              const colors = labelColor(c.label)
              return (
                <tr key={c.documentType} className="border-t border-[#F0EDE8]">
                  <td className="px-3.5 py-2.5 text-[12px] font-semibold text-[#1C1917] whitespace-nowrap">{drt(DR.documentTypes[c.documentType], lang)}</td>
                  <td className="px-3.5 py-2.5 text-[12px] text-[#57534E]">{c.extractedName || '—'}</td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className="text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap"
                      style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}
                    >
                      {drt(DR.nameMatch.label[c.label], lang)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {(c.label === 'mismatch' || c.label === 'minor_variation') && onGoToDocument && (
                      <button
                        type="button"
                        onClick={() => onGoToDocument(c.documentType)}
                        className="text-[11px] font-bold text-[#1565C0] hover:underline"
                      >
                        {drt(DR.common.correctName, lang)}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {(comparisons.some((c) => c.label === 'mismatch') || comparisons.some((c) => c.label === 'minor_variation')) && (
        <div className="px-3.5 py-2.5 border-t border-[#F0EDE8] bg-[#FFFBEB]">
          <p className="text-[10px] text-[#92400E] leading-[1.5]">{drt(DR.nameMatch.generalCaution, lang)}</p>
        </div>
      )}
    </div>
  )
}
