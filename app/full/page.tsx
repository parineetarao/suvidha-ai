'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

// SECTION 1 — TYPES
type ActivePanel = 'schemes' | 'compare' | 'prep' | 'tracker' | 'csc' | 'helpline';
type EligibilityStatus = 'eligible' | 'partial' | 'ineligible';
type AppStatus = 'approved' | 'docs_needed' | 'pending' | 'rejected';

type SchemeItem = {
  id: number;
  nameEnglish: string;
  nameHindi: string;
  category: string;
  benefit: string;
  eligibility: string[];
  documents: string[];
  process: string;
  officialUrl: string;
  applyUrl: string;
  helpline: string;
  headerColor: string;
  logo: string;
  stateSpecific?: string[];
  incomeLimit?: string;
  ageLimit?: string;
  occupation?: string[];
  deadline?: string;
};

type TrackerItem = {
  id: number;
  schemeName: string;
  status: AppStatus;
  appliedDate: string;
  referenceNumber?: string;
  nextStep: string;
  documents: string[];
  notes?: string;
};

type CSCItem = {
  id: number;
  name: string;
  address: string;
  distance: string;
  phone: string;
  hours: string;
  services: string[];
};

// SECTION 2 — DATA
const allSchemes: SchemeItem[] = [
  {
    id: 1,
    nameEnglish: "PM Kisan Samman Nidhi",
    nameHindi: "पीएम किसान सम्मान निधि",
    category: "farmer",
    benefit: "₹6,000 per year in 3 installments",
    eligibility: ["Small and marginal farmers", "Land holding up to 2 hectares", "All states"],
    documents: ["Aadhaar Card", "Bank Passbook", "Land Records"],
    process: "Apply online through CSC or bank branch",
    officialUrl: "https://pmkisan.gov.in",
    applyUrl: "https://pmkisan.gov.in/RegistrationForm.aspx",
    helpline: "011-23381092, 18001155266",
    headerColor: "#1A6B3C",
    logo: "/schemes/pm-kisan.png"
  },
  {
    id: 2,
    nameEnglish: "PM Awas Yojana (Gramin)",
    nameHindi: "प्रधानमंत्री आवास योजना (ग्रामीण)",
    category: "housing",
    benefit: "₹1.20 lakh assistance for house construction",
    eligibility: ["No pucca house", "Annual income < ₹3L", "Rural areas only"],
    documents: ["Aadhaar", "Income Certificate", "Land Records", "BPL Card"],
    process: "Apply through CSC or online portal",
    officialUrl: "https://pmayg.gov.in",
    applyUrl: "https://pmayg.gov.in/frmLogin.aspx",
    helpline: "1800116188",
    headerColor: "#E8690B",
    logo: "/schemes/pm-awas.png"
  },
  {
    id: 3,
    nameEnglish: "Ujjwala Yojana",
    nameHindi: "उज्ज्वला योजना",
    category: "women",
    benefit: "Free LPG connection with stove",
    eligibility: ["Women from BPL families", "Age 18+ years", "No existing LPG connection"],
    documents: ["Aadhaar", "BPL Card", "Bank Account", "Photo"],
    process: "Apply through LPG distributor or CSC",
    officialUrl: "https://pmujjwalayojana.gov.in",
    applyUrl: "https://pmujjwalayojana.gov.in/apply",
    helpline: "18002333555",
    headerColor: "#7C3AED",
    logo: "/schemes/ujjwala.png"
  },
  {
    id: 4,
    nameEnglish: "PM Shram Yogi Maandhan",
    nameHindi: "प्रधानमंत्री श्रम योगी मानधन",
    category: "senior",
    benefit: "₹3,000 monthly pension after 60 years",
    eligibility: ["Unorganized sector workers", "Age 18-40 years", "Monthly income < ₹15,000"],
    documents: ["Aadhaar", "Bank Account", "Age Proof", "Self-declaration"],
    process: "Apply through EPFO or CSC",
    officialUrl: "https://maandhan.gov.in",
    applyUrl: "https://maandhan.gov.in/registration",
    helpline: "1800110005",
    headerColor: "#0F766E",
    logo: "/schemes/shram-yogi.png"
  },
  {
    id: 5,
    nameEnglish: "Mudra Yojana",
    nameHindi: "मुद्रा योजना",
    category: "business",
    benefit: "Business loan up to ₹10 lakh",
    eligibility: ["Indian citizen", "Business plan required", "No collateral for < ₹10L"],
    documents: ["Business Plan", "KYC documents", "Bank statements", "GST if applicable"],
    process: "Apply through participating banks",
    officialUrl: "https://mudra.org.in",
    applyUrl: "https://mudra.org.in/apply",
    helpline: "1800110005",
    headerColor: "#DC2626",
    logo: "/schemes/mudra.png"
  },
  {
    id: 6,
    nameEnglish: "National Scholarship Portal",
    nameHindi: "राष्ट्रीय छात्रवृत्ति पोर्टल",
    category: "student",
    benefit: "Various scholarships for students",
    eligibility: ["Students from class 1 to PhD", "Based on merit and income", "Different criteria for each scheme"],
    documents: ["Aadhaar", "Bank Account", "Previous year marks", "Income certificate"],
    process: "Apply online through NSP portal",
    officialUrl: "https://scholarships.gov.in",
    applyUrl: "https://scholarships.gov.in/fresh/newlogin",
    helpline: "0120-6619540",
    headerColor: "#2563EB",
    logo: "/schemes/scholarship.png"
  }
];

const trackerData: TrackerItem[] = [
  {
    id: 1,
    schemeName: "PM Kisan Samman Nidhi",
    status: "approved",
    appliedDate: "2024-01-15",
    referenceNumber: "PMK2024MH123456",
    nextStep: "Wait for next installment",
    documents: ["Aadhaar", "Bank Passbook", "Land Records"],
    notes: "First installment received on 2024-02-01"
  },
  {
    id: 2,
    schemeName: "Ujjwala Yojana",
    status: "pending",
    appliedDate: "2024-02-01",
    referenceNumber: "UJ2024MH789012",
    nextStep: "Document verification pending",
    documents: ["Aadhaar", "BPL Card"],
    notes: "Submitted additional documents on 2024-02-10"
  }
];

const cscData: CSCItem[] = [
  {
    id: 1,
    name: "VLE Digital Seva Kendra",
    address: "Main Road, Near Post Office, Village Kharghar",
    distance: "2.5 km",
    phone: "9876543210",
    hours: "9:00 AM - 6:00 PM",
    services: ["PM Kisan", "Aadhaar", "PAN Card", "Banking"]
  },
  {
    id: 2,
    name: "Jan Seva Kendra",
    address: "Shop No. 5, Market Complex, Taluka Place",
    distance: "4.1 km",
    phone: "9876543211",
    hours: "10:00 AM - 7:00 PM",
    services: ["All Schemes", "Insurance", "Bill Payment"]
  }
];

// SECTION 3 — HELPER FUNCTIONS
const filterSchemes = (schemes: SchemeItem[], query: string): SchemeItem[] => {
  const q = query.toLowerCase().trim();
  if (!q) return schemes;
  
  return schemes.filter(scheme => {
    // Category-based matching
    if (q.includes('farmer') || q.includes('किसान') || q.includes('kisan')) {
      return scheme.category === 'farmer';
    }
    if (q.includes('women') || q.includes('mahila') || q.includes('महिला')) {
      return scheme.category === 'women';
    }
    if (q.includes('student') || q.includes('education') || q.includes('छात्र')) {
      return scheme.category === 'student';
    }
    if (q.includes('housing') || q.includes('house') || q.includes('आवास')) {
      return scheme.category === 'housing';
    }
    if (q.includes('senior') || q.includes('pension') || q.includes('वृद्ध')) {
      return scheme.category === 'senior';
    }
    if (q.includes('business') || q.includes('loan') || q.includes('व्यवसाय')) {
      return scheme.category === 'business';
    }
    
    // Text search
    return scheme.nameEnglish.toLowerCase().includes(q) ||
           scheme.nameHindi.toLowerCase().includes(q) ||
           scheme.category.toLowerCase().includes(q) ||
           scheme.benefit.toLowerCase().includes(q);
  });
};

const getStatusStyle = (status: AppStatus) => {
  switch (status) {
    case 'approved': return { bg: '#F0FDF4', text: '#1A6B3C', border: '#BBF7D0' };
    case 'pending': return { bg: '#FFF8F1', text: '#E8690B', border: '#FED7AA' };
    case 'docs_needed': return { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' };
    case 'rejected': return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
    default: return { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' };
  }
};

const shareWhatsApp = (text: string) => {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
};

const findNearestCSC = () => {
  alert('Finding nearest CSC centers... This feature will show the closest centers on map.');
};

// SECTION 4 — MAIN COMPONENT
export default function FullModePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePanel, setActivePanel] = useState<ActivePanel>('schemes');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SchemeItem[]>(allSchemes)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedScheme, setSelectedScheme] = useState<SchemeItem>(allSchemes[0]);
  const [compareList, setCompareList] = useState<SchemeItem[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [checkedDocs, setCheckedDocs] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const [referenceNumber, setReferenceNumber] = useState('');
  const [scriptLang, setScriptLang] = useState<'hindi' | 'marathi' | 'english'>('hindi');
  const [selectedCSC, setSelectedCSC] = useState(0);
  const [trackerFilter, setTrackerFilter] = useState<'all' | 'pending' | 'approved' | 'action'>('all');
  
  // Profile state
  const [hasProfile, setHasProfile] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: '',
    age: '',
    state: '',
    occupation: '',
    land: '',
    income: ''
  });

  // On mount read URL param
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearchQuery(q);
      const filtered = filterSchemes(allSchemes, q)
      setResults(filtered.length > 0 ? filtered : allSchemes)
      setHasSearched(true)
      if (filtered.length > 0) setSelectedScheme(filtered[0])
    }
  }, [searchParams]);

  // Handler functions
  const handleSearch = () => {
    const filtered = filterSchemes(allSchemes, searchQuery)
    setResults(filtered.length > 0 ? filtered : allSchemes)
    setHasSearched(true)
    if (filtered.length > 0) setSelectedScheme(filtered[0])
  };

  const toggleSave = (id: number) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleCompare = (scheme: SchemeItem) => {
    setCompareList(prev => {
      const exists = prev.find(item => item.id === scheme.id);
      if (exists) return prev.filter(item => item.id !== scheme.id);
      if (prev.length >= 3) {
        alert('You can compare maximum 3 schemes at a time');
        return prev;
      }
      return [...prev, scheme];
    });
  };

  const toggleDoc = (index: number) => {
    setCheckedDocs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Panel info
  const panelInfo = {
    schemes: { title: 'Scheme Search', subtitle: 'Find and explore government schemes' },
    compare: { title: 'Compare Schemes', subtitle: 'Compare benefits and eligibility' },
    prep: { title: 'Application Prep', subtitle: 'Prepare and track applications' },
    tracker: { title: 'Application Tracker', subtitle: 'Monitor your application status' },
    csc: { title: 'CSC Locator', subtitle: 'Find nearest service centers' },
    helpline: { title: 'Helpline', subtitle: 'Get help and support' }
  };

  const navItems = [
    { id: 'schemes', label: 'Scheme Search', icon: '🔍' },
    { id: 'compare', label: 'Compare', icon: '⚖️', badge: compareList.length > 0 ? compareList.length : undefined },
    { id: 'prep', label: 'Application Prep', icon: '📋' },
    { id: 'tracker', label: 'Application Tracker', icon: '📊' },
    { id: 'csc', label: 'CSC Locator', icon: '📍' },
    { id: 'helpline', label: 'Helpline', icon: '📞' }
  ];

  return (
    <div className="min-h-screen bg-[#F4F1EC]">
      {/* Left Sidebar */}
      <div className="w-64 bg-[#1C1917] h-screen fixed left-0 top-0 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#E8690B] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">स्व</span>
            </div>
            <div>
              <div className="text-white font-bold" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                Suvidha
              </div>
              <div className="text-[10px] text-white/70">Government Schemes</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-3">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id as ActivePanel)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activePanel === item.id
                  ? 'bg-[#E8690B] text-white'
                  : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{item.label}</div>
              </div>
              {item.badge && (
                <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          {savedIds.length > 0 && (
            <div className="text-[9px] text-white/55" style={{ paddingLeft: '36px', marginTop: '-4px', marginBottom: '4px' }}>
              ⭐ {savedIds.length} saved
            </div>
          )}
          <button
            onClick={() => router.push('/')}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 7,
              padding: '8px 12px',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginBottom: 6
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Back to Home
          </button>
          <div className="bg-black/20 rounded-md p-0.5 flex gap-0.5">
            <button
              onClick={() => router.push('/simple')}
              className="px-3 py-1 rounded text-xs text-white/50"
            >
              Simple
            </button>
            <button className="px-3 py-1 rounded text-xs font-bold bg-[#E8690B] text-white">
              Full Mode
            </button>
          </div>
        </div>

        {/* Bottom section */}
        <div className="p-2.5 border-t border-white/10">
          <button
            onClick={() => {
              if (hasProfile) {
                alert(`Profile saved!\n\nName: ${profileData.fullName}\nAge: ${profileData.age}\nState: ${profileData.state}\nOccupation: ${profileData.occupation}\n\nIn production this will sync to your account.`)
              } else {
                setActivePanel('prep')
                setShowProfileForm(true)
              }
            }}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 7, padding: '8px 12px', color: 'white', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
              marginBottom: 8
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3"/>
            </svg>
            {hasProfile ? `✓ Profile Saved — ${profileData.fullName.split(' ')[0]}` : 'Login / Save Profile'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64">
        {/* Top bar */}
        <div className="h-12.5 bg-white border-b-2 border-[#E8690B] px-5 flex items-center flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {panelInfo[activePanel].title}
            </div>
            <div className="text-[10px] text-[#A8A29E] ml-1">{panelInfo[activePanel].subtitle}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select className="border border-[#E7E0D8] rounded text-[10px] px-2 py-1">
              <option>Hindi</option>
              <option>Marathi</option>
              <option>English</option>
            </select>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto bg-[#F4F1EC] p-4">
          {/* SCHEMES PANEL */}
          {activePanel === 'schemes' && (
            <div className="grid grid-cols-[1fr_280px] gap-3">
              {/* Left column */}
              <div>
                {/* Search card */}
                <div className="bg-white rounded-lg p-4 mb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-[#1A6B3C] rounded-full flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#1C1917]">Search Government Schemes</div>
                      <div className="text-[10px] text-[#A8A29E]">Find schemes matching your profile</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      className="flex-1 border border-[#E7E0D8] rounded-md px-3 py-2 text-sm outline-none focus:border-[#E8690B]"
                      placeholder="Enter keywords like farmer, women, student..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                      className="bg-[#E8690B] text-white rounded-md px-4 py-1.5 text-xs font-bold cursor-pointer"
                      onClick={handleSearch}
                    >
                      Search
                    </button>
                  </div>
                  {(hasSearched || searchParams.get('q')) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A6B3C] text-white">State: Maharashtra</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8690B] text-white">Age: 45</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7C3AED] text-white">Occupation: Farmer</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0F766E] text-white">Income: Low</span>
                    </div>
                  )}
                </div>

                {/* Results header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[#78716C]">
                    {hasSearched ? `${results.length} schemes found` : `Showing all ${allSchemes.length} schemes — search above to filter`}
                  </div>
                  <div className="flex gap-1">
                    {['Best Match', 'Highest Benefit', 'Easiest'].map(sort => (
                      <button
                        key={sort}
                        className="px-2 py-0.5 rounded text-xs font-bold border bg-white text-[#57534E] border-[#E7E0D8]"
                      >
                        {sort}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Results list */}
                <div className="space-y-2">
                  {results.map(scheme => (
                    <div
                      key={scheme.id}
                      className={`bg-white rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                        selectedScheme.id === scheme.id ? 'ring-2 ring-[#E8690B]' : ''
                      }`}
                      onClick={() => setSelectedScheme(scheme)}
                    >
                      <div className="flex gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: scheme.headerColor }}>
                          <img src={scheme.logo} alt={scheme.nameEnglish} className="w-full h-full object-contain p-2" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-[#1C1917] mb-1">{scheme.nameHindi}</div>
                          <div className="text-xs text-[#78716C] mb-2">{scheme.benefit}</div>
                          <div className="flex gap-2">
                            <button
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A6B3C] text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSave(scheme.id);
                              }}
                            >
                              {savedIds.includes(scheme.id) ? '✓ Saved' : '+ Save'}
                            </button>
                            <button
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8690B] text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompare(scheme);
                              }}
                            >
                              + Compare
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column - Scheme Detail Panel */}
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden" style={{ backgroundColor: selectedScheme.headerColor }}>
                      <img src={selectedScheme.logo} alt={selectedScheme.nameEnglish} className="w-full h-full object-contain p-2" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[#1C1917]">{selectedScheme.nameHindi}</div>
                      <div className="text-xs text-[#78716C]">{selectedScheme.category}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-[9px] uppercase text-[#A8A29E] font-bold mb-1">Benefits</div>
                      <div className="text-xs text-[#1C1917]">{selectedScheme.benefit}</div>
                    </div>

                    <div>
                      <div className="text-[9px] uppercase text-[#A8A29E] font-bold mb-1">Eligibility</div>
                      <ul className="text-xs text-[#1C1917] space-y-0.5">
                        {selectedScheme.eligibility.map((item, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-[#E8690B] mt-0.5">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-[9px] uppercase text-[#A8A29E] font-bold mb-1">Documents Required</div>
                      <ul className="text-xs text-[#1C1917] space-y-0.5">
                        {selectedScheme.documents.map((doc, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-[#E8690B] mt-0.5">•</span>
                            {doc}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-[9px] uppercase text-[#A8A29E] font-bold mb-1">Application Process</div>
                      <div className="text-xs text-[#1C1917]">{selectedScheme.process}</div>
                    </div>

                    <div className="pt-2 border-t border-[#E7E0D8]">
                      <button
                        className="w-full bg-[#E8690B] text-white rounded-lg py-2 text-xs font-bold cursor-pointer"
                        onClick={() => {
                          setActivePanel('prep')
                          if (!hasProfile) {
                            setShowProfileForm(false)
                          }
                        }}
                      >
                        Generate Preparation Doc
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* COMPARE PANEL */}
          {activePanel === 'compare' && (
            <div className="max-w-4xl mx-auto">
              {compareList.length === 0 ? (
                <div className="bg-white rounded-lg p-8 text-center">
                  <div className="w-16 h-16 bg-[#F4F1EC] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E8690B" strokeWidth="2">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                    </svg>
                  </div>
                  <div className="text-lg font-bold text-[#1C1917] mb-2">Compare Schemes</div>
                  <div className="text-sm text-[#78716C] mb-4">Add schemes to compare their benefits and eligibility side by side</div>
                  <button
                    className="bg-[#E8690B] text-white rounded-lg px-4 py-2 text-sm font-bold"
                    onClick={() => setActivePanel('schemes')}
                  >
                    Go to Scheme Search
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-bold text-[#1C1917]">Compare Schemes ({compareList.length}/3)</div>
                    <button
                      className="text-xs text-red-600 font-bold"
                      onClick={() => setCompareList([])}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#E7E0D8]">
                          <th className="text-left p-2">Scheme</th>
                          <th className="text-left p-2">Benefit</th>
                          <th className="text-left p-2">Eligibility</th>
                          <th className="text-left p-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareList.map(scheme => (
                          <tr key={scheme.id} className="border-b border-[#E7E0D8]">
                            <td className="p-2">
                              <div className="font-bold">{scheme.nameHindi}</div>
                            </td>
                            <td className="p-2">{scheme.benefit}</td>
                            <td className="p-2">{scheme.eligibility[0]}</td>
                            <td className="p-2">
                              <button
                                className="text-red-600 text-xs"
                                onClick={() => setCompareList(prev => prev.filter(item => item.id !== scheme.id))}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* APPLICATION PREP PANEL */}
          {activePanel === 'prep' && (
            <div className="bg-white rounded-lg p-6 text-center">
              <div className="text-lg font-bold mb-4">Application Preparation</div>
              <div className="text-sm text-gray-600 mb-6">
                {!hasProfile ? 'Create your profile first to generate personalized application documents.' : 'Your profile is ready! Application documents can be generated.'}
              </div>
              {!hasProfile ? (
                <button
                  className="bg-[#E8690B] text-white rounded-lg px-6 py-3 font-bold"
                  onClick={() => setShowProfileForm(true)}
                >
                  Create Profile Now →
                </button>
              ) : (
                <div className="text-green-600 font-bold">✓ Profile Created Successfully</div>
              )}
            </div>
          )}

          {/* TRACKER PANEL */}
          {activePanel === 'tracker' && (
            <div className="bg-white rounded-lg p-6">
              <div className="text-lg font-bold mb-4">Application Tracker</div>
              <div className="text-sm text-gray-600">Track your application status here</div>
            </div>
          )}

          {/* CSC PANEL */}
          {activePanel === 'csc' && (
            <div className="bg-white rounded-lg p-6">
              <div className="text-lg font-bold mb-4">CSC Locator</div>
              <div className="text-sm text-gray-600">Find nearest Common Service Center</div>
            </div>
          )}

          {/* HELPLINE PANEL */}
          {activePanel === 'helpline' && (
            <div className="bg-white rounded-lg p-6">
              <div className="text-lg font-bold mb-4">Helpline</div>
              <div className="text-sm text-gray-600">Contact support for assistance</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
