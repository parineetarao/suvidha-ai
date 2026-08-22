'use client';
import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import AuthStatus from "@/components/AuthStatus"
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Mic, Search, CheckCircle2, AlertCircle, FileText, MessageSquare, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { S, g, gf, type Lang } from '@/lib/strings';
import { searchSchemes } from '@/lib/api';

// Canonical English search queries per quick-category chip (Section 2) and
// per audience card (Section 8) — kept in English regardless of UI language
// so POST /schemes/search gets a stable query and results don't shuffle
// every time someone switches languages. The multilingual embedding model
// matches these against scheme text in any language on the DB side.
const CHIP_QUERIES: Record<string, string> = {
  farmer: 'farmer agriculture crop land',
  senior: 'senior citizen elderly pension old age',
  woman: 'single woman widow women welfare',
  student: 'student scholarship education',
  wage: 'daily wage worker laborer construction unorganised',
  housing: 'housing home rural awas',
};

const AUDIENCE_QUERIES: Record<string, string> = {
  farmers: 'farmer agriculture crop land',
  women: 'women welfare maternity widow girl child',
  seniors: 'senior citizen elderly pension old age',
  students: 'student scholarship education skill training',
  business: 'business loan entrepreneur MSME self-employed',
  health: 'health medical insurance treatment',
};

// A real match_score (0-100, from the backend's hybrid semantic+TF-IDF
// ranking) below this is treated as "not really about this category" when
// turning a ranked list into a headline count — the DB's category/
// eligibility_rules fields are too sparse (see backend inspection) to give
// an exact taxonomy-based count instead.
const RELEVANCE_THRESHOLD = 32;

type CategoryCountState = { status: 'loading' } | { status: 'ready'; count: number } | { status: 'error' };

function CitizenOrbitalLogoMark({ size }: { size: number }) {
  const radius = Math.round((size * 8) / 34);

  return (
    <div
      className="bg-[#E8690B] flex items-center justify-center flex-shrink-0"
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px` }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <rect width="64" height="64" rx="14" fill="#E8690B" />
        <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeDasharray="3 3" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx="32" cy="27" r="6" fill="white" />
        <path d="M20 46 C20 38 25 34 32 34 C39 38 44 38 44 46" fill="white" />
        <circle cx="32" cy="6" r="3.5" fill="white" opacity="0.9" />
        <circle cx="55" cy="23" r="3" fill="white" opacity="0.75" />
        <circle cx="55" cy="41" r="2.5" fill="white" opacity="0.6" />
        <circle cx="9" cy="23" r="3" fill="white" opacity="0.75" />
        <circle cx="9" cy="41" r="2.5" fill="white" opacity="0.6" />
        <circle cx="32" cy="58" r="2.5" fill="white" opacity="0.6" />
      </svg>
    </div>
  );
}

function SuvidhaWordmark({
  darkBackground,
  titleSize,
  subtitleSize,
  tagline,
}: {
  darkBackground: boolean;
  titleSize: number;
  subtitleSize: number;
  tagline: string;
}) {
  return (
    <div>
      <div className="font-bold leading-none" style={{ fontFamily: 'var(--font-libre-baskerville)', fontSize: `${titleSize}px` }}>
        <span style={{ color: darkBackground ? '#FFFFFF' : '#1C1917' }}>Suvidha</span>
        <span style={{ color: '#E8690B' }}>AI</span>
      </div>
      <div
        className="uppercase leading-none mt-1"
        style={{
          fontFamily: 'var(--font-mukta)',
          fontSize: `${subtitleSize}px`,
          color: darkBackground ? 'rgba(255,255,255,0.5)' : '#A8A29E',
          letterSpacing: '0.04em',
        }}
      >
        {tagline}
      </div>
    </div>
  );
}

export default function SuvidhaAILanding() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en-IN');
  const [searchInput, setSearchInput] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const searchBoxRef = useRef<HTMLTextAreaElement>(null);

  const { isAuthenticated } = useAuth();

  // Real DB-backed counts for the 6 "Every Citizen" cards (Section 8) —
  // fetched once on mount via the existing POST /schemes/search endpoint,
  // independent of the UI language toggle (see LANG_TO_API_LANGUAGE note
  // above on why the query itself stays English).
  const [audienceCounts, setAudienceCounts] = useState<Record<string, CategoryCountState>>(
    Object.fromEntries(Object.keys(AUDIENCE_QUERIES).map((k) => [k, { status: 'loading' }])) as Record<string, CategoryCountState>
  );

  const loadAudienceCounts = () => {
    setAudienceCounts(
      Object.fromEntries(Object.keys(AUDIENCE_QUERIES).map((k) => [k, { status: 'loading' }])) as Record<string, CategoryCountState>
    );
    Object.entries(AUDIENCE_QUERIES).forEach(([key, query]) => {
      searchSchemes(query, 'en', 50)
        .then((results) => {
          const count = results.filter((r) => r.match_score >= RELEVANCE_THRESHOLD).length;
          setAudienceCounts((prev) => ({ ...prev, [key]: { status: 'ready', count } }));
        })
        .catch(() => {
          setAudienceCounts((prev) => ({ ...prev, [key]: { status: 'error' } }));
        });
    });
  };

  useEffect(() => {
    loadAudienceCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToDiscovery(query?: string, panel?: 'prep') {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (panel) params.set('panel', panel);
    params.set('lang', lang);
    router.push('/full?' + params.toString());
  }

  function focusHeroSearch() {
    searchBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchBoxRef.current?.focus();
  }

  // How It Works step cards -> real integration targets. Steps 2/3/4/6 all
  // land on app/full's already-live schemes panel (it shows search,
  // eligibility, rejection risks, and WhatsApp share together in one
  // workflow — see inspection notes), carrying forward whatever the user
  // already typed in the hero search box if anything. Step 5 deep-links
  // into the Application Preparation panel there (now wired to
  // POST /applications). Step 1 just points back at the existing search
  // box — that entry point already works and isn't being rebuilt.
  function handleStepClick(step: number) {
    const query = searchInput.trim() || undefined;
    if (step === 1) {
      focusHeroSearch();
    } else if (step === 5) {
      goToDiscovery(query, 'prep');
    } else {
      goToDiscovery(query);
    }
  }

  const languages: { code: Lang; label: string }[] = [
    { code: 'en-IN', label: 'English' },
    { code: 'hi-IN', label: 'हिंदी' },
    { code: 'mr-IN', label: 'मराठी' },
    { code: 'ta-IN', label: 'தமிழ்' },
    { code: 'te-IN', label: 'తెలుగు' },
    { code: 'kn-IN', label: 'ಕನ್ನಡ' },
    { code: 'ml-IN', label: 'മലയാളം' },
    { code: 'bn-IN', label: 'বাংলা' },
    { code: 'gu-IN', label: 'ગુજરાતી' },
    { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  ];

  return (
    <div className="w-full bg-white overflow-hidden">
      {/* SECTION 1: NAVIGATION BAR */}
      <nav className="sticky top-0 z-100 h-[62px] bg-white border-b-2 border-[#E8690B] flex items-center px-4 sm:px-6 lg:px-10 xl:px-5 sm:px-8 lg:px-12 justify-between gap-3">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CitizenOrbitalLogoMark size={34} />
          <SuvidhaWordmark darkBackground={false} titleSize={17} subtitleSize={9} tagline={g(S.landing.tagline, lang)} />
        </div>

        {/* Center: Nav Links */}
        <div className="hidden md:flex items-center gap-5 lg:gap-8">
          {[
            { id: 'schemes', label: g(S.landing.navSchemes, lang) },
            { id: 'how-it-works', label: g(S.landing.navHow, lang) },
            { id: 'about', label: g(S.landing.navAbout, lang) },
            { id: 'help', label: g(S.landing.navHelp, lang) },
          ].map((item) =>
            item.id === 'help' ? (
              <button
                key={item.id}
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="text-[12px] font-semibold text-[#57534E] hover:text-[#E8690B] hover:border-b-2 hover:border-[#E8690B] pb-1 transition-all whitespace-nowrap bg-transparent border-none cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-[12px] font-semibold text-[#57534E] hover:text-[#E8690B] hover:border-b-2 hover:border-[#E8690B] pb-1 transition-all whitespace-nowrap"
              >
                {item.label}
              </a>
            )
          )}
        </div>

        {/* Right: Language & Login */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-2 sm:px-3 py-2 text-[12px] text-[#57534E] cursor-pointer"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
                    {isAuthenticated ? (
                        <AuthStatus />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link
                            href="/login"
                            className="text-[#1A6B3C] text-[12px] font-semibold rounded-[5px] px-3 py-2 border border-[#1A6B3C] hover:bg-[#F0FDF4] transition-colors whitespace-nowrap"
                          >
                            Log in
                          </Link>
                          <Link
                            href="/register"
                            className="bg-[#1A6B3C] text-white text-[12px] rounded-[5px] px-3 sm:px-[18px] py-2 hover:bg-[#155032] transition-colors whitespace-nowrap"
                          >
                            Register
                          </Link>
                        </div>
                      )}
        </div>
      </nav>

      {/* SECTION 2: HERO */}
      <section className="relative w-full bg-white min-h-[620px] lg:min-h-[700px] px-5 sm:px-8 lg:px-16 xl:px-24 py-14 lg:py-20 overflow-hidden">
        {/* Background artwork */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image src="/images/hero-background.png" alt="" fill priority className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/45"></div>
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_520px] xl:grid-cols-[1fr_580px] gap-10 lg:gap-16 xl:gap-24 items-center max-w-[1600px] mx-auto">
          {/* LEFT SIDE */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[5px] px-3.5 py-1.5 mb-6">
              <div className="w-[5px] h-[5px] rounded-full bg-[#1A6B3C]" style={{ animation: 'pulse-dot 2s infinite' }}></div>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">{g(S.landing.badgeAccurate, lang)}</span>
              <span className="text-[#A8D5B5] mx-2">·</span>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">{g(S.landing.badgeFree, lang)}</span>
              <span className="text-[#A8D5B5] mx-2">·</span>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">{g(S.landing.badgeLanguage, lang)}</span>
            </div>

            {/* Headline */}
            <h1 className="max-w-[560px]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              <div
                className="text-[40px] sm:text-[48px] lg:text-[52px] xl:text-[58px] font-bold italic leading-tight bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #E8690B 0%, #EF8A1F 30%, #6B9B4F 65%, #1A6B3C 100%)' }}
              >
                {g(S.landing.headlineHi, lang)}
              </div>
              <div className="text-[22px] sm:text-[26px] lg:text-[28px] text-[#57534E] mt-2">{g(S.landing.headlineEn, lang)}</div>
            </h1>

            {/* Subline */}
            <p className="text-[14px] text-[#57534E] leading-[1.7] max-w-[440px] mb-6 mt-5">
              {g(S.landing.subline, lang)}
            </p>

            {/* Search Box */}
            <div className="max-w-[540px] bg-[#FAF7F2]/95 backdrop-blur-sm border-2 border-[#E7E0D8] rounded-[12px] p-4 mb-6 focus-within:border-[#E8690B] focus-within:bg-white transition-all">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                <textarea
                  ref={searchBoxRef}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const inputValue = searchInput.trim();
                      if (inputValue) {
                        router.push('/full?q=' + encodeURIComponent(inputValue));
                      }
                    }
                  }}
                  placeholder={g(S.landing.searchPlaceholder, lang)}
                  className="flex-1 h-14 text-[15px] bg-transparent resize-none placeholder-[#A8A29E] outline-none"
                  style={{ fontFamily: 'var(--font-mukta)' }}
                />
                <button
                  className="bg-[#E8690B] text-white text-[14px] font-bold rounded-[7px] px-5 py-3 whitespace-nowrap hover:bg-[#D05B09] transition-colors"
                  onClick={() => {
                    const inputValue = searchInput.trim();
                    if (inputValue) {
                      router.push('/full?q=' + encodeURIComponent(inputValue));
                    }
                  }}
                >
                  {g(S.landing.findSchemes, lang)}
                </button>
              </div>
            </div>

            {/* Suggestion Chips — real backend query (POST /schemes/search
                via app/full's already-live search+results workflow), no
                frontend-hardcoded scheme mapping. */}
            <div className="flex flex-wrap gap-2 max-w-[540px] mb-6">
              {[
                { id: 'farmer', label: g(S.landing.chipFarmer, lang) },
                { id: 'senior', label: g(S.landing.chipSenior, lang) },
                { id: 'woman', label: g(S.landing.chipWoman, lang) },
                { id: 'student', label: g(S.landing.chipStudent, lang) },
                { id: 'wage', label: g(S.landing.chipWage, lang) },
                { id: 'housing', label: g(S.landing.chipHousing, lang) },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => goToDiscovery(CHIP_QUERIES[chip.id])}
                  className="text-[11px] font-semibold px-[13px] py-[5px] rounded border border-[#E7E0D8] bg-white/90 text-[#57534E] hover:border-[#E8690B] hover:text-[#E8690B] transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Mic Button */}
            <button
              className="bg-[#F0FDF4]/95 border-[1.5px] border-[#BBF7D0] rounded-full px-[22px] py-[10px] flex items-center gap-2 hover:bg-[#E8F5E9] transition-colors mb-6"
              onClick={() => router.push('/simple')}
            >
              <Mic size={15} className="text-[#1A6B3C]" />
              <span className="text-[13px] font-semibold text-[#1A6B3C]">{g(S.landing.speakLang, lang)}</span>
            </button>
            <span className="text-[11px] text-[#A8A29E] block mb-6">{g(S.landing.langList, lang)}</span>

            {/* Trust Signals Row */}
            <div className="flex flex-wrap gap-5 pt-4 mt-5 border-t border-[#F0EBE4] max-w-[540px]">
              {[
                { text: g(S.landing.trust1, lang) },
                { text: g(S.landing.trust2, lang) },
                { text: g(S.landing.trust3, lang) },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#1A6B3C] flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[11px] text-[#57534E]" style={{ fontFamily: 'var(--font-mukta)' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE: ORBITAL ANIMATION */}
          <div className="hidden lg:flex items-center justify-center xl:scale-105 2xl:scale-110">
          <div className="w-[520px] h-[520px] relative flex-shrink-0">
            {/* Static SVG Rings */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 520 520" fill="none">
              {/* Inner dashed ring */}
              <circle cx="260" cy="260" r="120" stroke="#E7E0D8" strokeWidth="1.2" strokeDasharray="5 5" />
              {/* Outer dashed ring */}
              <circle cx="260" cy="260" r="210" stroke="#E7E0D8" strokeWidth="1" strokeDasharray="4 7" />
              {/* Outermost dashed ring */}
              <circle cx="260" cy="260" r="240" stroke="#E7E0D8" strokeWidth="0.8" strokeDasharray="3 8" />
              {/* Inner glow ring */}
              <circle cx="260" cy="260" r="48" fill="rgba(232, 105, 11, 0.05)" stroke="rgba(232, 105, 11, 0.18)" strokeWidth="1" />
              {/* Compass point dots */}
              <circle cx="260" cy="130" r="2.5" fill="#E7E0D8" />
              <circle cx="390" cy="260" r="2.5" fill="#E7E0D8" />
              <circle cx="260" cy="390" r="2.5" fill="#E7E0D8" />
              <circle cx="130" cy="260" r="2.5" fill="#E7E0D8" />
            </svg>

            {/* Center Node */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center">
              <div
                className="w-[80px] h-[80px] rounded-full bg-[#E8690B] flex items-center justify-center mx-auto mb-2 flex-shrink-0"
                style={{ animation: 'glow-pulse 3s ease-in-out infinite' }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                </svg>
              </div>
              <div className="text-[10px] font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-mukta)' }}>
                {g(S.landing.citizenCenter, lang)}
              </div>
              <div className="text-[8px] text-[#A8A29E]" style={{ fontFamily: 'var(--font-mukta)' }}>
                {g(S.landing.citizenSub, lang)}
              </div>
            </div>

            {/* Inner Orbit Container (3 nodes) */}
            <div
              className="absolute w-[240px] h-[240px] top-1/2 left-1/2 -ml-[120px] -mt-[120px]"
              style={{ animation: 'rotate-clockwise 24s linear infinite' }}
            >
              {/* PM Kisan - Top */}
              <div
                className="absolute top-[-28px] left-[calc(50%_-_28px)] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 24s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-kisan.jpg" alt="PM Kisan" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">PM Kisan</div>
              </div>

              {/* Ayushman - Bottom Right */}
              <div
                className="absolute bottom-[-8px] right-[-14px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 24s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-ayushman.png" alt="Ayushman Bharat" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">Ayushman</div>
              </div>

              {/* MGNREGA - Bottom Left */}
              <div
                className="absolute bottom-[-8px] left-[-14px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 24s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-mgnrega.jpg" alt="MGNREGA" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">MGNREGA</div>
              </div>
            </div>

            {/* Outermost Orbit Container (3 nodes) */}
            <div
              className="absolute w-[480px] h-[480px] top-1/2 left-1/2 -ml-[240px] -mt-[240px]"
              style={{ animation: 'rotate-clockwise 60s linear infinite' }}
            >
              {/* Sukanya Samridhi - Top */}
              <div
                className="absolute top-[-28px] left-[calc(50%_-_28px)] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 60s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-sukanya.png" alt="Sukanya Samridhi" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">Sukanya Samridhi</div>
              </div>

              {/* PM SVANidhi - Bottom Right */}
              <div
                className="absolute bottom-[-8px] right-[-14px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 60s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-svanidhi.png" alt="PM SVANidhi" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">PM SVANidhi</div>
              </div>

              {/* Fasal Bima - Bottom Left */}
              <div
                className="absolute bottom-[-8px] left-[-14px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-counter-clockwise 60s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-fasal-bima.png" alt="Fasal Bima" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">Fasal Bima</div>
              </div>
            </div>

            {/* Outer Orbit Container (5 nodes) */}
            <div
              className="absolute w-[420px] h-[420px] top-1/2 left-1/2 -ml-[210px] -mt-[210px]"
              style={{ animation: 'rotate-counter-clockwise 44s linear infinite' }}
            >
              {/* PM AWAS - Top */}
              <div
                className="absolute top-[-28px] left-[calc(50%_-_28px)] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-clockwise 44s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-awas.png" alt="PM Awas" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">PM Awas</div>
              </div>

              {/* MUDRA - Top Right */}
              <div
                className="absolute top-12 right-[-16px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-clockwise 44s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-mudra.png" alt="MUDRA" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">MUDRA</div>
              </div>

              {/* UJJWALA - Bottom Right */}
              <div
                className="absolute bottom-[48px] right-[-10px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-clockwise 44s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-ujjwala.png" alt="PM Ujjwala" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">Ujjwala</div>
              </div>

              {/* JAN DHAN - Bottom Left */}
              <div
                className="absolute bottom-[48px] left-[-10px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-clockwise 44s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-jandhan.png" alt="Jan Dhan" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">Jan Dhan</div>
              </div>

              {/* PMKVY - Top Left */}
              <div
                className="absolute top-12 left-[-16px] flex flex-col items-center cursor-pointer"
                style={{ animation: 'rotate-clockwise 44s linear infinite' }}
              >
                <div className="w-14 h-14 bg-white border-2 border-[rgba(255,255,255,0.8)] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] hover:scale-110 transition-transform flex-shrink-0 relative overflow-hidden">
                  <Image src="/images/scheme-pmkvy.png" alt="PMKVY" fill sizes="56px" className="object-cover" />
                </div>
                <div className="text-[8px] font-bold text-[#57534E] mt-1.5 max-w-[70px] whitespace-nowrap text-center">PMKVY</div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: TRICOLOUR STRIPE */}
      <div className="flex h-1">
        <div className="flex-1 bg-[#E8690B]"></div>
        <div className="flex-1 bg-white border-y border-[#E7E0D8]"></div>
        <div className="flex-1 bg-[#1A6B3C]"></div>
      </div>

      {/* SECTION 4: STATS STRIP */}
      <section className="bg-white border-b border-[#E7E0D8] px-5 sm:px-8 lg:px-12 py-3.5">
        <div className="max-w-7xl mx-auto flex justify-center items-center gap-9 flex-wrap">
          {[
            { number: '500+', label: g(S.landing.statSchemes, lang) },
            { number: '10', label: g(S.landing.statLanguages, lang) },
            { number: g(S.landing.statTimeNum, lang), label: g(S.landing.statTime, lang) },
            { number: g(S.landing.statFreeNum, lang), label: g(S.landing.statFree, lang) },
          ].map((stat, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-[19px] font-bold text-[#E8690B]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  {stat.number}
                </div>
                <div className="text-[12px] text-[#78716C]" style={{ fontFamily: 'var(--font-mukta)' }}>
                  {stat.label}
                </div>
              </div>
              {idx < 3 && <div className="h-[26px] w-px bg-[#E7E0D8]"></div>}
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 5: DUAL MODE */}
      <section id="about" className="bg-white border-y border-[#E7E0D8] px-5 sm:px-8 lg:px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-5 mb-4">
              <div className="h-px w-5 bg-[#E8690B]"></div>
              <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
                {g(S.landing.dualModeTag, lang)}
              </span>
              <div className="h-px w-5 bg-[#E8690B]"></div>
            </div>
            <h2 className="text-[30px] font-bold text-center" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {g(S.landing.dualModeHeading, lang)}
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              {g(S.landing.dualModeSub, lang)}
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10">
            {/* Simple Mode Card */}
            <div className="border-[1.5px] border-[#E7E0D8] rounded-[12px] overflow-hidden cursor-pointer hover:border-[#E8690B] hover:shadow-lg hover:-translate-y-[3px] transition-all bg-[#FAF7F2]">
              {/* Image Area */}
              <div className="h-[280px] relative overflow-hidden flex items-center justify-center">
                <Image src="/images/mode-simple.avif" alt="Simple Mode" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                <div className="absolute top-0 left-0 z-10 bg-black/35 text-white text-[9px] rounded-[4px] px-2 py-1 m-2.5">
                  {g(S.landing.simpleModeBadge, lang)}
                </div>
              </div>

              {/* Body */}
              <div className="bg-white p-5">
                <h3 className="text-[17px] font-bold text-[#1C1917] mb-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  {g(S.landing.simpleModeTitle, lang)}
                </h3>
                <p className="text-[12px] text-[#57534E] mb-4">
                  {g(S.landing.simpleModeDesc, lang)}
                </p>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {[
                    g(S.landing.simpleFeat1, lang),
                    g(S.landing.simpleFeat2, lang),
                    g(S.landing.simpleFeat3, lang),
                    g(S.landing.simpleFeat4, lang),
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-[#1A6B3C] flex-shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[#57534E]">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Button */}
                <Link href="/simple">
                  <button className="w-full bg-[#E8690B] text-white text-[13px] font-bold rounded-[7px] py-3 hover:bg-[#D05B09] transition-colors">
                    {g(S.landing.useSimpleMode, lang)}
                  </button>
                </Link>
              </div>
            </div>

            {/* Full Mode Card */}
            <div className="border-[1.5px] border-[#E7E0D8] rounded-[12px] overflow-hidden cursor-pointer hover:border-[#E8690B] hover:shadow-lg hover:-translate-y-[3px] transition-all bg-[#FAF7F2]">
              {/* Image Area */}
              <div className="h-[280px] relative overflow-hidden flex items-center justify-center">
                <Image src="/images/mode-full.jpg" alt="Full Mode" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                <div className="absolute top-0 left-0 z-10 bg-black/35 text-white text-[9px] rounded-[4px] px-2 py-1 m-2.5">
                  {g(S.landing.fullModeBadge, lang)}
                </div>
              </div>

              {/* Body */}
              <div className="bg-white p-5">
                <h3 className="text-[17px] font-bold text-[#1C1917] mb-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  {g(S.landing.fullModeTitle, lang)}
                </h3>
                <p className="text-[12px] text-[#57534E] mb-4">
                  {g(S.landing.fullModeDesc, lang)}
                </p>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {[
                    g(S.landing.fullFeat1, lang),
                    g(S.landing.fullFeat2, lang),
                    g(S.landing.fullFeat3, lang),
                    g(S.landing.fullFeat4, lang),
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-[#0D47A1] flex-shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[#57534E]">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Button */}
                <Link href="/full">
                  <button className="w-full bg-[#E8690B] text-white text-[13px] font-bold rounded-[7px] py-3 hover:bg-[#D05B09] transition-colors">
                    {g(S.landing.useFullMode, lang)}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: PROBLEM STATEMENT */}
      <section className="bg-[#FDF6EE] border-t-[3px] border-b-[3px] border-[#E8690B] px-5 sm:px-8 lg:px-12 py-16">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-11">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              {g(S.landing.problemTag, lang)}
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {g(S.landing.problemHeading, lang)}
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              {g(S.landing.problemSub, lang)}
            </p>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Left Column: Stats */}
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { number: '67%', label: g(S.landing.statAwareness, lang), badge: g(S.landing.badgeAwareness, lang), source: 'PMGSY Impact Assessment' },
                  { number: '23%', label: g(S.landing.statUsability, lang), badge: g(S.landing.badgeUsability, lang), source: 'IAMAI India Report 2024' },
                  { number: '57%', label: g(S.landing.statLanguage, lang), badge: g(S.landing.badgeLanguageGap, lang), source: 'KANTAR Report 2024' },
                  { number: '40%', label: g(S.landing.statGuidance, lang), badge: g(S.landing.badgeGuidance, lang), source: 'CSC Annual Report' },
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white border border-[#E7E0D8] rounded-[10px] p-5 border-t-[3px] border-t-[#E8690B]">
                    <div className="text-[36px] font-bold text-[#E8690B] mb-1" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                      {stat.number}
                    </div>
                    <div className="text-[11px] text-[#57534E] mb-2">{stat.label}</div>
                    <div className="inline-block bg-red-100 text-red-700 text-[9px] font-bold px-2 py-1 rounded mb-2">
                      {stat.badge}
                    </div>
                    <div className="text-[9px] italic text-[#A8A29E]">{stat.source}</div>
                  </div>
                ))}
              </div>

              {/* Barrier Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { number: '1 in 4', title: g(S.landing.barrier1Title, lang), desc: g(S.landing.barrier1Desc, lang) },
                  { number: '0', title: g(S.landing.barrier2Title, lang), desc: g(S.landing.barrier2Desc, lang) },
                  { number: '68%', title: g(S.landing.barrier3Title, lang), desc: g(S.landing.barrier3Desc, lang) },
                ].map((barrier, idx) => (
                  <div key={idx} className="bg-white border border-[#E7E0D8] rounded-lg p-3.5 text-center">
                    <div
                      className={`text-[26px] font-bold mb-1 ${idx === 1 ? 'text-[#57534E]' : 'text-[#E8690B]'}`}
                      style={{ fontFamily: 'var(--font-libre-baskerville)', color: idx === 2 ? '#1A6B3C' : undefined }}
                    >
                      {barrier.number}
                    </div>
                    <div className="text-[11px] font-bold text-[#1C1917] mb-1">{barrier.title}</div>
                    <div className="text-[10px] text-[#78716C]">{barrier.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Chart */}
            <div>
              {/* Chart Card */}
              <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-5 mb-4">
                <h3 className="text-[12px] font-bold text-[#1C1917] mb-1">{g(S.landing.chartTitle, lang)}</h3>
                <p className="text-[10px] text-[#A8A29E] mb-4">{g(S.landing.chartSub, lang)}</p>

                {/* Chart Bars */}
                <div className="space-y-3">
                  {[
                    { label: g(S.landing.barUrban, lang), percentage: 42, color: '#E8690B' },
                    { label: g(S.landing.barSemiUrban, lang), percentage: 22, color: '#E8690B' },
                    { label: g(S.landing.barRural, lang), percentage: 9, color: '#E8690B' },
                    { label: g(S.landing.barRuralVoice, lang), percentage: 68, color: '#1A6B3C' },
                    { label: g(S.landing.barVoiceSearch, lang), percentage: 140, label2: 'M', color: '#1A6B3C' },
                  ].map((bar, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="text-[10px] text-[#57534E] w-[150px] flex-shrink-0">{bar.label}</div>
                      <div className="flex-1 h-2 bg-[#F4F0EB] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(bar.percentage / 2, 100)}%`, backgroundColor: bar.color }}
                        ></div>
                      </div>
                      <div className="text-[11px] font-bold text-[#57534E] min-w-[50px] text-right">
                        {bar.percentage}
                        {bar.label2 ? bar.label2 : '%'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-[9px] italic text-[#A8A29E] mt-3">Source: IAMAI 2024 · Digital India Foundation · Bhashini Impact Study 2023</div>
              </div>

              {/* Callout Box */}
              <div className="bg-[#FFF8F1] border-[1.5px] border-[#FED7AA] rounded-[10px] p-4">
                <h4 className="text-[11px] font-bold text-[#C2570A] mb-2">{g(S.landing.calloutTitle, lang)}</h4>
                <p className="text-[13px] text-[#7C3009] leading-[1.65]">
                  <span className="font-bold">{g(S.landing.calloutBoldPart, lang)}</span>{g(S.landing.calloutRest, lang)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: HOW IT WORKS */}
      <section id="how-it-works" className="bg-white border-t border-[#E7E0D8] px-5 sm:px-8 lg:px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              {g(S.landing.howTag, lang)}
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {g(S.landing.howHeading, lang)}
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              {g(S.landing.howSub, lang)}
            </p>
          </div>

          {/* Step Cards */}
          <div>
            {/* Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative mb-4">
              {/* Connector line */}
              <div className="hidden sm:block absolute top-8 left-[16.66%] right-[16.66%] h-0.5 bg-[#E7E0D8] pointer-events-none"></div>

              {[
                { step: 1, title: g(S.landing.step1Title, lang) },
                { step: 2, title: g(S.landing.step2Title, lang), highlight: true },
                { step: 3, title: g(S.landing.step3Title, lang) },
              ].map((item) => (
                <div
                  key={item.step}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleStepClick(item.step)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStepClick(item.step); }}
                  className={`rounded-[10px] p-5 text-center relative z-10 transition-all cursor-pointer ${
                    item.highlight ? 'bg-white border-2 border-[#E8690B]' : 'bg-[#FAF7F2] border-[1.5px] border-[#E7E0D8] hover:border-[#E8690B] hover:-translate-y-[3px]'
                  }`}
                >
                  {/* Step Circle */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3.5 border-4 border-white text-white font-bold text-base ${
                      item.step <= 3 ? 'bg-[#E8690B]' : 'bg-[#1A6B3C]'
                    }`}
                    style={{
                      boxShadow: `0 0 0 3px ${item.step <= 3 ? '#E8690B' : '#1A6B3C'}`,
                      fontFamily: 'var(--font-libre-baskerville)',
                    }}
                  >
                    {item.step}
                  </div>

                  {/* Icon SVG */}
                  <div
                    className={`w-10 h-10 rounded-[10px] flex items-center justify-center mx-auto mb-3 ${
                      item.step <= 3 ? 'bg-[#FFF8F1]' : 'bg-[#F0FDF4]'
                    }`}
                  >
                    {item.step === 1 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8690B" strokeWidth="2">
                        <path d="M12 1c-6.338 0-12 4.226-12 10.007 0 2.05.738 4.063 2.047 5.625.055 3.215 1.817 4.614 4.942 5.368.527 1.564 2.789 3 5.011 3 6.338 0 12-4.226 12-10.007s-5.662-10.007-12-10.007z" />
                      </svg>
                    )}
                    {item.step === 2 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A6B3C" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                    )}
                    {item.step === 3 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8690B" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-[13px] font-bold text-[#1C1917] mb-1">{item.title}</h3>
                  <p className="text-[11px] text-[#57534E] leading-[1.55]">
                    {item.step === 1 && g(S.landing.step1Desc, lang)}
                    {item.step === 2 && g(S.landing.step2Desc, lang)}
                    {item.step === 3 && g(S.landing.step3Desc, lang)}
                  </p>
                </div>
              ))}
            </div>

            {/* Arrow Separator */}
            <div className="flex justify-center items-center gap-2 py-2">
              <div className="h-px w-20 bg-[#E7E0D8]"></div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7E0D8" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <div className="h-px w-20 bg-[#E7E0D8]"></div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative">
              {[
                { step: 4, title: g(S.landing.step4Title, lang) },
                { step: 5, title: g(S.landing.step5Title, lang) },
                { step: 6, title: g(S.landing.step6Title, lang) },
              ].map((item) => (
                <div
                  key={item.step}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleStepClick(item.step)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStepClick(item.step); }}
                  className="rounded-[10px] p-5 text-center relative z-10 bg-[#FAF7F2] border-[1.5px] border-[#E7E0D8] hover:border-[#E8690B] hover:-translate-y-[3px] transition-all cursor-pointer"
                >
                  {/* Step Circle */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3.5 border-4 border-white text-white font-bold text-base bg-[#1A6B3C]"
                    style={{
                      boxShadow: '0 0 0 3px #1A6B3C',
                      fontFamily: 'var(--font-libre-baskerville)',
                    }}
                  >
                    {item.step}
                  </div>

                  {/* Icon SVG */}
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mx-auto mb-3 bg-[#F0FDF4]">
                    {item.step === 4 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A6B3C" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                    {item.step === 5 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A6B3C" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                    )}
                    {item.step === 6 && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A6B3C" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-[13px] font-bold text-[#1C1917] mb-1">{item.title}</h3>
                  <p className="text-[11px] text-[#57534E] leading-[1.55]">
                    {item.step === 4 && g(S.landing.step4Desc, lang)}
                    {item.step === 5 && g(S.landing.step5Desc, lang)}
                    {item.step === 6 && g(S.landing.step6Desc, lang)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: AUDIENCE CATEGORY CARDS */}
      <section id="schemes" className="bg-[#FAF7F2] border-t border-[#E7E0D8] px-5 sm:px-8 lg:px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-9">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              {g(S.landing.audienceTag, lang)}
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {g(S.landing.audienceHeading, lang)}
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              {g(S.landing.audienceSub, lang)}
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[
              {
                key: 'farmers',
                title: g(S.landing.audFarmers, lang),
                image: '/images/aud-farmers.jpg',
                description: g(S.landing.audFarmersDesc, lang),
                overlay: '#1B5E20',
                link: '#1B5E20',
              },
              {
                key: 'women',
                title: g(S.landing.audWomen, lang),
                image: '/images/aud-women.jpg',
                description: g(S.landing.audWomenDesc, lang),
                overlay: '#880E4F',
                link: '#880E4F',
              },
              {
                key: 'seniors',
                title: g(S.landing.audSeniors, lang),
                image: '/images/aud-seniors.avif',
                description: g(S.landing.audSeniorsDesc, lang),
                overlay: '#0D47A1',
                link: '#0D47A1',
              },
              {
                key: 'students',
                title: g(S.landing.audStudents, lang),
                image: '/images/aud-students.jpg',
                description: g(S.landing.audStudentsDesc, lang),
                overlay: '#BF360C',
                link: '#BF360C',
              },
              {
                key: 'business',
                title: g(S.landing.audBusiness, lang),
                image: '/images/aud-business.jpg',
                description: g(S.landing.audBusinessDesc, lang),
                overlay: '#004D40',
                link: '#004D40',
              },
              {
                key: 'health',
                title: g(S.landing.audHealth, lang),
                image: '/images/aud-health.avif',
                description: g(S.landing.audHealthDesc, lang),
                overlay: '#B71C1C',
                link: '#B71C1C',
              },
            ].map((card) => {
              const countState = audienceCounts[card.key];
              const navigate = () => goToDiscovery(AUDIENCE_QUERIES[card.key]);
              return (
                <div
                  key={card.key}
                  role="button"
                  tabIndex={0}
                  onClick={navigate}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(); }}
                  className="border border-[#E7E0D8] rounded-[10px] overflow-hidden cursor-pointer hover:border-[#E8690B] hover:shadow-md hover:-translate-y-[3px] transition-all bg-white"
                >
                  {/* Image Area */}
                  <div className="h-[220px] relative overflow-hidden bg-gradient-to-br from-[#E7E0D8] to-[#D1C5BA] flex items-center justify-center">
                    {card.image && <Image src={card.image} alt={card.title} fill className="object-cover" />}
                    <div style={{ backgroundColor: `${card.overlay}26` }} className="absolute inset-0"></div>
                  </div>

                  {/* Body */}
                  <div className="p-3 pt-3.5">
                    <div className="text-[9px] uppercase text-[#A8A29E] font-semibold mb-1 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mukta)' }}>
                      {countState.status === 'loading' && <span>{g(S.landing.loadingSchemes, lang)}</span>}
                      {countState.status === 'ready' && <span>{gf(S.landing.schemesCount, lang, countState.count)}</span>}
                      {countState.status === 'error' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); loadAudienceCounts(); }}
                          className="text-[#DC2626] normal-case font-semibold underline decoration-dotted"
                        >
                          {g(S.landing.couldNotLoad, lang)} · {g(S.landing.retry, lang)}
                        </button>
                      )}
                    </div>
                    <h3 className="text-[14px] font-bold text-[#1C1917] mb-1" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-[#57534E] leading-[1.5] mb-2.5" style={{ fontFamily: 'var(--font-mukta)' }}>
                      {card.description}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(); }}
                      className="text-[11px] font-bold flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                      style={{ color: card.link }}
                    >
                      {g(S.landing.viewAll, lang)} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1C1917] px-5 sm:px-8 lg:px-12 py-7">
        <div className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-3">
          {/* Left: Logo */}
          <div className="flex items-center gap-2">
            <CitizenOrbitalLogoMark size={26} />
            <SuvidhaWordmark darkBackground titleSize={14} subtitleSize={7} tagline={g(S.landing.tagline, lang)} />
          </div>

          {/* Center: Info */}
          <div className="text-[11px] text-[rgba(255,255,255,0.3)] text-center">
            {g(S.landing.footerInfo, lang)}
          </div>

          {/* Right: Links */}
          <div className="flex gap-6 text-[11px] text-[rgba(255,255,255,0.3)]">
            {[g(S.landing.footerAbout, lang), g(S.landing.footerHelp, lang), g(S.landing.footerPrivacy, lang), g(S.landing.footerContact, lang)].map((link) => (
              <a key={link} href="#" className="hover:text-[#E8690B] transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* HELP MODAL */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-5"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="bg-white rounded-[14px] max-w-[480px] w-full p-6 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              aria-label={g(S.landing.helpModalClose, lang)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1C1917] text-xl leading-none bg-transparent border-none cursor-pointer"
            >
              ×
            </button>
            <h3 className="text-[19px] font-bold text-[#1C1917] mb-3" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              {g(S.landing.helpModalTitle, lang)}
            </h3>
            <p className="text-[13px] text-[#57534E] leading-[1.7] mb-5">
              {g(S.landing.helpModalBody, lang)}
            </p>
            <div className="border-t border-[#F0EBE4] pt-4 space-y-2">
              <div className="text-[13px] text-[#1C1917]">
                <span className="font-semibold">{g(S.landing.helpModalHelplineLabel, lang)}:</span> 155261
              </div>
              <div className="text-[13px] text-[#1C1917]">
                <span className="font-semibold">{g(S.landing.helpModalEmailLabel, lang)}:</span>{' '}
                <a href="mailto:suvidhaaiofficial@gmail.com" className="text-[#1A6B3C] hover:underline">
                  suvidhaaiofficial@gmail.com
                </a>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="bg-[#1A6B3C] text-white text-[12px] font-bold rounded-[6px] px-4 py-2 hover:bg-[#155032] transition-colors"
                >
                  {g(S.landing.helpModalClose, lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
