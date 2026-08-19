'use client'

import { useRef } from 'react'
import { Camera, Upload } from 'lucide-react'
import type { DocLang } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_BYTES = 10 * 1024 * 1024

interface DocumentCameraModalProps {
  lang: DocLang
  disabled?: boolean
  inputIdPrefix: string
  onFile: (file: File) => void
  onError: (messageKey: 'invalidFileType' | 'fileTooLarge') => void
}

/**
 * Renders the "take photo" (mobile camera) and "upload" (desktop file picker) triggers.
 * Both accept the same image types; only the camera input requests `capture` so desktop
 * file selection is never blocked.
 */
export function DocumentCameraModal({ lang, disabled, inputIdPrefix, onFile, onError }: DocumentCameraModalProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const handleFiles = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return // user cancelled the picker

    if (!ACCEPTED_TYPES.includes(file.type)) {
      onError('invalidFileType')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      onError('fileTooLarge')
      return
    }
    onFile(file)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <label
        htmlFor={`${inputIdPrefix}-camera`}
        className={`flex-1 flex items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-[#FED7AA] bg-[#FFF8F1] text-[#C2570A] font-bold text-[13px] py-3 px-3 cursor-pointer hover:bg-[#FFEEDC] transition-colors min-h-[44px] ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Camera size={17} aria-hidden="true" />
        {drt(DR.common.takePhoto, lang)}
        <input
          ref={cameraInputRef}
          id={`${inputIdPrefix}-camera`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          aria-label={drt(DR.a11y.cameraInputLabel, lang)}
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      <label
        htmlFor={`${inputIdPrefix}-upload`}
        className={`flex-1 flex items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-[#E7E0D8] bg-white text-[#57534E] font-bold text-[13px] py-3 px-3 cursor-pointer hover:border-[#E8690B] hover:text-[#E8690B] transition-colors min-h-[44px] ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Upload size={17} aria-hidden="true" />
        {drt(DR.common.uploadFile, lang)}
        <input
          ref={uploadInputRef}
          id={`${inputIdPrefix}-upload`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={drt(DR.a11y.uploadInputLabel, lang)}
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
