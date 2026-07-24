import type { DocumentType } from './types'

/** Keyword lists used to estimate whether OCR text matches the expected document type. Matching is case-insensitive and substring-based. */
export const DOCUMENT_KEYWORDS: Record<DocumentType, string[]> = {
  aadhaar: [
    'government of india', 'unique identification authority', 'uidai', 'aadhaar', 'aadhar',
    'आधार', 'भारत सरकार', 'विशिष्ट पहचान', 'dob', 'जन्म तिथि', 'जन्म तारीख',
  ],
  bank_passbook: [
    'account number', 'a/c no', 'ac no', 'ifsc', 'branch', 'bank', 'passbook',
    'खाते', 'खाता', 'बैंक', 'बँक', 'शाखा',
  ],
  income_certificate: [
    'income certificate', 'annual income', 'वार्षिक आय', 'आय प्रमाणपत्र', 'आय प्रमाण पत्र',
    'tehsildar', 'mamlatdar', 'collector', 'तहसीलदार',
  ],
  ration_card: [
    'ration card', 'राशन कार्ड', 'रेशन कार्ड', 'food and civil supplies', 'family id', 'food & civil supplies',
  ],
  land_record: [
    '7/12', 'satbara', 'सातबारा', '7/12 उतारा', 'survey number', 'survey no', 'gat number', 'gat no',
    'land record', 'भूलेख', 'खसरा', 'खतौनी',
  ],
  caste_certificate: [
    'caste certificate', 'जाति प्रमाणपत्र', 'जाति प्रमाण पत्र', 'जात प्रमाणपत्र',
    'scheduled caste', 'scheduled tribe', 'obc', 'other backward class',
  ],
  domicile_certificate: [
    'domicile certificate', 'residence certificate', 'अधिवास प्रमाणपत्र', 'अधिवास प्रमाण पत्र', 'रहिवासी दाखला',
  ],
  passport_photo: ['passport size photo', 'photograph'],
  other: [],
}

/** Approximate label extraction hints ("Name" / "नाम" / "नाव" etc.) used by name-matching. */
export const NAME_LABELS = ['name', 'नाम', 'नाव', "applicant's name", 'holder name', 'account holder']

export const DOCUMENT_ICON: Record<DocumentType, string> = {
  aadhaar: 'IdCard',
  bank_passbook: 'Landmark',
  income_certificate: 'FileText',
  ration_card: 'FileText',
  land_record: 'FileText',
  caste_certificate: 'FileText',
  domicile_certificate: 'FileText',
  passport_photo: 'FileText',
  other: 'FileText',
}

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'aadhaar',
  'bank_passbook',
  'income_certificate',
  'ration_card',
  'land_record',
  'caste_certificate',
  'domicile_certificate',
  'passport_photo',
  'other',
]
