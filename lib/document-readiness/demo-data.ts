import type { DocumentReadinessResult, DocumentType } from './types'
import { validateDocument } from './validators'

/**
 * Fictional demo profile used only for the presentation fallback below.
 * None of this is real personal data.
 */
export const DEMO_PROFILE_NAME = 'Rajesh Baliram Patil'

export interface DemoScenario {
  id: string
  labelKey: string
  documentType: DocumentType
  /** Fictional OCR-style text — never sent through real OCR. */
  sampleText: string
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'aadhaar_ready',
    labelKey: 'aadhaarReady',
    documentType: 'aadhaar',
    sampleText: `Government of India\nUnique Identification Authority of India\nRajesh Baliram Patil\nDOB: 12/04/1979\n5678 9012 3456\nMale`,
  },
  {
    id: 'bank_missing_ifsc',
    labelKey: 'bankMissingIfsc',
    documentType: 'bank_passbook',
    sampleText: `State Bank of India\nBranch: Hadapsar\nAccount Holder Name: Rajesh B Patil\nAccount Number: 20394857612\nType: Savings`,
  },
  {
    id: 'income_outdated',
    labelKey: 'incomeOutdated',
    documentType: 'income_certificate',
    sampleText: `Income Certificate\nName: Rajesh Baliram Patil\nAnnual Income: Rs. 118000\nIssued by Tehsildar\nDate of Issue: 14/02/2022`,
  },
  {
    id: 'land_name_mismatch',
    labelKey: 'landNameMismatch',
    documentType: 'land_record',
    sampleText: `7/12 Utara\nSurvey No: 214/2A\nOwner Name: R. Patil\nVillage: Hadapsar\nArea: 1.2 Hectare`,
  },
  {
    id: 'blurry_unclear',
    labelKey: 'blurryUnclear',
    documentType: 'aadhaar',
    sampleText: `.. ...   . .`,
  },
]

export function buildDemoResult(scenario: DemoScenario, profileName?: string): DocumentReadinessResult {
  const validation = validateDocument({
    documentType: scenario.documentType,
    text: scenario.sampleText,
    ocrConfidence: scenario.id === 'blurry_unclear' ? 22 : 86,
    profileName,
  })

  return {
    documentType: scenario.documentType,
    status: validation.status,
    confidence: validation.confidence,
    ocrConfidence: scenario.id === 'blurry_unclear' ? 22 : 86,
    extractedText: scenario.sampleText,
    extractedFields: validation.extractedFields,
    issues: validation.issues,
    extractedName: validation.extractedName,
    completedAt: new Date().toISOString(),
    isDemo: true,
  }
}
