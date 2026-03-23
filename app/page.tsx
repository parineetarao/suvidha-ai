'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Mic, Search, CheckCircle2, AlertCircle, FileText, MessageSquare, ArrowRight } from 'lucide-react';
import { useState } from 'react';

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
}: {
  darkBackground: boolean;
  titleSize: number;
  subtitleSize: number;
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
        Government Scheme Finder
      </div>
    </div>
  );
}

export default function SuvidhaAILanding() {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [searchInput, setSearchInput] = useState('');

  const languages = ['English', 'हिंदी', 'मराठी', 'বাংলা', 'తెలుగు', 'தமிழ்', 'ગુજરાતી', 'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ', 'ଓଡ଼ିଆ', 'অসমীয়া'];

  return (
    <div className="w-full bg-white overflow-hidden">
      {/* SECTION 1: NAVIGATION BAR */}
      <nav className="sticky top-0 z-100 h-[62px] bg-white border-b-2 border-[#E8690B] flex items-center px-12 justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <CitizenOrbitalLogoMark size={34} />
          <SuvidhaWordmark darkBackground={false} titleSize={17} subtitleSize={9} />
        </div>

        {/* Center: Nav Links */}
        <div className="flex items-center gap-8">
          {['Schemes', 'How it Works', 'About', 'Help'].map((link) => (
            <a
              key={link}
              href="#"
              className="text-[12px] font-semibold text-[#57534E] hover:text-[#E8690B] hover:border-b-2 hover:border-[#E8690B] pb-1 transition-all"
            >
              {link}
            </a>
          ))}
        </div>

        {/* Right: Language & Login */}
        <div className="flex items-center gap-3">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[12px] text-[#57534E] cursor-pointer"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button className="bg-[#1A6B3C] text-white text-[12px] rounded-[5px] px-[18px] py-2 hover:bg-[#155032] transition-colors">
            Login
          </button>
        </div>
      </nav>

      {/* SECTION 2: HERO */}
      <section className="relative w-full bg-white min-h-[580px] px-12 py-14 overflow-hidden">
        {/* Decorative circle background */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-[#FFF3E8] opacity-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

        <div className="relative z-10 grid grid-cols-[1fr_460px] gap-12 items-center max-w-7xl mx-auto">
          {/* LEFT SIDE */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[5px] px-3.5 py-1.5 mb-6">
              <div className="w-[5px] h-[5px] rounded-full bg-[#1A6B3C]" style={{ animation: 'pulse-dot 2s infinite' }}></div>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">Accurate</span>
              <span className="text-[#A8D5B5] mx-2">·</span>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">Free</span>
              <span className="text-[#A8D5B5] mx-2">·</span>
              <span className="text-[10px] font-bold text-[#1A6B3C] uppercase tracking-wider">In your language</span>
            </div>

            {/* Headline */}
            <h1 className="max-w-[460px]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              <div className="text-[50px] font-bold italic text-[#E8690B] leading-tight">सुविधा सबके लिए।</div>
              <div className="text-[28px] text-[#57534E] mt-1">Welfare for all.</div>
            </h1>

            {/* Subline */}
            <p className="text-[14px] text-[#57534E] leading-[1.7] max-w-[400px] mb-6 mt-4">
              Tell us your situation in simple words — in any Indian language. We match you to every scheme you qualify for and show you exactly how to claim it.
            </p>

            {/* Search Box */}
            <div className="max-w-[500px] bg-[#FAF7F2] border-2 border-[#E7E0D8] rounded-[12px] p-4 mb-6 focus-within:border-[#E8690B] focus-within:bg-white transition-all">
              <div className="flex gap-2 items-stretch">
                <textarea
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
                  placeholder="मैं 45 साल का किसान हूं... / I am a 60-year-old widow..."
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
                  Find Schemes →
                </button>
              </div>
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap gap-2 max-w-[500px] mb-6">
              {['Farmer', 'Senior Citizen', 'Single Woman', 'Student', 'Daily Wage Worker', 'Need Housing'].map((chip) => (
                <button
                  key={chip}
                  className="text-[11px] font-semibold px-[13px] py-[5px] rounded border border-[#E7E0D8] bg-white text-[#57534E] hover:border-[#E8690B] hover:text-[#E8690B] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Mic Button */}
            <button className="bg-[#F0FDF4] border-[1.5px] border-[#BBF7D0] rounded-full px-[22px] py-[10px] flex items-center gap-2 hover:bg-[#E8F5E9] transition-colors mb-6">
              <Mic size={15} className="text-[#1A6B3C]" />
              <span className="text-[13px] font-semibold text-[#1A6B3C]">Speak in your language</span>
            </button>
            <span className="text-[11px] text-[#A8A29E] block mb-6">Hindi · English · Marathi + 9 more</span>

            {/* Trust Signals Row */}
            <div className="flex flex-wrap gap-5 pt-4 mt-5 border-t border-[#F0EBE4] max-w-[500px]">
              {[
                { text: '500+ schemes covered' },
                { text: 'Central and state governments' },
                { text: 'Updated from official sources' },
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
                The Citizen
              </div>
              <div className="text-[8px] text-[#A8A29E]" style={{ fontFamily: 'var(--font-mukta)' }}>
                You are at the center
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
      </section>

      {/* SECTION 3: TRICOLOUR STRIPE */}
      <div className="flex h-1">
        <div className="flex-1 bg-[#E8690B]"></div>
        <div className="flex-1 bg-white border-y border-[#E7E0D8]"></div>
        <div className="flex-1 bg-[#1A6B3C]"></div>
      </div>

      {/* SECTION 4: STATS STRIP */}
      <section className="bg-white border-b border-[#E7E0D8] px-12 py-3.5">
        <div className="max-w-7xl mx-auto flex justify-center items-center gap-9 flex-wrap">
          {[
            { number: '500+', label: 'Government schemes' },
            { number: '12', label: 'Indian languages' },
            { number: '3 min', label: 'Average search time' },
            { number: 'Free', label: 'For every citizen' },
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
      <section className="bg-white border-y border-[#E7E0D8] px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-5 mb-4">
              <div className="h-px w-5 bg-[#E8690B]"></div>
              <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
                Two ways to use SuvidhaAI
              </span>
              <div className="h-px w-5 bg-[#E8690B]"></div>
            </div>
            <h2 className="text-[30px] font-bold text-center" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              Choose how you want to search
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              One platform for every citizen — simple voice guidance for rural users, complete application tools for family helpers and CSC operators.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 gap-5 mt-10">
            {/* Simple Mode Card */}
            <div className="border-[1.5px] border-[#E7E0D8] rounded-[12px] overflow-hidden cursor-pointer hover:border-[#E8690B] hover:shadow-lg hover:-translate-y-[3px] transition-all bg-[#FAF7F2]">
              {/* Image Area */}
              <div className="h-[280px] relative overflow-hidden flex items-center justify-center">
                <Image src="/images/mode-simple.avif" alt="Simple Mode" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                <div className="absolute top-0 left-0 z-10 bg-black/35 text-white text-[9px] rounded-[4px] px-2 py-1 m-2.5">
                  Simple Mode · सरल मोड
                </div>
              </div>

              {/* Body */}
              <div className="bg-white p-5">
                <h3 className="text-[17px] font-bold text-[#1C1917] mb-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  Simple Mode — For Citizens Directly
                </h3>
                <p className="text-[12px] text-[#57534E] mb-4">
                  Voice-first, Hindi and Marathi, results spoken aloud. Designed for farmers, senior citizens, and rural users — minimal text, maximum clarity.
                </p>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {[
                    'Speak your situation — no typing needed',
                    'Results read aloud in Hindi or Marathi',
                    'One-tap WhatsApp share and helpline call',
                    'No login or registration needed',
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
                    Use Simple Mode — बोलकर खोजें
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
                  Full Mode · पूर्ण सुविधा
                </div>
              </div>

              {/* Body */}
              <div className="bg-white p-5">
                <h3 className="text-[17px] font-bold text-[#1C1917] mb-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  Full Mode — For Helpers & CSC Operators
                </h3>
                <p className="text-[12px] text-[#57534E] mb-4">
                  Complete eligibility analysis, rejection prevention, pre-filled application documents, and status tracking for educated family members and government operators.
                </p>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {[
                    'Detailed eligibility check per scheme',
                    'Rejection prevention warnings',
                    'Printable pre-filled application summary',
                    'Application status tracker in profile',
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
                    Use Full Mode — पूर्ण सुविधा
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: PROBLEM STATEMENT */}
      <section className="bg-[#FDF6EE] border-t-[3px] border-b-[3px] border-[#E8690B] px-12 py-16">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-11">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              The real problem
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              ₹12 lakh crore in welfare. Most of it unclaimed.
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              India allocates more per citizen than most developing nations. The problem is not the budget — it is the gap between schemes existing and citizens actually receiving them.
            </p>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-2 gap-12">
            {/* Left Column: Stats */}
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { number: '67%', label: 'Eligible citizens who never apply', badge: 'Awareness gap', source: 'PMGSY Impact Assessment' },
                  { number: '23%', label: 'Find government digital portals too difficult to use', badge: 'Usability gap', source: 'IAMAI India Report 2024' },
                  { number: '57%', label: 'Prefer Indic languages — most portals are English only', badge: 'Language gap', source: 'KANTAR Report 2024' },
                  { number: '40%', label: 'Applications rejected due to missing or incorrect documents', badge: 'Guidance gap', source: 'CSC Annual Report' },
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
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { number: '1 in 4', title: 'Cannot navigate English interfaces', desc: 'Most portals require English literacy to find basic schemes' },
                  { number: '0', title: 'Portals that speak results in Hindi', desc: '140M Indians use voice daily — no portal supports it' },
                  { number: '68%', title: 'Rural users prefer voice interfaces', desc: 'The solution exists — it just hasn\'t been applied to welfare' },
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
                <h3 className="text-[12px] font-bold text-[#1C1917] mb-1">Who do existing welfare portals actually reach?</h3>
                <p className="text-[10px] text-[#A8A29E] mb-4">Active monthly users as % of eligible population · India 2024</p>

                {/* Chart Bars */}
                <div className="space-y-3">
                  {[
                    { label: 'Urban educated users', percentage: 42, color: '#E8690B' },
                    { label: 'Semi-urban users', percentage: 22, color: '#E8690B' },
                    { label: 'Rural users — primary beneficiaries', percentage: 9, color: '#E8690B' },
                    { label: 'Rural users comfortable with voice', percentage: 68, color: '#1A6B3C' },
                    { label: 'Indians using voice search daily', percentage: 140, label2: 'M', color: '#1A6B3C' },
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
                <h4 className="text-[11px] font-bold text-[#C2570A] mb-2">The gap in plain terms</h4>
                <p className="text-[13px] text-[#7C3009] leading-[1.65]">
                  <span className="font-bold">Rural citizens are the primary intended beneficiaries of most welfare schemes</span> — yet existing digital portals reach only 9% of them. SuvidhaAI is built for the 91% that existing tools have not reached.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: HOW IT WORKS */}
      <section className="bg-white border-t border-[#E7E0D8] px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              Step by step
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              From confusion to clarity in under 3 minutes
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              SuvidhaAI guides you through every step — from not knowing what you qualify for, to walking into a CSC fully prepared.
            </p>
          </div>

          {/* Step Cards */}
          <div>
            {/* Row 1 */}
            <div className="grid grid-cols-3 gap-5 relative mb-4">
              {/* Connector line */}
              <div className="absolute top-8 left-[16.66%] right-[16.66%] h-0.5 bg-[#E7E0D8] pointer-events-none"></div>

              {[
                { step: 1, title: 'Speak or Type' },
                { step: 2, title: 'AI Scans 500+ Schemes', highlight: true },
                { step: 3, title: 'See What You Qualify For' },
              ].map((item) => (
                <div
                  key={item.step}
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
                    {item.step === 1 && 'Say who you are in Hindi, Marathi, or English. No dropdowns, no forms. Just speak naturally.'}
                    {item.step === 2 && 'We extract your profile automatically and match you against every central and state government scheme.'}
                    {item.step === 3 && 'Each result tells you clearly: Eligible, Maybe Eligible, or Not Eligible — with a plain-language explanation.'}
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
            <div className="grid grid-cols-3 gap-5 relative">
              {[
                { step: 4, title: 'Get Warned Before You Apply' },
                { step: 5, title: 'Get Your Preparation Document' },
                { step: 6, title: 'Share on WhatsApp' },
              ].map((item) => (
                <div
                  key={item.step}
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
                    {item.step === 4 && 'We show common rejection reasons so you fix them before applying — saving wasted trips.'}
                    {item.step === 5 && 'A printable summary with your details pre-filled, documents to carry, and where to go — in your language.'}
                    {item.step === 6 && 'One tap sends all your matched schemes to WhatsApp so your family or CSC operator can help you apply.'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: AUDIENCE CATEGORY CARDS */}
      <section className="bg-[#FAF7F2] border-t border-[#E7E0D8] px-12 py-[68px]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-9">
            <span className="text-[10px] uppercase font-bold text-[#E8690B] tracking-widest" style={{ fontFamily: 'var(--font-mukta)' }}>
              Find by who you are
            </span>
            <h2 className="text-[30px] font-bold mt-2" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
              Every citizen. Every scheme.
            </h2>
            <p className="text-[14px] text-[#57534E] max-w-[540px] mx-auto mt-3">
              Select your situation — we show every scheme you qualify for with full guidance to claim it.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-3 gap-3.5">
            {[
              {
                title: 'Farmers',
                image: '/images/aud-farmers.jpg',
                count: '6 SCHEMES',
                description: 'Crop insurance, income support, solar pumps, credit',
                overlay: '#1B5E20',
                link: '#1B5E20',
              },
              {
                title: 'Women',
                image: '/images/aud-women.jpg',
                count: '8 SCHEMES',
                description: 'Maternity, widow pension, LPG, entrepreneurship loans',
                overlay: '#880E4F',
                link: '#880E4F',
              },
              {
                title: 'Senior Citizens',
                image: '/images/aud-seniors.avif',
                count: '3 SCHEMES',
                description: 'Old age pension, Ayushman health cover, savings',
                overlay: '#0D47A1',
                link: '#0D47A1',
              },
              {
                title: 'Students & Youth',
                image: '/images/aud-students.jpg',
                count: '8 SCHEMES',
                description: 'Scholarships, skill training, internships, loans',
                overlay: '#BF360C',
                link: '#BF360C',
              },
              {
                title: 'Business & Self-Employed',
                image: '/images/aud-business.jpg',
                count: '6 SCHEMES',
                description: 'Mudra loans, vendor credit, PMEGP grants',
                overlay: '#004D40',
                link: '#004D40',
              },
              {
                title: 'Health & Housing',
                image: '/images/aud-health.avif',
                count: '5 SCHEMES',
                description: 'Ayushman health cover, PM Awas Yojana, sanitation',
                overlay: '#B71C1C',
                link: '#B71C1C',
              },
            ].map((card, idx) => (
              <div
                key={idx}
                className="border border-[#E7E0D8] rounded-[10px] overflow-hidden cursor-pointer hover:border-[#E8690B] hover:shadow-md hover:-translate-y-[3px] transition-all bg-white"
              >
                {/* Image Area */}
                <div className="h-[220px] relative overflow-hidden bg-gradient-to-br from-[#E7E0D8] to-[#D1C5BA] flex items-center justify-center">
                  {card.image && <Image src={card.image} alt={card.title} fill className="object-cover" />}
                  <div style={{ backgroundColor: `${card.overlay}26` }} className="absolute inset-0"></div>
                </div>

                {/* Body */}
                <div className="p-3 pt-3.5">
                  <div className="text-[9px] uppercase text-[#A8A29E] font-semibold mb-1" style={{ fontFamily: 'var(--font-mukta)' }}>
                    {card.count}
                  </div>
                  <h3 className="text-[14px] font-bold text-[#1C1917] mb-1" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-[#57534E] leading-[1.5] mb-2.5" style={{ fontFamily: 'var(--font-mukta)' }}>
                    {card.description}
                  </p>
                  <a href="#" className="text-[11px] font-bold flex items-center gap-1" style={{ color: card.link }}>
                    View all schemes <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1C1917] px-12 py-7">
        <div className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-3">
          {/* Left: Logo */}
          <div className="flex items-center gap-2">
            <CitizenOrbitalLogoMark size={26} />
            <SuvidhaWordmark darkBackground titleSize={14} subtitleSize={7} />
          </div>

          {/* Center: Info */}
          <div className="text-[11px] text-[rgba(255,255,255,0.3)] text-center">
            Data sourced from official Government of India portals · Free for every citizen
          </div>

          {/* Right: Links */}
          <div className="flex gap-6 text-[11px] text-[rgba(255,255,255,0.3)]">
            {['About', 'Help', 'Privacy', 'Contact'].map((link) => (
              <a key={link} href="#" className="hover:text-[#E8690B] transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
