'use client'

import { RefreshCw, Trash2, ScanLine } from 'lucide-react'
import type { Lang } from '@/lib/strings'
import { DR, drt } from '@/lib/document-readiness/translations'
import { DocumentCameraModal } from './DocumentCameraModal'

interface DocumentUploadCardProps {
  lang: Lang
  previewUrl: string | null
  isProcessing: boolean
  hasResult: boolean
  onFileSelected: (file: File) => void
  onRemove: () => void
  onRunCheck: () => void
  onError: (messageKey: 'invalidFileType' | 'fileTooLarge') => void
  inputIdPrefix: string
}

export function DocumentUploadCard({
  lang,
  previewUrl,
  isProcessing,
  hasResult,
  onFileSelected,
  onRemove,
  onRunCheck,
  onError,
  inputIdPrefix,
}: DocumentUploadCardProps) {
  if (!previewUrl) {
    return (
      <div>
        <DocumentCameraModal lang={lang} disabled={isProcessing} inputIdPrefix={inputIdPrefix} onFile={onFileSelected} onError={onError} />
      </div>
    )
  }

  return (
    <div>
      <div className="relative rounded-[8px] overflow-hidden border border-[#E7E0D8] bg-[#F4F1EC] mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral in-memory object URL, not an optimizable asset */}
        <img src={previewUrl} alt="" className="w-full max-h-[220px] object-contain bg-[#1C1917]/5" />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onRunCheck}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 rounded-[8px] bg-[#E8690B] text-white font-bold text-[13px] py-3 px-3 hover:bg-[#D05B09] transition-colors min-h-[44px] disabled:opacity-60"
        >
          <ScanLine size={17} aria-hidden="true" />
          {isProcessing ? drt(DR.common.checking, lang) : hasResult ? drt(DR.common.recheck, lang) : drt(DR.common.checkDocument, lang)}
        </button>
        <label
          htmlFor={`${inputIdPrefix}-replace`}
          className={`flex-1 flex items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-[#E7E0D8] bg-white text-[#57534E] font-bold text-[13px] py-3 px-3 cursor-pointer hover:border-[#E8690B] hover:text-[#E8690B] transition-colors min-h-[44px] ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {drt(DR.common.replaceImage, lang)}
          <input
            id={`${inputIdPrefix}-replace`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={drt(DR.common.replaceImage, lang)}
            disabled={isProcessing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) onError('invalidFileType')
                else if (file.size > 10 * 1024 * 1024) onError('fileTooLarge')
                else onFileSelected(file)
              }
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          disabled={isProcessing}
          aria-label={drt(DR.a11y.removeImageLabel, lang)}
          className="flex items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] font-bold text-[13px] py-3 px-3 hover:bg-[#FEE2E2] transition-colors min-h-[44px] disabled:opacity-60"
        >
          <Trash2 size={16} aria-hidden="true" />
          <span className="sm:hidden">{drt(DR.common.removeImage, lang)}</span>
        </button>
      </div>
    </div>
  )
}
