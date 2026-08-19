'use client'

import { useState, type ReactNode } from 'react'
import { FileEdit, Landmark, MapPinned, ScanLine, AlertTriangle } from 'lucide-react'
import { S, g } from '@/lib/strings'
import { DR, drt } from '@/lib/document-readiness/translations'
import type { DocLang, RequiredDocumentRef, DocumentType } from '@/lib/document-readiness/types'
import type { ProfileData } from '@/app/full/page'

interface ApplicationPreparationFormProps {
  lang: DocLang
  schemeName: string
  requiredDocuments: RequiredDocumentRef[]
  profileData: ProfileData
  onFieldChange: (field: keyof ProfileData, value: string) => void
  onBack: () => void
  onSubmit: () => void
}

type FieldErrors = Partial<Record<keyof ProfileData, string>>

function maskAccountDisplay(value: string): string {
  const digits = value.replace(/\s/g, '')
  if (digits.length <= 4) return digits
  return '•'.repeat(digits.length - 4) + digits.slice(-4)
}

function validateForm(data: ProfileData, lang: DocLang): FieldErrors {
  const errors: FieldErrors = {}
  const required = g(S.full.validationRequired, lang)

  const requiredFields: (keyof ProfileData)[] = [
    'fullName', 'age', 'gender', 'state', 'district', 'mobileNumber',
    'aadhaarBankLinked', 'farmerCategory', 'landOwnership', 'landArea',
    'surveyNumber', 'bankName', 'accountNumber', 'ifscCode',
  ]
  requiredFields.forEach((field) => {
    if (!data[field] || !String(data[field]).trim()) errors[field] = required
  })

  if (data.mobileNumber && !errors.mobileNumber && !/^[6-9]\d{9}$/.test(data.mobileNumber.trim())) {
    errors.mobileNumber = g(S.full.validationMobile, lang)
  }
  if (data.ifscCode && !errors.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode.trim().toUpperCase())) {
    errors.ifscCode = g(S.full.validationIfsc, lang)
  }
  if (data.landArea && !errors.landArea && (Number.isNaN(Number(data.landArea)) || Number(data.landArea) <= 0)) {
    errors.landArea = g(S.full.validationLandArea, lang)
  }

  return errors
}

function FieldWrap({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-[#57534E] block mb-1">
        {label}
        {required && <span className="text-[#DC2626] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-[#DC2626] mt-1">{error}</p>}
    </div>
  )
}

const inputClass = (hasError?: boolean) =>
  `w-full border-[1.5px] rounded-[7px] px-3 py-2.5 text-[13px] text-[#1C1917] outline-none transition-colors bg-white ${
    hasError ? 'border-[#FECACA] focus:border-[#DC2626]' : 'border-[#E7E0D8] focus:border-[#E8690B]'
  }`

export function ApplicationPreparationForm({
  lang,
  schemeName,
  requiredDocuments,
  profileData,
  onFieldChange,
  onBack,
  onSubmit,
}: ApplicationPreparationFormProps) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [accountFocused, setAccountFocused] = useState(false)
  const [checkedDocs, setCheckedDocs] = useState<Partial<Record<DocumentType, boolean>>>({})

  const handleSubmit = () => {
    const nextErrors = validateForm(profileData, lang)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onSubmit()
  }

  const genderOptions = [
    { value: 'male', label: g(S.full.genderMale, lang) },
    { value: 'female', label: g(S.full.genderFemale, lang) },
    { value: 'other', label: g(S.full.genderOther, lang) },
  ]
  const farmerCategoryOptions = [
    { value: 'marginal', label: g(S.full.farmerCategoryMarginal, lang) },
    { value: 'small', label: g(S.full.farmerCategorySmall, lang) },
    { value: 'other', label: g(S.full.farmerCategoryOther, lang) },
  ]
  const landOwnershipOptions = [
    { value: 'owned', label: g(S.full.landOwnershipOwned, lang) },
    { value: 'joint', label: g(S.full.landOwnershipJoint, lang) },
    { value: 'leased', label: g(S.full.landOwnershipLeased, lang) },
  ]
  const yesNoOptions = [
    { value: 'yes', label: g(S.full.yesOption, lang) },
    { value: 'no', label: g(S.full.noOption, lang) },
  ]

  const select = (field: keyof ProfileData, options: { value: string; label: string }[]) => (
    <select
      value={profileData[field]}
      onChange={(e) => onFieldChange(field, e.target.value)}
      className={inputClass(!!errors[field])}
    >
      <option value="">{g(S.full.selectPlaceholder, lang)}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )

  const text = (field: keyof ProfileData, opts?: { type?: string; placeholder?: string }) => (
    <input
      type={opts?.type ?? 'text'}
      value={profileData[field]}
      onChange={(e) => onFieldChange(field, e.target.value)}
      placeholder={opts?.placeholder}
      className={inputClass(!!errors[field])}
      style={{ fontSize: 16 }}
    />
  )

  return (
    <div className="max-w-[760px] mx-auto pb-8">
      <button
        type="button"
        onClick={onBack}
        className="text-[11px] font-bold text-[#78716C] hover:text-[#E8690B] transition-colors mb-3"
      >
        {g(S.full.backToOverview, lang)}
      </button>

      <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <FileEdit size={17} className="text-[#E8690B]" aria-hidden="true" />
          <h2 className="text-[16px] font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
            {g(S.full.applicationFormTitle, lang)}
          </h2>
        </div>
        <p className="text-[10px] text-[#A8A29E] mb-1">{schemeName}</p>
        <p className="text-[11px] text-[#78716C] leading-[1.5] mb-4">{g(S.full.applicationFormSubtitle, lang)}</p>

        {Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[7px] px-3 py-2 mb-4" role="alert" aria-live="assertive">
            <AlertTriangle size={14} className="text-[#DC2626] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-[#DC2626] leading-[1.5]">{g(S.full.validationFixErrors, lang)}</p>
          </div>
        )}

        {/* Personal details */}
        <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-2">{g(S.full.formSectionPersonal, lang)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <FieldWrap label={g(S.full.labelName, lang)} required error={errors.fullName}>{text('fullName')}</FieldWrap>
          <FieldWrap label={g(S.full.labelAge, lang)} required error={errors.age}>{text('age', { type: 'number' })}</FieldWrap>
          <FieldWrap label={g(S.full.labelGender, lang)} required error={errors.gender}>{select('gender', genderOptions)}</FieldWrap>
          <FieldWrap label={g(S.full.labelState, lang)} required error={errors.state}>{text('state')}</FieldWrap>
          <FieldWrap label={g(S.full.labelDistrict, lang)} required error={errors.district}>{text('district')}</FieldWrap>
          <FieldWrap label={g(S.full.labelMobile, lang)} required error={errors.mobileNumber}>
            {text('mobileNumber', { type: 'tel', placeholder: '98XXXXXXXX' })}
          </FieldWrap>
        </div>

        {/* Land details */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-2">
          <MapPinned size={12} aria-hidden="true" />
          {g(S.full.formSectionLand, lang)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <FieldWrap label={g(S.full.labelFarmerCategory, lang)} required error={errors.farmerCategory}>
            {select('farmerCategory', farmerCategoryOptions)}
          </FieldWrap>
          <FieldWrap label={g(S.full.labelLandOwnership, lang)} required error={errors.landOwnership}>
            {select('landOwnership', landOwnershipOptions)}
          </FieldWrap>
          <FieldWrap label={g(S.full.labelLandArea, lang)} required error={errors.landArea}>
            {text('landArea', { type: 'number', placeholder: '2' })}
          </FieldWrap>
          <FieldWrap label={g(S.full.labelSurveyNumber, lang)} required error={errors.surveyNumber}>
            {text('surveyNumber', { placeholder: '214/2A' })}
          </FieldWrap>
        </div>

        {/* Bank details */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-2">
          <Landmark size={12} aria-hidden="true" />
          {g(S.full.formSectionBank, lang)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldWrap label={g(S.full.labelAadhaarBankLinked, lang)} required error={errors.aadhaarBankLinked}>
            {select('aadhaarBankLinked', yesNoOptions)}
          </FieldWrap>
          <FieldWrap label={g(S.full.labelBankName, lang)} required error={errors.bankName}>
            {text('bankName')}
          </FieldWrap>
          <FieldWrap label={g(S.full.labelAccountNumber, lang)} required error={errors.accountNumber}>
            <input
              type="text"
              inputMode="numeric"
              value={accountFocused ? profileData.accountNumber : maskAccountDisplay(profileData.accountNumber)}
              onFocus={() => setAccountFocused(true)}
              onBlur={() => setAccountFocused(false)}
              onChange={(e) => onFieldChange('accountNumber', e.target.value.replace(/\D/g, ''))}
              className={inputClass(!!errors.accountNumber)}
              style={{ fontSize: 16 }}
            />
          </FieldWrap>
          <FieldWrap label={g(S.full.labelIfsc, lang)} required error={errors.ifscCode}>
            <input
              type="text"
              value={profileData.ifscCode}
              onChange={(e) => onFieldChange('ifscCode', e.target.value.toUpperCase())}
              placeholder="SBIN0001234"
              className={inputClass(!!errors.ifscCode)}
              style={{ fontSize: 16, textTransform: 'uppercase' }}
            />
          </FieldWrap>
        </div>
      </div>

      {/* Required documents checklist */}
      <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-5 mb-4">
        <h3 className="text-[14px] font-bold text-[#1C1917] mb-3" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
          {g(S.full.requiredDocumentsForScheme, lang)}
        </h3>
        <div className="space-y-2">
          {requiredDocuments.map((ref) => (
            <label
              key={ref.type}
              className="flex items-start gap-3 border border-[#E7E0D8] rounded-[8px] p-3 cursor-pointer hover:border-[#E8690B] transition-colors"
            >
              <input
                type="checkbox"
                checked={!!checkedDocs[ref.type]}
                onChange={(e) => setCheckedDocs((prev) => ({ ...prev, [ref.type]: e.target.checked }))}
                className="w-[18px] h-[18px] mt-0.5 accent-[#1A6B3C] flex-shrink-0"
                aria-label={`${drt(DR.documentTypes[ref.type], lang)} — ${g(S.full.iHaveThisDocument, lang)}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-[#1C1917]">{drt(DR.documentTypes[ref.type], lang)}</span>
                  <span
                    className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      ref.required ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#F4F1EC] text-[#A8A29E]'
                    }`}
                  >
                    {ref.required ? drt(DR.common.required, lang) : drt(DR.common.optional, lang)}
                  </span>
                </div>
                <p className="text-[10.5px] text-[#78716C] mt-0.5">{drt(DR.reasons[ref.reasonKey as keyof typeof DR.reasons], lang)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-2 bg-[#E8690B] text-white font-bold text-[14px] rounded-[9px] py-3.5 hover:bg-[#D05B09] transition-colors"
      >
        <ScanLine size={17} aria-hidden="true" />
        {g(S.full.checkDocumentReadinessBtn, lang)}
      </button>
    </div>
  )
}
