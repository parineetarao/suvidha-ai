'use client'

import React, { Suspense, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { S, g, gf, type Lang } from '@/lib/strings'
import type { DocumentType, DocumentReadinessResult, RequiredDocumentRef, NameComparison } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'
import { compareNames } from '@/lib/document-readiness/name-matching'
import { computeReadinessScore } from '@/lib/document-readiness/readiness-score'
import { loadStoredResults, saveStoredResult, clearStoredResults } from '@/lib/document-readiness/storage'
import { verifyDocument } from '@/lib/documents'
import { getCurrentPosition, getNearbyCscs, type CSCOut } from '@/lib/csc'
import { DocumentReadinessCheck } from '@/components/document-readiness/DocumentReadinessCheck'
import { NameConsistencyCard } from '@/components/document-readiness/NameConsistencyCard'
import { ReadinessSummary } from '@/components/document-readiness/ReadinessSummary'
import { ApplicationPreparationForm } from '@/components/full-mode/ApplicationPreparationForm'
import { FileCheck2, Trash2 } from 'lucide-react'

type ActivePanel = 'schemes' | 'compare' | 'prep' | 'tracker' | 'csc' | 'helpline'
type EligibilityStatus = 'eligible' | 'partial' | 'ineligible'
type AppStatus = 'approved' | 'docs_needed' | 'pending' | 'rejected'

type SchemeItem = {
  id: number
  nameHindi: string
  nameEnglish: string
  nameMr: string
  logoText: string
  logoColor: string
  headerColor: string
  ministry: string
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

type TrackerItem = {
  id: number
  schemeName: string
  schemeNameHindi: string
  schemeNameMr: string
  logoText: string
  logoColor: string
  dateApplied: string
  referenceNumber: string
  status: AppStatus
  nextStep: string
  nextStepHindi: string
  nextStepMr: string
  borderColor: string
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
}

const allSchemes: SchemeItem[] = [
  {
    id: 1,
    nameHindi: 'पीएम किसान सम्मान निधि',
    nameEnglish: 'PM Kisan Samman Nidhi',
    nameMr: 'पीएम किसान सन्मान निधी',
    logoText: 'पी',
    logoColor: '#1A6B3C',
    headerColor: '#1A6B3C',
    ministry: 'Ministry of Agriculture',
    amount: '₹6,000',
    unit: 'सालाना',
    unitHindi: 'सालाना',
    unitMr: 'वार्षिक',
    eligibility: 'eligible',
    matchScore: 94,
    matchLabel: 'High Match',
    warning: 'Aadhaar must be linked to bank account before applying',
    warningHindi: 'आवेदन से पहले आधार को बैंक खाते से लिंक करना ज़रूरी है',
    warningMr: 'अर्ज करण्यापूर्वी आधार बँक खात्याशी जोडणे आवश्यक आहे',
    applicationModes: ['Online', 'CSC'],
    rejectionRisks: [
      { risk: 'Name mismatch between Aadhaar and land records', fix: 'Visit Aadhaar centre to update name to exactly match land records' },
      { risk: 'Aadhaar not linked to bank account', fix: 'Visit any bank branch with Aadhaar card to link it' }
    ],
    rejectionRisksHindi: [
      { risk: 'आधार और ज़मीन के कागज़ों में नाम अलग-अलग है', fix: 'नाम को ज़मीन के कागज़ों से बिल्कुल मिलाने के लिए आधार केंद्र जाएं' },
      { risk: 'आधार बैंक खाते से लिंक नहीं है', fix: 'लिंक करने के लिए आधार कार्ड लेकर किसी भी बैंक शाखा में जाएं' }
    ],
    rejectionRisksMr: [
      { risk: 'आधार आणि जमिनीच्या कागदपत्रांमधील नाव वेगळे आहे', fix: 'नाव जमिनीच्या कागदपत्रांशी तंतोतंत जुळवण्यासाठी आधार केंद्रात जा' },
      { risk: 'आधार बँक खात्याशी जोडलेले नाही', fix: 'जोडण्यासाठी आधार कार्डसह कोणत्याही बँक शाखेत जा' }
    ],
    steps: [
      { text: 'Visit pmkisan.gov.in or nearest CSC centre', mode: 'online' },
      { text: 'Click New Farmer Registration', mode: 'online' },
      { text: 'Enter Aadhaar number — details auto-fill', mode: 'online' },
      { text: 'Fill land documents and bank account number', mode: 'offline' },
      { text: 'Submit and note the Reference Number', mode: 'online' }
    ],
    stepsHindi: ['pmkisan.gov.in पर जाएं या नज़दीकी CSC केंद्र जाएं', 'New Farmer Registration पर क्लिक करें', 'आधार नंबर डालें — जानकारी अपने आप भर जाएगी', 'ज़मीन के कागज़ और बैंक खाता नंबर भरें', 'Submit करें और Reference Number नोट करें'],
    stepsMr: ['pmkisan.gov.in वर जा किंवा जवळच्या CSC केंद्रात जा', 'New Farmer Registration वर क्लिक करा', 'आधार क्रमांक टाका — माहिती आपोआप भरली जाईल', 'जमिनीचे कागद आणि बँक खाते क्रमांक भरा', 'Submit करा आणि Reference Number नोंदवा'],
    documents: ['Aadhaar Card', 'Bank Passbook', 'Land Records (Khasra/Khatauni)', 'Mobile Number (Aadhaar linked)', 'Passport Photo (2 copies)'],
    documentsHindi: ['आधार कार्ड', 'बैंक पासबुक', 'ज़मीन के कागज़ (खसरा/खतौनी)', 'मोबाइल नंबर (आधार से लिंक)', 'पासपोर्ट फोटो (2 प्रतियां)'],
    documentsMr: ['आधार कार्ड', 'बँक पासबुक', 'जमिनीचे कागद (खसरा/खतावणी)', 'मोबाइल क्रमांक (आधार लिंक)', 'पासपोर्ट फोटो (2 प्रती)'],
    officialUrl: 'https://pmkisan.gov.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
      { type: 'land_record', required: true, labelKey: 'land_record', reasonKey: 'landOwnershipProof' },
    ],
  },
  {
    id: 2,
    nameHindi: 'प्रधानमंत्री फसल बीमा',
    nameEnglish: 'PM Fasal Bima Yojana',
    nameMr: 'पंतप्रधान पीक विमा योजना',
    logoText: 'फ',
    logoColor: '#E8690B',
    headerColor: '#E8690B',
    ministry: 'Ministry of Agriculture',
    amount: 'Full Coverage',
    unit: 'फसल नुकसान',
    unitHindi: 'फसल नुकसान',
    unitMr: 'पीक नुकसान',
    eligibility: 'eligible',
    matchScore: 88,
    matchLabel: 'High Match',
    warning: 'Must apply within 2 weeks of sowing',
    warningHindi: 'बुआई के 2 हफ्ते के अंदर आवेदन करना ज़रूरी है',
    warningMr: 'पेरणीच्या 2 आठवड्यांच्या आत अर्ज करणे आवश्यक आहे',
    applicationModes: ['CSC', 'Bank'],
    rejectionRisks: [
      { risk: 'Application submitted after sowing deadline', fix: 'Apply within 2 weeks of crop sowing' },
      { risk: 'Incorrect crop or area details', fix: 'Cross-verify with Khasra document before filling' }
    ],
    rejectionRisksHindi: [
      { risk: 'आवेदन बुआई की समय-सीमा के बाद जमा किया गया', fix: 'फसल बुआई के 2 हफ्ते के अंदर आवेदन करें' },
      { risk: 'फसल या क्षेत्रफल की जानकारी गलत है', fix: 'फॉर्म भरने से पहले खसरा दस्तावेज़ से मिलान करें' }
    ],
    rejectionRisksMr: [
      { risk: 'पेरणीच्या मुदतीनंतर अर्ज सादर केला', fix: 'पीक पेरणीच्या 2 आठवड्यांच्या आत अर्ज करा' },
      { risk: 'पीक किंवा क्षेत्रफळाची माहिती चुकीची आहे', fix: 'फॉर्म भरण्यापूर्वी खसरा दस्तऐवजाशी पडताळणी करा' }
    ],
    steps: [
      { text: 'Visit nearest bank or CSC centre', mode: 'csc' },
      { text: 'Fill PMFBY Application Form', mode: 'offline' },
      { text: 'Provide Khasra number and sowing details', mode: 'offline' },
      { text: 'Pay premium amount', mode: 'offline' },
      { text: 'Collect Insurance Certificate', mode: 'csc' }
    ],
    stepsHindi: ['नज़दीकी बैंक या CSC केंद्र जाएं', 'PMFBY Application Form भरें', 'खसरा नंबर और बुआई की जानकारी दें', 'प्रीमियम राशि जमा करें', 'बीमा प्रमाण पत्र लें'],
    stepsMr: ['जवळच्या बँकेत किंवा CSC केंद्रात जा', 'PMFBY अर्ज फॉर्म भरा', 'खसरा क्रमांक आणि पेरणीची माहिती द्या', 'प्रीमियम रक्कम भरा', 'विमा प्रमाणपत्र घ्या'],
    documents: ['Aadhaar Card', 'Bank Passbook', 'Land Records', 'Crop Sowing Certificate'],
    documentsHindi: ['आधार कार्ड', 'बैंक पासबुक', 'ज़मीन के कागज़', 'फसल बुआई प्रमाण पत्र'],
    documentsMr: ['आधार कार्ड', 'बँक पासबुक', 'जमिनीचे कागद', 'पीक पेरणी प्रमाणपत्र'],
    officialUrl: 'https://pmfby.gov.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
      { type: 'land_record', required: true, labelKey: 'land_record', reasonKey: 'landOwnershipProof' },
    ],
  },
  {
    id: 3,
    nameHindi: 'पीएम आवास योजना ग्रामीण',
    nameEnglish: 'PM Awas Yojana (Rural)',
    nameMr: 'पीएम आवास योजना ग्रामीण',
    logoText: 'आ',
    logoColor: '#1565C0',
    headerColor: '#1565C0',
    ministry: 'Ministry of Rural Development',
    amount: '₹1.3 Lakh',
    unit: 'एकमुश्त',
    unitHindi: 'एकमुश्त',
    unitMr: 'एकरकमी',
    eligibility: 'partial',
    matchScore: 72,
    matchLabel: 'Partial Match',
    warning: 'Must be in SECC 2011 beneficiary list',
    warningHindi: 'SECC 2011 लाभार्थी सूची में नाम होना ज़रूरी है',
    warningMr: 'SECC 2011 लाभार्थी यादीत नाव असणे आवश्यक आहे',
    applicationModes: ['Gram Panchayat'],
    rejectionRisks: [
      { risk: 'Name not in SECC 2011 list', fix: 'Check at Gram Panchayat and apply for inclusion' },
      { risk: 'Already owns a pucca house', fix: 'Scheme only for those without any pucca house in India' }
    ],
    rejectionRisksHindi: [
      { risk: 'नाम SECC 2011 सूची में नहीं है', fix: 'ग्राम पंचायत में जाँच करें और शामिल होने के लिए आवेदन करें' },
      { risk: 'पहले से पक्का घर मौजूद है', fix: 'यह योजना केवल उनके लिए है जिनके पास भारत में कहीं भी पक्का घर नहीं है' }
    ],
    rejectionRisksMr: [
      { risk: 'नाव SECC 2011 यादीत नाही', fix: 'ग्रामपंचायतीत तपासा आणि समाविष्ट होण्यासाठी अर्ज करा' },
      { risk: 'आधीच पक्के घर आहे', fix: 'ही योजना फक्त भारतात कुठेही पक्के घर नसलेल्यांसाठी आहे' }
    ],
    steps: [
      { text: 'Visit Gram Panchayat office', mode: 'offline' },
      { text: 'Apply for PMAY-G registration', mode: 'offline' },
      { text: 'Submit BPL Card and Aadhaar', mode: 'offline' },
      { text: 'Wait for survey and verification', mode: 'offline' },
      { text: 'Receive funds in installments after approval', mode: 'offline' }
    ],
    stepsHindi: ['ग्राम पंचायत कार्यालय जाएं', 'PMAY-G पंजीकरण के लिए आवेदन करें', 'BPL कार्ड और आधार जमा करें', 'सर्वेक्षण और सत्यापन का इंतज़ार करें', 'स्वीकृति के बाद किस्तों में राशि मिलेगी'],
    stepsMr: ['ग्रामपंचायत कार्यालयात जा', 'PMAY-G नोंदणीसाठी अर्ज करा', 'BPL कार्ड आणि आधार जमा करा', 'सर्वेक्षण आणि पडताळणीची वाट पाहा', 'मंजुरीनंतर हप्त्यांमध्ये रक्कम मिळेल'],
    documents: ['Aadhaar Card', 'BPL Ration Card', 'Bank Passbook', 'Income Certificate', 'Passport Photo'],
    documentsHindi: ['आधार कार्ड', 'BPL राशन कार्ड', 'बैंक पासबुक', 'आय प्रमाण पत्र', 'पासपोर्ट फोटो'],
    documentsMr: ['आधार कार्ड', 'BPL रेशन कार्ड', 'बँक पासबुक', 'उत्पन्नाचा दाखला', 'पासपोर्ट फोटो'],
    officialUrl: 'https://pmayg.nic.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'ration_card', required: true, labelKey: 'ration_card', reasonKey: 'householdProof' },
      { type: 'income_certificate', required: true, labelKey: 'income_certificate', reasonKey: 'incomeProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
    ],
  },
  {
    id: 4,
    nameHindi: 'आयुष्मान भारत PMJAY',
    nameEnglish: 'Ayushman Bharat PMJAY',
    nameMr: 'आयुष्मान भारत PMJAY',
    logoText: 'आ',
    logoColor: '#FF671F',
    headerColor: '#FF671F',
    ministry: 'Ministry of Health',
    amount: '₹5 लाख',
    unit: 'प्रति वर्ष',
    unitHindi: 'प्रति वर्ष',
    unitMr: 'प्रति वर्ष',
    eligibility: 'eligible',
    matchScore: 91,
    matchLabel: 'High Match',
    warning: null,
    warningHindi: null,
    warningMr: null,
    applicationModes: ['Online', 'Hospital'],
    rejectionRisks: [
      { risk: 'Family not in SECC database', fix: 'Check eligibility at pmjay.gov.in using mobile number' },
      { risk: 'Treatment at non-empanelled hospital', fix: 'Only empanelled hospitals accept Ayushman Card' }
    ],
    rejectionRisksHindi: [
      { risk: 'परिवार SECC डेटाबेस में नहीं है', fix: 'मोबाइल नंबर से pmjay.gov.in पर पात्रता जाँचें' },
      { risk: 'गैर-सूचीबद्ध अस्पताल में इलाज', fix: 'केवल सूचीबद्ध अस्पताल ही आयुष्मान कार्ड स्वीकार करते हैं' }
    ],
    rejectionRisksMr: [
      { risk: 'कुटुंब SECC डेटाबेसमध्ये नाही', fix: 'मोबाइल क्रमांकाने pmjay.gov.in वर पात्रता तपासा' },
      { risk: 'नोंदणी नसलेल्या रुग्णालयात उपचार', fix: 'फक्त नोंदणीकृत रुग्णालयेच आयुष्मान कार्ड स्वीकारतात' }
    ],
    steps: [
      { text: 'Check eligibility at pmjay.gov.in', mode: 'online' },
      { text: 'Visit nearest empanelled hospital or CSC', mode: 'csc' },
      { text: 'Get Ayushman Card made with Aadhaar', mode: 'offline' },
      { text: 'Show card at hospital during treatment', mode: 'offline' },
      { text: 'Receive cashless treatment up to ₹5 lakh', mode: 'offline' }
    ],
    stepsHindi: ['pmjay.gov.in पर पात्रता जाँचें', 'नज़दीकी सूचीबद्ध अस्पताल या CSC जाएं', 'आधार से आयुष्मान कार्ड बनवाएं', 'इलाज के समय अस्पताल में कार्ड दिखाएं', '₹5 लाख तक का कैशलेस इलाज पाएं'],
    stepsMr: ['pmjay.gov.in वर पात्रता तपासा', 'जवळच्या नोंदणीकृत रुग्णालयात किंवा CSC मध्ये जा', 'आधारसह आयुष्मान कार्ड बनवा', 'उपचारावेळी रुग्णालयात कार्ड दाखवा', '₹5 लाखांपर्यंत कॅशलेस उपचार मिळवा'],
    documents: ['Aadhaar Card', 'Ration Card', 'Mobile Number'],
    documentsHindi: ['आधार कार्ड', 'राशन कार्ड', 'मोबाइल नंबर'],
    documentsMr: ['आधार कार्ड', 'रेशन कार्ड', 'मोबाइल क्रमांक'],
    officialUrl: 'https://pmjay.gov.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'ration_card', required: true, labelKey: 'ration_card', reasonKey: 'householdProof' },
    ],
  },
  {
    id: 5,
    nameHindi: 'पीएम मुद्रा योजना',
    nameEnglish: 'PM Mudra Yojana',
    nameMr: 'पीएम मुद्रा योजना',
    logoText: 'मु',
    logoColor: '#E8690B',
    headerColor: '#E8690B',
    ministry: 'Ministry of Finance',
    amount: '₹10 लाख',
    unit: 'तक ऋण',
    unitHindi: 'तक ऋण',
    unitMr: 'पर्यंत कर्ज',
    eligibility: 'eligible',
    matchScore: 85,
    matchLabel: 'High Match',
    warning: 'Prior business experience required',
    warningHindi: 'व्यापार का पूर्व अनुभव ज़रूरी है',
    warningMr: 'व्यवसायाचा आधीचा अनुभव आवश्यक आहे',
    applicationModes: ['Bank', 'NBFC'],
    rejectionRisks: [
      { risk: 'No business plan or proof of business activity', fix: 'Prepare a simple business plan before visiting bank' },
      { risk: 'Poor credit history or existing loan default', fix: 'Check CIBIL score at bank before applying' }
    ],
    rejectionRisksHindi: [
      { risk: 'व्यापार योजना या व्यापार गतिविधि का प्रमाण नहीं है', fix: 'बैंक जाने से पहले एक सरल व्यापार योजना तैयार करें' },
      { risk: 'खराब क्रेडिट इतिहास या मौजूदा ऋण चूक', fix: 'आवेदन से पहले बैंक में CIBIL स्कोर जाँचें' }
    ],
    rejectionRisksMr: [
      { risk: 'व्यवसाय योजना किंवा व्यवसाय क्रियाकलापाचा पुरावा नाही', fix: 'बँकेत जाण्यापूर्वी एक साधी व्यवसाय योजना तयार करा' },
      { risk: 'खराब क्रेडिट इतिहास किंवा सध्याचे कर्ज थकीत', fix: 'अर्ज करण्यापूर्वी बँकेत CIBIL स्कोअर तपासा' }
    ],
    steps: [
      { text: 'Visit nearest bank or NBFC', mode: 'offline' },
      { text: 'Collect Mudra Loan Application Form', mode: 'offline' },
      { text: 'Submit business plan and identity documents', mode: 'offline' },
      { text: 'Bank processes application (7–30 days)', mode: 'offline' },
      { text: 'Receive Mudra Card with loan amount', mode: 'offline' }
    ],
    stepsHindi: ['नज़दीकी बैंक या NBFC जाएं', 'Mudra Loan Application Form लें', 'व्यापार योजना और पहचान दस्तावेज़ जमा करें', 'बैंक आवेदन को प्रोसेस करेगा (7–30 दिन)', 'ऋण राशि के साथ Mudra Card पाएं'],
    stepsMr: ['जवळच्या बँकेत किंवा NBFC मध्ये जा', 'Mudra Loan अर्ज फॉर्म घ्या', 'व्यवसाय योजना आणि ओळख कागदपत्रे द्या', 'बँक अर्जावर प्रक्रिया करेल (7–30 दिवस)', 'कर्ज रकमेसह Mudra Card मिळवा'],
    documents: ['Aadhaar Card', 'PAN Card', 'Bank Passbook', 'Business Registration (if any)', 'Passport Photo'],
    documentsHindi: ['आधार कार्ड', 'पैन कार्ड', 'बैंक पासबुक', 'व्यापार पंजीकरण (यदि हो)', 'पासपोर्ट फोटो'],
    documentsMr: ['आधार कार्ड', 'पॅन कार्ड', 'बँक पासबुक', 'व्यवसाय नोंदणी (असल्यास)', 'पासपोर्ट फोटो'],
    officialUrl: 'https://mudra.org.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
      { type: 'income_certificate', required: false, labelKey: 'income_certificate', reasonKey: 'incomeProof' },
    ],
  },
  {
    id: 6,
    nameHindi: 'पीएम उज्ज्वला योजना',
    nameEnglish: 'PM Ujjwala Yojana',
    nameMr: 'पीएम उज्ज्वला योजना',
    logoText: 'उ',
    logoColor: '#6A1B9A',
    headerColor: '#6A1B9A',
    ministry: 'Ministry of Petroleum',
    amount: 'Free LPG',
    unit: 'कनेक्शन',
    unitHindi: 'कनेक्शन',
    unitMr: 'कनेक्शन',
    eligibility: 'eligible',
    matchScore: 89,
    matchLabel: 'High Match',
    warning: 'BPL Ration Card mandatory',
    warningHindi: 'BPL राशन कार्ड होना अनिवार्य है',
    warningMr: 'BPL रेशन कार्ड असणे अनिवार्य आहे',
    applicationModes: ['LPG Distributor'],
    rejectionRisks: [
      { risk: 'LPG connection already exists at address', fix: 'Only one connection per household' },
      { risk: 'Name not matching BPL list', fix: 'Ensure Aadhaar name matches BPL ration card exactly' }
    ],
    rejectionRisksHindi: [
      { risk: 'पते पर पहले से LPG कनेक्शन मौजूद है', fix: 'प्रति परिवार केवल एक कनेक्शन मिलेगा' },
      { risk: 'नाम BPL सूची से मेल नहीं खाता', fix: 'सुनिश्चित करें कि आधार नाम BPL राशन कार्ड से बिल्कुल मेल खाए' }
    ],
    rejectionRisksMr: [
      { risk: 'पत्त्यावर आधीच LPG कनेक्शन आहे', fix: 'प्रति कुटुंब फक्त एकच कनेक्शन मिळेल' },
      { risk: 'नाव BPL यादीशी जुळत नाही', fix: 'आधार नाव BPL रेशन कार्डशी तंतोतंत जुळते याची खात्री करा' }
    ],
    steps: [
      { text: 'Visit nearest LPG distributor', mode: 'offline' },
      { text: 'Collect Ujjwala Application Form', mode: 'offline' },
      { text: 'Submit BPL card, Aadhaar and bank details', mode: 'offline' },
      { text: 'Verification by distributor (3–7 days)', mode: 'offline' },
      { text: 'Receive free connection and first cylinder', mode: 'offline' }
    ],
    stepsHindi: ['नज़दीकी LPG वितरक के पास जाएं', 'Ujjwala Application Form लें', 'BPL कार्ड, आधार और बैंक विवरण जमा करें', 'वितरक द्वारा सत्यापन (3–7 दिन)', 'मुफ्त कनेक्शन और पहला सिलेंडर पाएं'],
    stepsMr: ['जवळच्या LPG वितरकाकडे जा', 'उज्ज्वला अर्ज फॉर्म घ्या', 'BPL कार्ड, आधार आणि बँक तपशील जमा करा', 'वितरकाकडून पडताळणी (3–7 दिवस)', 'मोफत कनेक्शन आणि पहिला सिलेंडर मिळवा'],
    documents: ['Aadhaar Card', 'BPL Ration Card', 'Bank Passbook', 'Passport Photo'],
    documentsHindi: ['आधार कार्ड', 'BPL राशन कार्ड', 'बैंक पासबुक', 'पासपोर्ट फोटो'],
    documentsMr: ['आधार कार्ड', 'BPL रेशन कार्ड', 'बँक पासबुक', 'पासपोर्ट फोटो'],
    officialUrl: 'https://pmuy.gov.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'ration_card', required: true, labelKey: 'ration_card', reasonKey: 'householdProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
    ],
  },
  {
    id: 7,
    nameHindi: 'PMKVY कौशल विकास',
    nameEnglish: 'PMKVY Skill Development',
    nameMr: 'PMKVY कौशल्य विकास',
    logoText: 'क',
    logoColor: '#1565C0',
    headerColor: '#1565C0',
    ministry: 'Ministry of Skill Development',
    amount: 'Free Training',
    unit: 'Certificate',
    unitHindi: 'प्रमाण पत्र के साथ',
    unitMr: 'प्रमाणपत्रासह',
    eligibility: 'eligible',
    matchScore: 82,
    matchLabel: 'High Match',
    warning: null,
    warningHindi: null,
    warningMr: null,
    applicationModes: ['Online', 'Training Centre'],
    rejectionRisks: [
      { risk: 'Centre not available for chosen skill', fix: 'Check pmkvyofficial.org for available courses near you' }
    ],
    rejectionRisksHindi: [
      { risk: 'चुने गए कौशल के लिए केंद्र उपलब्ध नहीं है', fix: 'अपने पास उपलब्ध कोर्स के लिए pmkvyofficial.org देखें' }
    ],
    rejectionRisksMr: [
      { risk: 'निवडलेल्या कौशल्यासाठी केंद्र उपलब्ध नाही', fix: 'जवळील उपलब्ध कोर्ससाठी pmkvyofficial.org पहा' }
    ],
    steps: [
      { text: 'Visit pmkvyofficial.org', mode: 'online' },
      { text: 'Find nearest training centre', mode: 'online' },
      { text: 'Register with Aadhaar', mode: 'online' },
      { text: 'Complete training course (3–6 months)', mode: 'offline' },
      { text: 'Receive certificate and placement assistance', mode: 'offline' }
    ],
    stepsHindi: ['pmkvyofficial.org पर जाएं', 'नज़दीकी प्रशिक्षण केंद्र खोजें', 'आधार से पंजीकरण करें', 'प्रशिक्षण कोर्स पूरा करें (3–6 महीने)', 'प्रमाण पत्र और नौकरी सहायता पाएं'],
    stepsMr: ['pmkvyofficial.org वर जा', 'जवळचे प्रशिक्षण केंद्र शोधा', 'आधारसह नोंदणी करा', 'प्रशिक्षण अभ्यासक्रम पूर्ण करा (3–6 महिने)', 'प्रमाणपत्र आणि नोकरी सहाय्य मिळवा'],
    documents: ['Aadhaar Card', 'Educational Certificate', 'Passport Photo'],
    documentsHindi: ['आधार कार्ड', 'शैक्षणिक प्रमाण पत्र', 'पासपोर्ट फोटो'],
    documentsMr: ['आधार कार्ड', 'शैक्षणिक प्रमाणपत्र', 'पासपोर्ट फोटो'],
    officialUrl: 'https://pmkvyofficial.org',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'passport_photo', required: true, labelKey: 'passport_photo', reasonKey: 'photoRequirement' },
    ],
  },
  {
    id: 8,
    nameHindi: 'सुकन्या समृद्धि योजना',
    nameEnglish: 'Sukanya Samridhi Yojana',
    nameMr: 'सुकन्या समृद्धी योजना',
    logoText: 'सु',
    logoColor: '#880E4F',
    headerColor: '#880E4F',
    ministry: 'Ministry of Finance',
    amount: '8.2% ब्याज',
    unit: 'बेटी बचत',
    unitHindi: 'बेटी बचत',
    unitMr: 'मुलीसाठी बचत',
    eligibility: 'partial',
    matchScore: 68,
    matchLabel: 'Partial Match',
    warning: 'Girl child must be under 10 years',
    warningHindi: 'बेटी की उम्र 10 साल से कम होनी चाहिए',
    warningMr: 'मुलीचे वय 10 वर्षांपेक्षा कमी असणे आवश्यक आहे',
    applicationModes: ['Post Office', 'Bank'],
    rejectionRisks: [
      { risk: 'Girl child above 10 years', fix: 'Scheme is only for girls below 10 years' }
    ],
    rejectionRisksHindi: [
      { risk: 'बेटी की उम्र 10 साल से अधिक है', fix: 'यह योजना केवल 10 साल से कम उम्र की बेटियों के लिए है' }
    ],
    rejectionRisksMr: [
      { risk: 'मुलीचे वय 10 वर्षांपेक्षा जास्त आहे', fix: 'ही योजना फक्त 10 वर्षांखालील मुलींसाठी आहे' }
    ],
    steps: [
      { text: 'Visit nearest Post Office or bank', mode: 'offline' },
      { text: 'Collect Sukanya Samridhi Form', mode: 'offline' },
      { text: 'Submit girl child birth certificate and Aadhaar', mode: 'offline' },
      { text: 'Open account with minimum ₹250', mode: 'offline' },
      { text: 'Deposit annually until girl turns 15', mode: 'offline' }
    ],
    stepsHindi: ['नज़दीकी पोस्ट ऑफिस या बैंक जाएं', 'Sukanya Samridhi Form लें', 'बेटी का जन्म प्रमाण पत्र और आधार जमा करें', 'न्यूनतम ₹250 से खाता खोलें', 'बेटी के 15 साल की होने तक हर साल जमा करें'],
    stepsMr: ['जवळच्या पोस्ट ऑफिस किंवा बँकेत जा', 'सुकन्या समृद्धी फॉर्म घ्या', 'मुलीचे जन्म प्रमाणपत्र आणि आधार जमा करा', 'किमान ₹250 ने खाते उघडा', 'मुलगी 15 वर्षांची होईपर्यंत दरवर्षी जमा करा'],
    documents: ['Girl Child Birth Certificate', 'Aadhaar (parent and child)', 'Bank Passbook'],
    documentsHindi: ['बेटी का जन्म प्रमाण पत्र', 'आधार (माता-पिता और बेटी)', 'बैंक पासबुक'],
    documentsMr: ['मुलीचे जन्म प्रमाणपत्र', 'आधार (पालक आणि मूल)', 'बँक पासबुक'],
    officialUrl: 'https://www.indiapost.gov.in',
    requiredDocuments: [
      { type: 'aadhaar', required: true, labelKey: 'aadhaar', reasonKey: 'identityProof' },
      { type: 'bank_passbook', required: true, labelKey: 'bank_passbook', reasonKey: 'directBenefitTransfer' },
      { type: 'domicile_certificate', required: false, labelKey: 'domicile_certificate', reasonKey: 'residenceProof' },
    ],
  }
]

const trackerData: TrackerItem[] = [
  { id: 1, schemeName: 'PM Kisan Samman Nidhi', schemeNameHindi: 'पीएम किसान सम्मान निधि', schemeNameMr: 'पीएम किसान सन्मान निधी', logoText: 'पी', logoColor: '#1A6B3C', dateApplied: '15 Jan 2025', referenceNumber: 'PMKISAN-MH-2025-18832', status: 'approved', nextStep: 'Next installment due April 2025. Check bank account on 1st April.', nextStepHindi: 'अगली किस्त अप्रैल 2025 में देय है। 1 अप्रैल को बैंक खाता जाँचें।', nextStepMr: 'पुढील हप्ता एप्रिल 2025 मध्ये देय आहे. 1 एप्रिल रोजी बँक खाते तपासा.', borderColor: '#1A6B3C' },
  { id: 2, schemeName: 'Ayushman Bharat PMJAY', schemeNameHindi: 'आयुष्मान भारत PMJAY', schemeNameMr: 'आयुष्मान भारत PMJAY', logoText: 'आ', logoColor: '#FF671F', dateApplied: '02 Feb 2025', referenceNumber: 'PMJAY-2025-44210', status: 'docs_needed', nextStep: 'Submit updated ration card copy at nearest CSC centre.', nextStepHindi: 'नज़दीकी CSC केंद्र पर अपडेटेड राशन कार्ड की प्रति जमा करें।', nextStepMr: 'जवळच्या CSC केंद्रात अद्ययावत रेशन कार्डची प्रत जमा करा.', borderColor: '#1565C0' },
  { id: 3, schemeName: 'PM Awas Yojana Rural', schemeNameHindi: 'पीएम आवास योजना ग्रामीण', schemeNameMr: 'पीएम आवास योजना ग्रामीण', logoText: 'आ', logoColor: '#1565C0', dateApplied: '20 Mar 2025', referenceNumber: '', status: 'pending', nextStep: 'Survey scheduled. Keep all documents ready at home.', nextStepHindi: 'सर्वेक्षण निर्धारित है। घर पर सभी दस्तावेज़ तैयार रखें।', nextStepMr: 'सर्वेक्षण नियोजित आहे. घरी सर्व कागदपत्रे तयार ठेवा.', borderColor: '#D97706' }
]

function getTrackerName(item: TrackerItem, lang: Lang): string {
  if (lang === 'hi-IN') return item.schemeNameHindi
  if (lang === 'mr-IN') return item.schemeNameMr
  return item.schemeName
}
function getTrackerNextStep(item: TrackerItem, lang: Lang): string {
  if (lang === 'hi-IN') return item.nextStepHindi
  if (lang === 'mr-IN') return item.nextStepMr
  return item.nextStep
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

function getStatusStyle(s: AppStatus, lang: Lang) {
  const map = {
    approved: { label: g(S.full.statusApproved, lang), bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    docs_needed: { label: g(S.full.statusDocs, lang), bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    pending: { label: g(S.full.statusPending, lang), bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    rejected: { label: g(S.full.statusRejected, lang), bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' }
  }
  return map[s]
}

function getSchemeCategory(scheme: SchemeItem): string {
  if (scheme.id === 1 || scheme.id === 2) return 'farmer'
  if (scheme.id === 3) return 'housing'
  if (scheme.id === 4) return 'health'
  if (scheme.id === 5) return 'business'
  if (scheme.id === 6 || scheme.id === 8) return 'women'
  if (scheme.id === 7) return 'student'
  return 'general'
}

function filterSchemes(schemes: SchemeItem[], query: string): SchemeItem[] {
  if (!query.trim()) return schemes
  const q = query.toLowerCase()
  const isFarmer = q.includes('किसान') || q.includes('kisan') || q.includes('farmer') || q.includes('खेती') || q.includes('fasal') || q.includes('फसल') || q.includes('agriculture') || q.includes('crop') || q.includes('शेतकरी') || q.includes('शेती')
  const isWomen = q.includes('महिला') || q.includes('women') || q.includes('woman') || q.includes('beti') || q.includes('ujjwala')
  const isStudent = q.includes('student') || q.includes('छात्र') || q.includes('scholarship') || q.includes('शिक्षा') || q.includes('education') || q.includes('skill') || q.includes('विद्यार्थी') || q.includes('शिक्षण')
  const isHousing = q.includes('घर') || q.includes('housing') || q.includes('awas') || q.includes('home') || q.includes('house')
  const isSenior = q.includes('pension') || q.includes('पेंशन') || q.includes('health') || q.includes('hospital') || q.includes('ayushman') || q.includes('आरोग्य')
  const isBusiness = q.includes('business') || q.includes('loan') || q.includes('mudra') || q.includes('कर्ज़') || q.includes('कर्ज') || q.includes('व्यवसाय')

  return schemes.filter(s => {
    if (isFarmer && (s.id === 1 || s.id === 2)) return true
    if (isWomen && (s.id === 6 || s.id === 8)) return true
    if (isStudent && s.id === 7) return true
    if (isHousing && s.id === 3) return true
    if (isSenior && s.id === 4) return true
    if (isBusiness && s.id === 5) return true
    if (s.nameEnglish.toLowerCase().includes(q)) return true
    if (s.nameHindi.includes(q)) return true
    if (s.nameMr.includes(q)) return true
    return false
  })
}

function FullModePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Core state
  const [activePanel, setActivePanel] = useState<ActivePanel>('schemes')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SchemeItem[]>(allSchemes)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedScheme, setSelectedScheme] = useState<SchemeItem>(allSchemes[0])
  const [compareList, setCompareList] = useState<SchemeItem[]>([])
  const [savedIds, setSavedIds] = useState<number[]>([])
  const [checkedDocs, setCheckedDocs] = useState<Record<number, boolean>>({ 0: true, 1: true })
  const [referenceNumber, setReferenceNumber] = useState('')
  const [scriptLang, setScriptLang] = useState<'hindi' | 'marathi' | 'english'>('hindi')
  const [selectedCSC, setSelectedCSC] = useState(0)
  const [cscList, setCscList] = useState<CSCOut[]>([])
  const [cscStatus, setCscStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [cscErrorMessage, setCscErrorMessage] = useState<string | null>(null)
  const [trackerFilter, setTrackerFilter] = useState('all')
  const [isListening, setIsListening] = useState(false)
  const [sortBy, setSortBy] = useState('match')
  // Full Mode's own selector only ever offers these 3 (see the <select>
  // below) — narrower than the app-wide Lang (10 codes, as of the landing
  // page i18n expansion) on purpose, since it flows into the
  // document-readiness subsystem's DocLang-typed props, which are still
  // Hindi/Marathi/English only by design. A narrower type here is safely
  // assignable everywhere the wider Lang is expected (g/gf calls below).
  const [lang, setLang] = useState<'hi-IN' | 'mr-IN' | 'en-IN'>('en-IN')

  // Profile state
  const [hasProfile, setHasProfile] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: '', age: '', state: '', occupation: '', income: '',
    land: '', landOwnership: '', aadhaarBankLinked: '',
    currentHouse: '', bplCard: '', familySize: '', rationCardType: '',
    businessType: '', businessAge: '', existingLoan: '',
    maritalStatus: '', lpgConnection: '', girlChildAge: '',
    qualification: '', institutionName: '',
    gender: '', district: '', mobileNumber: '', farmerCategory: '',
    landArea: '', surveyNumber: '', bankName: '', accountNumber: '', ifscCode: ''
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

  // URL param on mount
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setSearchQuery(q)
      const filtered = filterSchemes(allSchemes, q)
      setResults(filtered.length > 0 ? filtered : allSchemes)
      setHasSearched(true)
      if (filtered.length > 0) setSelectedScheme(filtered[0])
    }
  }, [searchParams])

  const handleSearch = () => {
    const filtered = filterSchemes(allSchemes, searchQuery)
    setResults(filtered.length > 0 ? filtered : allSchemes)
    setHasSearched(true)
    if (filtered.length > 0) setSelectedScheme(filtered[0])
  }

  const toggleSave = (id: number) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleCompare = (scheme: SchemeItem) => {
    setCompareList(prev => {
      if (prev.find(s => s.id === scheme.id)) return prev.filter(s => s.id !== scheme.id)
      if (prev.length >= 3) { alert(g(S.full.maxCompare, lang)); return prev }
      return [...prev, scheme]
    })
  }

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

  const startVoice = () => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert(lang === 'hi-IN' ? 'इस ब्राउज़र में आवाज़ समर्थित नहीं है' : lang === 'mr-IN' ? 'या ब्राउझरमध्ये आवाज समर्थित नाही' : 'Voice not supported in this browser'); return }
    const recognition = new SR()
    recognition.lang = lang
    recognition.interimResults = false
    setIsListening(true)
    recognition.start()
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setSearchQuery(transcript)
      setIsListening(false)
      const filtered = filterSchemes(allSchemes, transcript)
      setResults(filtered.length > 0 ? filtered : allSchemes)
      setHasSearched(true)
      if (filtered.length > 0) setSelectedScheme(filtered[0])
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
  }

  const updateProfile = (field: keyof ProfileData, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }))
  }

  const useDemoProfile = () => {
    setProfileData({
      fullName: 'Rajesh Patil', age: '45', state: 'Maharashtra',
      occupation: 'Farmer', income: '< ₹1.5L/year', land: '2 acres',
      landOwnership: 'owned', aadhaarBankLinked: 'yes',
      currentHouse: 'kutcha', bplCard: 'yes', familySize: '4',
      rationCardType: 'BPL', businessType: '', businessAge: '',
      existingLoan: 'no', maritalStatus: 'married', lpgConnection: 'no',
      girlChildAge: '', qualification: '', institutionName: '',
      gender: 'male', district: 'Pune', mobileNumber: '9876543210',
      farmerCategory: 'small', landArea: '2', surveyNumber: '214/2A',
      bankName: 'State Bank of India', accountNumber: '20394857612', ifscCode: 'SBIN0001234',
    })
    setShowProfileForm(true)
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
    tracker: `${trackerData.length} ${g(S.full.panelSubs.tracker, lang)}`,
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
                <path d="M3 12h18M3 6h18M3 18h18"/>
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

        {/* USER SECTION */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E8690B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
            R
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>Rajesh Patil</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.55)' }}>{g(S.full.farmerMaharashtra, lang)}</div>
          </div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80', marginLeft: 'auto', flexShrink: 0 }}></div>
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
            { id: 'tracker', label: g(S.full.navTracker, lang), badge: trackerData.length.toString() },
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
                {item.id === 'schemes' && <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>}
                {item.id === 'compare' && <><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="12" rx="1"/></>}
                {item.id === 'prep' && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>}
                {item.id === 'tracker' && <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>}
                {item.id === 'csc' && <><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>}
                {item.id === 'helpline' && <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.17a16 16 0 006.29 6.29l1.49-1.34a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 15.42z"/>}
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
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
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
              <circle cx="12" cy="8" r="4"/>
              <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3"/>
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
              onChange={(e) => setLang(e.target.value as 'hi-IN' | 'mr-IN' | 'en-IN')}
              style={{ fontSize: '10px', fontWeight: 700, border: '1px solid #E7E0D8', borderRadius: '5px', padding: '4px 8px', background: 'white', cursor: 'pointer', outline: 'none', color: '#1C1917' }}
            >
              <option value="hi-IN">हिंदी</option>
              <option value="mr-IN">मराठी</option>
              <option value="en-IN">English</option>
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
                      style={{
                        width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                        flexShrink: 0, background: isListening ? '#DC2626' : '#F4F1EC',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      onClick={startVoice}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isListening ? 'white' : '#57534E'} strokeWidth="2" strokeLinecap="round">
                        <rect x="9" y="2" width="6" height="11" rx="3"/>
                        <path d="M5 10a7 7 0 0014 0"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
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
                    {hasSearched ? gf(S.full.schemesFound, lang, results.length) : gf(S.full.showingAll, lang, allSchemes.length)}
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

                {/* RESULTS LIST */}
                <div>
                  {results.map(scheme => (
                    <div
                      key={scheme.id}
                      style={{
                        background: 'white', borderRadius: '8px',
                        border: '1.5px solid', borderColor: selectedScheme?.id === scheme.id ? '#E8690B' : 'transparent',
                        marginBottom: '6px', cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: selectedScheme?.id === scheme.id ? '0 2px 10px rgba(232,105,11,0.15)' : '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                      onClick={() => setSelectedScheme(scheme)}
                      onMouseEnter={(e) => {
                        if (selectedScheme?.id !== scheme.id) {
                          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedScheme?.id !== scheme.id) {
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
                            onClick={(e) => { e.stopPropagation(); setSelectedScheme(scheme) }}
                          >
                            {g(S.full.viewDetails, lang)}
                          </button>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            <button
                              style={{
                                width: '22px', height: '22px', borderRadius: '50%',
                                border: '1px solid', borderColor: savedIds.includes(scheme.id) ? '#FED7AA' : '#E7E0D8',
                                background: savedIds.includes(scheme.id) ? '#FFF8F1' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', fontSize: '10px', fontWeight: 700,
                                color: savedIds.includes(scheme.id) ? '#E8690B' : '#A8A29E'
                              }}
                              onClick={(e) => { e.stopPropagation(); toggleSave(scheme.id) }}
                            >
                              {savedIds.includes(scheme.id) ? '⭐' : '☆'}
                            </button>
                            <button
                              style={{
                                width: '22px', height: '22px', borderRadius: '50%',
                                border: '1px solid', borderColor: compareList.find(s => s.id === scheme.id) ? '#BFDBFE' : '#E7E0D8',
                                background: compareList.find(s => s.id === scheme.id) ? '#EFF6FF' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', fontSize: '10px', fontWeight: 700,
                                color: compareList.find(s => s.id === scheme.id) ? '#1565C0' : '#A8A29E'
                              }}
                              onClick={(e) => { e.stopPropagation(); toggleCompare(scheme) }}
                            >
                              {compareList.find(s => s.id === scheme.id) ? '✓C' : '+C'}
                            </button>
                          </div>
                        </div>
                      </div>
                      {scheme.warning && (
                        <div style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A', padding: '4px 10px 4px 14px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0 0 8px 8px' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 00112.12L21.71 18a2 2 0 01-2.12-2.12"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <span style={{ fontSize: '9px', color: '#92400E', flex: 1 }}>{getSchemeWarning(scheme, lang)}</span>
                          <span style={{ fontSize: '9px', color: '#D97706', fontWeight: 700, cursor: 'pointer' }}>{g(S.full.fixArrow, lang)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN - SCHEME DETAIL PANEL */}
              <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', position: 'sticky', top: 0 }}>
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
                    {selectedScheme.eligibility === 'eligible' ? `${g(S.full.eligible, lang)} — ` : `${g(S.full.partial, lang)} — `}{gf(S.full.matchPercent, lang, selectedScheme.matchScore)}
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
                  {/* ELIGIBILITY CHECK */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      {g(S.full.eligibilityCheck, lang)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>{g(S.full.eligRow1, lang)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>{g(S.full.eligRow2, lang)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>{g(S.full.eligRow3, lang)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: selectedScheme.eligibility === 'partial' ? '#D97706' : '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>
                        {selectedScheme.eligibility === 'partial' ? '!' : '✓'}
                      </div>
                      <span style={{ fontSize: '10px', color: selectedScheme.eligibility === 'partial' ? '#D97706' : '#1C1917' }}>
                        {selectedScheme.eligibility === 'partial' ? g(S.full.eligRow4Partial, lang) : g(S.full.eligRow4, lang)}
                      </span>
                    </div>
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
                    onClick={() => toggleSave(selectedScheme.id)}
                  >
                    {savedIds.includes(selectedScheme.id) ? g(S.full.schemeSaved, lang) : g(S.full.saveScheme, lang)}
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
          {compareList.length > 0 && (
            <div style={{
              position: 'fixed', bottom: 0, left: '200px', right: 0, height: '48px',
              background: 'white', borderTop: '2px solid #E8690B',
              display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 50
            }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>{g(S.full.comparing, lang)}</span>
              <div style={{ flex: 1, display: 'flex', gap: '5px' }}>
                {compareList.map(scheme => (
                  <div key={scheme.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FFF8F1', border: '1px solid #FED7AA', borderRadius: '5px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#1C1917' }}>
                    {getSchemeName(scheme, lang)}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', fontSize: '11px', padding: 0, marginLeft: '2px' }}
                      onClick={() => setCompareList(prev => prev.filter(s => s.id !== scheme.id))}
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
                onClick={() => setCompareList([])}
              >
                {g(S.full.clearAll, lang)}
              </button>
            </div>
          )}

          {/* OTHER PANELS - PLACEHOLDERS */}
          {activePanel === 'compare' && (
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              {compareList.length === 0 ? (
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
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3"/>
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
              <button
                style={{ background: 'white', color: '#78716C', border: '1.5px solid #E7E0D8', borderRadius: '8px', padding: '10px 24px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: '8px', fontFamily: 'inherit' }}
                onClick={useDemoProfile}
              >
                {g(S.full.useDemo, lang)}
              </button>
            </div>
          )}

          {activePanel === 'prep' && showProfileForm && (
            <ApplicationPreparationForm
              lang={lang}
              schemeName={schemeName}
              requiredDocuments={requiredDocs}
              profileData={profileData}
              onFieldChange={updateProfile}
              onBack={() => setShowProfileForm(false)}
              onSubmit={() => {
                setHasProfile(true)
                setShowProfileForm(false)
              }}
            />
          )}

          {activePanel === 'prep' && hasProfile && !showProfileForm && (
            <div className="max-w-[1100px] mx-auto">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                    <FileCheck2 size={18} className="text-[#E8690B]" aria-hidden="true" />
                    {drt(DR.full.tabTitle, lang)}
                  </h2>
                  <p className="text-[11px] text-[#78716C] mt-0.5">
                    {drt(DR.full.selectedScheme, lang)}: <span className="font-semibold text-[#1C1917]">{schemeName}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={clearDocReadinessData}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#78716C] border border-[#E7E0D8] rounded-[7px] px-3 py-2 hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    {drt(DR.common.clearData, lang)}
                  </button>
                  {hasStoredDocData && Object.keys(docResults).length === 0 && (
                    <span className="text-[9.5px] text-[#A8A29E]">
                      {lang === 'hi-IN' ? 'पिछली जाँच का डेटा मिला' : lang === 'mr-IN' ? 'मागील तपासणीचा डेटा सापडला' : 'Previous check data found on this device'}
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[8px] px-3 py-2 mb-2">
                <p className="text-[10.5px] text-[#1D4ED8] leading-[1.5]">{drt(DR.common.purposeStatement, lang)}</p>
              </div>
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2 mb-4">
                <p className="text-[10.5px] text-[#92400E] leading-[1.5]">{drt(DR.common.safetyNotice, lang)}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
                {/* LEFT: required documents list */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-[#A8A29E] tracking-wide">{drt(DR.full.requiredDocuments, lang)}</div>
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
                          <span className="text-[12.5px] font-semibold text-[#1C1917] flex-1">{drt(DR.documentTypes[ref.type], lang)}</span>
                          {!ref.required && <span className="text-[8px] font-bold text-[#A8A29E] uppercase">{drt(DR.common.optional, lang)}</span>}
                        </div>
                        <div className="text-[9.5px] text-[#A8A29E] mt-1 ml-4">{drt(DR.status[statusKey], lang)} · {drt(DR.reasons[ref.reasonKey as keyof typeof DR.reasons], lang)}</div>
                      </button>
                    )
                  })}
                  <div className="pt-1">
                    <ReadinessSummary lang={lang} score={docReadinessScore} compact />
                  </div>
                </div>

                {/* RIGHT: selected document check + cross-doc name comparison */}
                <div className="space-y-4">
                  <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-4">
                    <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#1C1917] mb-3" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                      {drt(DR.documentTypes[activeDocType], lang)}
                      {activeDocRef && !activeDocRef.required && (
                        <span className="text-[9px] font-bold text-[#A8A29E] uppercase border border-[#E7E0D8] rounded-full px-2 py-0.5">{drt(DR.common.optional, lang)}</span>
                      )}
                    </h3>
                    <DocumentReadinessCheck
                      key={activeDocType}
                      lang={lang}
                      documentType={activeDocType}
                      displayLabel={drt(DR.documentTypes[activeDocType], lang)}
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

                  <NameConsistencyCard lang={lang} profileName={profileData.fullName || '—'} comparisons={nameComparisons} onGoToDocument={(t) => setSelectedDocType(t)} />

                  <ReadinessSummary lang={lang} score={docReadinessScore} />

                  <p className="text-[10px] text-[#A8A29E] leading-[1.5]">{drt(DR.common.disclaimerNote, lang)}</p>
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
              {trackerData
                .filter(item => trackerFilter === 'all' ||
                  (trackerFilter === 'pending' && (item.status === 'pending' || item.status === 'docs_needed')) ||
                  (trackerFilter === 'approved' && item.status === 'approved') ||
                  (trackerFilter === 'action' && (item.status === 'rejected' || item.status === 'docs_needed'))
                )
                .map(item => (
                  <div key={item.id} style={{ background: 'white', borderRadius: '10px', marginBottom: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E7E0D8' }}>
                    {/* Progress stepper simplified */}
                    <div style={{ background: '#FAF7F2', padding: '16px 20px', borderBottom: '1px solid #E7E0D8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {[g(S.full.stepApplied, lang), g(S.full.stepReview, lang), g(S.full.stepVerified, lang), g(S.full.stepDisbursed, lang)].map((step, i) => (
                          <React.Fragment key={i}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                border: '2px solid',
                                borderColor: i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) ? '#1A6B3C' : '#E7E0D8',
                                background: i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) ? '#1A6B3C' : 'white',
                                color: i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) || (item.status === 'docs_needed' && i === 2) ? 'white' : '#A8A29E',
                                fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                                {i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) ? '✓' : (item.status === 'docs_needed' && i === 2) ? '⚠' : i + 1}
                              </div>
                              <div style={{ fontSize: '9px', fontWeight: 700, color: i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) ? '#1A6B3C' : (item.status === 'docs_needed' && i === 2) ? '#D97706' : '#A8A29E' }}>
                                {step}
                              </div>
                            </div>
                            {i < 3 && (
                              <div style={{
                                flex: 1, height: '2px', marginBottom: '16px',
                                background: i < (item.status === 'approved' ? 4 : item.status === 'docs_needed' ? 2 : item.status === 'pending' ? 1 : 1) ? '#1A6B3C' : '#E7E0D8'
                              }}></div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    {/* Details */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1.5px solid #E7E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: '#FAF7F2', color: item.logoColor }}>
                        {item.logoText}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917' }}>{getTrackerName(item, lang)}</div>
                        <div style={{ fontSize: '9px', color: '#A8A29E', marginTop: '1px' }}>{item.dateApplied}</div>
                        {item.referenceNumber ? (
                          <div style={{ fontSize: '9px', color: '#57534E', fontFamily: 'monospace', background: '#F4F1EC', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                            {item.referenceNumber}
                          </div>
                        ) : (
                          <div style={{ fontSize: '9px', color: '#A8A29E', fontStyle: 'italic', marginTop: '3px' }}>
                            {g(S.full.noRefYet, lang)}
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: '#57534E', lineHeight: 1.5, marginTop: '4px' }}>
                          {getTrackerNextStep(item, lang)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{
                          width: '120px', padding: '8px 12px', borderRadius: '8px', textAlign: 'center',
                          fontSize: '11px', fontWeight: 700,
                          ...getStatusStyle(item.status, lang)
                        }}>
                          {getStatusStyle(item.status, lang).label}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: '1px solid #E7E0D8', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {g(S.full.updateBtn, lang)}
                          </button>
                          {item.status === 'docs_needed' && (
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
                              onClick={() => shareWhatsApp(gf(S.full.approvedShare, lang, getTrackerName(item, lang)) + '\nRef: ' + item.referenceNumber)}
                            >
                              {g(S.full.shareCheck, lang)}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
