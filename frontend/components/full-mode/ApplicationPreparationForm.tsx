'use client'

import { useState, type ReactNode } from 'react'
import { FileEdit, Landmark, MapPinned, GraduationCap, Home, HeartPulse, Briefcase, Users, ScanLine, AlertTriangle } from 'lucide-react'
import { S, g } from '@/lib/strings'
import { DR, drt } from '@/lib/document-readiness/translations'
import type { DocLang, RequiredDocumentRef, DocumentType } from '@/lib/document-readiness/types'
import type { ProfileData } from '@/app/full/page'

interface ApplicationPreparationFormProps {
  lang: DocLang
  schemeName: string
  // Real backend scheme.category, bucketed by full/page.tsx's
  // getSchemeCategory() — 'farmer' | 'housing' | 'health' | 'business' |
  // 'women' | 'student' | 'general'. Drives which Part 2 fields show; never
  // guessed inside this component.
  schemeCategory: string
  requiredDocuments: RequiredDocumentRef[]
  profileData: ProfileData
  onFieldChange: (field: keyof ProfileData, value: string) => void
  onBack: () => void
  onSubmit: () => void
}

type FieldErrors = Partial<Record<keyof ProfileData, string>>
type FormStep = 1 | 2

function maskAccountDisplay(value: string): string {
  const digits = value.replace(/\s/g, '')
  if (digits.length <= 4) return digits
  return '•'.repeat(digits.length - 4) + digits.slice(-4)
}

function getCategoryLabel(category: string, lang: DocLang): string {
  switch (category) {
    case 'farmer': return g(S.full.categoryLabelFarmer, lang)
    case 'housing': return g(S.full.categoryLabelHousing, lang)
    case 'health': return g(S.full.categoryLabelHealth, lang)
    case 'business': return g(S.full.categoryLabelBusiness, lang)
    case 'women': return g(S.full.categoryLabelWomen, lang)
    case 'student': return g(S.full.categoryLabelStudent, lang)
    default: return g(S.full.categoryLabelGeneral, lang)
  }
}

// Part 1 — identity, contact, and bank/DBT details. These genuinely apply
// to every applicant regardless of which scheme they're applying to (every
// scheme in this system pays out via bank transfer), so they're never
// gated behind a scheme category.
const BASIC_FIELDS: (keyof ProfileData)[] = [
  'fullName', 'age', 'gender', 'state', 'district', 'mobileNumber', 'income',
  'aadhaarBankLinked', 'bankName', 'accountNumber', 'ifscCode',
]

// Part 2 — which fields are required per scheme category, and thus which
// section renders. Grounded in the real `eligibility_rules` /
// `documents_required` seen on published schemes per category (e.g.
// agriculture schemes require occupation=farmer + a land_record document;
// health/housing schemes gate on BPL/ration-card status; the one real
// women-gated scheme in the DB restricts by gender + a girl-child max age) —
// not invented. 'general' has no domain-specific fields.
const DOMAIN_FIELDS: Record<string, (keyof ProfileData)[]> = {
  farmer: ['farmerCategory', 'landOwnership', 'landArea', 'surveyNumber'],
  housing: ['currentHouse', 'bplCard'],
  health: ['rationCardType'],
  business: ['businessType', 'businessAge', 'existingLoan'],
  women: ['bplCard', 'girlChildAge'],
  student: ['institutionName', 'course', 'yearOfStudy', 'marksOrPercentage'],
  general: ['occupation'],
}

function validateBasicFields(data: ProfileData, lang: DocLang): FieldErrors {
  const errors: FieldErrors = {}
  const required = g(S.full.validationRequired, lang)

  BASIC_FIELDS.forEach((field) => {
    if (!data[field] || !String(data[field]).trim()) errors[field] = required
  })

  if (data.mobileNumber && !errors.mobileNumber && !/^[6-9]\d{9}$/.test(data.mobileNumber.trim())) {
    errors.mobileNumber = g(S.full.validationMobile, lang)
  }
  if (data.ifscCode && !errors.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode.trim().toUpperCase())) {
    errors.ifscCode = g(S.full.validationIfsc, lang)
  }

  return errors
}

function validateDomainFields(data: ProfileData, category: string, lang: DocLang): FieldErrors {
  const errors: FieldErrors = {}
  const required = g(S.full.validationRequired, lang)
  const fields = DOMAIN_FIELDS[category] ?? DOMAIN_FIELDS.general

  fields.forEach((field) => {
    if (!data[field] || !String(data[field]).trim()) errors[field] = required
  })

  if (fields.includes('landArea') && data.landArea && !errors.landArea && (Number.isNaN(Number(data.landArea)) || Number(data.landArea) <= 0)) {
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
  schemeCategory,
  requiredDocuments,
  profileData,
  onFieldChange,
  onBack,
  onSubmit,
}: ApplicationPreparationFormProps) {
  const [step, setStep] = useState<FormStep>(1)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [accountFocused, setAccountFocused] = useState(false)
  const [checkedDocs, setCheckedDocs] = useState<Partial<Record<DocumentType, boolean>>>({})

  const categoryLabel = getCategoryLabel(schemeCategory, lang)
  const domainFields = DOMAIN_FIELDS[schemeCategory] ?? DOMAIN_FIELDS.general

  const handleNext = () => {
    const nextErrors = validateBasicFields(profileData, lang)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setErrors({})
    setStep(2)
  }

  const handleBackToBasic = () => {
    setErrors({})
    setStep(1)
  }

  const handleSubmit = () => {
    const nextErrors = validateDomainFields(profileData, schemeCategory, lang)
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
  const currentHouseOptions = [
    { value: 'kutcha', label: g(S.full.currentHouseKutcha, lang) },
    { value: 'semi_pucca', label: g(S.full.currentHouseSemiPucca, lang) },
    { value: 'pucca', label: g(S.full.currentHousePucca, lang) },
  ]
  const rationCardOptions = [
    { value: 'bpl', label: g(S.full.rationCardBpl, lang) },
    { value: 'apl', label: g(S.full.rationCardApl, lang) },
    { value: 'other', label: g(S.full.rationCardOther, lang) },
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

  const stepBadge = (
    <div className="text-[10px] font-bold uppercase tracking-wide text-[#E8690B] mb-1">
      {step === 1
        ? g(S.full.stepPart1Label, lang)
        : `${g(S.full.stepPart2Prefix, lang)} ${categoryLabel} ${g(S.full.detailsWord, lang)}`}
    </div>
  )

  const categoryIcon = () => {
    switch (schemeCategory) {
      case 'farmer': return <MapPinned size={12} aria-hidden="true" />
      case 'housing': return <Home size={12} aria-hidden="true" />
      case 'health': return <HeartPulse size={12} aria-hidden="true" />
      case 'business': return <Briefcase size={12} aria-hidden="true" />
      case 'women': return <Users size={12} aria-hidden="true" />
      case 'student': return <GraduationCap size={12} aria-hidden="true" />
      default: return <FileEdit size={12} aria-hidden="true" />
    }
  }

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
        {stepBadge}
        <p className="text-[11px] text-[#78716C] leading-[1.5] mb-4">{g(S.full.applicationFormSubtitle, lang)}</p>

        {Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[7px] px-3 py-2 mb-4" role="alert" aria-live="assertive">
            <AlertTriangle size={14} className="text-[#DC2626] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-[#DC2626] leading-[1.5]">{g(S.full.validationFixErrors, lang)}</p>
          </div>
        )}

        {step === 1 && (
          <>
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
              <FieldWrap label={g(S.full.labelIncome, lang)} required error={errors.income}>
                {text('income', { type: 'number', placeholder: '150000' })}
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
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide mb-2">
              {categoryIcon()}
              {categoryLabel} {g(S.full.detailsWord, lang)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {domainFields.includes('farmerCategory') && (
                <FieldWrap label={g(S.full.labelFarmerCategory, lang)} required error={errors.farmerCategory}>
                  {select('farmerCategory', farmerCategoryOptions)}
                </FieldWrap>
              )}
              {domainFields.includes('landOwnership') && (
                <FieldWrap label={g(S.full.labelLandOwnership, lang)} required error={errors.landOwnership}>
                  {select('landOwnership', landOwnershipOptions)}
                </FieldWrap>
              )}
              {domainFields.includes('landArea') && (
                <FieldWrap label={g(S.full.labelLandArea, lang)} required error={errors.landArea}>
                  {text('landArea', { type: 'number', placeholder: '2' })}
                </FieldWrap>
              )}
              {domainFields.includes('surveyNumber') && (
                <FieldWrap label={g(S.full.labelSurveyNumber, lang)} required error={errors.surveyNumber}>
                  {text('surveyNumber', { placeholder: '214/2A' })}
                </FieldWrap>
              )}

              {domainFields.includes('currentHouse') && (
                <FieldWrap label={g(S.full.labelCurrentHouse, lang)} required error={errors.currentHouse}>
                  {select('currentHouse', currentHouseOptions)}
                </FieldWrap>
              )}
              {domainFields.includes('bplCard') && (
                <FieldWrap label={g(S.full.labelBplStatus, lang)} required error={errors.bplCard}>
                  {select('bplCard', yesNoOptions)}
                </FieldWrap>
              )}

              {domainFields.includes('rationCardType') && (
                <FieldWrap label={g(S.full.labelRationCardType, lang)} required error={errors.rationCardType}>
                  {select('rationCardType', rationCardOptions)}
                </FieldWrap>
              )}

              {domainFields.includes('businessType') && (
                <FieldWrap label={g(S.full.labelBusinessType, lang)} required error={errors.businessType}>
                  {text('businessType')}
                </FieldWrap>
              )}
              {domainFields.includes('businessAge') && (
                <FieldWrap label={g(S.full.labelBusinessAge, lang)} required error={errors.businessAge}>
                  {text('businessAge', { placeholder: '2 years' })}
                </FieldWrap>
              )}
              {domainFields.includes('existingLoan') && (
                <FieldWrap label={g(S.full.labelExistingLoan, lang)} required error={errors.existingLoan}>
                  {select('existingLoan', yesNoOptions)}
                </FieldWrap>
              )}

              {domainFields.includes('girlChildAge') && (
                <FieldWrap label={g(S.full.labelGirlChildAge, lang)} required error={errors.girlChildAge}>
                  {text('girlChildAge', { type: 'number' })}
                </FieldWrap>
              )}

              {domainFields.includes('institutionName') && (
                <FieldWrap label={g(S.full.labelInstitutionName, lang)} required error={errors.institutionName}>
                  {text('institutionName')}
                </FieldWrap>
              )}
              {domainFields.includes('course') && (
                <FieldWrap label={g(S.full.labelCourse, lang)} required error={errors.course}>
                  {text('course')}
                </FieldWrap>
              )}
              {domainFields.includes('yearOfStudy') && (
                <FieldWrap label={g(S.full.labelYearOfStudy, lang)} required error={errors.yearOfStudy}>
                  {text('yearOfStudy', { placeholder: '2' })}
                </FieldWrap>
              )}
              {domainFields.includes('marksOrPercentage') && (
                <FieldWrap label={g(S.full.labelMarksOrPercentage, lang)} required error={errors.marksOrPercentage}>
                  {text('marksOrPercentage', { type: 'number', placeholder: '75' })}
                </FieldWrap>
              )}

              {domainFields.includes('occupation') && (
                <FieldWrap label={g(S.full.labelOccupation, lang)} required error={errors.occupation}>
                  {text('occupation')}
                </FieldWrap>
              )}
            </div>
            {schemeCategory === 'general' && (
              <p className="text-[10.5px] text-[#A8A29E] mt-3">{g(S.full.generalDetailsHint, lang)}</p>
            )}
          </>
        )}
      </div>

      {step === 1 && (
        <button
          type="button"
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-2 bg-[#E8690B] text-white font-bold text-[14px] rounded-[9px] py-3.5 hover:bg-[#D05B09] transition-colors"
        >
          {g(S.full.nextButtonPrefix, lang)} {categoryLabel} {g(S.full.detailsWord, lang)} →
        </button>
      )}

      {step === 2 && (
        <>
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBackToBasic}
              className="flex-shrink-0 border-[1.5px] border-[#E7E0D8] text-[#57534E] font-bold text-[13px] rounded-[9px] px-5 hover:border-[#E8690B] hover:text-[#E8690B] transition-colors"
            >
              {g(S.full.backToBasicInfo, lang)}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 flex items-center justify-center gap-2 bg-[#E8690B] text-white font-bold text-[14px] rounded-[9px] py-3.5 hover:bg-[#D05B09] transition-colors"
            >
              <ScanLine size={17} aria-hidden="true" />
              {g(S.full.checkDocumentReadinessBtn, lang)}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
