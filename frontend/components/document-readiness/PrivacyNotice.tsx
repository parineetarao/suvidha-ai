'use client'

import { ShieldCheck, Info } from 'lucide-react'
import type { Lang } from '@/lib/strings'
import { DR, drt } from '@/lib/document-readiness/translations'

interface PrivacyNoticeProps {
  lang: Lang
  variant?: 'privacy' | 'safety'
  className?: string
}

export function PrivacyNotice({ lang, variant = 'privacy', className }: PrivacyNoticeProps) {
  const text = variant === 'privacy' ? drt(DR.common.privacyNotice, lang) : drt(DR.common.safetyNotice, lang)
  const Icon = variant === 'privacy' ? ShieldCheck : Info

  return (
    <div
      className={`flex items-start gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[8px] px-3 py-2.5 ${className ?? ''}`}
    >
      <Icon size={15} className="text-[#1A6B3C] flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-[11px] text-[#15803D] leading-[1.5]">{text}</p>
    </div>
  )
}
