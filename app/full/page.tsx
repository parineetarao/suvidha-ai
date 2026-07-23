'use client'

import React, { Suspense, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'

type ActivePanel = 'schemes' | 'compare' | 'prep' | 'tracker' | 'csc' | 'helpline'
type EligibilityStatus = 'eligible' | 'partial' | 'ineligible'
type AppStatus = 'approved' | 'docs_needed' | 'pending' | 'rejected'

type SchemeItem = {
  id: number
  nameHindi: string
  nameEnglish: string
  logoText: string
  logoColor: string
  headerColor: string
  ministry: string
  amount: string
  unit: string
  eligibility: EligibilityStatus
  matchScore: number
  matchLabel: string
  warning: string | null
  applicationModes: string[]
  rejectionRisks: { risk: string; fix: string }[]
  steps: { text: string; mode: 'online' | 'offline' | 'csc' }[]
  documents: string[]
  officialUrl: string
}

type TrackerItem = {
  id: number
  schemeName: string
  logoText: string
  logoColor: string
  dateApplied: string
  referenceNumber: string
  status: AppStatus
  nextStep: string
  borderColor: string
}

type ProfileData = {
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
}

const allSchemes: SchemeItem[] = [
  {
    id: 1,
    nameHindi: 'पीएम किसान सम्मान निधि',
    nameEnglish: 'PM Kisan Samman Nidhi',
    logoText: 'पी',
    logoColor: '#1A6B3C',
    headerColor: '#1A6B3C',
    ministry: 'Ministry of Agriculture',
    amount: '₹6,000',
    unit: 'सालाना',
    eligibility: 'eligible',
    matchScore: 94,
    matchLabel: 'High Match',
    warning: 'Aadhaar must be linked to bank account before applying',
    applicationModes: ['Online', 'CSC'],
    rejectionRisks: [
      { risk: 'Name mismatch between Aadhaar and land records', fix: 'Visit Aadhaar centre to update name to exactly match land records' },
      { risk: 'Aadhaar not linked to bank account', fix: 'Visit any bank branch with Aadhaar card to link it' }
    ],
    steps: [
      { text: 'Visit pmkisan.gov.in or nearest CSC centre', mode: 'online' },
      { text: 'Click New Farmer Registration', mode: 'online' },
      { text: 'Enter Aadhaar number — details auto-fill', mode: 'online' },
      { text: 'Fill land documents and bank account number', mode: 'offline' },
      { text: 'Submit and note the Reference Number', mode: 'online' }
    ],
    documents: ['Aadhaar Card', 'Bank Passbook', 'Land Records (Khasra/Khatauni)', 'Mobile Number (Aadhaar linked)', 'Passport Photo (2 copies)'],
    officialUrl: 'https://pmkisan.gov.in'
  },
  {
    id: 2,
    nameHindi: 'प्रधानमंत्री फसल बीमा',
    nameEnglish: 'PM Fasal Bima Yojana',
    logoText: 'फ',
    logoColor: '#E8690B',
    headerColor: '#E8690B',
    ministry: 'Ministry of Agriculture',
    amount: 'Full Coverage',
    unit: 'फसल नुकसान',
    eligibility: 'eligible',
    matchScore: 88,
    matchLabel: 'High Match',
    warning: 'Must apply within 2 weeks of sowing',
    applicationModes: ['CSC', 'Bank'],
    rejectionRisks: [
      { risk: 'Application submitted after sowing deadline', fix: 'Apply within 2 weeks of crop sowing' },
      { risk: 'Incorrect crop or area details', fix: 'Cross-verify with Khasra document before filling' }
    ],
    steps: [
      { text: 'Visit nearest bank or CSC centre', mode: 'csc' },
      { text: 'Fill PMFBY Application Form', mode: 'offline' },
      { text: 'Provide Khasra number and sowing details', mode: 'offline' },
      { text: 'Pay premium amount', mode: 'offline' },
      { text: 'Collect Insurance Certificate', mode: 'csc' }
    ],
    documents: ['Aadhaar Card', 'Bank Passbook', 'Land Records', 'Crop Sowing Certificate'],
    officialUrl: 'https://pmfby.gov.in'
  },
  {
    id: 3,
    nameHindi: 'पीएम आवास योजना ग्रामीण',
    nameEnglish: 'PM Awas Yojana (Rural)',
    logoText: 'आ',
    logoColor: '#1565C0',
    headerColor: '#1565C0',
    ministry: 'Ministry of Rural Development',
    amount: '₹1.3 Lakh',
    unit: 'एकमुश्त',
    eligibility: 'partial',
    matchScore: 72,
    matchLabel: 'Partial Match',
    warning: 'Must be in SECC 2011 beneficiary list',
    applicationModes: ['Gram Panchayat'],
    rejectionRisks: [
      { risk: 'Name not in SECC 2011 list', fix: 'Check at Gram Panchayat and apply for inclusion' },
      { risk: 'Already owns a pucca house', fix: 'Scheme only for those without any pucca house in India' }
    ],
    steps: [
      { text: 'Visit Gram Panchayat office', mode: 'offline' },
      { text: 'Apply for PMAY-G registration', mode: 'offline' },
      { text: 'Submit BPL Card and Aadhaar', mode: 'offline' },
      { text: 'Wait for survey and verification', mode: 'offline' },
      { text: 'Receive funds in installments after approval', mode: 'offline' }
    ],
    documents: ['Aadhaar Card', 'BPL Ration Card', 'Bank Passbook', 'Income Certificate', 'Passport Photo'],
    officialUrl: 'https://pmayg.nic.in'
  },
  {
    id: 4,
    nameHindi: 'आयुष्मान भारत PMJAY',
    nameEnglish: 'Ayushman Bharat PMJAY',
    logoText: 'आ',
    logoColor: '#FF671F',
    headerColor: '#FF671F',
    ministry: 'Ministry of Health',
    amount: '₹5 लाख',
    unit: 'प्रति वर्ष',
    eligibility: 'eligible',
    matchScore: 91,
    matchLabel: 'High Match',
    warning: null,
    applicationModes: ['Online', 'Hospital'],
    rejectionRisks: [
      { risk: 'Family not in SECC database', fix: 'Check eligibility at pmjay.gov.in using mobile number' },
      { risk: 'Treatment at non-empanelled hospital', fix: 'Only empanelled hospitals accept Ayushman Card' }
    ],
    steps: [
      { text: 'Check eligibility at pmjay.gov.in', mode: 'online' },
      { text: 'Visit nearest empanelled hospital or CSC', mode: 'csc' },
      { text: 'Get Ayushman Card made with Aadhaar', mode: 'offline' },
      { text: 'Show card at hospital during treatment', mode: 'offline' },
      { text: 'Receive cashless treatment up to ₹5 lakh', mode: 'offline' }
    ],
    documents: ['Aadhaar Card', 'Ration Card', 'Mobile Number'],
    officialUrl: 'https://pmjay.gov.in'
  },
  {
    id: 5,
    nameHindi: 'पीएम मुद्रा योजना',
    nameEnglish: 'PM Mudra Yojana',
    logoText: 'मु',
    logoColor: '#E8690B',
    headerColor: '#E8690B',
    ministry: 'Ministry of Finance',
    amount: '₹10 लाख',
    unit: 'तक ऋण',
    eligibility: 'eligible',
    matchScore: 85,
    matchLabel: 'High Match',
    warning: 'Prior business experience required',
    applicationModes: ['Bank', 'NBFC'],
    rejectionRisks: [
      { risk: 'No business plan or proof of business activity', fix: 'Prepare a simple business plan before visiting bank' },
      { risk: 'Poor credit history or existing loan default', fix: 'Check CIBIL score at bank before applying' }
    ],
    steps: [
      { text: 'Visit nearest bank or NBFC', mode: 'offline' },
      { text: 'Collect Mudra Loan Application Form', mode: 'offline' },
      { text: 'Submit business plan and identity documents', mode: 'offline' },
      { text: 'Bank processes application (7–30 days)', mode: 'offline' },
      { text: 'Receive Mudra Card with loan amount', mode: 'offline' }
    ],
    documents: ['Aadhaar Card', 'PAN Card', 'Bank Passbook', 'Business Registration (if any)', 'Passport Photo'],
    officialUrl: 'https://mudra.org.in'
  },
  {
    id: 6,
    nameHindi: 'पीएम उज्ज्वला योजना',
    nameEnglish: 'PM Ujjwala Yojana',
    logoText: 'उ',
    logoColor: '#6A1B9A',
    headerColor: '#6A1B9A',
    ministry: 'Ministry of Petroleum',
    amount: 'Free LPG',
    unit: 'कनेक्शन',
    eligibility: 'eligible',
    matchScore: 89,
    matchLabel: 'High Match',
    warning: 'BPL Ration Card mandatory',
    applicationModes: ['LPG Distributor'],
    rejectionRisks: [
      { risk: 'LPG connection already exists at address', fix: 'Only one connection per household' },
      { risk: 'Name not matching BPL list', fix: 'Ensure Aadhaar name matches BPL ration card exactly' }
    ],
    steps: [
      { text: 'Visit nearest LPG distributor', mode: 'offline' },
      { text: 'Collect Ujjwala Application Form', mode: 'offline' },
      { text: 'Submit BPL card, Aadhaar and bank details', mode: 'offline' },
      { text: 'Verification by distributor (3–7 days)', mode: 'offline' },
      { text: 'Receive free connection and first cylinder', mode: 'offline' }
    ],
    documents: ['Aadhaar Card', 'BPL Ration Card', 'Bank Passbook', 'Passport Photo'],
    officialUrl: 'https://pmuy.gov.in'
  },
  {
    id: 7,
    nameHindi: 'PMKVY कौशल विकास',
    nameEnglish: 'PMKVY Skill Development',
    logoText: 'क',
    logoColor: '#1565C0',
    headerColor: '#1565C0',
    ministry: 'Ministry of Skill Development',
    amount: 'Free Training',
    unit: 'Certificate',
    eligibility: 'eligible',
    matchScore: 82,
    matchLabel: 'High Match',
    warning: null,
    applicationModes: ['Online', 'Training Centre'],
    rejectionRisks: [
      { risk: 'Centre not available for chosen skill', fix: 'Check pmkvyofficial.org for available courses near you' }
    ],
    steps: [
      { text: 'Visit pmkvyofficial.org', mode: 'online' },
      { text: 'Find nearest training centre', mode: 'online' },
      { text: 'Register with Aadhaar', mode: 'online' },
      { text: 'Complete training course (3–6 months)', mode: 'offline' },
      { text: 'Receive certificate and placement assistance', mode: 'offline' }
    ],
    documents: ['Aadhaar Card', 'Educational Certificate', 'Passport Photo'],
    officialUrl: 'https://pmkvyofficial.org'
  },
  {
    id: 8,
    nameHindi: 'सुकन्या समृद्धि योजना',
    nameEnglish: 'Sukanya Samridhi Yojana',
    logoText: 'सु',
    logoColor: '#880E4F',
    headerColor: '#880E4F',
    ministry: 'Ministry of Finance',
    amount: '8.2% ब्याज',
    unit: 'बेटी बचत',
    eligibility: 'partial',
    matchScore: 68,
    matchLabel: 'Partial Match',
    warning: 'Girl child must be under 10 years',
    applicationModes: ['Post Office', 'Bank'],
    rejectionRisks: [
      { risk: 'Girl child above 10 years', fix: 'Scheme is only for girls below 10 years' }
    ],
    steps: [
      { text: 'Visit nearest Post Office or bank', mode: 'offline' },
      { text: 'Collect Sukanya Samridhi Form', mode: 'offline' },
      { text: 'Submit girl child birth certificate and Aadhaar', mode: 'offline' },
      { text: 'Open account with minimum ₹250', mode: 'offline' },
      { text: 'Deposit annually until girl turns 15', mode: 'offline' }
    ],
    documents: ['Girl Child Birth Certificate', 'Aadhaar (parent and child)', 'Bank Passbook'],
    officialUrl: 'https://www.indiapost.gov.in'
  }
]

const trackerData: TrackerItem[] = [
  { id: 1, schemeName: 'PM Kisan Samman Nidhi', logoText: 'पी', logoColor: '#1A6B3C', dateApplied: '15 Jan 2025', referenceNumber: 'PMKISAN-MH-2025-18832', status: 'approved', nextStep: 'Next installment due April 2025. Check bank account on 1st April.', borderColor: '#1A6B3C' },
  { id: 2, schemeName: 'Ayushman Bharat PMJAY', logoText: 'आ', logoColor: '#FF671F', dateApplied: '02 Feb 2025', referenceNumber: 'PMJAY-2025-44210', status: 'docs_needed', nextStep: 'Submit updated ration card copy at nearest CSC centre.', borderColor: '#1565C0' },
  { id: 3, schemeName: 'PM Awas Yojana Rural', logoText: 'आ', logoColor: '#1565C0', dateApplied: '20 Mar 2025', referenceNumber: '', status: 'pending', nextStep: 'Survey scheduled. Keep all documents ready at home.', borderColor: '#D97706' }
]

const cscData = [
  { id: 1, name: 'Jan Seva Kendra — Hadapsar', address: 'Shop 4, Near Bus Stand, Hadapsar, Pune 411028', distance: '0.8 km', isOpen: true, hours: '9AM–6PM', phone: '9876543210' },
  { id: 2, name: 'CSC Centre — Wanowrie', address: 'Wanowrie Main Road, Near Post Office, Pune', distance: '1.4 km', isOpen: true, hours: '10AM–5PM', phone: '9876543211' },
  { id: 3, name: 'Digital Seva Kendra — Undri', address: 'Undri Chowk, Pune 411060', distance: '2.1 km', isOpen: false, hours: '9AM–5PM', phone: '9876543212' },
  { id: 4, name: 'Jan Seva Kendra — Kondhwa', address: 'Kondhwa Road, Near Garden, Pune', distance: '2.8 km', isOpen: true, hours: '9AM–7PM', phone: '9876543213' }
]

const helplineData = [
  { name: 'Central Scheme Helpline', number: '155261', hours: 'Mon–Sat · 9AM–6PM', languages: 'Hindi · English · Regional', category: 'General', categoryBg: '#F4F1EC', categoryColor: '#78716C', btnColor: '#1A6B3C' },
  { name: 'PM Kisan Helpline', number: '155261', hours: 'Mon–Fri · 9AM–5PM', languages: 'Hindi · English · Regional', category: 'Agriculture', categoryBg: '#F0FDF4', categoryColor: '#15803D', btnColor: '#1A6B3C' },
  { name: 'Ayushman Bharat Helpline', number: '14555', hours: '24 × 7 Available', languages: 'Hindi · English', category: 'Health', categoryBg: '#FEF2F2', categoryColor: '#DC2626', btnColor: '#DC2626' },
  { name: 'CSC Centre Helpline', number: '1800-121-3468', hours: 'Mon–Sat · 9AM–6PM', languages: 'Hindi · English', category: 'CSC', categoryBg: '#EFF6FF', categoryColor: '#1D4ED8', btnColor: '#1565C0' },
  { name: 'PM Awas Yojana Helpline', number: '1800-11-6446', hours: 'Mon–Fri · 9AM–6PM', languages: 'Hindi · English', category: 'Housing', categoryBg: '#F0FDF4', categoryColor: '#15803D', btnColor: '#1A6B3C' },
  { name: 'PMKVY Skill Helpline', number: '1800-123-9626', hours: 'Mon–Fri · 9AM–6PM', languages: 'Hindi · English', category: 'Education', categoryBg: '#EFF6FF', categoryColor: '#1D4ED8', btnColor: '#1565C0' }
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

function getStatusStyle(s: AppStatus) {
  const map = {
    approved: { label: '✓ APPROVED', bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    docs_needed: { label: '⚠ DOCS NEEDED', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    pending: { label: '⏳ PENDING', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    rejected: { label: '✗ REJECTED', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' }
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
  const isFarmer = q.includes('किसान') || q.includes('kisan') || q.includes('farmer') || q.includes('खेती') || q.includes('fasal') || q.includes('फसल') || q.includes('agriculture') || q.includes('crop')
  const isWomen = q.includes('महिला') || q.includes('women') || q.includes('woman') || q.includes('beti') || q.includes('ujjwala')
  const isStudent = q.includes('student') || q.includes('छात्र') || q.includes('scholarship') || q.includes('शिक्षा') || q.includes('education') || q.includes('skill')
  const isHousing = q.includes('घर') || q.includes('housing') || q.includes('awas') || q.includes('home') || q.includes('house')
  const isSenior = q.includes('pension') || q.includes('पेंशन') || q.includes('health') || q.includes('hospital') || q.includes('ayushman')
  const isBusiness = q.includes('business') || q.includes('loan') || q.includes('mudra') || q.includes('कर्ज़')

  return schemes.filter(s => {
    if (isFarmer && (s.id === 1 || s.id === 2)) return true
    if (isWomen && (s.id === 6 || s.id === 8)) return true
    if (isStudent && s.id === 7) return true
    if (isHousing && s.id === 3) return true
    if (isSenior && s.id === 4) return true
    if (isBusiness && s.id === 5) return true
    if (s.nameEnglish.toLowerCase().includes(q)) return true
    if (s.nameHindi.includes(q)) return true
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
  const [trackerFilter, setTrackerFilter] = useState('all')
  const [isListening, setIsListening] = useState(false)
  const [sortBy, setSortBy] = useState('match')

  // Profile state
  const [hasProfile, setHasProfile] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: '', age: '', state: '', occupation: '', income: '',
    land: '', landOwnership: '', aadhaarBankLinked: '',
    currentHouse: '', bplCard: '', familySize: '', rationCardType: '',
    businessType: '', businessAge: '', existingLoan: '',
    maritalStatus: '', lpgConnection: '', girlChildAge: '',
    qualification: '', institutionName: ''
  })

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
      if (prev.length >= 3) { alert('Maximum 3 schemes can be compared'); return prev }
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

  const shareWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const startVoice = () => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice not supported in this browser'); return }
    const recognition = new SR()
    recognition.lang = 'hi-IN'
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

  const saveProfile = () => {
    if (!profileData.fullName || !profileData.age || !profileData.state || !profileData.occupation) {
      alert('Please fill Name, Age, State, and Occupation to continue.')
      return
    }
    setHasProfile(true)
    setShowProfileForm(false)
  }

  const useDemoProfile = () => {
    setProfileData({
      fullName: 'Rajesh Patil', age: '45', state: 'Maharashtra',
      occupation: 'Farmer', income: '< ₹1.5L/year', land: '2 acres',
      landOwnership: 'yes', aadhaarBankLinked: 'yes',
      currentHouse: 'kutcha', bplCard: 'yes', familySize: '4',
      rationCardType: 'BPL', businessType: '', businessAge: '',
      existingLoan: 'no', maritalStatus: 'married', lpgConnection: 'no',
      girlChildAge: '', qualification: '', institutionName: ''
    })
    setHasProfile(true)
  }

  const schemeCategory = getSchemeCategory(selectedScheme)

  const categoryContext =
    schemeCategory === 'farmer' ? `I am a farmer with ${profileData.land || 'agricultural land'} registered in my name.` :
    schemeCategory === 'housing' ? `I currently reside in a ${profileData.currentHouse || 'kutcha'} house. My family consists of ${profileData.familySize || 'multiple'} members. I do not own any pucca house anywhere in India.` :
    schemeCategory === 'health' ? `My family consists of ${profileData.familySize || 'multiple'} members. We hold a ${profileData.rationCardType || 'BPL'} ration card.` :
    schemeCategory === 'business' ? `I run a ${profileData.businessType || 'small'} business${profileData.businessAge ? ` for the past ${profileData.businessAge}` : ''}. I have no existing loan defaults.` :
    schemeCategory === 'women' ? `I am a ${profileData.maritalStatus || 'married'} woman from a BPL household.` :
    schemeCategory === 'student' ? `I am currently pursuing ${profileData.qualification || 'higher education'} at ${profileData.institutionName || 'my institution'}.` :
    'I meet all the required eligibility criteria for this scheme.'

  const draftLetter = `To,
The Concerned Authority,
${selectedScheme.nameEnglish} Scheme

Subject: Application for Registration under ${selectedScheme.nameEnglish}

Respected Sir/Madam,

I, ${profileData.fullName}, aged ${profileData.age} years, residing in ${profileData.state}, hereby apply for registration under ${selectedScheme.nameEnglish}.

${categoryContext} My annual income is ${profileData.income || 'within the eligible limit'}. I meet all the eligibility criteria for this scheme.

I request you to kindly process my application and register me as a beneficiary at the earliest.

Enclosures:
${selectedScheme.documents.map((doc, i) => `${i + 1}. ${doc} (attested copy)`).join('\n')}

Yours faithfully,
${profileData.fullName}
Date: ${new Date().toLocaleDateString('en-IN')}
Place: ${profileData.state}`

  const panelTitles: Record<ActivePanel, string> = {
    schemes: 'Scheme Search',
    compare: 'Compare Schemes',
    prep: 'Application Preparation',
    tracker: 'Application Tracker',
    csc: 'CSC Locator',
    helpline: 'Helplines'
  }

  const panelSubs: Record<ActivePanel, string> = {
    schemes: 'Active',
    compare: `${compareList.length} schemes selected`,
    prep: selectedScheme.nameEnglish,
    tracker: `${trackerData.length} applications`,
    csc: 'Near Pune, Maharashtra',
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
                GOVERNMENT SCHEME FINDER
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
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.55)' }}>Farmer · Maharashtra</div>
          </div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80', marginLeft: 'auto', flexShrink: 0 }}></div>
        </div>

        {/* NAV SECTION */}
        <div style={{ padding: '8px 0', flex: 1 }}>
          <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', padding: '6px 14px 2px', fontWeight: 700 }}>
            MAIN
          </div>
          {[
            { id: 'schemes', label: 'Scheme Search', badge: results.length.toString() },
            { id: 'compare', label: 'Compare Schemes', badge: compareList.length > 0 ? compareList.length.toString() : '' },
            { id: 'prep', label: 'Application Prep', badge: '' },
            { id: 'tracker', label: 'Application Tracker', badge: trackerData.length.toString() },
            { id: 'csc', label: 'CSC Locator', badge: '' },
            { id: 'helpline', label: 'Helpline', badge: '' }
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
            Back to Home
          </button>
          <button
            style={{
              width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '7px', padding: '8px 12px', color: 'white', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px'
            }}
            onClick={() => {
              if (hasProfile) {
                alert(`Profile saved!\n\nName: ${profileData.fullName}\nAge: ${profileData.age}\nState: ${profileData.state}\nOccupation: ${profileData.occupation}\n\nIn production this will sync to your account.`)
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
            {hasProfile ? `✓ ${profileData.fullName.split(' ')[0]}'s Profile` : 'Login / Save Profile'}
          </button>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
            <button
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 700, padding: '4px', flex: 1, borderRadius: '4px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={() => router.push('/simple')}
            >
              Simple
            </button>
            <button
              style={{ background: '#E8690B', color: 'white', fontSize: '10px', fontWeight: 700, padding: '4px', flex: 1, borderRadius: '4px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Full Mode
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
            <select style={{ fontSize: '10px', fontWeight: 700, border: '1px solid #E7E0D8', borderRadius: '5px', padding: '4px 8px', background: 'white', cursor: 'pointer', outline: 'none', color: '#1C1917' }}>
              <option>Hindi</option>
              <option>Marathi</option>
              <option>English</option>
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
                    DESCRIBE YOUR SITUATION
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <textarea
                      style={{
                        flex: 1, minHeight: '56px', border: '1.5px solid #E7E0D8', borderRadius: '7px',
                        padding: '8px 10px', fontSize: '12px', color: '#1C1917', background: '#FAF7F2',
                        resize: 'none', outline: 'none', fontFamily: 'inherit'
                      }}
                      placeholder="मैं 45 साल का किसान हूँ..."
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
                      Search
                    </button>
                  </div>
                  {hasSearched && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#1A6B3C' }}>
                        State: Maharashtra
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#E8690B' }}>
                        Age: 45
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#7C3AED' }}>
                        Occupation: Farmer
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', color: 'white', cursor: 'pointer', background: '#0F766E' }}>
                        Income: Low
                      </span>
                    </div>
                  )}
                </div>

                {/* RESULTS HEADER */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#78716C' }}>
                    {hasSearched ? `${results.length} schemes found` : `Showing all ${allSchemes.length} schemes`}
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
                        {sort === 'match' ? 'Best Match' : sort === 'amount' ? 'Highest Benefit' : 'Easiest'}
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
                            {scheme.nameHindi}
                          </div>
                          <div style={{ fontSize: '9px', color: '#A8A29E', marginTop: '1px' }}>{scheme.nameEnglish}</div>
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
                            {scheme.matchLabel}
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
                            {scheme.unit}
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
                            View Details
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
                          <span style={{ fontSize: '9px', color: '#92400E', flex: 1 }}>{scheme.warning}</span>
                          <span style={{ fontSize: '9px', color: '#D97706', fontWeight: 700, cursor: 'pointer' }}>Fix →</span>
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
                        {selectedScheme.nameHindi}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>
                        {selectedScheme.nameEnglish}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>
                        {selectedScheme.ministry}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', borderRadius: '99px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, background: selectedScheme.eligibility === 'eligible' ? '#F0FDF4' : '#FFFBEB', color: selectedScheme.eligibility === 'eligible' ? '#15803D' : '#D97706' }}>
                    {selectedScheme.eligibility === 'eligible' ? '✓ Eligible — ' : '⚠ Partial — '}{selectedScheme.matchScore}% match
                  </div>
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.18)', borderRadius: '5px', overflow: 'hidden', marginTop: '6px' }}>
                    <div style={{ flex: 1, padding: '5px 7px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white', fontFamily: 'Georgia, serif' }}>{selectedScheme.amount}</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>Annual</span>
                    </div>
                    <div style={{ flex: 1, padding: '5px 7px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>Installments</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>Payments</span>
                    </div>
                    <div style={{ flex: 1, padding: '5px 7px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>Direct</span>
                      <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '1px' }}>Bank Transfer</span>
                    </div>
                  </div>
                </div>

                {/* SCROLLABLE BODY */}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                  {/* ELIGIBILITY CHECK */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      ELIGIBILITY CHECK
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>Land holding verified</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>Occupation and state confirmed</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>✓</div>
                      <span style={{ fontSize: '10px', color: '#1C1917' }}>Income within eligibility limit</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: selectedScheme.eligibility === 'partial' ? '#D97706' : '#1A6B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: 'white', fontWeight: 700 }}>
                        {selectedScheme.eligibility === 'partial' ? '!' : '✓'}
                      </div>
                      <span style={{ fontSize: '10px', color: selectedScheme.eligibility === 'partial' ? '#D97706' : '#1C1917' }}>
                        {selectedScheme.eligibility === 'partial' ? 'Some criteria need verification' : 'All criteria met'}
                      </span>
                    </div>
                  </div>

                  {/* REJECTION RISKS */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      REJECTION RISKS
                    </div>
                    {selectedScheme.rejectionRisks.map((risk, i) => (
                      <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '5px', padding: '5px 7px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#92400E', display: 'block' }}>{risk.risk}</span>
                        <span style={{ fontSize: '8px', color: '#78716C', marginTop: '1px', display: 'block' }}>Fix → {risk.fix}</span>
                      </div>
                    ))}
                  </div>

                  {/* HOW TO APPLY */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      HOW TO APPLY
                    </div>
                    {selectedScheme.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', marginBottom: '3px' }}>
                        <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: '#1A6B3C', color: 'white', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          {i + 1}
                        </div>
                        <div style={{ fontSize: '10px', color: '#1C1917', lineHeight: 1.4, flex: 1 }}>
                          {step.text}
                          <span style={{
                            fontSize: '7px', fontWeight: 700, padding: '1px 4px', borderRadius: '99px',
                            marginLeft: '3px',
                            background: step.mode === 'online' ? '#F0FDF4' : step.mode === 'csc' ? '#EFF6FF' : '#FFFBEB',
                            color: step.mode === 'online' ? '#15803D' : step.mode === 'csc' ? '#1D4ED8' : '#D97706'
                          }}>
                            {step.mode}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DOCUMENTS REQUIRED */}
                  <div>
                    <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A8A29E', fontWeight: 700, marginBottom: '4px' }}>
                      DOCUMENTS REQUIRED
                    </div>
                    {selectedScheme.documents.map((doc, i) => (
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
                    📋 Generate Preparation Doc
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#1A6B3C', border: '1.5px solid #BBF7D0', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => toggleSave(selectedScheme.id)}
                  >
                    {savedIds.includes(selectedScheme.id) ? '✓ Scheme Saved' : '⭐ Save Scheme'}
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#15803D', border: '1.5px solid #BBF7D0', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => shareWhatsApp('SuvidhaAI — ' + selectedScheme.nameHindi + '\nBenefit: ' + selectedScheme.amount + '\nApply: ' + selectedScheme.officialUrl)}
                  >
                    💬 Share via WhatsApp
                  </button>
                  <button
                    style={{
                      background: 'white', color: '#E8690B', border: '1.5px solid #FED7AA', borderRadius: '6px',
                      padding: '7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', width: '100%'
                    }}
                    onClick={() => window.open(selectedScheme.officialUrl, '_blank')}
                  >
                    🔗 Official Website →
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
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>Comparing:</span>
              <div style={{ flex: 1, display: 'flex', gap: '5px' }}>
                {compareList.map(scheme => (
                  <div key={scheme.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FFF8F1', border: '1px solid #FED7AA', borderRadius: '5px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#1C1917' }}>
                    {scheme.nameHindi}
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
                Compare Now →
              </button>
              <button
                style={{ fontSize: '10px', color: '#A8A29E', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}
                onClick={() => setCompareList([])}
              >
                Clear all
              </button>
            </div>
          )}

          {/* OTHER PANELS - PLACEHOLDERS */}
          {activePanel === 'compare' && (
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              {compareList.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <div style={{ fontSize: '14px', fontFamily: 'Georgia, serif', fontWeight: 700, color: '#A8A29E' }}>
                    No schemes selected for comparison
                  </div>
                  <div style={{ fontSize: '11px', color: '#C4BFBA', maxWidth: '280px', margin: '6px auto 0' }}>
                    Go to Scheme Search and click +C button on any card. Compare up to 3 schemes.
                  </div>
                  <button
                    style={{ background: '#E8690B', color: 'white', borderRadius: '7px', padding: '8px 16px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '14px' }}
                    onClick={() => setActivePanel('schemes')}
                  >
                    ← Go to Scheme Search
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '140px ' + compareList.map(() => '1fr').join(' '), background: '#E7E0D8', gap: '1px', borderRadius: '8px', overflow: 'hidden' }}>
                  {/* Header Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '11px', fontWeight: 700, color: '#57534E' }}>
                    Compare
                  </div>
                  {compareList.map((scheme, index) => (
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
                        {scheme.nameHindi}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.65)' }}>
                        {scheme.nameEnglish}
                      </div>
                    </div>
                  ))}

                  {/* Eligibility Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Eligibility
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px',
                        background: scheme.eligibility === 'eligible' ? '#F0FDF4' : scheme.eligibility === 'partial' ? '#FFFBEB' : '#FEF2F2',
                        color: scheme.eligibility === 'eligible' ? '#15803D' : scheme.eligibility === 'partial' ? '#D97706' : '#DC2626'
                      }}>
                        {scheme.eligibility === 'eligible' ? '✓ Eligible' : scheme.eligibility === 'partial' ? '⚠ Partial' : '✗ Ineligible'}
                      </div>
                    </div>
                  ))}

                  {/* Match Score Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Match Score
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
                    Benefit Amount
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917', fontFamily: 'Georgia, serif' }}>
                        {scheme.amount}
                      </div>
                      <div style={{ fontSize: '8px', color: '#A8A29E' }}>
                        {scheme.unit}
                      </div>
                    </div>
                  ))}

                  {/* How to Apply Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    How to Apply
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
                    Documents
                  </div>
                  {compareList.map(scheme => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1C1917' }}>
                        {scheme.documents.length} documents
                      </div>
                    </div>
                  ))}

                  {/* Processing Time Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Processing Time
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1C1917' }}>
                        {index === 0 ? '7–14 days' : index === 1 ? '14–30 days' : '30–90 days'}
                      </div>
                    </div>
                  ))}

                  {/* Rejection Risk Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Rejection Risk
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px',
                        background: index === 0 ? '#F0FDF4' : index === 1 ? '#FFFBEB' : '#FEF2F2',
                        color: index === 0 ? '#15803D' : index === 1 ? '#D97706' : '#DC2626'
                      }}>
                        {index === 0 ? 'Low' : index === 1 ? 'Medium' : 'High'}
                      </div>
                    </div>
                  ))}

                  {/* Recommended Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Recommended
                  </div>
                  {compareList.map((scheme, index) => (
                    <div key={scheme.id} style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
                      <div style={{
                        fontSize: '10px', fontWeight: 700,
                        color: index === 0 ? '#15803D' : '#57534E'
                      }}>
                        {index === 0 ? '✓ Start Here' : `Apply ${index + 1}${index === 1 ? 'nd' : 'rd'}`}
                      </div>
                    </div>
                  ))}

                  {/* Action Row */}
                  <div style={{ background: '#F4F1EC', padding: '12px', fontSize: '10px', fontWeight: 700, color: '#57534E' }}>
                    Action
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
                        Start Preparation →
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
                {selectedScheme.nameHindi} — {selectedScheme.nameEnglish}
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: 700, color: '#1C1917', display: 'block', marginBottom: '12px' }}>
                अपनी जानकारी भरें
              </div>
              <div style={{ fontSize: '11px', color: '#78716C', marginTop: '6px', marginBottom: '12px', lineHeight: 1.6 }}>
                To generate a personalised application document, we need your basic details. This takes less than 2 minutes.
              </div>
              <div style={{ background: '#F4F1EC', borderRadius: '6px', padding: '8px 12px', marginBottom: '16px', textAlign: 'left' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#1C1917' }}>We need: </span>
                <span style={{ fontSize: '10px', color: '#78716C', marginLeft: '4px' }}>
                  {schemeCategory === 'farmer' ? 'Name, Age, State, Land details, Aadhaar-bank link status' :
                   schemeCategory === 'housing' ? 'Name, Age, State, BPL card status, Current house type' :
                   schemeCategory === 'health' ? 'Name, Age, State, Ration card type, Family size' :
                   schemeCategory === 'business' ? 'Name, Age, State, Business type, Loan history' :
                   schemeCategory === 'women' ? 'Name, Age, State, BPL status, LPG connection status' :
                   schemeCategory === 'student' ? 'Name, Age, State, Current qualification, Institution' :
                   'Name, Age, State, Occupation, Income'}
                </span>
              </div>
              <button
                style={{ background: '#E8690B', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
                onClick={() => setShowProfileForm(true)}
              >
                भरें और Document बनाएं →
              </button>
              <button
                style={{ background: 'white', color: '#78716C', border: '1.5px solid #E7E0D8', borderRadius: '8px', padding: '10px 24px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: '8px', fontFamily: 'inherit' }}
                onClick={useDemoProfile}
              >
                Demo Profile use करें (Rajesh Patil — Farmer)
              </button>
            </div>
          )}

          {activePanel === 'tracker' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#1C1917' }}>
                    Application Tracker
                  </div>
                  <div style={{ fontSize: '10px', color: '#78716C', marginTop: '2px' }}>
                    Track status of your applications
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
                      {filter === 'all' ? 'All' : filter === 'pending' ? 'Pending' : filter === 'approved' ? 'Approved' : 'Action Needed'}
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
                        {['Applied', 'Under Review', 'Verified', 'Disbursed'].map((step, i) => (
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
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917' }}>{item.schemeName}</div>
                        <div style={{ fontSize: '9px', color: '#A8A29E', marginTop: '1px' }}>{item.dateApplied}</div>
                        {item.referenceNumber ? (
                          <div style={{ fontSize: '9px', color: '#57534E', fontFamily: 'monospace', background: '#F4F1EC', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                            {item.referenceNumber}
                          </div>
                        ) : (
                          <div style={{ fontSize: '9px', color: '#A8A29E', fontStyle: 'italic', marginTop: '3px' }}>
                            No reference number yet
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: '#57534E', lineHeight: 1.5, marginTop: '4px' }}>
                          {item.nextStep}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{
                          width: '120px', padding: '8px 12px', borderRadius: '8px', textAlign: 'center',
                          fontSize: '11px', fontWeight: 700,
                          ...getStatusStyle(item.status)
                        }}>
                          {getStatusStyle(item.status).label}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: '1px solid #E7E0D8', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Update
                          </button>
                          {item.status === 'docs_needed' && (
                            <button
                              style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#E8690B', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                              onClick={() => setActivePanel('csc')}
                            >
                              Find CSC →
                            </button>
                          )}
                          {item.status === 'approved' && (
                            <button
                              style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#25D366', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                              onClick={() => shareWhatsApp(item.schemeName + ' — Application APPROVED!\nRef: ' + item.referenceNumber)}
                            >
                              Share ✓
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
                  placeholder="Search by area or pincode..."
                />
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {cscData.map((csc, index) => (
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
                          {csc.distance}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px', background: csc.isOpen ? '#F0FDF4' : '#FEF2F2', color: csc.isOpen ? '#15803D' : '#DC2626' }}>
                          ● {csc.isOpen ? 'Open' : 'Closed'}
                        </span>
                        <span style={{ fontSize: '9px', color: '#A8A29E', marginLeft: '2px' }}>{csc.hours}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                        <button
                          style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#1565C0', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={openMaps}
                        >
                          📍 Directions
                        </button>
                        <button
                          style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#F4F1EC', color: '#1C1917', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => window.open('tel:' + csc.phone)}
                        >
                          📞 Call
                        </button>
                        <button
                          style={{ fontSize: '9px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: 'none', background: '#25D366', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => window.open('https://wa.me/91' + csc.phone + '?text=' + encodeURIComponent('I need help with government scheme application'), '_blank')}
                        >
                          💬 WhatsApp
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
                  Open in Google Maps
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.5, maxWidth: '260px' }}>
                  Click button below to find all CSC centres near your current location on Google Maps.
                </div>
                <button
                  style={{ background: '#E8690B', color: 'white', borderRadius: '8px', padding: '10px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={openMaps}
                >
                  📍 Find CSC Centres Near Me →
                </button>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '12px', textAlign: 'center' }}>
                  Or use list on the left to find by area or pincode.
                </div>
              </div>
            </div>
          )}

          {activePanel === 'helpline' && (
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#1C1917', marginBottom: '2px' }}>
                Government Helplines
              </div>
              <div style={{ fontSize: '10px', color: '#78716C', marginTop: '2px', marginBottom: '12px' }}>
                Official contact numbers for all central government schemes
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {helplineData.map((item, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '14px', border: '1px solid #E7E0D8', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: '8px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', display: 'inline-block', marginBottom: '8px', background: item.categoryBg, color: item.categoryColor }}>
                      {item.category}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1C1917', marginBottom: '4px' }}>{item.name}</div>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: 700, color: '#E8690B', display: 'block', marginBottom: '4px' }}>
                      {item.number}
                    </div>
                    <div style={{ fontSize: '9px', color: '#78716C', marginBottom: '2px' }}>{item.hours}</div>
                    <div style={{ fontSize: '9px', color: '#A8A29E', marginBottom: '10px' }}>{item.languages}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        style={{ flex: 1, padding: '7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: item.btnColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => window.open('tel:' + item.number.replace(/-/g, ''))}
                      >
                        📞 Call Now
                      </button>
                      <button
                        style={{ flex: 1, padding: '7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: '#25D366', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => window.open('https://wa.me/' + item.number.replace(/-/g, ''), '_blank')}
                      >
                        💬 WhatsApp
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
