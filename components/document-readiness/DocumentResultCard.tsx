'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Volume2, Pencil } from 'lucide-react'
import type { Lang } from '@/lib/strings'
import type { DocumentReadinessResult, ReadinessStatus } from '@/lib/document-readiness/types'
import { DR, drt, drtf } from '@/lib/document-readiness/translations'
import { speakText } from '@/lib/document-readiness/speech'

interface DocumentResultCardProps {
  lang: Lang
  result: DocumentReadinessResult
  compact?: boolean
  onNameCorrected: (name: string) => void
}

function statusVisual(status: ReadinessStatus) {
  switch (status) {
    case 'ready':
      return { Icon: CheckCircle2, bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D' }
    case 'warning':
      return { Icon: AlertTriangle, bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' }
    case 'unclear':
      return { Icon: HelpCircle, bg: '#F4F1EC', border: '#E7E0D8', color: '#78716C' }
    case 'error':
      return { Icon: XCircle, bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' }
    default:
      return { Icon: HelpCircle, bg: '#F4F1EC', border: '#E7E0D8', color: '#78716C' }
  }
}

export function DocumentResultCard({ lang, result, compact, onNameCorrected }: DocumentResultCardProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(result.extractedName ?? '')

  const { Icon, bg, border, color } = statusVisual(result.status)
  const docTypeMismatchIssue = result.issues.find((i) => i.code === 'doc_type_mismatch')
  const nameMismatchIssue = result.issues.find((i) => i.code === 'name_mismatch')

  const simpleSentence =
    result.status === 'ready'
      ? drt(DR.simpleStatus.ready, lang)
      : nameMismatchIssue
      ? drt(DR.simpleStatus.mismatch, lang)
      : result.status === 'unclear'
      ? drt(DR.simpleStatus.unclear, lang)
      : drt(DR.simpleStatus.warning, lang)

  const confidenceLabel =
    result.confidence === 'high' ? drt(DR.full.confidenceHigh, lang) : result.confidence === 'medium' ? drt(DR.full.confidenceMedium, lang) : drt(DR.full.confidenceLow, lang)

  return (
    <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: border }}>
      <div className="flex items-start gap-2.5 p-3.5" style={{ background: bg }}>
        <Icon size={20} style={{ color }} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold" style={{ color }}>
              {drt(DR.status[result.status], lang)}
            </span>
            {result.isDemo && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                {drt(DR.common.demoLabel, lang)}
              </span>
            )}
            {!compact && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/70 border" style={{ borderColor: border, color }}>
                {drt(DR.full.confidence, lang)}: {confidenceLabel}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-[1.6] mt-1" style={{ color: '#1C1917' }}>
            {compact ? simpleSentence : result.status === 'ready' ? drt(DR.successMessage, lang) : simpleSentence}
          </p>
          {docTypeMismatchIssue && (
            <p className="text-[11px] leading-[1.5] mt-1.5 font-semibold" style={{ color: '#B45309' }}>
              {drtf(DR.mismatchWarning, lang, drt(DR.documentTypes[result.documentType], lang))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => speakText(simpleSentence, lang)}
          aria-label={drt(DR.common.listen, lang)}
          className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-1.5 border bg-white hover:opacity-80 transition-opacity"
          style={{ borderColor: border, color }}
        >
          <Volume2 size={13} aria-hidden="true" />
          {drt(DR.common.listen, lang)}
        </button>
      </div>

      <div className="p-3.5 bg-white">
        {/* Name read from document */}
        <div className="mb-3">
          <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-1">{drt(DR.common.nameReadFromDocument, lang)}</div>
          {editingName ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label={drt(DR.common.correctName, lang)}
                className="flex-1 border-[1.5px] border-[#E7E0D8] rounded-[6px] px-2.5 py-2 text-[13px] text-[#1C1917] outline-none focus:border-[#E8690B]"
                style={{ fontSize: 16 }}
              />
              <button
                type="button"
                onClick={() => {
                  onNameCorrected(nameDraft.trim())
                  setEditingName(false)
                }}
                className="rounded-[6px] bg-[#1A6B3C] text-white text-[12px] font-bold px-3 py-2 min-h-[44px]"
              >
                {drt(DR.common.save, lang)}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-[#1C1917]">
                {result.extractedName || <span className="text-[#A8A29E] italic font-normal">{drt(DR.common.enterYourName, lang)}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(result.extractedName ?? '')
                  setEditingName(true)
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-[#1565C0] hover:underline"
              >
                <Pencil size={12} aria-hidden="true" />
                {drt(DR.common.correctName, lang)}
              </button>
            </div>
          )}
        </div>

        {/* Extracted fields — full mode only */}
        {!compact && Object.keys(result.extractedFields).length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-1.5">{drt(DR.full.extractedFields, lang)}</div>
            <div className="grid grid-cols-2 gap-2">
              {result.extractedFields.aadhaarLastFour && (
                <FieldChip label="Aadhaar" value={`XXXX-XXXX-${result.extractedFields.aadhaarLastFour}`} />
              )}
              {result.extractedFields.accountNumberLastFour && (
                <FieldChip label="A/C No." value={`•••• ${result.extractedFields.accountNumberLastFour}`} />
              )}
              {result.extractedFields.ifsc && <FieldChip label="IFSC" value={result.extractedFields.ifsc} />}
              {result.extractedFields.incomeAmount && <FieldChip label="Income" value={result.extractedFields.incomeAmount} />}
              {result.extractedFields.year && <FieldChip label="Year" value={String(result.extractedFields.year)} />}
              {result.extractedFields.dateOfBirth && <FieldChip label="DOB" value={result.extractedFields.dateOfBirth} />}
            </div>
          </div>
        )}

        {/* Issues + suggestions */}
        {result.issues.length > 0 && (!compact || result.status !== 'ready') && (
          <div className="mb-3 space-y-1.5">
            {!compact && <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-1">{drt(DR.full.issuesAndSuggestions, lang)}</div>}
            {result.issues.slice(0, compact ? 2 : undefined).map((issue, i) => (
              <div key={`${issue.code}-${i}`} className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] px-2.5 py-2">
                <div className="text-[11px] font-bold text-[#92400E]">{drt((DR.issues as any)[toIssueDictKey(issue.code)]?.message ?? DR.errors.genericError, lang)}</div>
                <div className="text-[10px] text-[#78716C] mt-0.5">
                  {drt((DR.issues as any)[toIssueDictKey(issue.code)]?.suggestion ?? DR.errors.genericError, lang)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Raw OCR text — collapsible, hidden by default */}
        {result.extractedText && !result.isDemo && (
          <details className="mt-2">
            <summary className="text-[11px] font-bold text-[#57534E] cursor-pointer select-none">{drt(DR.common.whatWasRead, lang)}</summary>
            <div className="mt-1.5 text-[10px] text-[#78716C] leading-[1.6] whitespace-pre-wrap bg-[#F4F1EC] rounded-[6px] p-2 max-h-[160px] overflow-y-auto">
              {result.extractedText}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function FieldChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#F4F1EC] rounded-[6px] px-2 py-1.5">
      <div className="text-[8px] uppercase font-bold text-[#A8A29E]">{label}</div>
      <div className="text-[11px] font-semibold text-[#1C1917] truncate">{value}</div>
    </div>
  )
}

const ISSUE_CODE_TO_DICT_KEY: Record<string, string> = {
  text_too_short: 'textTooShort',
  name_unreadable: 'nameUnreadable',
  name_mismatch: 'nameMismatch',
  doc_type_mismatch: 'docTypeMismatch',
  aadhaar_number_not_found: 'aadhaarNumberNotFound',
  dob_not_found: 'dobNotFound',
  account_number_not_found: 'accountNumberNotFound',
  ifsc_not_found: 'ifscNotFound',
  not_details_page: 'notDetailsPage',
  income_amount_not_found: 'incomeAmountNotFound',
  issuing_authority_not_found: 'issuingAuthorityNotFound',
  certificate_outdated: 'certificateOutdated',
  ration_terms_not_found: 'rationTermsNotFound',
  family_info_not_found: 'familyInfoNotFound',
  land_identifier_not_found: 'landIdentifierNotFound',
  owner_name_initials: 'ownerNameInitials',
  caste_terms_not_found: 'casteTermsNotFound',
  reference_number_not_found: 'referenceNumberNotFound',
  domicile_terms_not_found: 'domicileTermsNotFound',
  date_or_ref_not_found: 'dateOrRefNotFound',
}

function toIssueDictKey(code: string): string {
  return ISSUE_CODE_TO_DICT_KEY[code] ?? code
}
