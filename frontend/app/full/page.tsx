'use client'

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { S, g, gf, type Lang, type Str } from '@/lib/strings'
import type { DocumentType, DocumentReadinessResult, RequiredDocumentRef, NameComparison, DocLang } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'
import { compareNames } from '@/lib/document-readiness/name-matching'
import { computeReadinessScore } from '@/lib/document-readiness/readiness-score'
import { loadStoredResults, saveStoredResult, clearStoredResults } from '@/lib/document-readiness/storage'
import { verifyDocument } from '@/lib/documents'
import { getCurrentPosition, getNearbyCscs, type CSCOut } from '@/lib/csc'
import { transcribeAudio } from '@/lib/voice'
import { DocumentReadinessCheck } from '@/components/document-readiness/DocumentReadinessCheck'
import { NameConsistencyCard } from '@/components/document-readiness/NameConsistencyCard'
import { ReadinessSummary } from '@/components/document-readiness/ReadinessSummary'
import { ApplicationPreparationForm } from '@/components/full-mode/ApplicationPreparationForm'
import { FileCheck2, Trash2 } from 'lucide-react'
import { apiPatch, apiPut, ApiError as ApiClientError } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { toUserPatchPayload, toProfilePutPayload } from "@/lib/profile-mapping"
import {
  createApplication,
  listApplications,
  updateApplication,
  generateLetter,
  type ApplicationOut,
  type ApplicationStatus,
} from "@/lib/applications"
import {
  searchSchemes as apiSearchSchemes,
  getScheme as apiGetScheme,
  compareSchemes as apiCompareSchemes,
  listSchemes as apiListSchemes,
  ApiError,
  type ApiLanguage,
  type SchemeMatch as ApiSchemeMatch,
  type SchemeDetail as ApiSchemeDetail,
  type MatchReason as ApiMatchReason,
} from '@/lib/api'

// Was hardcoded to only 3 outcomes (hi/mr/everything-else-as-en), matching
// the language selector's old 3-option limit. Now that the selector below
// offers all 10, this needs to actually map every one of them — this is
// also the mapping voice input reuses for its lang param (see startVoice),
// since ApiLanguage and VoiceLanguage are the same 10-code set.
const LANG_TO_API_LANGUAGE: Record<Lang, ApiLanguage> = {
  'en-IN': 'en', 'hi-IN': 'hi', 'mr-IN': 'mr', 'ta-IN': 'ta', 'te-IN': 'te',
  'kn-IN': 'kn', 'ml-IN': 'ml', 'bn-IN': 'bn', 'gu-IN': 'gu', 'pa-IN': 'pa',
}

function toApiLanguage(lang: Lang): ApiLanguage {
  return LANG_TO_API_LANGUAGE[lang] ?? 'en'
}

// The document-readiness subsystem's DocLang props are Hindi/Marathi/English
// only by design (its own translation dictionary was never expanded to all
// 10 — same documented scope limit Simple Mode already has). Same narrowing
// function Simple Mode uses for the identical constraint, just operating on
// the wider Lang type here instead of Simple Mode's local UiLang.
function toDocCheckLang(lang: Lang): DocLang {
  return lang === 'mr-IN' || lang === 'en-IN' ? lang : 'hi-IN'
}

type ActivePanel = 'schemes' | 'compare' | 'prep' | 'tracker' | 'csc' | 'helpline'
type EligibilityStatus = 'eligible' | 'partial' | 'ineligible'

type SchemeItem = {
  id: number
  schemeId: string
  // Real DB UUID (Scheme.id, distinct from schemeId/scheme_code above) —
  // only known once GET /schemes/{id} resolves (search results don't carry
  // it). Needed to call POST /applications {scheme_id}. Empty until then.
  dbId: string
  nameHindi: string
  nameEnglish: string
  nameMr: string
  logoText: string
  logoColor: string
  headerColor: string
  ministry: string
  category: string | null
  // Real eligibility_rules signals, carried through for getSchemeCategory()
  // to fall back on when `category` text is empty/too vague (e.g. many
  // real published schemes are gender:"female"-gated with no category set
  // at all, or use a generic label like "welfare"/"employment").
  eligibilityGender: string | null
  eligibilityOccupations: string[]
  amount: string
  unit: string
  unitHindi: string
  unitMr: string
  eligibility: EligibilityStatus
  matchScore: number
  matchLabel: string
  warning: string | null
  warningHindi: string | null
  warningMr: string | null
  applicationModes: string[]
  rejectionRisks: { risk: string; fix: string }[]
  rejectionRisksHindi: { risk: string; fix: string }[]
  rejectionRisksMr: { risk: string; fix: string }[]
  steps: { text: string; mode: 'online' | 'offline' | 'csc' }[]
  stepsHindi: string[]
  stepsMr: string[]
  documents: string[]
  documentsHindi: string[]
  documentsMr: string[]
  officialUrl: string
  requiredDocuments: RequiredDocumentRef[]
  reasons: ApiMatchReason[]
}

function getSchemeName(scheme: SchemeItem, lang: Lang): string {
  if (lang === 'en-IN') return scheme.nameEnglish
  if (lang === 'mr-IN') return scheme.nameMr
  return scheme.nameHindi
}
function getSchemeUnit(scheme: SchemeItem, lang: Lang): string {
  if (lang === 'mr-IN') return scheme.unitMr
  if (lang === 'hi-IN') return scheme.unitHindi
  return scheme.unit
}
function getSchemeWarning(scheme: SchemeItem, lang: Lang): string | null {
  if (lang === 'mr-IN') return scheme.warningMr
  if (lang === 'hi-IN') return scheme.warningHindi
  return scheme.warning
}
function getSchemeRejectionRisks(scheme: SchemeItem, lang: Lang): { risk: string; fix: string }[] {
  if (lang === 'mr-IN') return scheme.rejectionRisksMr
  if (lang === 'hi-IN') return scheme.rejectionRisksHindi
  return scheme.rejectionRisks
}
function getSchemeStepTexts(scheme: SchemeItem, lang: Lang): string[] {
  if (lang === 'mr-IN') return scheme.stepsMr
  if (lang === 'hi-IN') return scheme.stepsHindi
  return scheme.steps.map(s => s.text)
}
function getSchemeDocuments(scheme: SchemeItem, lang: Lang): string[] {
  if (lang === 'mr-IN') return scheme.documentsMr
  if (lang === 'hi-IN') return scheme.documentsHindi
  return scheme.documents
}

export type ProfileData = {
  fullName: string
  age: string
  state: string
  occupation: string
  income: string
  land: string
  landOwnership: string
  aadhaarBankLinked: string
  currentHouse: string
  bplCard: string
  familySize: string
  rationCardType: string
  businessType: string
  businessAge: string
  existingLoan: string
  maritalStatus: string
  lpgConnection: string
  girlChildAge: string
  qualification: string
  institutionName: string
  // Application Preparation Form (scheme-specific sample application)
  gender: string
  district: string
  mobileNumber: string
  farmerCategory: string
  landArea: string
  surveyNumber: string
  bankName: string
  accountNumber: string
  ifscCode: string
  // Student-category domain fields (Application Preparation Form, Part 2)
  course: string
  yearOfStudy: string
  marksOrPercentage: string
}

const PALETTE = [
  { header: '#1A6B3C', logo: '#1A6B3C' },
  { header: '#E8690B', logo: '#E8690B' },
  { header: '#1565C0', logo: '#1565C0' },
  { header: '#6A1B9A', logo: '#6A1B9A' },
  { header: '#880E4F', logo: '#880E4F' },
  { header: '#0F766E', logo: '#0F766E' },
]

function paletteFor(index: number) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

function eligibilityFromScore(score: number): EligibilityStatus {
  if (score >= 70) return 'eligible'
  if (score >= 40) return 'partial'
  return 'ineligible'
}

/**
 * Real backend adapters — replace the old hardcoded `allSchemes` mock data.
 *
 * POST /schemes/search only returns relevance data (name, match_score,
 * reasons, warnings), so matchToSchemeItem() leaves ministry/documents/steps
 * empty; those are filled in by detailToSchemeItem() once GET
 * /schemes/{id} is called for the selected scheme. The three nameHindi/
 * nameEnglish/nameMr (etc.) fields all get the same value because the
 * backend already resolves translation server-side for the requested
 * `language` — there is no client-side multi-language scheme data anymore.
 */
function matchToSchemeItem(match: ApiSchemeMatch, index: number): SchemeItem {
  const colors = paletteFor(index)
  const name = match.name
  const warning = match.warnings[0] ?? null
  return {
    id: index,
    schemeId: match.scheme_id,
    dbId: '',
    nameHindi: name, nameEnglish: name, nameMr: name,
    logoText: name.charAt(0).toUpperCase(),
    logoColor: colors.logo,
    headerColor: colors.header,
    ministry: '',
    category: null,
    eligibilityGender: null,
    eligibilityOccupations: [],
    amount: '',
    unit: '', unitHindi: '', unitMr: '',
    eligibility: eligibilityFromScore(match.match_score),
    matchScore: match.match_score,
    matchLabel: match.match_score >= 70 ? 'High Match' : 'Partial Match',
    warning, warningHindi: warning, warningMr: warning,
    applicationModes: [],
    rejectionRisks: [], rejectionRisksHindi: [], rejectionRisksMr: [],
    steps: [], stepsHindi: [], stepsMr: [],
    documents: [], documentsHindi: [], documentsMr: [],
    officialUrl: '',
    requiredDocuments: [],
    reasons: match.reasons,
  }
}

function detailToSchemeItem(
  detail: ApiSchemeDetail,
  index: number,
  matchScore: number,
  reasons: ApiMatchReason[],
  warnings: string[]
): SchemeItem {
  const colors = paletteFor(index)
  const name = detail.name
  const warning = detail.warning ?? warnings[0] ?? null
  const applyStepText = (mode: string) => `Apply via ${mode}`
  const applyMode = (mode: string): 'online' | 'offline' | 'csc' => {
    const m = mode.toLowerCase()
    if (m.includes('csc')) return 'csc'
    if (m.includes('online')) return 'online'
    return 'offline'
  }
  return {
    id: index,
    schemeId: detail.scheme_code,
    dbId: detail.id,
    nameHindi: name, nameEnglish: name, nameMr: name,
    logoText: name.charAt(0).toUpperCase(),
    logoColor: colors.logo,
    headerColor: colors.header,
    ministry: detail.ministry ?? '',
    category: detail.category,
    eligibilityGender: detail.eligibility_rules?.gender ?? null,
    eligibilityOccupations: detail.eligibility_rules?.occupations ?? [],
    amount: detail.benefits ?? detail.description ?? '',
    unit: '', unitHindi: '', unitMr: '',
    eligibility: eligibilityFromScore(matchScore),
    matchScore,
    matchLabel: matchScore >= 70 ? 'High Match' : 'Partial Match',
    warning, warningHindi: warning, warningMr: warning,
    applicationModes: detail.application_modes,
    rejectionRisks: detail.rejection_risks,
    rejectionRisksHindi: detail.rejection_risks,
    rejectionRisksMr: detail.rejection_risks,
    steps: detail.application_modes.map(mode => ({ text: applyStepText(mode), mode: applyMode(mode) })),
    stepsHindi: detail.application_modes.map(mode => `${mode} के ज़रिए आवेदन करें`),
    stepsMr: detail.application_modes.map(mode => `${mode} मार्गे अर्ज करा`),
    documents: detail.documents_required,
    documentsHindi: detail.documents_required,
    documentsMr: detail.documents_required,
    officialUrl: detail.application_url ?? detail.source_url ?? '',
    requiredDocuments: documentsRequiredToRefs(detail.documents_required),
    reasons,
  }
}

const EMPTY_SCHEME: SchemeItem = matchToSchemeItem(
  { scheme_id: '', name: '', match_score: 0, reasons: [], warnings: [] },
  0
)

/** Generic (not scheme-specific — the backend doesn't return per-scheme
 * guidance text) next-step copy per real ApplicationStatus, for the
 * Tracker cards. */
function getNextStepText(status: ApplicationStatus, lang: Lang): string {
  const copy: Record<ApplicationStatus, Str> = {
    draft: { 'en-IN': 'Complete your profile and required documents to continue.', 'hi-IN': 'जारी रखने के लिए अपनी प्रोफ़ाइल और आवश्यक दस्तावेज़ पूरे करें।', 'mr-IN': 'सुरू ठेवण्यासाठी तुमची प्रोफाइल आणि आवश्यक कागदपत्रे पूर्ण करा.' },
    docs_pending: { 'en-IN': 'Upload and verify your required documents in Application Preparation.', 'hi-IN': '"आवेदन तैयारी" में अपने आवश्यक दस्तावेज़ अपलोड और सत्यापित करें।', 'mr-IN': '"अर्ज तयारी" मध्ये तुमची आवश्यक कागदपत्रे अपलोड आणि सत्यापित करा.' },
    letter_generated: { 'en-IN': 'Print or carry your preparation document to a CSC centre to submit.', 'hi-IN': 'जमा करने के लिए अपना तैयारी दस्तावेज़ प्रिंट करें या CSC केंद्र ले जाएं।', 'mr-IN': 'सादर करण्यासाठी तुमचा तयारी दस्तऐवज प्रिंट करा किंवा CSC केंद्रात घेऊन जा.' },
    submitted: { 'en-IN': 'Your application has been submitted and is awaiting review.', 'hi-IN': 'आपका आवेदन जमा हो चुका है और समीक्षा की प्रतीक्षा में है।', 'mr-IN': 'तुमचा अर्ज सादर झाला आहे आणि समीक्षेच्या प्रतीक्षेत आहे.' },
    under_review: { 'en-IN': 'Your application is under review by the department.', 'hi-IN': 'आपका आवेदन विभाग द्वारा समीक्षा में है।', 'mr-IN': 'तुमचा अर्ज विभागाकडून समीक्षेत आहे.' },
    approved: { 'en-IN': 'Your application has been approved.', 'hi-IN': 'आपका आवेदन स्वीकृत हो गया है।', 'mr-IN': 'तुमचा अर्ज मंजूर झाला आहे.' },
    rejected: { 'en-IN': 'Your application was rejected. You can re-apply from Application Preparation.', 'hi-IN': 'आपका आवेदन अस्वीकृत हो गया। आप "आवेदन तैयारी" से दोबारा आवेदन कर सकते हैं।', 'mr-IN': 'तुमचा अर्ज नाकारला गेला. तुम्ही "अर्ज तयारी" मधून पुन्हा अर्ज करू शकता.' },
  }
  return g(copy[status], lang)
}

/** Real ApplicationStatus -> status pill style/label, replacing the old
 * 4-value fake AppStatus mapping (getStatusStyle) which didn't cover the
 * actual 7-state backend state machine (application_service.TRANSITIONS). */
function getRealStatusStyle(s: ApplicationStatus, lang: Lang) {
  const map: Record<ApplicationStatus, { label: string; bg: string; color: string; border: string }> = {
    draft: { label: g(S.full.statusDraft, lang), bg: '#F4F1EC', color: '#78716C', border: '#E7E0D8' },
    docs_pending: { label: g(S.full.statusDocsPending, lang), bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    letter_generated: { label: g(S.full.statusLetterGenerated, lang), bg: '#FFF8F1', color: '#E8690B', border: '#FDE0C4' },
    submitted: { label: g(S.full.statusSubmitted, lang), bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    under_review: { label: g(S.full.statusUnderReview, lang), bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    approved: { label: g(S.full.statusApproved, lang), bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    rejected: { label: g(S.full.statusRejected, lang), bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  }
  return map[s]
}

// Sequential progress through the 5 forward states before the two terminal
// branches (approved/rejected) — used to fill in the Tracker card's stepper.
const STATUS_STEP_ORDER: ApplicationStatus[] = ['draft', 'docs_pending', 'letter_generated', 'submitted', 'under_review']
function getStatusStepIndex(status: ApplicationStatus): number {
  if (status === 'approved') return STATUS_STEP_ORDER.length
  if (status === 'rejected') return STATUS_STEP_ORDER.indexOf('under_review') + 1
  const i = STATUS_STEP_ORDER.indexOf(status)
  return i === -1 ? 0 : i + 1
}

const helplineData = [
  { name: 'Central Scheme Helpline', nameHindi: 'केंद्रीय योजना हेल्पलाइन', nameMr: 'केंद्रीय योजना हेल्पलाइन', number: '155261', hours: 'Mon–Sat · 9AM–6PM', hoursHindi: 'सोम–शनि · सुबह 9–शाम 6', hoursMr: 'सोम–शनि · सकाळी 9–संध्या. 6', languages: 'Hindi · English · Regional', languagesHindi: 'हिंदी · अंग्रेज़ी · क्षेत्रीय', languagesMr: 'हिंदी · इंग्रजी · प्रादेशिक', category: 'General', categoryHindi: 'सामान्य', categoryMr: 'सामान्य', categoryBg: '#F4F1EC', categoryColor: '#78716C', btnColor: '#1A6B3C' },
  { name: 'PM Kisan Helpline', nameHindi: 'पीएम किसान हेल्पलाइन', nameMr: 'पीएम किसान हेल्पलाइन', number: '155261', hours: 'Mon–Fri · 9AM–5PM', hoursHindi: 'सोम–शुक्र · सुबह 9–शाम 5', hoursMr: 'सोम–शुक्र · सकाळी 9–संध्या. 5', languages: 'Hindi · English · Regional', languagesHindi: 'हिंदी · अंग्रेज़ी · क्षेत्रीय', languagesMr: 'हिंदी · इंग्रजी · प्रादेशिक', category: 'Agriculture', categoryHindi: 'कृषि', categoryMr: 'शेती', categoryBg: '#F0FDF4', categoryColor: '#15803D', btnColor: '#1A6B3C' },
  { name: 'Ayushman Bharat Helpline', nameHindi: 'आयुष्मान भारत हेल्पलाइन', nameMr: 'आयुष्मान भारत हेल्पलाइन', number: '14555', hours: '24 × 7 Available', hoursHindi: '24 × 7 उपलब्ध', hoursMr: '24 × 7 उपलब्ध', languages: 'Hindi · English', languagesHindi: 'हिंदी · अंग्रेज़ी', languagesMr: 'हिंदी · इंग्रजी', category: 'Health', categoryHindi: 'स्वास्थ्य', categoryMr: 'आरोग्य', categoryBg: '#FEF2F2', categoryColor: '#DC2626', btnColor: '#DC2626' },
  { name: 'CSC Centre Helpline', nameHindi: 'CSC केंद्र हेल्पलाइन', nameMr: 'CSC केंद्र हेल्पलाइन', number: '1800-121-3468', hours: 'Mon–Sat · 9AM–6PM', hoursHindi: 'सोम–शनि · सुबह 9–शाम 6', hoursMr: 'सोम–शनि · सकाळी 9–संध्या. 6', languages: 'Hindi · English', languagesHindi: 'हिंदी · अंग्रेज़ी', languagesMr: 'हिंदी · इंग्रजी', category: 'CSC', categoryHindi: 'CSC', categoryMr: 'CSC', categoryBg: '#EFF6FF', categoryColor: '#1D4ED8', btnColor: '#1565C0' },
  { name: 'PM Awas Yojana Helpline', nameHindi: 'पीएम आवास योजना हेल्पलाइन', nameMr: 'पीएम आवास योजना हेल्पलाइन', number: '1800-11-6446', hours: 'Mon–Fri · 9AM–6PM', hoursHindi: 'सोम–शुक्र · सुबह 9–शाम 6', hoursMr: 'सोम–शुक्र · सकाळी 9–संध्या. 6', languages: 'Hindi · English', languagesHindi: 'हिंदी · अंग्रेज़ी', languagesMr: 'हिंदी · इंग्रजी', category: 'Housing', categoryHindi: 'आवास', categoryMr: 'गृहनिर्माण', categoryBg: '#F0FDF4', categoryColor: '#15803D', btnColor: '#1A6B3C' },
  { name: 'PMKVY Skill Helpline', nameHindi: 'PMKVY कौशल हेल्पलाइन', nameMr: 'PMKVY कौशल्य हेल्पलाइन', number: '1800-123-9626', hours: 'Mon–Fri · 9AM–6PM', hoursHindi: 'सोम–शुक्र · सुबह 9–शाम 6', hoursMr: 'सोम–शुक्र · सकाळी 9–संध्या. 6', languages: 'Hindi · English', languagesHindi: 'हिंदी · अंग्रेज़ी', languagesMr: 'हिंदी · इंग्रजी', category: 'Education', categoryHindi: 'शिक्षा', categoryMr: 'शिक्षण', categoryBg: '#EFF6FF', categoryColor: '#1D4ED8', btnColor: '#1565C0' }
]

const visitScripts = {
  hindi: '"नमस्ते। मुझे PM Kisan Samman Nidhi के लिए registration करवाना है। मैं एक किसान हूँ। कृपया New Farmer Registration में मदद करें।"',
  marathi: '"नमस्कार। मला PM Kisan Samman Nidhi साठी registration करायचे आहे. मी एक शेतकरी आहे. कृपया मदत करा."',
  english: '"Hello. I want to register for PM Kisan Samman Nidhi. I am a farmer. Please help me with New Farmer Registration."'
}

function getEligibilityColor(e: EligibilityStatus): string {
  if (e === 'eligible') return '#1A6B3C'
  if (e === 'partial') return '#D97706'
  return '#DC2626'
}

/** Maps a scheme to one of the fixed buckets the Application Preparation
 * form's Part 2 (domain-specific fields) is keyed on: farmer, housing,
 * health, business, women, student, or general.
 *
 * Two-stage, audited against every distinct `category` value actually
 * present in the real `schemes` table (agriculture, education, employment,
 * health, housing, welfare, plus ~54/62 published schemes with no category
 * at all — checked live via psql, not assumed):
 *
 * 1. Keyword-match the free-text `category` field where it's specific
 *    enough to trust directly (e.g. "agriculture" -> farmer,
 *    "employment"/"self-employed" -> business — real myScheme-style
 *    category labels for loan/business schemes like PM Mudra Yojana).
 * 2. Where `category` is empty or too generic to trust alone (empty, or
 *    "welfare" — a label real schemes use for everything from girl-child
 *    savings schemes to LPG connections to old-age support), fall back to
 *    the scheme's actual `eligibility_rules` (occupations / gender), which
 *    is real structured data already fetched for this scheme. This matters
 *    a lot in practice: 16 real published schemes are gender:"female"-
 *    gated, but only 2 of them have category="welfare" — the other 14 have
 *    NO category set at all, so text-matching alone would wrongly bucket
 *    all of them as 'general'.
 *
 * No "senior citizen" or "disability" bucket exists because no real
 * published scheme currently carries a structured signal for either —
 * eligibility_rules has no disability field at all, and zero published
 * schemes have min_age >= 55 (checked live via psql). Inventing fields for
 * a category with zero real backing would be guessing, not data-driven
 * classification — if/when such data appears, this is the one function to
 * extend.
 */
function getSchemeCategory(scheme: SchemeItem): string {
  const c = (scheme.category ?? '').toLowerCase()
  if (c.includes('farm') || c.includes('agri') || c.includes('कृषि')) return 'farmer'
  if (c.includes('hous') || c.includes('awas') || c.includes('rural dev')) return 'housing'
  if (c.includes('health') || c.includes('medical')) return 'health'
  if (c.includes('business') || c.includes('finance') || c.includes('loan') || c.includes('msme') || c.includes('employment') || c.includes('self-employ') || c.includes('entrepreneur')) return 'business'
  if (c.includes('women') || c.includes('girl')) return 'women'
  if (c.includes('student') || c.includes('educat') || c.includes('skill')) return 'student'

  const occupations = scheme.eligibilityOccupations.map((o) => o.toLowerCase())
  if (occupations.includes('farmer')) return 'farmer'
  if (occupations.includes('student')) return 'student'
  if (occupations.includes('business_owner') || occupations.includes('entrepreneur')) return 'business'
  if (scheme.eligibilityGender === 'female') return 'women'

  return 'general'
}

/** Best-effort mapping from the backend's free-text `documents_required`
 * strings (e.g. "Aadhaar Card", "Bank Passbook copy") to the fixed
 * DocumentType enum the document-readiness checklist UI is built on.
 * `labelKey` is unused by every current render path (DR.documentTypes[type]
 * drives the visible label instead) — kept only to satisfy the interface. */
function documentsRequiredToRefs(documents: string[]): RequiredDocumentRef[] {
  const seen = new Set<DocumentType>()
  const refs: RequiredDocumentRef[] = []
  for (const raw of documents) {
    const d = raw.toLowerCase()
    let type: DocumentType = 'other'
    let reasonKey = 'identityProof'
    if (d.includes('aadhaar') || d.includes('aadhar')) { type = 'aadhaar'; reasonKey = 'identityProof' }
    else if (d.includes('bank') || d.includes('passbook') || d.includes('account')) { type = 'bank_passbook'; reasonKey = 'directBenefitTransfer' }
    else if (d.includes('income')) { type = 'income_certificate'; reasonKey = 'incomeProof' }
    else if (d.includes('ration')) { type = 'ration_card'; reasonKey = 'householdProof' }
    else if (d.includes('land') || d.includes('7/12') || d.includes('khata') || d.includes('property')) { type = 'land_record'; reasonKey = 'landOwnershipProof' }
    else if (d.includes('caste')) { type = 'caste_certificate'; reasonKey = 'categoryProof' }
    else if (d.includes('domicile') || d.includes('residence')) { type = 'domicile_certificate'; reasonKey = 'residenceProof' }
    else if (d.includes('photo')) { type = 'passport_photo'; reasonKey = 'photoRequirement' }
    if (seen.has(type)) continue
    seen.add(type)
    refs.push({ type, required: true, labelKey: type, reasonKey })
  }
  return refs
}

function FullModePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Core state
  const [activePanel, setActivePanel] = useState<ActivePanel>('schemes')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SchemeItem[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedScheme, setSelectedScheme] = useState<SchemeItem>(EMPTY_SCHEME)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareList, setCompareList] = useState<SchemeItem[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [checkedDocs, setCheckedDocs] = useState<Record<number, boolean>>({ 0: true, 1: true })
  const [referenceNumber, setReferenceNumber] = useState('')
  const [scriptLang, setScriptLang] = useState<'hindi' | 'marathi' | 'english'>('hindi')
  const [selectedCSC, setSelectedCSC] = useState(0)
  const [cscList, setCscList] = useState<CSCOut[]>([])
  const [cscStatus, setCscStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [cscErrorMessage, setCscErrorMessage] = useState<string | null>(null)
  const [trackerFilter, setTrackerFilter] = useState('all')
  // Voice input — same real backend (POST /voice/transcribe, faster-whisper)
  // and MediaRecorder pattern as Simple Mode's startRecording, not raw
  // browser SpeechRecognition. isRecording = mic actively capturing,
  // isTranscribing = audio sent, waiting on the backend.
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const { user, isAuthenticated, logout } = useAuth()
  const [sortBy, setSortBy] = useState('match')
  // Widened from a 3-language ('hi-IN'|'mr-IN'|'en-IN') selector to the
  // full app-wide Lang (10 codes) so voice input — and the search/compare
  // API calls, which already went through toApiLanguage — can actually be
  // used in all 10. The document-readiness subsystem's DocLang props are
  // still Hindi/Marathi/English only by design; toDocCheckLang() (module
  // scope, above) narrows down to that at each of those call sites
  // instead, same pattern Simple Mode already uses for the same constraint.
  const [lang, setLang] = useState<Lang>('en-IN')

  // Profile state
  const [hasProfile, setHasProfile] = useState(false)
  const [applicationStatus, setApplicationStatus] = useState<'idle' | 'creating' | 'created' | 'exists' | 'error'>('idle')
  const [showProfileForm, setShowProfileForm] = useState(false)

  // Real applications (GET /applications) — backs both the Tracker panel
  // and the sidebar badge. schemeNamesById is a lazy cache resolved via
  // GET /schemes/{id} since ApplicationOut only carries scheme_id, not name.
  const [applications, setApplications] = useState<ApplicationOut[]>([])
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const [applicationsError, setApplicationsError] = useState<string | null>(null)
  const [schemeNamesById, setSchemeNamesById] = useState<Record<string, string>>({})
  // The application row tied to the currently selected scheme, once known —
  // resolved either from a fresh createApplication() call or, for a
  // pre-existing ('exists') application, by matching selectedScheme.dbId
  // against the applications list. Needed to call generate-letter.
  const [currentApplicationId, setCurrentApplicationId] = useState<string | null>(null)
  const [letterStatus, setLetterStatus] = useState<'idle' | 'generating' | 'done' | 'error' | 'unavailable'>('idle')
  const [letterTextByAppId, setLetterTextByAppId] = useState<Record<string, string>>({})
  const [letterCopied, setLetterCopied] = useState(false)
  // Mirrors `applications` for reads inside selectScheme without adding it
  // as a dependency — selectScheme must not re-create (and re-run) every
  // time the applications list refreshes.
  const applicationsRef = useRef<ApplicationOut[]>([])
  useEffect(() => { applicationsRef.current = applications }, [applications])

  const refreshApplications = useCallback(async () => {
    setApplicationsLoading(true)
    setApplicationsError(null)
    try {
      const list = await listApplications()
      setApplications(list)
      return list
    } catch {
      setApplicationsError(g(S.full.trackerLoadError, lang))
      return null
    } finally {
      setApplicationsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  useEffect(() => {
    refreshApplications()
    // Only on mount — the badge/tracker refresh explicitly after actions
    // that change the applications list (create, generate-letter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lazily resolve scheme names for whatever's in `applications` but not yet
  // cached. GET /schemes/{id} can't be used here — it looks a scheme up by
  // scheme_code (see lib/api.ts's listSchemes comment), but
  // ApplicationOut.scheme_id is the scheme's real `id` UUID, so that lookup
  // always 404s for an application's scheme_id. GET /schemes (list) does
  // return `id` alongside `name`, so that's the source used instead.
  useEffect(() => {
    const missing = applications.some((a) => !(a.scheme_id in schemeNamesById))
    if (!missing) return
    let cancelled = false
    apiListSchemes(100)
      .then((page) => {
        if (cancelled) return
        setSchemeNamesById((prev) => {
          const next = { ...prev }
          for (const s of page.items) next[s.id] = s.name
          return next
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications])
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: '', age: '', state: '', occupation: '', income: '',
    land: '', landOwnership: '', aadhaarBankLinked: '',
    currentHouse: '', bplCard: '', familySize: '', rationCardType: '',
    businessType: '', businessAge: '', existingLoan: '',
    maritalStatus: '', lpgConnection: '', girlChildAge: '',
    qualification: '', institutionName: '',
    gender: '', district: '', mobileNumber: '', farmerCategory: '',
    landArea: '', surveyNumber: '', bankName: '', accountNumber: '', ifscCode: '',
    course: '', yearOfStudy: '', marksOrPercentage: ''
  })

  // Document Readiness Check state
  const [docResults, setDocResults] = useState<Partial<Record<DocumentType, DocumentReadinessResult>>>({})
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(null)
  const [hasStoredDocData, setHasStoredDocData] = useState(false)
  const [docVerifyStatus, setDocVerifyStatus] = useState<Partial<Record<DocumentType, 'pending' | 'synced' | 'failed'>>>({})

  useEffect(() => {
    const stored = loadStoredResults()
    setHasStoredDocData(Object.keys(stored).length > 0)
  }, [])

  const requiredDocs: RequiredDocumentRef[] = selectedScheme.requiredDocuments
  const activeDocType: DocumentType = selectedDocType ?? requiredDocs[0]?.type ?? 'aadhaar'
  const activeDocRef = requiredDocs.find((d) => d.type === activeDocType)

  const nameComparisons: NameComparison[] = requiredDocs
    .map((ref) => docResults[ref.type])
    .filter((r): r is DocumentReadinessResult => !!r && !!r.extractedName)
    .map((r) => {
      const cmp = compareNames(profileData.fullName, r.extractedName)
      return { documentType: r.documentType, extractedName: r.extractedName ?? '', label: cmp.label, similarity: cmp.similarity }
    })

  const docReadinessScore = computeReadinessScore({ requiredDocs, results: docResults, nameComparisons })

  const handleDocResult = (type: DocumentType, result: DocumentReadinessResult | null) => {
    setDocResults((prev) => {
      const next = { ...prev }
      if (result) {
        next[type] = result
        saveStoredResult(result, docReadinessScore.score)
      } else {
        delete next[type]
      }
      return next
    })

    if (result && (result.status === 'ready' || result.status === 'warning')) {
      setDocVerifyStatus((prev) => ({ ...prev, [type]: 'pending' }))
      verifyDocument(result)
        .then(() => setDocVerifyStatus((prev) => ({ ...prev, [type]: 'synced' })))
        .catch(() => setDocVerifyStatus((prev) => ({ ...prev, [type]: 'failed' })))
    } else if (!result) {
      setDocVerifyStatus((prev) => {
        const next = { ...prev }
        delete next[type]
        return next
      })
    }
  }

  const clearDocReadinessData = () => {
    setDocResults({})
    clearStoredResults()
    setHasStoredDocData(false)
  }

  // POST /applications/{id}/generate-letter is only legal from
  // "docs_pending" (application_service.TRANSITIONS); a fresh application
  // is "draft", so this first nudges it forward with PATCH /applications/{id}
  // when needed, then generates. The result is cached client-side
  // (letterTextByAppId) because a second generate-letter call for the same
  // application always 400s (letter_service.py can't transition
  // "letter_generated" -> "letter_generated") — this is a real backend
  // constraint, not something to work around by calling it again.
  const handleGenerateLetter = async () => {
    if (!currentApplicationId) return
    if (letterTextByAppId[currentApplicationId]) return // already have it, nothing to do
    const current = applications.find((a) => a.id === currentApplicationId)
    // Letter text isn't persisted server-side (LetterOut is generated
    // on-the-fly, not stored) — if this application already moved past
    // "docs_pending" in an earlier session, generate-letter would 400
    // (InvalidTransition) rather than return the letter again. Surface that
    // plainly instead of firing a doomed request.
    if (current && current.status !== 'draft' && current.status !== 'docs_pending') {
      setLetterStatus('unavailable')
      return
    }
    setLetterStatus('generating')
    try {
      if (current?.status === 'draft') {
        await updateApplication(currentApplicationId, { status: 'docs_pending' })
      }
      const letter = await generateLetter(currentApplicationId)
      setLetterTextByAppId((prev) => ({ ...prev, [currentApplicationId]: letter.letter_text }))
      setLetterStatus('done')
      refreshApplications()
    } catch {
      setLetterStatus('error')
    }
  }

  // Fetches full scheme detail (GET /schemes/{id}) and shows it in the right
  // panel. matchScore/reasons/warnings come from the search hit that was
  // clicked, since the detail endpoint itself doesn't return relevance data.
  const selectScheme = useCallback(async (
    schemeId: string,
    matchScore: number,
    reasons: ApiMatchReason[],
    warnings: string[],
    index: number
  ) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const detail = await apiGetScheme(schemeId, toApiLanguage(lang))
      setSelectedScheme(detailToSchemeItem(detail, index, matchScore, reasons, warnings))
      // Switching schemes — re-resolve the application context for THIS
      // scheme rather than carrying over whatever the previously selected
      // scheme left behind in currentApplicationId/applicationStatus.
      const existing = applicationsRef.current.find((a) => a.scheme_id === detail.id)
      setCurrentApplicationId(existing?.id ?? null)
      setApplicationStatus(existing ? 'exists' : 'idle')
      setLetterStatus('idle')
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : 'Failed to load scheme details.')
    } finally {
      setDetailLoading(false)
    }
  }, [lang])

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearchLoading(true)
    setSearchError(null)
    try {
      const matches = await apiSearchSchemes(trimmed, toApiLanguage(lang), 20)
      const items = matches.map((m, i) => matchToSchemeItem(m, i))
      setResults(items)
      setHasSearched(true)
      if (items.length > 0) {
        selectScheme(items[0].schemeId, items[0].matchScore, items[0].reasons, matches[0].warnings, 0)
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Search failed.')
      setResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [lang, selectScheme])

  // URL params on mount — homepage deep-links in via ?q=, ?panel=, ?lang=
  useEffect(() => {
    const langParam = searchParams.get('lang')
    if (langParam && langParam in LANG_TO_API_LANGUAGE) {
      setLang(langParam as Lang)
    }
    const panel = searchParams.get('panel')
    if (panel === 'prep') {
      setActivePanel('prep')
    }
    const q = searchParams.get('q')
    if (q) {
      setSearchQuery(q)
      runSearch(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSearch = () => {
    runSearch(searchQuery)
  }

  const toggleSave = (id: string) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleCompare = (scheme: SchemeItem) => {
    setCompareIds(prev => {
      if (prev.includes(scheme.schemeId)) return prev.filter(id => id !== scheme.schemeId)
      if (prev.length >= 3) { alert(g(S.full.maxCompare, lang)); return prev }
      return [...prev, scheme.schemeId]
    })
  }

  const compareTrayItems = compareIds
    .map(id => results.find(r => r.schemeId === id))
    .filter((s): s is SchemeItem => !!s)

  // POST /schemes/compare needs >=2 ids; fetch whenever the selection crosses
  // that threshold, and clear the fetched detail otherwise.
  useEffect(() => {
    if (compareIds.length < 2) {
      setCompareList([])
      setCompareError(null)
      return
    }
    let cancelled = false
    setCompareLoading(true)
    setCompareError(null)
    apiCompareSchemes(compareIds, toApiLanguage(lang))
      .then(details => {
        if (cancelled) return
        setCompareList(details.map((d, i) => {
          const hit = results.find(r => r.schemeId === d.scheme_code)
          return detailToSchemeItem(d, i, hit?.matchScore ?? 0, hit?.reasons ?? [], hit?.warning ? [hit.warning] : [])
        }))
      })
      .catch(err => {
        if (!cancelled) setCompareError(err instanceof ApiError ? err.message : 'Failed to load comparison.')
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareIds, lang])

  const toggleDoc = (index: number) => {
    setCheckedDocs(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const openMaps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => window.open(`https://www.google.com/maps/search/Common+Service+Centre+CSC/@${pos.coords.latitude},${pos.coords.longitude},14z`, '_blank'),
        () => window.open('https://www.google.com/maps/search/Common+Service+Centre+CSC+Pune', '_blank')
      )
    } else {
      window.open('https://www.google.com/maps/search/Common+Service+Centre+CSC+Pune', '_blank')
    }
  }

  const openDirectionsTo = (csc: CSCOut) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${csc.latitude},${csc.longitude}`, '_blank')
  }

  const fetchNearbyCscs = async () => {
    setCscStatus('loading')
    setCscErrorMessage(null)
    try {
      const position = await getCurrentPosition()
      const results = await getNearbyCscs(position.coords.latitude, position.coords.longitude)
      setCscList(results)
      setSelectedCSC(0)
      setCscStatus('ready')
    } catch (err) {
      setCscErrorMessage(err instanceof GeolocationPositionError
        ? 'Location access denied — allow location access to find nearby CSCs.'
        : err instanceof Error ? err.message : 'Could not load nearby CSCs.')
      setCscStatus('error')
    }
  }

  useEffect(() => {
    if (activePanel === 'csc' && cscStatus === 'idle') {
      fetchNearbyCscs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel])

  const shareWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  // Real backend voice input — same pattern as Simple Mode's
  // startRecording/stopRecording (app/simple/page.tsx): MediaRecorder
  // captures a webm/opus blob, POSTs it to /voice/transcribe (faster-whisper,
  // via lib/voice.ts's transcribeAudio — the same client binding Simple Mode
  // uses), and the transcript drives the search the same way typed text
  // does. Deliberately NOT browser SpeechRecognition — that only reliably
  // covers a handful of the 10 supported languages and never touches the
  // real multilingual backend at all.
  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const startRecording = async () => {
    setVoiceError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        setIsRecording(false)

        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        audioChunksRef.current = []

        if (audioBlob.size === 0) {
          setVoiceError(g(S.full.voiceEmptyError, lang))
          return
        }

        setIsTranscribing(true)
        try {
          const result = await transcribeAudio(audioBlob, toApiLanguage(lang))
          // Same confidence floor as Simple Mode: below ~0.35 the "small"
          // CPU Whisper model tends to produce repeated-token garbage
          // rather than a genuine low-confidence transcript — better to
          // ask the user to retry than run a nonsense query.
          if (result.text.trim() && result.confidence >= 0.35) {
            setSearchQuery(result.text)
            runSearch(result.text)
          } else {
            setVoiceError(g(S.full.voiceEmptyError, lang))
          }
        } catch (err) {
          // A 401/403 here means the access token was rejected. Full Mode
          // (like Simple Mode) doesn't require login to use voice search,
          // so most of the time this is a stale dev/fallback token, not an
          // actual session — only claim a real session expired, and send
          // the user to re-login, when they were genuinely logged in.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            if (isAuthenticated) {
              setVoiceError(g(S.full.voiceSessionExpiredError, lang))
              logout()
              setTimeout(() => router.push('/login'), 1200)
            } else {
              setVoiceError(g(S.full.voiceTranscribeError, lang))
            }
          } else {
            setVoiceError(g(S.full.voiceTranscribeError, lang))
          }
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      setVoiceError(g(S.full.voiceMicError, lang))
    }
  }

  const startVoice = () => {
    if (isRecording) {
      stopRecording()
      return
    }
    startRecording()
  }

  const updateProfile = (field: keyof ProfileData, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }))
  }

  const schemeCategory = getSchemeCategory(selectedScheme)
  const schemeName = getSchemeName(selectedScheme, lang)
  const schemeDocs = getSchemeDocuments(selectedScheme, lang)

  const categoryContext =
    lang === 'hi-IN' ? (
      schemeCategory === 'farmer' ? `मेरे नाम पर ${profileData.land || 'कृषि भूमि'} दर्ज है।` :
        schemeCategory === 'housing' ? `मैं वर्तमान में एक ${profileData.currentHouse || 'कच्चे'} घर में रहता/रहती हूँ। मेरे परिवार में ${profileData.familySize || 'कई'} सदस्य हैं। भारत में कहीं भी मेरा कोई पक्का घर नहीं है।` :
          schemeCategory === 'health' ? `मेरे परिवार में ${profileData.familySize || 'कई'} सदस्य हैं। हमारे पास ${profileData.rationCardType || 'BPL'} राशन कार्ड है।` :
            schemeCategory === 'business' ? `मैं ${profileData.businessAge ? `पिछले ${profileData.businessAge} से` : ''} एक ${profileData.businessType || 'छोटा'} व्यापार चलाता/चलाती हूँ। मेरा कोई मौजूदा ऋण चूक नहीं है।` :
              schemeCategory === 'women' ? `मैं एक ${profileData.maritalStatus || 'विवाहित'} महिला हूँ जो BPL परिवार से हूँ।` :
                schemeCategory === 'student' ? `मैं वर्तमान में ${profileData.institutionName || 'अपने संस्थान'} में ${profileData.qualification || 'उच्च शिक्षा'} कर रहा/रही हूँ।` :
                  'मैं इस योजना के लिए सभी आवश्यक पात्रता मानदंडों को पूरा करता/करती हूँ।'
    ) : lang === 'mr-IN' ? (
      schemeCategory === 'farmer' ? `माझ्या नावावर ${profileData.land || 'शेतजमीन'} नोंदणीकृत आहे.` :
        schemeCategory === 'housing' ? `मी सध्या ${profileData.currentHouse || 'कच्च्या'} घरात राहतो/राहते. माझ्या कुटुंबात ${profileData.familySize || 'अनेक'} सदस्य आहेत. भारतात कुठेही माझे पक्के घर नाही.` :
          schemeCategory === 'health' ? `माझ्या कुटुंबात ${profileData.familySize || 'अनेक'} सदस्य आहेत. आमच्याकडे ${profileData.rationCardType || 'BPL'} रेशन कार्ड आहे.` :
            schemeCategory === 'business' ? `मी ${profileData.businessAge ? `गेल्या ${profileData.businessAge} पासून` : ''} एक ${profileData.businessType || 'लहान'} व्यवसाय चालवतो/चालवते. माझे कोणतेही थकीत कर्ज नाही.` :
              schemeCategory === 'women' ? `मी ${profileData.maritalStatus || 'विवाहित'} महिला असून BPL कुटुंबातील आहे.` :
                schemeCategory === 'student' ? `मी सध्या ${profileData.institutionName || 'माझ्या संस्थेत'} ${profileData.qualification || 'उच्च शिक्षण'} घेत आहे.` :
                  'मी या योजनेसाठी सर्व आवश्यक पात्रता निकष पूर्ण करतो/करते.'
    ) : (
      schemeCategory === 'farmer' ? `I am a farmer with ${profileData.land || 'agricultural land'} registered in my name.` :
        schemeCategory === 'housing' ? `I currently reside in a ${profileData.currentHouse || 'kutcha'} house. My family consists of ${profileData.familySize || 'multiple'} members. I do not own any pucca house anywhere in India.` :
          schemeCategory === 'health' ? `My family consists of ${profileData.familySize || 'multiple'} members. We hold a ${profileData.rationCardType || 'BPL'} ration card.` :
            schemeCategory === 'business' ? `I run a ${profileData.businessType || 'small'} business${profileData.businessAge ? ` for the past ${profileData.businessAge}` : ''}. I have no existing loan defaults.` :
              schemeCategory === 'women' ? `I am a ${profileData.maritalStatus || 'married'} woman from a BPL household.` :
                schemeCategory === 'student' ? `I am currently pursuing ${profileData.qualification || 'higher education'} at ${profileData.institutionName || 'my institution'}.` :
                  'I meet all the required eligibility criteria for this scheme.'
    )

  const draftLetter = lang === 'hi-IN' ? `सेवा में,
संबंधित अधिकारी,
${schemeName} योजना

विषय: ${schemeName} के अंतर्गत पंजीकरण हेतु आवेदन

महोदय/महोदया,

मैं, ${profileData.fullName}, आयु ${profileData.age} वर्ष, निवासी ${profileData.state}, ${schemeName} के अंतर्गत पंजीकरण के लिए आवेदन करता/करती हूँ।

${categoryContext} मेरी वार्षिक आय ${profileData.income || 'पात्रता सीमा के भीतर'} है। मैं इस योजना के सभी पात्रता मानदंड पूरे करता/करती हूँ।

कृपया मेरे आवेदन पर शीघ्र कार्रवाई करते हुए मुझे लाभार्थी के रूप में पंजीकृत करें।

संलग्नक:
${schemeDocs.map((doc, i) => `${i + 1}. ${doc} (सत्यापित प्रति)`).join('\n')}

भवदीय,
${profileData.fullName}
दिनांक: ${new Date().toLocaleDateString('en-IN')}
स्थान: ${profileData.state}` : lang === 'mr-IN' ? `प्रति,
संबंधित अधिकारी,
${schemeName} योजना

विषय: ${schemeName} अंतर्गत नोंदणीसाठी अर्ज

महोदय/महोदया,

मी, ${profileData.fullName}, वय ${profileData.age} वर्षे, रहिवासी ${profileData.state}, ${schemeName} अंतर्गत नोंदणीसाठी अर्ज करत आहे.

${categoryContext} माझे वार्षिक उत्पन्न ${profileData.income || 'पात्रता मर्यादेत'} आहे. मी या योजनेचे सर्व पात्रता निकष पूर्ण करतो/करते.

कृपया माझ्या अर्जावर लवकरात लवकर प्रक्रिया करून मला लाभार्थी म्हणून नोंदणीकृत करावे.

जोडपत्रे:
${schemeDocs.map((doc, i) => `${i + 1}. ${doc} (साक्षांकित प्रत)`).join('\n')}

आपला विश्वासू,
${profileData.fullName}
दिनांक: ${new Date().toLocaleDateString('en-IN')}
ठिकाण: ${profileData.state}` : `To,
The Concerned Authority,
${schemeName} Scheme

Subject: Application for Registration under ${schemeName}

Respected Sir/Madam,

I, ${profileData.fullName}, aged ${profileData.age} years, residing in ${profileData.state}, hereby apply for registration under ${schemeName}.

${categoryContext} My annual income is ${profileData.income || 'within the eligible limit'}. I meet all the eligibility criteria for this scheme.

I request you to kindly process my application and register me as a beneficiary at the earliest.

Enclosures:
${schemeDocs.map((doc, i) => `${i + 1}. ${doc} (attested copy)`).join('\n')}

Yours faithfully,
${profileData.fullName}
Date: ${new Date().toLocaleDateString('en-IN')}
Place: ${profileData.state}`

  const panelTitles: Record<ActivePanel, string> = {
    schemes: g(S.full.panelTitles.schemes, lang),
    compare: g(S.full.panelTitles.compare, lang),
    prep: g(S.full.panelTitles.prep, lang),
    tracker: g(S.full.panelTitles.tracker, lang),
    csc: g(S.full.panelTitles.csc, lang),
    helpline: g(S.full.panelTitles.helpline, lang)
  }

  const panelSubs: Record<ActivePanel, string> = {
    schemes: g(S.full.panelSubs.schemes, lang),
    compare: gf(S.full.panelSubs.compare, lang, compareList.length),
    prep: schemeName,
    tracker: `${applications.length} ${g(S.full.panelSubs.tracker, lang)}`,
    csc: g(S.full.panelSubs.csc, lang),
    helpline: 'All India'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', height: '100vh', overflow: 'hidden', background: '#F4F1EC', fontFamily: 'var(--font-mukta, system-ui, sans-serif)' }}>
      {/* LEFT SIDEBAR */}
      <div style={{ background: '#1A6B3C', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* BRAND SECTION */}
        <div style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', background: '#E8690B', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700 }}>
                <span style={{ color: 'white' }}>Suvidha</span><span style={{ color: '#FFD700' }}>AI</span>
              </div>
              <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                {g(S.full.brandTag, lang)}
              </div>
            </div>
          </div>
        </div>

        {/* USER SECTION — real logged-in user via useAuth(), never a
            hardcoded placeholder identity. Guests see a generic label
            instead of silently posing as some other person. */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E8690B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {(user?.full_name || user?.mobile_number || user?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
              {user?.full_name || user?.mobile_number || user?.email || g(S.full.guestUser, lang)}
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.55)' }}>
              {isAuthenticated ? (user?.mobile_number || user?.email || '') : g(S.full.notLoggedIn, lang)}
            </div>
          </div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isAuthenticated ? '#4ADE80' : '#78716C', marginLeft: 'auto', flexShrink: 0 }}></div>
        </div>

        {/* NAV SECTION */}
        <div style={{ padding: '8px 0', flex: 1 }}>
          <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', padding: '6px 14px 2px', fontWeight: 700 }}>
            {g(S.full.navMain, lang)}
          </div>
          {[
            { id: 'schemes', label: g(S.full.navSchemes, lang), badge: results.length.toString() },
            { id: 'compare', label: g(S.full.navCompare, lang), badge: compareList.length > 0 ? compareList.length.toString() : '' },
            { id: 'prep', label: g(S.full.navPrep, lang), badge: '' },
            { id: 'tracker', label: g(S.full.navTracker, lang), badge: applications.length.toString() },
            { id: 'csc', label: g(S.full.navCSC, lang), badge: '' },
            { id: 'helpline', label: g(S.full.navHelpline, lang), badge: '' }
          ].map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', cursor: 'pointer',
                borderLeft: activePanel === item.id ? '3px solid #E8690B' : '3px solid transparent',
                background: activePanel === item.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                borderRadius: '0 6px 6px 0', marginRight: 6, transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { if (activePanel !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={(e) => { if (activePanel !== item.id) e.currentTarget.style.background = 'transparent' }}
              onClick={() => setActivePanel(item.id as ActivePanel)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activePanel === item.id ? 'white' : 'rgba(255,255,255,0.6)'} strokeWidth="2" strokeLinecap="round">
                {item.id === 'schemes' && <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>}
                {item.id === 'compare' && <><rect x="3" y="3" width="8" height="18" rx="1" /><rect x="13" y="3" width="8" height="12" rx="1" /></>}
                {item.id === 'prep' && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>}
                {item.id === 'tracker' && <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />}
                {item.id === 'csc' && <><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></>}
                {item.id === 'helpline' && <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.17a16 16 0 006.29 6.29l1.49-1.34a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 15.42z" />}
              </svg>
              <span style={{ fontSize: '11px', fontWeight: 700, color: activePanel === item.id ? 'white' : 'rgba(255,255,255,0.65)' }}>
                {item.label}
              </span>
              {item.badge && (
                <span style={{ background: '#E8690B', color: 'white', borderRadius: '99px', padding: '1px 6px', fontSize: '9px', fontWeight: 700, marginLeft: 'auto' }}>
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* BOTTOM SECTION */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            style={{
              width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '7px', padding: '8px 12px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px'
            }}
            onClick={() => router.push('/')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {g(S.full.backHome, lang)}
          </button>
          <button
            style={{
              width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '7px', padding: '8px 12px', color: 'white', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px'
            }}
            onClick={() => {
              if (hasProfile) {
                alert(`${g(S.full.profileSavedAlert, lang)}\n\n${g(S.full.labelName, lang)}: ${profileData.fullName}\n${g(S.full.labelAge, lang)}: ${profileData.age}\n${g(S.full.labelState, lang)}: ${profileData.state}\n${g(S.full.labelOccupation, lang)}: ${profileData.occupation}`)
              } else {
                setActivePanel('prep')
                setShowProfileForm(true)
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
            </svg>
            {hasProfile ? gf(S.full.profileSaved, lang, profileData.fullName.split(' ')[0]) : g(S.full.loginSave, lang)}
          </button>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
            <button
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 700, padding: '4px', flex: 1, borderRadius: '4px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={() => router.push('/simple')}
            >
              {g(S.full.simpleMode, lang)}
            </button>
            <button
              style={{ background: '#E8690B', color: 'white', fontSize: '10px', fontWeight: 700, padding: '4px', flex: 1, borderRadius: '4px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {g(S.full.fullMode, lang)}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* TOP BAR */}
        <div style={{ height: '50px', background: 'white', borderBottom: '2px solid #E8690B', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700, color: '#1C1917' }}>
              {panelTitles[activePanel]}
            </span>
            <span style={{ fontSize: '10px', color: '#A8A29E', marginLeft: '4px' }}>
              · {panelSubs[activePanel]}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              style={{ fontSize: '10px', fontWeight: 700, border: '1px solid #E7E0D8', borderRadius: '5px', padding: '4px 8px', background: 'white', cursor: 'pointer', outline: 'none', color: '#1C1917' }}
            >
              <option value="hi-IN">हिंदी</option>
              <option value="mr-IN">मराठी</option>
              <option value="en-IN">English</option>
              <option value="ta-IN">தமிழ்</option>
              <option value="te-IN">తెలుగు</option>
              <option value="kn-IN">ಕನ್ನಡ</option>
              <option value="ml-IN">മലയാളം</option>
              <option value="bn-IN">বাংলা</option>
              <option value="gu-IN">ગુજરાતી</option>
              <option value="pa-IN">ਪੰਜਾਬੀ</option>
            </select>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#F4F1EC', padding: '16px' }}>
          {/* SCHEMES PANEL */}
          {activePanel === 'schemes' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '12px' }}>
              {/* LEFT COLUMN */}
              <div>
                {/* SEARCH CARD */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '10px', border: '1px solid #E7E0D8' }}>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '5px' }}>
                    {g(S.full.searchLabel, lang)}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <textarea
                      style={{
                        flex: 1, minHeight: '56px', border: '1.5px solid #E7E0D8', borderRadius: '7px',
                        padding: '8px 10px', fontSize: '12px', color: '#1C1917', background: '#FAF7F2',
                        resize: 'none', outline: 'none', fontFamily: 'inherit'
                      }}
                      placeholder={g(S.full.searchPlaceholder, lang)}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                      disabled={isTranscribing}
                      style={{
                        width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                        cursor: isTranscribing ? 'wait' : 'pointer',
                        flexShrink: 0, background: isRecording ? '#DC2626' : isTranscribing ? '#E8690B' : '#F4F1EC',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: isTranscribing ? 0.75 : 1,
                      }}
                      onClick={startVoice}
                      title={isRecording ? g(S.full.voiceListening, lang) : isTranscribing ? g(S.full.voiceProcessing, lang) : undefined}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isRecording || isTranscribing ? 'white' : '#57534E'} strokeWidth="2" strokeLinecap="round">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0014 0" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                    </button>
                    <button
                      style={{
                        background: '#E8690B', color: 'white', border: 'none', borderRadius: '6px',
                        padding: '7px 16px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit', flexShrink: 0, height: '40px'
                      }}
                      onClick={handleSearch}
                    >
                      {g(S.full.searchBtn, lang)}
                    </button>
                  </div>
                  {(isRecording || isTranscribing) && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#57534E', marginTop: '6px' }}>
                      {isRecording ? g(S.full.voiceListening, lang) : g(S.full.voiceProcessing, lang)}
                    </div>
                  )}
                  {voiceError && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', marginTop: '6px' }}>
                      {voiceError}
                    </div>
                  )}
                  {hasSearched && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#1A6B3C' }}>
                        {g(S.full.filterState, lang)}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#E8690B' }}>
                        {g(S.full.filterAge, lang)}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#7C3AED' }}>
                        {g(S.full.filterOccupation, lang)}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#0F766E' }}>
                        {g(S.full.filterIncome, lang)}
                      </span>
                    </div>
                  )}
                </div>

                {/* RESULTS HEADER */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#78716C' }}>
                    {searchLoading
                      ? 'Searching…'
                      : hasSearched
                        ? gf(S.full.schemesFound, lang, results.length)
                        : 'Type a query above and press Search'}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['match', 'amount', 'ease'].map(sort => (
                      <button
                        key={sort}
                        style={{
                          fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                          border: '1px solid #E7E0D8', cursor: 'pointer',
                          background: sortBy === sort ? '#E8690B' : 'white',
                          color: sortBy === sort ? 'white' : '#57534E',
                          borderColor: sortBy === sort ? '#E8690B' : '#E7E0D8'
                        }}
                        onClick={() => setSortBy(sort)}
                      >
                        {sort === 'match' ? g(S.full.bestMatch, lang) : sort === 'amount' ? g(S.full.highestBenefit, lang) : g(S.full.easiest, lang)}
                      </button>
                    ))}
                  </div>
                </div>

                {searchError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '7px', padding: '8px 10px', fontSize: '11px', marginBottom: '10px' }}>
                    {searchError}
                  </div>
                )}

                {/* RESULTS LIST */}
                <div>
                  {results.map(scheme => (
                    <div
                      key={scheme.schemeId}
                      style={{
                        background: 'white', borderRadius: '8px',
                        border: '1.5px solid', borderColor: selectedScheme.schemeId === scheme.schemeId ? '#E8690B' : 'transparent',
                        marginBottom: '6px', cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: selectedScheme.schemeId === scheme.schemeId ? '0 2px 10px rgba(232,105,11,0.15)' : '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                      onClick={() => selectScheme(scheme.schemeId, scheme.matchScore, scheme.reasons, scheme.warning ? [scheme.warning] : [], scheme.id)}
                      onMouseEnter={(e) => {
                        if (selectedScheme.schemeId !== scheme.schemeId) {
                          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedScheme.schemeId !== scheme.schemeId) {
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                          e.currentTarget.style.transform = 'none'
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px' }}>
                        <div style={{ width: '4px', alignSelf: 'stretch', borderRadius: '2px', background: getEligibilityColor(scheme.eligibility), marginRight: '4px', flexShrink: 0 }}></div>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1.5px solid #E7E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF7F2', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: scheme.logoColor }}>{scheme.logoText}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                            {getSchemeName(scheme, lang)}
                          </div>
                          <div style={{ fontSize: '8px', color: '#C4BFBA', marginTop: '1px' }}>{scheme.ministry}</div>
                          <div style={{ display: 'flex', gap: '2px', marginTop: '3px' }}>
                            {scheme.applicationModes.map(mode => (
                              <span key={mode} style={{ fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '99px', background: '#F4F1EC', color: '#78716C' }}>
                                {mode}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ width: '78px', flexShrink: 0 }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: getEligibilityColor(scheme.eligibility), marginBottom: '2px' }}>
                            {scheme.matchLabel === 'High Match' ? g(S.full.highMatch, lang) : g(S.full.partialMatch, lang)}
                          </div>
                          <div style={{ height: '4px', background: '#E7E0D8', borderRadius: '2px', overflow: 'hidden', marginBottom: '1px' }}>
                            <div style={{ height: '100%', borderRadius: '2px', background: getEligibilityColor(scheme.eligibility), width: scheme.matchScore + '%' }}></div>
                          </div>
                          <div style={{ fontSize: '8px', color: '#A8A29E' }}>{scheme.matchScore}%</div>
                        </div>
                        <div style={{ width: '68px', flexShrink: 0, textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1C1917', display: 'block', lineHeight: 1.2 }}>
                            {scheme.amount}
                          </span>
                          <span style={{ fontSize: '8px', color: '#A8A29E', display: 'block', marginTop: '1px' }}>
                            {getSchemeUnit(scheme, lang)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
                          <button
                            style={{
                              background: '#E8690B', color: 'white', border: 'none', borderRadius: '5px',
                              padding: '4px 9px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                              fontFamily: 'inherit', whiteSpace: 'nowrap'
                            }}
                            onClick={(e) => { e.stopPropagation(); selectScheme(scheme.schemeId, scheme.matchScore, scheme.reasons, scheme.warning ? [scheme.warning] : [], scheme.id) }}
                          >
                            {g(S.full.viewDetails, lang)}
                          </button>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            <button
                              style={{
                                width: '22px', height: '22px', borderRadius: '50%',
                                border: '1px solid', borderColor: savedIds.includes(scheme.schemeId) ? '#FED7AA' : '#E7E0D8',
                                background: savedIds.includes(scheme.schemeId) ? '#FFF8F1' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', fontSize: '10px', fontWeight: 700,
                                color: savedIds.includes(scheme.schemeId) ? '#E8690B' : '#A8A29E'
                              }}
                              onClick={(e) => { e.stopPropagation(); toggleSave(scheme.schemeId) }}
                            >
                              {savedIds.includes(scheme.schemeId) ? '⭐' : '☆'}
                            </button>
                            <button
                              style={{
                                width: '22px', height: '22px', borderRadius: '50%',
                                border: '1px solid', borderColor: compareIds.includes(scheme.schemeId) ? '#BFDBFE' : '#E7E0D8',
                                background: compareIds.includes(scheme.schemeId) ? '#EFF6FF' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', fontSize: '10px', fontWeight: 700,
                                color: compareIds.includes(scheme.schemeId) ? '#1565C0' : '#A8A29E'
                              }}
                              onClick={(e) => { e.stopPropagation(); toggleCompare(scheme) }}
                            >
                              {compareIds.includes(scheme.schemeId) ? '✓C' : '+C'}
                            </button>
                          </div>
                        </div>
                      </div>
                      {scheme.warning && (
                        <div style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A', padding: '4px 10px 4px 14px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0 0 8px 8px' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 00112.12L21.71 18a2 2 0 01-2.12-2.12" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span style={{ fontSize: '9px', color: '#92400E', flex: 1 }}>{getSchemeWarning(scheme, lang)}</span>
                          <span style={{ fontSize: '9px', color: '#D97706', fontWeight: 700, cursor: 'pointer' }}>{g(S.full.fixArrow, lang)}</span>
                        </div>
                      )}
                      {scheme.reasons.length > 0 && (
                        <div style={{ borderTop: scheme.warning ? 'none' : '1px solid #F4F1EC', padding: '4px 10px 6px 14px' }}>
                          {scheme.reasons.slice(0, 2).map((r, i) => (
                            <div key={i} style={{ fontSize: '8px', color: '#78716C' }}>
                              · {r.matched} ({r.weight}%)
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN - SCHEME DETAIL PANEL */}
              <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', position: 'sticky', top: 0 }}>
                {detailError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '7px', padding: '8px 10px', fontSize: '11px', margin: '10px' }}>
                    {detailError}
                  </div>
                )}
                {detailLoading && (
                  <div style={{ padding: '10px 12px', fontSize: '11px', color: '#78716C' }}>Loading scheme details…</div>
                )}
                {/* HEADER */}
                <div style={{ padding: '12px', background: selectedScheme.headerColor }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {selectedScheme.logoText}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', fontFamily: 'Georgia, serif', lineHeight: 1.2 }}>
                        {getSchemeName(selectedScheme, lang)}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>
                        {selectedScheme.ministry}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', borderRadius: '99px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, background: selectedScheme.eligibility === 'eligible' ? '#F0FDF4' : '#FFFBEB', color: selectedScheme.eligibility === 'eligible' ? '#15803D' : '#D97706' }}>
                    {selectedScheme.eligibility === 'eligible' ? `${g(S.full.highMatch, lang)} — ` : `${g(S.full.partialMatch, lang)} — `}{gf(S.full.matchPercent, lang, selectedScheme.matchScore)}
                  </div>
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.18)', borderRadius: '5px', overflow: 'hidden', marginTop: '6px' }}>
                    <div style={{ flex: 1, padding: '5px 7px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white', fontFamily: 'Georgia, serif' }}>{selectedScheme.amount}</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>{g(S.full.annual, lang)}</span>
                    </div>
                    <div style={{ flex: 1, padding: '5px 7px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>{g(S.full.installments, lang)}</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>{g(S.full.payments, lang)}</span>
                    </div>
                    <div style={{ flex: 1, padding: '5px 7px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>{g(S.full.direct, lang)}</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>{g(S.full.bankTransfer, lang)}</span>
                    </div>
                  </div>
                </div>

                {/* SCROLLABLE BODY */}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                  {/* WHY THIS MATCHED (real reasons from POST /schemes/search) */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      {g(S.full.eligibilityCheck, lang)}
                    </div>
                    {selectedScheme.reasons.length === 0 ? (
                      <div style={{ fontSize: '10px', color: '#A8A29E' }}>No match details available.</div>
                    ) : (
                      selectedScheme.reasons.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                          <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                          <span style={{ fontSize: '10px', color: '#1C1917' }}>{r.matched} <span style={{ color: '#A8A29E' }}>({r.weight}%)</span></span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* REJECTION RISKS */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      {g(S.full.rejectionRisks, lang)}
                    </div>
                    {getSchemeRejectionRisks(selectedScheme, lang).map((risk, i) => (
                      <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '5px', padding: '5px 7px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#92400E', display: 'block' }}>{risk.risk}</span>
                        <span style={{ fontSize: '8px', color: '#78716C', marginTop: '1px', display: 'block' }}>{g(S.full.fixArrow, lang)} {risk.fix}</span>
                      </div>
                    ))}
                  </div>

                  {/* HOW TO APPLY */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      {g(S.full.howToApply, lang)}
                    </div>
                    {selectedScheme.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', marginBottom: '3px' }}>
                        <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: '#1A6B3C', color: 'white', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          {i + 1}
                        </div>
                        <div style={{ fontSize: '10px', color: '#1C1917', lineHeight: 1.4, flex: 1 }}>
                          {getSchemeStepTexts(selectedScheme, lang)[i]}
                          <span style={{
                            fontSize: '7px', fontWeight: 700, padding: '1px 4px', borderRadius: '99px',
                            marginLeft: '3px',
                            background: step.mode === 'online' ? '#F0FDF4' : step.mode === 'csc' ? '#EFF6FF' : '#FFFBEB',
                            color: step.mode === 'online' ? '#15803D' : step.mode === 'csc' ? '#1D4ED8' : '#D97706'
                          }}>
                            {step.mode === 'online' ? g(S.full.modeOnline, lang) : step.mode === 'csc' ? g(S.full.modeCSC, lang) : g(S.full.modeOffline, lang)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DOCUMENTS REQUIRED */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      {g(S.full.docsRequired, lang)}
                    </div>
                    {getSchemeDocuments(selectedScheme, lang).map((doc, i) => (
                      <div
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', cursor: 'pointer' }}
                        onClick={() => toggleDoc(i)}
                      >
                        <div style={{
                          width: '12px', height: '12px', border: '1.5px solid', borderColor: checkedDocs[i] ? '#1A6B3C' : '#E7E0D8',
                          borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '7px', transition: 'all 0.15s',
                          background: checkedDocs[i] ? '#1A6B3C' : 'white',
                          color: checkedDocs[i] ? 'white' : 'transparent'
                        }}>
                          {checkedDocs[i] ? '✓' : ''}
                        </div>
                        <span style={{
                          fontSize: '10px', color: checkedDocs[i] ? '#A8A29E' : '#1C1917',
                          textDecoration: checkedDocs[i] ? 'line-through' : 'none'
                        }}>
                          {doc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    style={{
                      background: '#E8690B', color: 'white', border: 'none', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => { setActivePanel('prep'); if (!hasProfile) setShowProfileForm(false) }}
                  >
                    {g(S.full.generateDoc, lang)}
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#1A6B3C', border: '1.5px solid #BBF7D0', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => toggleSave(selectedScheme.schemeId)}
                  >
                    {savedIds.includes(selectedScheme.schemeId) ? g(S.full.schemeSaved, lang) : g(S.full.saveScheme, lang)}
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#15803D', border: '1.5px solid #BBF7D0', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => shareWhatsApp('SuvidhaAI — ' + getSchemeName(selectedScheme, lang) + '\n' + g(S.full.cmpBenefit, lang) + ': ' + selectedScheme.amount + '\n' + selectedScheme.officialUrl)}
                  >
                    {g(S.full.shareWA, lang)}
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#E8690B', border: '1.5px solid #FED7AA', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => window.open(selectedScheme.officialUrl, '_blank')}
                  >
                    {g(S.full.officialSite, lang)}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* COMPARE TRAY */}
          {compareIds.length > 0 && (
            <div style={{
              position: 'fixed', bottom: 0, left: '200px', right: 0, height: '48px',
              background: 'white', borderTop: '2px solid #E8690B',
              display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 50
            }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>{g(S.full.comparing, lang)}</span>
              <div style={{ flex: 1, display: 'flex', gap: '5px' }}>
                {compareTrayItems.map(scheme => (
                  <div key={scheme.schemeId} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FFF8F1', border: '1px solid #FED7AA', borderRadius: '5px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#1C1917' }}>
                    {getSchemeName(scheme, lang)}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', fontSize: '11px', padding: 0, marginLeft: '2px' }}
                      onClick={() => setCompareIds(prev => prev.filter(id => id !== scheme.schemeId))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                style={{ background: '#E8690B', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => setActivePanel('compare')}
              >
                {g(S.full.compareNow, lang)}
              </button>
              <button
                style={{ fontSize: '10px', color: '#A8A29E', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}
                onClick={() => setCompareIds([])}
              >
                {g(S.full.clearAll, lang)}
              </button>
            </div>
          )}

          {/* OTHER PANELS - PLACEHOLDERS */}
          {activePanel === 'compare' && (
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              {compareError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '7px', padding: '8px 10px', fontSize: '11px', marginBottom: '10px' }}>
                  {compareError}
                </div>
              )}
              {compareLoading && (
                <div style={{ textAlign: 'center', paddingTop: '40px', fontSize: '11px', color: '#78716C' }}>Loading comparison…</div>
              )}
              {compareLoading ? null : compareList.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <div style={{ fontSize: '14px', fontFamily: 'Georgia, serif', fontWeight: 700, color: '#A8A29E' }}>
                    {g(S.full.noSchemesCompare, lang)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#C4BFBA', maxWidth: '280px', margin: '6px auto 0' }}>
                    {g(S.full.compareHint, lang)}
                  </div>
                  <button
                    style={{ background: '#E8690B', color: 'white', borderRadius: '7px', padding: '8px 16px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '14px' }}
                    onClick={() => setActivePanel('schemes')}
                  >
                    {g(S.full.goToSearch, lang)}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '140px ' + compareList.map(() => '1fr').join(' '), background: '#E7E0D8', gap: '1px', borderRadius: '8px', overflow: 'hidden' }}>
                  {/* Header Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '11px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.compareCol, lang)}
                  </div>
                  {compareList.map((scheme) => (
                    <div key={scheme.id} style={{ background: scheme.headerColor, padding: '12px', position: 'relative' }}>
                      <button
                        style={{
                          position: 'absolute', top: '8px', right: '8px',
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: 'rgba(255,255,255,0.2)', border: 'none',
                          color: 'white', fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => setCompareList(prev => prev.filter(s => s.id !== scheme.id))}
                      >
                        ×
                      </button>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'white', fontFamily: 'Georgia, serif', marginBottom: '2px' }}>
                        {getSchemeName(scheme, lang)}
                      </div>
                    </div>
                  ))}

                  {/* Eligibility Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpEligibility, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px',
                        background: scheme.eligibility === 'eligible' ? '#F0FDF4' : scheme.eligibility === 'partial' ? '#FFFBEB' : '#FEF2F2',
                        color: scheme.eligibility === 'eligible' ? '#15803D' : scheme.eligibility === 'partial' ? '#D97706' : '#DC2626'
                      }}>
                        {scheme.eligibility === 'eligible' ? g(S.full.eligible, lang) : scheme.eligibility === 'partial' ? g(S.full.partial, lang) : g(S.full.ineligible, lang)}
                      </div>
                    </div>
                  ))}

                  {/* Match Score Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpMatchScore, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917', marginBottom: '4px' }}>
                        {scheme.matchScore}%
                      </div>
                      <div style={{ height: '4px', background: '#E7E0D8', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '2px',
                          background: getEligibilityColor(scheme.eligibility),
                          width: scheme.matchScore + '%'
                        }}></div>
                      </div>
                    </div>
                  ))}

                  {/* Benefit Amount Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpBenefit, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917', fontFamily: 'Georgia, serif' }}>
                        {scheme.amount}
                      </div>
                      <div style={{ fontSize: '8px', color: '#A8A29E' }}>
                        {getSchemeUnit(scheme, lang)}
                      </div>
                    </div>
                  ))}

                  {/* How to Apply Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpHowApply, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {scheme.applicationModes.map(mode => (
                          <span key={mode} style={{
                            fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px',
                            background: '#F4F1EC', color: '#78716C'
                          }}>
                            {mode}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Documents Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpDocuments, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1C1917' }}>
                        {gf(S.full.cmpDocsCount, lang, scheme.documents.length)}
                      </div>
                    </div>
                  ))}

                  {/* Processing Time Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpProcessing, lang)}
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1C1917' }}>
                        {index === 0 ? '7–14' : index === 1 ? '14–30' : '30–90'} {lang === 'hi-IN' ? 'दिन' : lang === 'mr-IN' ? 'दिवस' : 'days'}
                      </div>
                    </div>
                  ))}

                  {/* Rejection Risk Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpRejection, lang)}
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px',
                        background: index === 0 ? '#F0FDF4' : index === 1 ? '#FFFBEB' : '#FEF2F2',
                        color: index === 0 ? '#15803D' : index === 1 ? '#D97706' : '#DC2626'
                      }}>
                        {index === 0 ? g(S.full.lowRisk, lang) : index === 1 ? g(S.full.mediumRisk, lang) : g(S.full.highRisk, lang)}
                      </div>
                    </div>
                  ))}

                  {/* Recommended Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpRecommended, lang)}
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{
                        fontSize: '10px', fontWeight: 700,
                        color: index === 0 ? '#15803D' : '#57534E'
                      }}>
                        {index === 0 ? g(S.full.cmpStartHere, lang) : gf(S.full.cmpApplyNth, lang, index + 1)}
                      </div>
                    </div>
                  ))}

                  {/* Action Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    {g(S.full.cmpAction, lang)}
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button
                        style={{
                          background: scheme.headerColor, color: 'white', borderRadius: '6px',
                          padding: '6px 12px', fontSize: '9px', fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'inherit', border: 'none'
                        }}
                        onClick={() => {
                          setSelectedScheme(scheme)
                          setActivePanel('prep')
                        }}
                      >
                        {g(S.full.startPrep, lang)}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activePanel === 'prep' && !hasProfile && !showProfileForm && (
            <div style={{ background: 'white', borderRadius: '10px', padding: '32px', maxWidth: '560px', margin: '0 auto', marginTop: '16px', border: '1px solid #E7E0D8', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#FFF8F1', border: '2px solid #FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E8690B" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                </svg>
              </div>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', display: 'inline-block', marginBottom: '12px' }}>
                {schemeName}
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: 700, color: '#1C1917', display: 'block', marginBottom: '12px' }}>
                {g(S.full.prepSubHead, lang)}
              </div>
              <div style={{ fontSize: '11px', color: '#78716C', marginTop: '6px', marginBottom: '12px', lineHeight: 1.6 }}>
                {g(S.full.prepSubDesc, lang)}
              </div>
              <div style={{ background: '#F4F1EC', borderRadius: '6px', padding: '8px 12px', marginBottom: '16px', textAlign: 'left' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917' }}>{g(S.full.weNeed, lang)}</span>
                <span style={{ fontSize: '10px', color: '#78716C', marginLeft: '4px' }}>
                  {lang === 'hi-IN' ? (
                    schemeCategory === 'farmer' ? 'नाम, आयु, राज्य, ज़मीन का विवरण, आधार-बैंक लिंक स्थिति' :
                      schemeCategory === 'housing' ? 'नाम, आयु, राज्य, BPL कार्ड स्थिति, वर्तमान घर का प्रकार' :
                        schemeCategory === 'health' ? 'नाम, आयु, राज्य, राशन कार्ड प्रकार, परिवार का आकार' :
                          schemeCategory === 'business' ? 'नाम, आयु, राज्य, व्यापार प्रकार, ऋण इतिहास' :
                            schemeCategory === 'women' ? 'नाम, आयु, राज्य, BPL स्थिति, LPG कनेक्शन स्थिति' :
                              schemeCategory === 'student' ? 'नाम, आयु, राज्य, वर्तमान योग्यता, संस्थान' :
                                'नाम, आयु, राज्य, व्यवसाय, आय'
                  ) : lang === 'mr-IN' ? (
                    schemeCategory === 'farmer' ? 'नाव, वय, राज्य, जमिनीचा तपशील, आधार-बँक लिंक स्थिती' :
                      schemeCategory === 'housing' ? 'नाव, वय, राज्य, BPL कार्ड स्थिती, सध्याच्या घराचा प्रकार' :
                        schemeCategory === 'health' ? 'नाव, वय, राज्य, रेशन कार्ड प्रकार, कुटुंबाचा आकार' :
                          schemeCategory === 'business' ? 'नाव, वय, राज्य, व्यवसाय प्रकार, कर्ज इतिहास' :
                            schemeCategory === 'women' ? 'नाव, वय, राज्य, BPL स्थिती, LPG कनेक्शन स्थिती' :
                              schemeCategory === 'student' ? 'नाव, वय, राज्य, सध्याची पात्रता, संस्था' :
                                'नाव, वय, राज्य, व्यवसाय, उत्पन्न'
                  ) : (
                    schemeCategory === 'farmer' ? 'Name, Age, State, Land details, Aadhaar-bank link status' :
                      schemeCategory === 'housing' ? 'Name, Age, State, BPL card status, Current house type' :
                        schemeCategory === 'health' ? 'Name, Age, State, Ration card type, Family size' :
                          schemeCategory === 'business' ? 'Name, Age, State, Business type, Loan history' :
                            schemeCategory === 'women' ? 'Name, Age, State, BPL status, LPG connection status' :
                              schemeCategory === 'student' ? 'Name, Age, State, Current qualification, Institution' :
                                'Name, Age, State, Occupation, Income'
                  )}
                </span>
              </div>
              <button
                style={{ background: '#E8690B', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
                onClick={() => setShowProfileForm(true)}
              >
                {g(S.full.fillAndGenerate, lang)}
              </button>
            </div>
          )}

          {activePanel === 'prep' && showProfileForm && (
            <ApplicationPreparationForm
              lang={toDocCheckLang(lang)}
              schemeName={schemeName}
              schemeCategory={schemeCategory}
              requiredDocuments={requiredDocs}
              profileData={profileData}
              onFieldChange={updateProfile}
              onBack={() => setShowProfileForm(false)}
              onSubmit={async () => {
                try {
                  await apiPatch("/users/me", toUserPatchPayload(profileData))
                  await apiPut("/users/me/profile", toProfilePutPayload(profileData))
                  setHasProfile(true)
                  setShowProfileForm(false)
                } catch (err) {
                  const message = err instanceof ApiError ? String(err.message) : "Could not save your profile. Please try again."
                  alert(message)
                  return
                }

                // Connect to the real applications backend (POST /applications)
                // now that the profile is saved — starts a real draft
                // Application row for this scheme. dbId is only populated
                // once GET /schemes/{id} has resolved (see detailToSchemeItem);
                // if it's still empty (e.g. scheme selected from a stale
                // state), skip silently rather than sending a bad request.
                if (!selectedScheme.dbId) return
                setApplicationStatus('creating')
                try {
                  const created = await createApplication(selectedScheme.dbId)
                  setCurrentApplicationId(created.id)
                  setApplicationStatus('created')
                  refreshApplications()
                } catch (err) {
                  if (err instanceof ApiClientError && err.status === 400) {
                    setApplicationStatus('exists')
                    // No id came back on the 400 — resolve it from the
                    // user's existing applications so Generate Letter still
                    // has something to call.
                    const list = await refreshApplications()
                    const existing = list?.find((a) => a.scheme_id === selectedScheme.dbId)
                    setCurrentApplicationId(existing?.id ?? null)
                  } else {
                    setApplicationStatus('error')
                  }
                }
              }}
            />
          )}

          {activePanel === 'prep' && hasProfile && !showProfileForm && (
            <div className="max-w-[1100px] mx-auto">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                    <FileCheck2 size={18} className="text-[#E8690B]" aria-hidden="true" />
                    {drt(DR.full.tabTitle, toDocCheckLang(lang))}
                  </h2>
                  <p className="text-[11px] text-[#78716C] mt-0.5">
                    {drt(DR.full.selectedScheme, toDocCheckLang(lang))}: <span className="font-semibold text-[#1C1917]">{schemeName}</span>
                  </p>
                  {applicationStatus !== 'idle' && (
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: applicationStatus === 'error' ? '#DC2626' : applicationStatus === 'created' ? '#15803D' : '#78716C' }}
                      role={applicationStatus === 'error' ? 'alert' : undefined}
                    >
                      {applicationStatus === 'creating' && g(S.full.applicationCreating, lang)}
                      {applicationStatus === 'created' && g(S.full.applicationStarted, lang)}
                      {applicationStatus === 'exists' && g(S.full.applicationExists, lang)}
                      {applicationStatus === 'error' && g(S.full.applicationError, lang)}
                      {(applicationStatus === 'created' || applicationStatus === 'exists') && (
                        <button
                          type="button"
                          onClick={() => setActivePanel('tracker')}
                          className="ml-2 underline font-bold"
                          style={{ color: '#E8690B' }}
                        >
                          {g(S.full.trackerTitle, lang)} →
                        </button>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={clearDocReadinessData}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#78716C] border border-[#E7E0D8] rounded-[7px] px-3 py-2 hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    {drt(DR.common.clearData, toDocCheckLang(lang))}
                  </button>
                  {hasStoredDocData && Object.keys(docResults).length === 0 && (
                    <span className="text-[9.5px] text-[#A8A29E]">
                      {lang === 'hi-IN' ? 'पिछली जाँच का डेटा मिला' : lang === 'mr-IN' ? 'मागील तपासणीचा डेटा सापडला' : 'Previous check data found on this device'}
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[8px] px-3 py-2 mb-2">
                <p className="text-[10.5px] text-[#1D4ED8] leading-[1.5]">{drt(DR.common.purposeStatement, toDocCheckLang(lang))}</p>
              </div>
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2 mb-4">
                <p className="text-[10.5px] text-[#92400E] leading-[1.5]">{drt(DR.common.safetyNotice, toDocCheckLang(lang))}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
                {/* LEFT: required documents list */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide">{drt(DR.full.requiredDocuments, toDocCheckLang(lang))}</div>
                  {requiredDocs.map((ref) => {
                    const docResult = docResults[ref.type]
                    const isActive = ref.type === activeDocType
                    const statusKey = docResult ? docResult.status : 'not_checked'
                    const dotColor =
                      docResult?.status === 'ready' ? '#1A6B3C' : docResult?.status === 'warning' ? '#D97706' : docResult?.status === 'unclear' ? '#78716C' : docResult?.status === 'error' ? '#DC2626' : '#C4BFBA'
                    return (
                      <button
                        key={ref.type}
                        type="button"
                        onClick={() => setSelectedDocType(ref.type)}
                        className={`w-full text-left rounded-[8px] border p-3 transition-colors ${isActive ? 'border-[#E8690B] bg-[#FFF8F1]' : 'border-[#E7E0D8] bg-white hover:border-[#E8690B]'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} aria-hidden="true" />
                          <span className="text-[12.5px] font-semibold text-[#1C1917] flex-1">{drt(DR.documentTypes[ref.type], toDocCheckLang(lang))}</span>
                          {!ref.required && <span className="text-[8px] font-bold text-[#A8A29E] uppercase">{drt(DR.common.optional, toDocCheckLang(lang))}</span>}
                        </div>
                        <div className="text-[9.5px] text-[#A8A29E] mt-1 ml-4">{drt(DR.status[statusKey], toDocCheckLang(lang))} · {drt(DR.reasons[ref.reasonKey as keyof typeof DR.reasons], toDocCheckLang(lang))}</div>
                      </button>
                    )
                  })}
                  <div className="pt-1">
                    <ReadinessSummary lang={toDocCheckLang(lang)} score={docReadinessScore} compact />
                  </div>
                </div>

                {/* RIGHT: selected document check + cross-doc name comparison */}
                <div className="space-y-4">
                  <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-4">
                    <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#1C1917] mb-3" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                      {drt(DR.documentTypes[activeDocType], toDocCheckLang(lang))}
                      {activeDocRef && !activeDocRef.required && (
                        <span className="text-[9px] font-bold text-[#A8A29E] uppercase border border-[#E7E0D8] rounded-full px-2 py-0.5">{drt(DR.common.optional, toDocCheckLang(lang))}</span>
                      )}
                    </h3>
                    <DocumentReadinessCheck
                      key={activeDocType}
                      lang={toDocCheckLang(lang)}
                      documentType={activeDocType}
                      displayLabel={drt(DR.documentTypes[activeDocType], toDocCheckLang(lang))}
                      expectedProfileName={profileData.fullName || undefined}
                      onProfileNameProvided={(name) => updateProfile('fullName', name)}
                      initialResult={docResults[activeDocType] ?? null}
                      onResult={(result) => handleDocResult(activeDocType, result)}
                      inputIdPrefix={`full-${activeDocType}`}
                    />
                    {docVerifyStatus[activeDocType] && (
                      <p className="text-[10px] mt-2" style={{ color: docVerifyStatus[activeDocType] === 'failed' ? '#DC2626' : docVerifyStatus[activeDocType] === 'synced' ? '#15803D' : '#78716C' }}>
                        {docVerifyStatus[activeDocType] === 'pending' && 'Saving verification…'}
                        {docVerifyStatus[activeDocType] === 'synced' && 'Verification saved to server ✓'}
                        {docVerifyStatus[activeDocType] === 'failed' && 'Could not save verification to server'}
                      </p>
                    )}
                  </div>

                  <NameConsistencyCard lang={toDocCheckLang(lang)} profileName={profileData.fullName || '—'} comparisons={nameComparisons} onGoToDocument={(t) => setSelectedDocType(t)} />

                  <ReadinessSummary lang={toDocCheckLang(lang)} score={docReadinessScore} />

                  {currentApplicationId && (
                    <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-4">
                      {!letterTextByAppId[currentApplicationId] ? (
                        <>
                          <button
                            type="button"
                            onClick={handleGenerateLetter}
                            disabled={letterStatus === 'generating'}
                            className="w-full text-white text-[13px] font-bold rounded-[8px] py-3"
                            style={{ background: letterStatus === 'generating' ? '#D1CCC3' : '#E8690B', cursor: letterStatus === 'generating' ? 'default' : 'pointer' }}
                          >
                            {letterStatus === 'generating' ? g(S.full.generatingLetter, lang) : g(S.full.generateLetterBtn, lang)}
                          </button>
                          {letterStatus === 'error' && (
                            <p className="text-[11px] mt-2" style={{ color: '#DC2626' }} role="alert">{g(S.full.letterError, lang)}</p>
                          )}
                          {letterStatus === 'unavailable' && (
                            <p className="text-[11px] mt-2" style={{ color: '#78716C' }}>{g(S.full.letterUnavailable, lang)}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[13px] font-bold text-[#1C1917]">{g(S.full.letterGeneratedHeading, lang)}</h3>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(letterTextByAppId[currentApplicationId] ?? '')
                                setLetterCopied(true)
                                setTimeout(() => setLetterCopied(false), 2000)
                              }}
                              className="text-[10px] font-bold border border-[#E7E0D8] rounded-[6px] px-2.5 py-1.5"
                            >
                              {letterCopied ? g(S.full.letterCopied, lang) : g(S.full.copyLetterBtn, lang)}
                            </button>
                          </div>
                          <pre
                            className="text-[11px] text-[#1C1917] whitespace-pre-wrap max-h-[320px] overflow-y-auto p-3 rounded-[6px]"
                            style={{ background: '#FAF7F2', fontFamily: 'inherit', border: '1px solid #E7E0D8' }}
                          >
                            {letterTextByAppId[currentApplicationId]}
                          </pre>
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-[#A8A29E] leading-[1.5]">{drt(DR.common.disclaimerNote, toDocCheckLang(lang))}</p>
                </div>
              </div>
            </div>
          )}

          {activePanel === 'tracker' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#1C1917' }}>
                    {g(S.full.trackerTitle, lang)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#78716C', marginTop: '2px' }}>
                    {g(S.full.trackerSub, lang)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['all', 'pending', 'approved', 'action'].map(filter => (
                    <button
                      key={filter}
                      style={{
                        fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '99px',
                        cursor: 'pointer', fontFamily: 'inherit',
                        background: trackerFilter === filter ? '#1A6B3C' : 'white',
                        color: trackerFilter === filter ? 'white' : '#57534E',
                        border: trackerFilter === filter ? 'none' : '1px solid #E7E0D8'
                      }}
                      onClick={() => setTrackerFilter(filter)}
                    >
                      {filter === 'all' ? g(S.full.filterAll, lang) : filter === 'pending' ? g(S.full.filterPending, lang) : filter === 'approved' ? g(S.full.filterApproved, lang) : g(S.full.filterAction, lang)}
                    </button>
                  ))}
                </div>
              </div>

              {applicationsLoading && applications.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '11px', color: '#78716C' }}>
                  {g(S.full.trackerLoading, lang)}
                </div>
              )}
              {applicationsError && (
                <div style={{ padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#DC2626', marginBottom: '8px' }}>{applicationsError}</p>
                  <button
                    style={{ fontSize: '10px', fontWeight: 700, padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#E8690B', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                    onClick={() => refreshApplications()}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!applicationsLoading && !applicationsError && applications.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '11px', color: '#78716C' }}>
                  {g(S.full.trackerEmpty, lang)}
                </div>
              )}
              {applications
                .filter(item => trackerFilter === 'all' ||
                  (trackerFilter === 'pending' && item.status !== 'approved' && item.status !== 'rejected') ||
                  (trackerFilter === 'approved' && item.status === 'approved') ||
                  (trackerFilter === 'action' && (item.status === 'rejected' || item.status === 'docs_pending'))
                )
                .map((item, index) => {
                  const schemeDisplayName = schemeNamesById[item.scheme_id] ?? '…'
                  const colors = paletteFor(index)
                  const stepIndex = getStatusStepIndex(item.status)
                  const dateApplied = new Date(item.created_at).toLocaleDateString(
                    lang === 'hi-IN' ? 'hi-IN' : lang === 'mr-IN' ? 'mr-IN' : 'en-IN',
                    { day: '2-digit', month: 'short', year: 'numeric' }
                  )
                  return (
                    <div key={item.id} style={{ background: 'white', borderRadius: '10px', marginBottom: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E7E0D8' }}>
                      {/* Progress stepper — 5 forward states; approved/rejected shown via the status pill instead of a 6th node */}
                      <div style={{ background: '#FAF7F2', padding: '16px 20px', borderBottom: '1px solid #E7E0D8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          {[g(S.full.stepApplied, lang), g(S.full.stepDocsPending, lang), g(S.full.stepLetterGenerated, lang), g(S.full.stepReview, lang), g(S.full.stepVerified, lang)].map((step, i) => {
                            const filled = i < stepIndex
                            const isRejectedMarker = item.status === 'rejected' && i === stepIndex - 1
                            return (
                              <React.Fragment key={i}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                  <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    border: '2px solid',
                                    borderColor: isRejectedMarker ? '#DC2626' : filled ? '#1A6B3C' : '#E7E0D8',
                                    background: isRejectedMarker ? '#DC2626' : filled ? '#1A6B3C' : 'white',
                                    color: filled || isRejectedMarker ? 'white' : '#A8A29E',
                                    fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}>
                                    {isRejectedMarker ? '✗' : filled ? '✓' : i + 1}
                                  </div>
                                  <div style={{ fontSize: '9px', fontWeight: 700, color: isRejectedMarker ? '#DC2626' : filled ? '#1A6B3C' : '#A8A29E' }}>
                                    {step}
                                  </div>
                                </div>
                                {i < 4 && (
                                  <div style={{
                                    flex: 1, height: '2px', marginBottom: '16px',
                                    background: i < stepIndex - 1 ? '#1A6B3C' : '#E7E0D8'
                                  }}></div>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </div>
                      </div>
                      {/* Details */}
                      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1.5px solid #E7E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: '#FAF7F2', color: colors.logo }}>
                          {schemeDisplayName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917' }}>{schemeDisplayName}</div>
                          <div style={{ fontSize: '9px', color: '#A8A29E', marginTop: '1px' }}>{dateApplied}</div>
                          {item.reference_number ? (
                            <div style={{ fontSize: '9px', color: '#57534E', fontFamily: 'monospace', background: '#F4F1EC', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                              {item.reference_number}
                            </div>
                          ) : (
                            <div style={{ fontSize: '9px', color: '#A8A29E', fontStyle: 'italic', marginTop: '3px' }}>
                              {g(S.full.noRefYet, lang)}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#57534E', lineHeight: 1.5, marginTop: '4px' }}>
                            {getNextStepText(item.status, lang)}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          <div style={{
                            width: '130px', padding: '8px 12px', borderRadius: '8px', textAlign: 'center',
                            fontSize: '11px', fontWeight: 700,
                            ...getRealStatusStyle(item.status, lang)
                          }}>
                            {getRealStatusStyle(item.status, lang).label}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: '1px solid #E7E0D8', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                              onClick={() => refreshApplications()}
                            >
                              {g(S.full.updateBtn, lang)}
                            </button>
                            {item.status === 'docs_pending' && (
                              <button
                                style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#E8690B', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={() => setActivePanel('csc')}
                              >
                                {g(S.full.findCSCArrow, lang)}
                              </button>
                            )}
                            {item.status === 'approved' && (
                              <button
                                style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#25D366', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={() => shareWhatsApp(gf(S.full.approvedShare, lang, schemeDisplayName) + (item.reference_number ? '\nRef: ' + item.reference_number : ''))}
                              >
                                {g(S.full.shareCheck, lang)}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {activePanel === 'csc' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '10px', height: 'calc(100vh - 130px)' }}>
              {/* LEFT: CSC LIST */}
              <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <input
                  type="text"
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid #E7E0D8', padding: '10px 12px', fontSize: '11px', outline: 'none', fontFamily: 'inherit', color: '#1C1917' }}
                  placeholder={g(S.full.cscSearchPlaceholder, lang)}
                />
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {cscStatus === 'loading' && (
                    <div style={{ padding: '16px 12px', fontSize: '11px', color: '#78716C' }}>Finding CSCs near you…</div>
                  )}
                  {cscStatus === 'error' && (
                    <div style={{ padding: '12px' }}>
                      <p style={{ fontSize: '11px', color: '#DC2626', marginBottom: '8px', lineHeight: 1.5 }}>{cscErrorMessage}</p>
                      <button
                        style={{ fontSize: '10px', fontWeight: 700, padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#E8690B', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                        onClick={fetchNearbyCscs}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {cscStatus === 'ready' && cscList.length === 0 && (
                    <div style={{ padding: '16px 12px', fontSize: '11px', color: '#78716C' }}>No CSCs found near your current location.</div>
                  )}
                  {cscList.map((csc, index) => (
                    <div
                      key={csc.id}
                      style={{
                        padding: '11px 12px', borderBottom: '1px solid #F0EDE8', cursor: 'pointer',
                        transition: 'all 0.15s',
                        background: selectedCSC === index ? '#FFF8F1' : 'transparent',
                        borderLeft: selectedCSC === index ? '3px solid #E8690B' : 'transparent'
                      }}
                      onClick={() => setSelectedCSC(index)}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1C1917' }}>{csc.name}</div>
                      <div style={{ fontSize: '9px', color: '#78716C', marginTop: '2px', lineHeight: 1.4 }}>{csc.address}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '5px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px', background: '#F4F1EC', color: '#57534E' }}>
                          {csc.distance_km.toFixed(1)} km
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                        <button
                          style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#1565C0', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => openDirectionsTo(csc)}
                        >
                          {g(S.full.directions, lang)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: MAP PANEL */}
              <div style={{ background: '#1C1917', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px' }}>
                <div style={{ fontSize: '48px', opacity: 0.35 }}>🗺️</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700, color: 'white', textAlign: 'center' }}>
                  {g(S.full.openInMaps, lang)}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.5, maxWidth: '260px' }}>
                  {g(S.full.mapsHint, lang)}
                </div>
                <button
                  style={{ background: '#E8690B', color: 'white', borderRadius: '8px', padding: '10px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={openMaps}
                >
                  {g(S.full.openMaps, lang)}
                </button>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '12px', textAlign: 'center' }}>
                  {g(S.full.mapsAltHint, lang)}
                </div>
              </div>
            </div>
          )}

          {activePanel === 'helpline' && (
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#1C1917', marginBottom: '2px' }}>
                {g(S.full.helplineTitle, lang)}
              </div>
              <div style={{ fontSize: '10px', color: '#78716C', marginTop: '2px', marginBottom: '12px' }}>
                {g(S.full.helplineSub, lang)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {helplineData.map((item, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '14px', border: '1px solid #E7E0D8', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: '8px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', display: 'inline-block', marginBottom: '8px', background: item.categoryBg, color: item.categoryColor }}>
                      {lang === 'hi-IN' ? item.categoryHindi : lang === 'mr-IN' ? item.categoryMr : item.category}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917', marginBottom: '4px' }}>{lang === 'hi-IN' ? item.nameHindi : lang === 'mr-IN' ? item.nameMr : item.name}</div>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: 700, color: '#E8690B', display: 'block', marginBottom: '4px' }}>
                      {item.number}
                    </div>
                    <div style={{ fontSize: '9px', color: '#78716C', marginBottom: '2px' }}>{lang === 'hi-IN' ? item.hoursHindi : lang === 'mr-IN' ? item.hoursMr : item.hours}</div>
                    <div style={{ fontSize: '9px', color: '#A8A29E', marginBottom: '10px' }}>{lang === 'hi-IN' ? item.languagesHindi : lang === 'mr-IN' ? item.languagesMr : item.languages}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        style={{ flex: 1, padding: '7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: item.btnColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => window.open('tel:' + item.number.replace(/-/g, ''))}
                      >
                        {g(S.full.callNow, lang)}
                      </button>
                      <button
                        style={{ flex: 1, padding: '7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: '#25D366', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => window.open('https://wa.me/' + item.number.replace(/-/g, ''), '_blank')}
                      >
                        {g(S.full.waBtn, lang)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: #E8690B; border-radius: 2px; }
        ::-webkit-scrollbar-track { background: #F4F1EC; }
      `}</style>
    </div>
  )
}
export default function FullModePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Loading SuvidhaAI...
        </div>
      }
    >
      <FullModePageContent />
    </Suspense>
  )
}
