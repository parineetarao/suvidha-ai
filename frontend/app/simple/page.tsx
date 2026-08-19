'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ScanLine } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DocumentReadinessResult, DocumentType, NameComparison } from '@/lib/document-readiness/types';
import { DR, drt } from '@/lib/document-readiness/translations';
import { compareNames } from '@/lib/document-readiness/name-matching';
import { DocumentReadinessCheck } from '@/components/document-readiness/DocumentReadinessCheck';
import { NameConsistencyCard } from '@/components/document-readiness/NameConsistencyCard';
import { ReadinessSummary } from '@/components/document-readiness/ReadinessSummary';
import type { ReadinessScoreOutput } from '@/lib/document-readiness/readiness-score';
import {
  searchSchemes as apiSearchSchemes,
  getScheme as apiGetScheme,
  ApiError,
  type ApiLanguage,
  type SchemeMatch as ApiSchemeMatch,
  type SchemeDetail as ApiSchemeDetail,
  type MatchReason as ApiMatchReason,
} from '@/lib/api';
import { S, g, gf, type Lang } from '@/lib/strings';

function mapSimpleDocIdToType(id: string): DocumentType {
  switch (id) {
    case 'aadhaar': return 'aadhaar';
    case 'passbook': return 'bank_passbook';
    case 'khasra': return 'land_record';
    case 'photo': return 'passport_photo';
    case 'ration': return 'ration_card';
    case 'income': return 'income_certificate';
    default: return 'other';
  }
}

type ConversationStage = 'greeting' | 'waiting' | 'processing' | 'results_shown';
type MessageType = 'bot' | 'user' | 'typing' | 'schemes' | 'prepPrompt' | 'docCheck';
type SchemeCategory = 'farmer' | 'women' | 'student' | 'housing' | 'senior' | 'business';
type DocCheckStatus = 'unchecked' | 'yes' | 'no';
type ScriptLang = 'hindi' | 'marathi' | 'english';

type Message = {
  id: number;
  type: MessageType;
  text?: string;
  isHindi?: boolean;
  showChips?: boolean;
  category?: SchemeCategory;
  schemes?: SchemeItem[];
  lang?: string;
  timestamp: string;
};

type SchemeItem = {
  id: number;
  schemeId: string;
  nameHindi: string;
  nameEnglish: string;
  nameMr: string;
  logo: string;
  headerColor: string;
  amount: string;
  unit: string;
  unitEnglish: string;
  unitMr: string;
  desc: string;
  descEnglish: string;
  descMr: string;
  eligible: boolean;
  matchTier: 'high' | 'medium';
  matchColor: string;
  warning: string | null;
  warningEnglish: string | null;
  warningMr: string | null;
  steps: string[];
  stepsEnglish: string[];
  stepsMr: string[];
  matchScore: number;
  reasons: ApiMatchReason[];
};

const UI_TO_API_LANGUAGE: Record<UiLang, ApiLanguage> = {
  'hi-IN': 'hi',
  'mr-IN': 'mr',
  'en-IN': 'en',
  'ta-IN': 'ta',
  'te-IN': 'te',
  'kn-IN': 'kn',
  'ml-IN': 'ml',
  'bn-IN': 'bn',
  'gu-IN': 'gu',
  'pa-IN': 'pa',
};

function toApiLanguage(uiLang: UiLang): ApiLanguage {
  return UI_TO_API_LANGUAGE[uiLang];
}

const SIMPLE_PALETTE = ['#1A6B3C', '#E8690B', '#1565C0', '#6A1B9A', '#880E4F', '#0F766E'];

/** Adapts a real POST /schemes/search hit into the chat card's display
 * shape. Search results don't carry ministry/steps/documents — those are
 * lazy-fetched via GET /schemes/{id} when the user taps "How to Get?"
 * (see schemeDetailsCache in SimpleModePage). */
function apiMatchToSimpleScheme(match: ApiSchemeMatch, index: number): SchemeItem {
  const name = match.name;
  const desc = match.reasons[0]?.matched ?? '';
  const warning = match.warnings[0] ?? null;
  const headerColor = SIMPLE_PALETTE[index % SIMPLE_PALETTE.length];
  return {
    id: index,
    schemeId: match.scheme_id,
    nameHindi: name, nameEnglish: name, nameMr: name,
    logo: '/images/scheme-jandhan.png',
    headerColor,
    amount: `${match.match_score}%`,
    unit: 'मिलान स्कोर', unitEnglish: 'match score', unitMr: 'जुळणी स्कोअर',
    desc, descEnglish: desc, descMr: desc,
    eligible: match.match_score >= 70,
    matchTier: match.match_score >= 70 ? 'high' : 'medium',
    matchColor: match.match_score >= 70 ? '#1A6B3C' : '#D97706',
    warning, warningEnglish: warning, warningMr: warning,
    steps: [], stepsEnglish: [], stepsMr: [],
    matchScore: match.match_score,
    reasons: match.reasons,
  };
}

function getSchemeName(scheme: SchemeItem, lang: UiLang): string {
  if (lang === 'en-IN') return scheme.nameEnglish;
  if (lang === 'mr-IN') return scheme.nameMr;
  return scheme.nameHindi;
}
function getSchemeUnit(scheme: SchemeItem, lang: UiLang): string {
  if (lang === 'en-IN') return scheme.unitEnglish;
  if (lang === 'mr-IN') return scheme.unitMr;
  return scheme.unit;
}
function getSchemeDesc(scheme: SchemeItem, lang: UiLang): string {
  if (lang === 'en-IN') return scheme.descEnglish;
  if (lang === 'mr-IN') return scheme.descMr;
  return scheme.desc;
}
function getSchemeWarning(scheme: SchemeItem, lang: UiLang): string | null {
  if (lang === 'en-IN') return scheme.warningEnglish;
  if (lang === 'mr-IN') return scheme.warningMr;
  return scheme.warning;
}
function getSchemeSteps(scheme: SchemeItem, lang: UiLang): string[] {
  if (lang === 'en-IN') return scheme.stepsEnglish;
  if (lang === 'mr-IN') return scheme.stepsMr;
  return scheme.steps;
}

const getTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function speak(text: string, lang = 'hi-IN') {
  if (typeof window === 'undefined') return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = lang === 'en-IN' ? 0.95 : 0.82;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

// All 10 backend-supported languages. Every chat string bundle below
// (uiStrings, botResponses, greetings, docLocationMap) is authored for
// all 10 — real scheme content also comes from the API in this exact
// language via toApiLanguage().
type UiLang = 'hi-IN' | 'mr-IN' | 'en-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'ml-IN' | 'bn-IN' | 'gu-IN' | 'pa-IN';

const uiStrings = {
  'hi-IN': {
    govSchemeHelper: 'सरकारी योजना सहायक',
    sarkariSahayak: 'सरकारी सहायक',
    activeConversation: 'ACTIVE CONVERSATION',
    farmerSearch: 'Farmer schemes search',
    farmerSearchSub: 'मैं महाराष्ट्र से एक किसान...',
    whatsapp: 'WhatsApp पर भेजें',
    helpline: 'Helpline · 155261',
    csc: 'नज़दीकी CSC खोजें',
    simpleMode: 'सरल मोड',
    detailedMode: 'विस्तृत',
    sarkaricSahayakSub: 'सरकारी सहायक · सरल मोड',
    typeHere: 'यहाँ लिखें या नीचे बोलें...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'Find Nearest CSC',
    today: 'आज · Today',
    docCheckTitle: 'दस्तावेज़ जाँच — Document Check',
    warningNote: 'ध्यान रखें: आधार में नाम, ज़मीन के कागज़ में नाम, और बैंक में नाम — तीनों बिल्कुल एक जैसे होने चाहिए। यही सबसे बड़ा rejection का कारण है।',
    required: 'ज़रूरी',
    hasIt: 'हाँ है',
    noIt: 'नहीं',
    readyStrip: '✓ तैयार है',
    notHave: '✗ नहीं है — कहाँ मिलेगा?',
    allReady: 'आप पूरी तरह तैयार हैं!',
    allReadySub: 'सभी ज़रूरी दस्तावेज़ आपके पास हैं — अभी CSC जाइए।',
    findCSCMaps: 'नज़दीकी CSC खोजें → Google Maps',
    notReady: 'अभी CSC मत जाइए',
    missingDocs: (n: number) => n + ' दस्तावेज़ बाकी हैं — पहले ये करें:',
    findOnMaps: 'इन जगहों को Maps पर ढूंढें',
    goAnyway: 'फिर भी CSC जाएं (Risk पर)',
    cscSays: 'CSC पर यह कहें:',
    sendWhatsApp: 'Script WhatsApp पर भेजें',
    newSearch: 'नई खोज शुरू करें ↺',
    prepYes: 'हाँ, ज़रूर',
    prepNo: 'बाद में',
    chipList: ['किसान कर्ज़', 'घर की मदद', 'पेंशन', 'दवाइयाँ', 'बच्चों की पढ़ाई'],
    recording: 'सुन रहा हूँ...',
    speakBtn: 'बोलकर खोजें',
    pincodeLabel: 'अपना Pin Code डालें:',
    goBtn: 'Go',
    voiceQuery: 'किसान कर्ज़ और खेती की योजना बताइए',
    progressLabel: (checked: number, total: number) => checked + ' में से ' + total + ' तैयार',
    eligibleBadge: '✓ पात्र',
    verifyBadge: '⚠ जाँच करें',
    howToGet: 'कैसे मिलेगा?',
    appStepsLabel: 'आवेदन के चरण:',
    documentsLabel: 'दस्तावेज़:',
    commonDocsList: 'आधार, बैंक पासबुक, पहचान पत्र',
    matchHigh: 'उच्च मिलान',
    matchMedium: 'मध्यम मिलान',
    matchStatusLabel: 'मिलान स्थिति:',
    whatsappHeader: 'SuvidhaAI योजनाएँ:',
    homeLabel: 'होम',
    comingSoon: 'Full Mode — जल्द आ रहा है',
  },
  'mr-IN': {
    govSchemeHelper: 'सरकारी योजना सहाय्यक',
    sarkariSahayak: 'सरकारी सहाय्यक',
    activeConversation: 'सक्रिय संभाषण',
    farmerSearch: 'शेतकरी योजना शोध',
    farmerSearchSub: 'मी महाराष्ट्रातून एक शेतकरी...',
    whatsapp: 'WhatsApp वर पाठवा',
    helpline: 'Helpline · 155261',
    csc: 'जवळचे CSC शोधा',
    simpleMode: 'सरल मोड',
    detailedMode: 'तपशील',
    sarkaricSahayakSub: 'सरकारी सहाय्यक · सोपी पद्धत',
    typeHere: 'येथे लिहा किंवा खाली बोला...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'जवळचे CSC शोधा',
    today: 'आज · Today',
    docCheckTitle: 'कागदपत्र तपासणी — Document Check',
    warningNote: 'लक्षात ठेवा: आधारमधील नाव, जमिनीच्या कागदपत्रातील नाव आणि बँकेतील नाव — तिन्ही अगदी सारखे असणे आवश्यक आहे।',
    required: 'आवश्यक',
    hasIt: 'हो आहे',
    noIt: 'नाही',
    readyStrip: '✓ तयार आहे',
    notHave: '✗ नाही — कुठे मिळेल?',
    allReady: 'तुम्ही पूर्णपणे तयार आहात!',
    allReadySub: 'सर्व आवश्यक कागदपत्रे तुमच्याकडे आहेत — आता CSC ला जा।',
    findCSCMaps: 'जवळचे CSC शोधा → Google Maps',
    notReady: 'आत्ता CSC ला जाऊ नका',
    missingDocs: (n: number) => n + ' कागदपत्रे बाकी आहेत — प्रथम हे करा:',
    findOnMaps: 'या ठिकाणांना Maps वर शोधा',
    goAnyway: 'तरीही CSC ला जा (Risk वर)',
    cscSays: 'CSC वर हे सांगा:',
    sendWhatsApp: 'Script WhatsApp वर पाठवा',
    newSearch: 'नवीन शोध सुरू करा ↺',
    prepYes: 'हो, नक्की',
    prepNo: 'नंतर',
    chipList: ['शेतकरी कर्ज', 'घरासाठी मदत', 'पेंशन', 'औषधे', 'मुलांचे शिक्षण'],
    recording: 'ऐकत आहे...',
    speakBtn: 'बोलून शोधा',
    pincodeLabel: 'आपला Pin Code टाका:',
    goBtn: 'Go',
    voiceQuery: 'शेतकरी कर्ज आणि शेतीच्या योजना सांगा',
    progressLabel: (checked: number, total: number) => total + ' पैकी ' + checked + ' तयार',
    eligibleBadge: '✓ पात्र',
    verifyBadge: '⚠ तपासा',
    howToGet: 'कसे मिळेल?',
    appStepsLabel: 'अर्जाचे टप्पे:',
    documentsLabel: 'कागदपत्रे:',
    commonDocsList: 'आधार, बँक पासबुक, ओळखपत्र',
    matchHigh: 'उच्च जुळणी',
    matchMedium: 'मध्यम जुळणी',
    matchStatusLabel: 'जुळणी स्थिती:',
    whatsappHeader: 'SuvidhaAI योजना:',
    homeLabel: 'मुख्यपृष्ठ',
    comingSoon: 'Full Mode — लवकरच येत आहे',
  },
  'en-IN': {
    govSchemeHelper: 'GOVERNMENT SCHEME HELPER',
    sarkariSahayak: 'Government Assistant',
    activeConversation: 'ACTIVE CONVERSATION',
    farmerSearch: 'Farmer schemes search',
    farmerSearchSub: 'I am a farmer from Maharashtra...',
    whatsapp: 'Share on WhatsApp',
    helpline: 'Helpline · 155261',
    csc: 'Find Nearest CSC',
    simpleMode: 'Simple',
    detailedMode: 'Detailed',
    sarkaricSahayakSub: 'Government Assistant · Simple Mode',
    typeHere: 'Type here or speak below...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'Find Nearest CSC',
    today: 'Today',
    docCheckTitle: 'Document Check',
    warningNote: 'Important: Your name in Aadhaar, land records, and bank account must match exactly. This is the most common reason for rejection.',
    required: 'Required',
    hasIt: 'Yes, I have it',
    noIt: 'No',
    readyStrip: '✓ Ready',
    notHave: '✗ Do not have — where to get?',
    allReady: 'You are fully prepared!',
    allReadySub: 'You have all required documents — go to the CSC now.',
    findCSCMaps: 'Find nearest CSC → Google Maps',
    notReady: 'Do not go to CSC yet',
    missingDocs: (n: number) => n + ' documents missing — do these first:',
    findOnMaps: 'Find these places on Maps',
    goAnyway: 'Go to CSC anyway (at your risk)',
    cscSays: 'Say this at CSC:',
    sendWhatsApp: 'Send Script on WhatsApp',
    newSearch: 'Start New Search ↺',
    prepYes: 'Yes, help me',
    prepNo: 'Later',
    chipList: ['Farmer loan', 'Housing help', 'Pension', 'Medicines', 'Child education'],
    recording: 'Listening...',
    speakBtn: 'Speak to Search',
    pincodeLabel: 'Enter your Pin Code:',
    goBtn: 'Go',
    voiceQuery: 'Tell me about farmer loans and agriculture schemes',
    progressLabel: (checked: number, total: number) => checked + ' of ' + total + ' ready',
    eligibleBadge: '✓ Eligible',
    verifyBadge: '⚠ Verify',
    howToGet: 'How to Get?',
    appStepsLabel: 'Application Steps:',
    documentsLabel: 'Documents:',
    commonDocsList: 'Aadhaar, Bank Passbook, ID Proof',
    matchHigh: 'High Match',
    matchMedium: 'Medium Match',
    matchStatusLabel: 'Match Status:',
    whatsappHeader: 'SuvidhaAI Schemes:',
    homeLabel: 'Home',
    comingSoon: 'Full Mode — Coming Soon',
  },
  'ta-IN': {
    govSchemeHelper: 'அரசு திட்ட உதவியாளர்',
    sarkariSahayak: 'அரசு உதவியாளர்',
    activeConversation: 'நடப்பு உரையாடல்',
    farmerSearch: 'விவசாயி திட்டங்கள் தேடல்',
    farmerSearchSub: 'நான் மகாராஷ்டிராவைச் சேர்ந்த ஒரு விவசாயி...',
    whatsapp: 'WhatsApp-இல் அனுப்பு',
    helpline: 'Helpline · 155261',
    csc: 'அருகிலுள்ள CSC தேடு',
    simpleMode: 'எளிய பயன்முறை',
    detailedMode: 'விரிவான',
    sarkaricSahayakSub: 'அரசு உதவியாளர் · எளிய பயன்முறை',
    typeHere: 'இங்கே தட்டச்சு செய்யவும் அல்லது கீழே பேசவும்...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'அருகிலுள்ள CSC தேடு',
    today: 'இன்று',
    docCheckTitle: 'ஆவண சரிபார்ப்பு — Document Check',
    warningNote: 'கவனிக்கவும்: ஆதார், நில ஆவணங்கள் மற்றும் வங்கி கணக்கில் உள்ள பெயர் — மூன்றும் சரியாக ஒரே மாதிரி இருக்க வேண்டும். இதுவே நிராகரிப்புக்கான முக்கிய காரணம்.',
    required: 'அவசியம்',
    hasIt: 'ஆம், உள்ளது',
    noIt: 'இல்லை',
    readyStrip: '✓ தயார்',
    notHave: '✗ இல்லை — எங்கே பெறுவது?',
    allReady: 'நீங்கள் முழுமையாகத் தயார்!',
    allReadySub: 'தேவையான அனைத்து ஆவணங்களும் உங்களிடம் உள்ளன — இப்போது CSC-க்குச் செல்லுங்கள்.',
    findCSCMaps: 'அருகிலுள்ள CSC தேடு → Google Maps',
    notReady: 'இப்போது CSC-க்குச் செல்ல வேண்டாம்',
    missingDocs: (n: number) => n + ' ஆவணங்கள் இல்லை — முதலில் இவற்றைச் செய்யவும்:',
    findOnMaps: 'இந்த இடங்களை Maps-இல் தேடவும்',
    goAnyway: 'இருந்தாலும் CSC-க்குச் செல்லவும் (Risk-இல்)',
    cscSays: 'CSC-இல் இதைச் சொல்லுங்கள்:',
    sendWhatsApp: 'Script-ஐ WhatsApp-இல் அனுப்பு',
    newSearch: 'புதிய தேடலைத் தொடங்கு ↺',
    prepYes: 'ஆம், நிச்சயமாக',
    prepNo: 'பின்னர்',
    chipList: ['விவசாயி கடன்', 'வீட்டு உதவி', 'ஓய்வூதியம்', 'மருந்துகள்', 'குழந்தைகள் கல்வி'],
    recording: 'கேட்கிறேன்...',
    speakBtn: 'பேசித் தேடு',
    pincodeLabel: 'உங்கள் Pin Code-ஐ உள்ளிடவும்:',
    goBtn: 'Go',
    voiceQuery: 'விவசாயி கடன் மற்றும் விவசாய திட்டங்களைச் சொல்லுங்கள்',
    progressLabel: (checked: number, total: number) => checked + ' இல் ' + total + ' தயார்',
    eligibleBadge: '✓ தகுதி',
    verifyBadge: '⚠ சரிபார்க்கவும்',
    howToGet: 'எப்படி பெறுவது?',
    appStepsLabel: 'விண்ணப்ப படிகள்:',
    documentsLabel: 'ஆவணங்கள்:',
    commonDocsList: 'ஆதார், வங்கி பாஸ்புக், அடையாள சான்று',
    matchHigh: 'அதிக பொருத்தம்',
    matchMedium: 'நடுத்தர பொருத்தம்',
    matchStatusLabel: 'பொருத்த நிலை:',
    whatsappHeader: 'SuvidhaAI திட்டங்கள்:',
    homeLabel: 'முகப்பு',
    comingSoon: 'Full Mode — விரைவில் வருகிறது',
  },
  'te-IN': {
    govSchemeHelper: 'ప్రభుత్వ పథక సహాయకుడు',
    sarkariSahayak: 'ప్రభుత్వ సహాయకుడు',
    activeConversation: 'ప్రస్తుత సంభాషణ',
    farmerSearch: 'రైతు పథకాల శోధన',
    farmerSearchSub: 'నేను మహారాష్ట్ర నుండి ఒక రైతుని...',
    whatsapp: 'WhatsApp‌లో పంపండి',
    helpline: 'Helpline · 155261',
    csc: 'సమీప CSC వెతకండి',
    simpleMode: 'సరళ మోడ్',
    detailedMode: 'వివరణాత్మక',
    sarkaricSahayakSub: 'ప్రభుత్వ సహాయకుడు · సరళ మోడ్',
    typeHere: 'ఇక్కడ టైప్ చేయండి లేదా క్రింద మాట్లాడండి...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'సమీప CSC వెతకండి',
    today: 'ఈరోజు',
    docCheckTitle: 'పత్రాల తనిఖీ — Document Check',
    warningNote: 'గమనించండి: ఆధార్, భూమి పత్రాలు మరియు బ్యాంకులో ఉన్న పేరు — మూడూ ఖచ్చితంగా ఒకేలా ఉండాలి. ఇదే తిరస్కరణకు అతిపెద్ద కారణం.',
    required: 'అవసరం',
    hasIt: 'అవును ఉంది',
    noIt: 'లేదు',
    readyStrip: '✓ సిద్ధంగా ఉంది',
    notHave: '✗ లేదు — ఎక్కడ పొందాలి?',
    allReady: 'మీరు పూర్తిగా సిద్ధంగా ఉన్నారు!',
    allReadySub: 'అవసరమైన అన్ని పత్రాలు మీ వద్ద ఉన్నాయి — ఇప్పుడు CSCకి వెళ్లండి.',
    findCSCMaps: 'సమీప CSC వెతకండి → Google Maps',
    notReady: 'ఇప్పుడు CSCకి వెళ్లవద్దు',
    missingDocs: (n: number) => n + ' పత్రాలు మిగిలి ఉన్నాయి — మొదట వీటిని చేయండి:',
    findOnMaps: 'ఈ ప్రదేశాలను Maps‌లో వెతకండి',
    goAnyway: 'అయినా CSCకి వెళ్లండి (Risk‌పై)',
    cscSays: 'CSC వద్ద ఇలా చెప్పండి:',
    sendWhatsApp: 'Script‌ను WhatsApp‌లో పంపండి',
    newSearch: 'కొత్త శోధన ప్రారంభించండి ↺',
    prepYes: 'అవును, ఖచ్చితంగా',
    prepNo: 'తర్వాత',
    chipList: ['రైతు రుణం', 'ఇంటి సహాయం', 'పింఛను', 'మందులు', 'పిల్లల చదువు'],
    recording: 'వింటున్నాను...',
    speakBtn: 'మాట్లాడి వెతకండి',
    pincodeLabel: 'మీ Pin Code నమోదు చేయండి:',
    goBtn: 'Go',
    voiceQuery: 'రైతు రుణాలు మరియు వ్యవసాయ పథకాల గురించి చెప్పండి',
    progressLabel: (checked: number, total: number) => checked + ' లో ' + total + ' సిద్ధం',
    eligibleBadge: '✓ అర్హత',
    verifyBadge: '⚠ తనిఖీ చేయండి',
    howToGet: 'ఎలా పొందాలి?',
    appStepsLabel: 'దరఖాస్తు దశలు:',
    documentsLabel: 'పత్రాలు:',
    commonDocsList: 'ఆధార్, బ్యాంక్ పాస్‌బుక్, గుర్తింపు రుజువు',
    matchHigh: 'అధిక సరిపోలిక',
    matchMedium: 'మధ్యస్థ సరిపోలిక',
    matchStatusLabel: 'సరిపోలిక స్థితి:',
    whatsappHeader: 'SuvidhaAI పథకాలు:',
    homeLabel: 'హోమ్',
    comingSoon: 'Full Mode — త్వరలో వస్తుంది',
  },
  'kn-IN': {
    govSchemeHelper: 'ಸರ್ಕಾರಿ ಯೋಜನೆ ಸಹಾಯಕ',
    sarkariSahayak: 'ಸರ್ಕಾರಿ ಸಹಾಯಕ',
    activeConversation: 'ಸಕ್ರಿಯ ಸಂಭಾಷಣೆ',
    farmerSearch: 'ರೈತ ಯೋಜನೆಗಳ ಹುಡುಕಾಟ',
    farmerSearchSub: 'ನಾನು ಮಹಾರಾಷ್ಟ್ರದ ಒಬ್ಬ ರೈತ...',
    whatsapp: 'WhatsApp‌ನಲ್ಲಿ ಕಳುಹಿಸಿ',
    helpline: 'Helpline · 155261',
    csc: 'ಹತ್ತಿರದ CSC ಹುಡುಕಿ',
    simpleMode: 'ಸರಳ ಮೋಡ್',
    detailedMode: 'ವಿವರವಾದ',
    sarkaricSahayakSub: 'ಸರ್ಕಾರಿ ಸಹಾಯಕ · ಸರಳ ಮೋಡ್',
    typeHere: 'ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಕೆಳಗೆ ಮಾತನಾಡಿ...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'ಹತ್ತಿರದ CSC ಹುಡುಕಿ',
    today: 'ಇಂದು',
    docCheckTitle: 'ದಾಖಲೆ ಪರಿಶೀಲನೆ — Document Check',
    warningNote: 'ಗಮನಿಸಿ: ಆಧಾರ್, ಭೂ ದಾಖಲೆಗಳು ಮತ್ತು ಬ್ಯಾಂಕ್‌ನಲ್ಲಿರುವ ಹೆಸರು — ಮೂರೂ ಸಂಪೂರ್ಣವಾಗಿ ಒಂದೇ ಆಗಿರಬೇಕು. ಇದೇ ತಿರಸ್ಕಾರಕ್ಕೆ ದೊಡ್ಡ ಕಾರಣ.',
    required: 'ಅಗತ್ಯ',
    hasIt: 'ಹೌದು ಇದೆ',
    noIt: 'ಇಲ್ಲ',
    readyStrip: '✓ ಸಿದ್ಧವಿದೆ',
    notHave: '✗ ಇಲ್ಲ — ಎಲ್ಲಿ ಸಿಗುತ್ತದೆ?',
    allReady: 'ನೀವು ಸಂಪೂರ್ಣವಾಗಿ ಸಿದ್ಧರಿದ್ದೀರಿ!',
    allReadySub: 'ಎಲ್ಲಾ ಅಗತ್ಯ ದಾಖಲೆಗಳು ನಿಮ್ಮ ಬಳಿ ಇವೆ — ಈಗ CSCಗೆ ಹೋಗಿ.',
    findCSCMaps: 'ಹತ್ತಿರದ CSC ಹುಡುಕಿ → Google Maps',
    notReady: 'ಈಗ CSCಗೆ ಹೋಗಬೇಡಿ',
    missingDocs: (n: number) => n + ' ದಾಖಲೆಗಳು ಬಾಕಿ ಇವೆ — ಮೊದಲು ಇವನ್ನು ಮಾಡಿ:',
    findOnMaps: 'ಈ ಸ್ಥಳಗಳನ್ನು Maps‌ನಲ್ಲಿ ಹುಡುಕಿ',
    goAnyway: 'ಆದರೂ CSCಗೆ ಹೋಗಿ (Risk‌ನಲ್ಲಿ)',
    cscSays: 'CSCನಲ್ಲಿ ಇದನ್ನು ಹೇಳಿ:',
    sendWhatsApp: 'Script ಅನ್ನು WhatsApp‌ನಲ್ಲಿ ಕಳುಹಿಸಿ',
    newSearch: 'ಹೊಸ ಹುಡುಕಾಟ ಪ್ರಾರಂಭಿಸಿ ↺',
    prepYes: 'ಹೌದು, ಖಂಡಿತ',
    prepNo: 'ನಂತರ',
    chipList: ['ರೈತ ಸಾಲ', 'ಮನೆ ಸಹಾಯ', 'ಪಿಂಚಣಿ', 'ಔಷಧಿಗಳು', 'ಮಕ್ಕಳ ಶಿಕ್ಷಣ'],
    recording: 'ಕೇಳುತ್ತಿದ್ದೇನೆ...',
    speakBtn: 'ಮಾತನಾಡಿ ಹುಡುಕಿ',
    pincodeLabel: 'ನಿಮ್ಮ Pin Code ನಮೂದಿಸಿ:',
    goBtn: 'Go',
    voiceQuery: 'ರೈತ ಸಾಲ ಮತ್ತು ಕೃಷಿ ಯೋಜನೆಗಳ ಬಗ್ಗೆ ಹೇಳಿ',
    progressLabel: (checked: number, total: number) => checked + ' ರಲ್ಲಿ ' + total + ' ಸಿದ್ಧ',
    eligibleBadge: '✓ ಅರ್ಹ',
    verifyBadge: '⚠ ಪರಿಶೀಲಿಸಿ',
    howToGet: 'ಹೇಗೆ ಪಡೆಯುವುದು?',
    appStepsLabel: 'ಅರ್ಜಿ ಹಂತಗಳು:',
    documentsLabel: 'ದಾಖಲೆಗಳು:',
    commonDocsList: 'ಆಧಾರ್, ಬ್ಯಾಂಕ್ ಪಾಸ್‌ಬುಕ್, ಗುರುತಿನ ಪುರಾವೆ',
    matchHigh: 'ಹೆಚ್ಚಿನ ಹೊಂದಾಣಿಕೆ',
    matchMedium: 'ಮಧ್ಯಮ ಹೊಂದಾಣಿಕೆ',
    matchStatusLabel: 'ಹೊಂದಾಣಿಕೆ ಸ್ಥಿತಿ:',
    whatsappHeader: 'SuvidhaAI ಯೋಜನೆಗಳು:',
    homeLabel: 'ಮುಖಪುಟ',
    comingSoon: 'Full Mode — ಶೀಘ್ರದಲ್ಲೇ ಬರುತ್ತಿದೆ',
  },
  'ml-IN': {
    govSchemeHelper: 'സർക്കാർ പദ്ധതി സഹായി',
    sarkariSahayak: 'സർക്കാർ സഹായി',
    activeConversation: 'നിലവിലെ സംഭാഷണം',
    farmerSearch: 'കർഷക പദ്ധതികളുടെ തിരയൽ',
    farmerSearchSub: 'ഞാൻ മഹാരാഷ്ട്രയിൽ നിന്നുള്ള ഒരു കർഷകനാണ്...',
    whatsapp: 'WhatsApp‌ൽ അയയ്ക്കുക',
    helpline: 'Helpline · 155261',
    csc: 'അടുത്തുള്ള CSC കണ്ടെത്തുക',
    simpleMode: 'ലളിത മോഡ്',
    detailedMode: 'വിശദമായ',
    sarkaricSahayakSub: 'സർക്കാർ സഹായി · ലളിത മോഡ്',
    typeHere: 'ഇവിടെ ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ താഴെ സംസാരിക്കുക...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'അടുത്തുള്ള CSC കണ്ടെത്തുക',
    today: 'ഇന്ന്',
    docCheckTitle: 'രേഖ പരിശോധന — Document Check',
    warningNote: 'ശ്രദ്ധിക്കുക: ആധാർ, ഭൂരേഖകൾ, ബാങ്കിലെ പേര് — മൂന്നും കൃത്യമായി ഒരുപോലെ ആയിരിക്കണം. ഇതാണ് നിരസിക്കലിന്റെ ഏറ്റവും വലിയ കാരണം.',
    required: 'ആവശ്യമാണ്',
    hasIt: 'ഉണ്ട്',
    noIt: 'ഇല്ല',
    readyStrip: '✓ തയ്യാറാണ്',
    notHave: '✗ ഇല്ല — എവിടെ കിട്ടും?',
    allReady: 'നിങ്ങൾ പൂർണ്ണമായി തയ്യാറാണ്!',
    allReadySub: 'ആവശ്യമായ എല്ലാ രേഖകളും നിങ്ങളുടെ പക്കലുണ്ട് — ഇപ്പോൾ CSC-യിലേക്ക് പോകൂ.',
    findCSCMaps: 'അടുത്തുള്ള CSC കണ്ടെത്തുക → Google Maps',
    notReady: 'ഇപ്പോൾ CSC-യിലേക്ക് പോകരുത്',
    missingDocs: (n: number) => n + ' രേഖകൾ ബാക്കിയുണ്ട് — ആദ്യം ഇവ ചെയ്യുക:',
    findOnMaps: 'ഈ സ്ഥലങ്ങൾ Maps-ൽ കണ്ടെത്തുക',
    goAnyway: 'എന്നാലും CSC-യിലേക്ക് പോകുക (Risk-ൽ)',
    cscSays: 'CSC-യിൽ ഇത് പറയുക:',
    sendWhatsApp: 'Script WhatsApp-ൽ അയയ്ക്കുക',
    newSearch: 'പുതിയ തിരയൽ ആരംഭിക്കുക ↺',
    prepYes: 'അതെ, തീർച്ചയായും',
    prepNo: 'പിന്നീട്',
    chipList: ['കർഷക വായ്പ', 'വീട് സഹായം', 'പെൻഷൻ', 'മരുന്നുകൾ', 'കുട്ടികളുടെ വിദ്യാഭ്യാസം'],
    recording: 'കേൾക്കുന്നു...',
    speakBtn: 'സംസാരിച്ച് തിരയുക',
    pincodeLabel: 'നിങ്ങളുടെ Pin Code നൽകുക:',
    goBtn: 'Go',
    voiceQuery: 'കർഷക വായ്പയും കാർഷിക പദ്ധതികളും പറയൂ',
    progressLabel: (checked: number, total: number) => checked + ' / ' + total + ' തയ്യാർ',
    eligibleBadge: '✓ യോഗ്യത',
    verifyBadge: '⚠ പരിശോധിക്കുക',
    howToGet: 'എങ്ങനെ ലഭിക്കും?',
    appStepsLabel: 'അപേക്ഷാ ഘട്ടങ്ങൾ:',
    documentsLabel: 'രേഖകൾ:',
    commonDocsList: 'ആധാർ, ബാങ്ക് പാസ്ബുക്ക്, തിരിച്ചറിയൽ രേഖ',
    matchHigh: 'ഉയർന്ന പൊരുത്തം',
    matchMedium: 'ഇടത്തരം പൊരുത്തം',
    matchStatusLabel: 'പൊരുത്ത നില:',
    whatsappHeader: 'SuvidhaAI പദ്ധതികൾ:',
    homeLabel: 'ഹോം',
    comingSoon: 'Full Mode — ഉടൻ വരുന്നു',
  },
  'bn-IN': {
    govSchemeHelper: 'সরকারি প্রকল্প সহায়ক',
    sarkariSahayak: 'সরকারি সহায়ক',
    activeConversation: 'চলমান কথোপকথন',
    farmerSearch: 'কৃষক প্রকল্প অনুসন্ধান',
    farmerSearchSub: 'আমি মহারাষ্ট্রের একজন কৃষক...',
    whatsapp: 'WhatsApp-এ পাঠান',
    helpline: 'Helpline · 155261',
    csc: 'নিকটবর্তী CSC খুঁজুন',
    simpleMode: 'সহজ মোড',
    detailedMode: 'বিস্তারিত',
    sarkaricSahayakSub: 'সরকারি সহায়ক · সহজ মোড',
    typeHere: 'এখানে লিখুন বা নিচে বলুন...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'নিকটবর্তী CSC খুঁজুন',
    today: 'আজ',
    docCheckTitle: 'নথি যাচাই — Document Check',
    warningNote: 'মনে রাখবেন: আধার, জমির কাগজপত্র এবং ব্যাংকে থাকা নাম — তিনটিই হুবহু একই হতে হবে। এটিই প্রত্যাখ্যানের সবচেয়ে বড় কারণ।',
    required: 'আবশ্যক',
    hasIt: 'হ্যাঁ আছে',
    noIt: 'না',
    readyStrip: '✓ প্রস্তুত',
    notHave: '✗ নেই — কোথায় পাবেন?',
    allReady: 'আপনি সম্পূর্ণ প্রস্তুত!',
    allReadySub: 'সমস্ত প্রয়োজনীয় নথি আপনার কাছে আছে — এখনই CSC-তে যান।',
    findCSCMaps: 'নিকটবর্তী CSC খুঁজুন → Google Maps',
    notReady: 'এখনই CSC-তে যাবেন না',
    missingDocs: (n: number) => n + ' নথি বাকি আছে — প্রথমে এগুলো করুন:',
    findOnMaps: 'এই জায়গাগুলো Maps-এ খুঁজুন',
    goAnyway: 'তবুও CSC-তে যান (Risk নিয়ে)',
    cscSays: 'CSC-তে এটি বলুন:',
    sendWhatsApp: 'Script WhatsApp-এ পাঠান',
    newSearch: 'নতুন অনুসন্ধান শুরু করুন ↺',
    prepYes: 'হ্যাঁ, অবশ্যই',
    prepNo: 'পরে',
    chipList: ['কৃষক ঋণ', 'বাড়ির সাহায্য', 'পেনশন', 'ওষুধ', 'সন্তানের শিক্ষা'],
    recording: 'শুনছি...',
    speakBtn: 'বলে খুঁজুন',
    pincodeLabel: 'আপনার Pin Code লিখুন:',
    goBtn: 'Go',
    voiceQuery: 'কৃষক ঋণ এবং কৃষি প্রকল্প সম্পর্কে বলুন',
    progressLabel: (checked: number, total: number) => checked + ' এর মধ্যে ' + total + ' প্রস্তুত',
    eligibleBadge: '✓ যোগ্য',
    verifyBadge: '⚠ যাচাই করুন',
    howToGet: 'কীভাবে পাবেন?',
    appStepsLabel: 'আবেদনের ধাপ:',
    documentsLabel: 'নথি:',
    commonDocsList: 'আধার, ব্যাংক পাসবই, পরিচয়পত্র',
    matchHigh: 'উচ্চ মিল',
    matchMedium: 'মাঝারি মিল',
    matchStatusLabel: 'মিলের অবস্থা:',
    whatsappHeader: 'SuvidhaAI প্রকল্প:',
    homeLabel: 'হোম',
    comingSoon: 'Full Mode — শীঘ্রই আসছে',
  },
  'gu-IN': {
    govSchemeHelper: 'સરકારી યોજના સહાયક',
    sarkariSahayak: 'સરકારી સહાયક',
    activeConversation: 'ચાલુ વાતચીત',
    farmerSearch: 'ખેડૂત યોજના શોધ',
    farmerSearchSub: 'હું મહારાષ્ટ્રનો એક ખેડૂત છું...',
    whatsapp: 'WhatsApp પર મોકલો',
    helpline: 'Helpline · 155261',
    csc: 'નજીકનું CSC શોધો',
    simpleMode: 'સરળ મોડ',
    detailedMode: 'વિગતવાર',
    sarkaricSahayakSub: 'સરકારી સહાયક · સરળ મોડ',
    typeHere: 'અહીં લખો અથવા નીચે બોલો...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'નજીકનું CSC શોધો',
    today: 'આજે',
    docCheckTitle: 'દસ્તાવેજ ચકાસણી — Document Check',
    warningNote: 'ધ્યાન રાખો: આધાર, જમીનના કાગળો અને બેંકમાં રહેલું નામ — ત્રણેય બરાબર એકસરખું હોવું જોઈએ. આ જ નકારવાનું સૌથી મોટું કારણ છે.',
    required: 'જરૂરી',
    hasIt: 'હા છે',
    noIt: 'ના',
    readyStrip: '✓ તૈયાર છે',
    notHave: '✗ નથી — ક્યાંથી મળશે?',
    allReady: 'તમે સંપૂર્ણ રીતે તૈયાર છો!',
    allReadySub: 'બધા જરૂરી દસ્તાવેજો તમારી પાસે છે — હવે CSC પર જાઓ.',
    findCSCMaps: 'નજીકનું CSC શોધો → Google Maps',
    notReady: 'અત્યારે CSC પર ન જાઓ',
    missingDocs: (n: number) => n + ' દસ્તાવેજ બાકી છે — પહેલા આ કરો:',
    findOnMaps: 'આ સ્થળો Maps પર શોધો',
    goAnyway: 'તો પણ CSC પર જાઓ (Risk પર)',
    cscSays: 'CSC પર આ કહો:',
    sendWhatsApp: 'Script WhatsApp પર મોકલો',
    newSearch: 'નવી શોધ શરૂ કરો ↺',
    prepYes: 'હા, ચોક્કસ',
    prepNo: 'પછી',
    chipList: ['ખેડૂત લોન', 'ઘર માટે મદદ', 'પેન્શન', 'દવાઓ', 'બાળકોનું શિક્ષણ'],
    recording: 'સાંભળી રહ્યો છું...',
    speakBtn: 'બોલીને શોધો',
    pincodeLabel: 'તમારો Pin Code દાખલ કરો:',
    goBtn: 'Go',
    voiceQuery: 'ખેડૂત લોન અને ખેતીની યોજનાઓ વિશે જણાવો',
    progressLabel: (checked: number, total: number) => checked + ' માંથી ' + total + ' તૈયાર',
    eligibleBadge: '✓ પાત્ર',
    verifyBadge: '⚠ ચકાસો',
    howToGet: 'કેવી રીતે મળશે?',
    appStepsLabel: 'અરજીના પગલાં:',
    documentsLabel: 'દસ્તાવેજો:',
    commonDocsList: 'આધાર, બેંક પાસબુક, ઓળખપત્ર',
    matchHigh: 'ઉચ્ચ મેળ',
    matchMedium: 'મધ્યમ મેળ',
    matchStatusLabel: 'મેળ સ્થિતિ:',
    whatsappHeader: 'SuvidhaAI યોજનાઓ:',
    homeLabel: 'હોમ',
    comingSoon: 'Full Mode — ટૂંક સમયમાં આવે છે',
  },
  'pa-IN': {
    govSchemeHelper: 'ਸਰਕਾਰੀ ਯੋਜਨਾ ਸਹਾਇਕ',
    sarkariSahayak: 'ਸਰਕਾਰੀ ਸਹਾਇਕ',
    activeConversation: 'ਚੱਲ ਰਹੀ ਗੱਲਬਾਤ',
    farmerSearch: 'ਕਿਸਾਨ ਯੋਜਨਾਵਾਂ ਦੀ ਖੋਜ',
    farmerSearchSub: "ਮੈਂ ਮਹਾਰਾਸ਼ਟਰ ਤੋਂ ਇੱਕ ਕਿਸਾਨ ਹਾਂ...",
    whatsapp: "WhatsApp 'ਤੇ ਭੇਜੋ",
    helpline: 'Helpline · 155261',
    csc: 'ਨਜ਼ਦੀਕੀ CSC ਲੱਭੋ',
    simpleMode: 'ਸਧਾਰਨ ਮੋਡ',
    detailedMode: 'ਵਿਸਤ੍ਰਿਤ',
    sarkaricSahayakSub: 'ਸਰਕਾਰੀ ਸਹਾਇਕ · ਸਧਾਰਨ ਮੋਡ',
    typeHere: 'ਇੱਥੇ ਲਿਖੋ ਜਾਂ ਹੇਠਾਂ ਬੋਲੋ...',
    shareBtn: 'Share',
    helplineBtn: 'Helpline 155261',
    findCSC: 'ਨਜ਼ਦੀਕੀ CSC ਲੱਭੋ',
    today: 'ਅੱਜ',
    docCheckTitle: 'ਦਸਤਾਵੇਜ਼ ਜਾਂਚ — Document Check',
    warningNote: 'ਧਿਆਨ ਰੱਖੋ: ਆਧਾਰ, ਜ਼ਮੀਨ ਦੇ ਕਾਗਜ਼ਾਂ ਅਤੇ ਬੈਂਕ ਵਿੱਚ ਨਾਮ — ਤਿੰਨੋਂ ਬਿਲਕੁਲ ਇੱਕੋ ਜਿਹੇ ਹੋਣੇ ਚਾਹੀਦੇ ਹਨ। ਇਹੀ ਰੱਦ ਹੋਣ ਦਾ ਸਭ ਤੋਂ ਵੱਡਾ ਕਾਰਨ ਹੈ।',
    required: 'ਜ਼ਰੂਰੀ',
    hasIt: 'ਹਾਂ ਹੈ',
    noIt: 'ਨਹੀਂ',
    readyStrip: '✓ ਤਿਆਰ ਹੈ',
    notHave: '✗ ਨਹੀਂ ਹੈ — ਕਿੱਥੋਂ ਮਿਲੇਗਾ?',
    allReady: 'ਤੁਸੀਂ ਪੂਰੀ ਤਰ੍ਹਾਂ ਤਿਆਰ ਹੋ!',
    allReadySub: 'ਸਾਰੇ ਜ਼ਰੂਰੀ ਦਸਤਾਵੇਜ਼ ਤੁਹਾਡੇ ਕੋਲ ਹਨ — ਹੁਣੇ CSC ਜਾਓ।',
    findCSCMaps: 'ਨਜ਼ਦੀਕੀ CSC ਲੱਭੋ → Google Maps',
    notReady: 'ਹੁਣੇ CSC ਨਾ ਜਾਓ',
    missingDocs: (n: number) => n + ' ਦਸਤਾਵੇਜ਼ ਬਾਕੀ ਹਨ — ਪਹਿਲਾਂ ਇਹ ਕਰੋ:',
    findOnMaps: "ਇਹਨਾਂ ਥਾਵਾਂ ਨੂੰ Maps 'ਤੇ ਲੱਭੋ",
    goAnyway: "ਫਿਰ ਵੀ CSC ਜਾਓ (Risk 'ਤੇ)",
    cscSays: "CSC 'ਤੇ ਇਹ ਕਹੋ:",
    sendWhatsApp: "Script WhatsApp 'ਤੇ ਭੇਜੋ",
    newSearch: 'ਨਵੀਂ ਖੋਜ ਸ਼ੁਰੂ ਕਰੋ ↺',
    prepYes: 'ਹਾਂ, ਜ਼ਰੂਰ',
    prepNo: 'ਬਾਅਦ ਵਿੱਚ',
    chipList: ['ਕਿਸਾਨ ਕਰਜ਼ਾ', 'ਘਰ ਦੀ ਮਦਦ', 'ਪੈਨਸ਼ਨ', 'ਦਵਾਈਆਂ', 'ਬੱਚਿਆਂ ਦੀ ਪੜ੍ਹਾਈ'],
    recording: 'ਸੁਣ ਰਿਹਾ ਹਾਂ...',
    speakBtn: 'ਬੋਲ ਕੇ ਖੋਜੋ',
    pincodeLabel: 'ਆਪਣਾ Pin Code ਪਾਓ:',
    goBtn: 'Go',
    voiceQuery: 'ਕਿਸਾਨ ਕਰਜ਼ਾ ਅਤੇ ਖੇਤੀ ਯੋਜਨਾਵਾਂ ਬਾਰੇ ਦੱਸੋ',
    progressLabel: (checked: number, total: number) => checked + " ਵਿੱਚੋਂ " + total + ' ਤਿਆਰ',
    eligibleBadge: '✓ ਯੋਗ',
    verifyBadge: '⚠ ਜਾਂਚ ਕਰੋ',
    howToGet: 'ਕਿਵੇਂ ਮਿਲੇਗਾ?',
    appStepsLabel: 'ਅਰਜ਼ੀ ਦੇ ਕਦਮ:',
    documentsLabel: 'ਦਸਤਾਵੇਜ਼:',
    commonDocsList: 'ਆਧਾਰ, ਬੈਂਕ ਪਾਸਬੁੱਕ, ਪਛਾਣ ਪੱਤਰ',
    matchHigh: 'ਉੱਚ ਮੇਲ',
    matchMedium: 'ਦਰਮਿਆਨਾ ਮੇਲ',
    matchStatusLabel: 'ਮੇਲ ਸਥਿਤੀ:',
    whatsappHeader: 'SuvidhaAI ਯੋਜਨਾਵਾਂ:',
    homeLabel: 'ਹੋਮ',
    comingSoon: 'Full Mode — ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ',
  },
}

type UiStringsBundle = (typeof uiStrings)[UiLang];

const greetings: Record<UiLang, { msg1: string; msg2: string }> = {
  'hi-IN': {
    msg1: 'नमस्ते! मैं सुविधा सहायक हूँ।',
    msg2: 'आप किस सरकारी योजना के बारे में जानकारी चाहते हैं? बताइए — हिंदी में, मराठी में, या किसी भी भाषा में।',
  },
  'mr-IN': {
    msg1: 'नमस्कार! मी सुविधा सहायक आहे।',
    msg2: 'तुम्हाला कोणत्या सरकारी योजनेबद्दल माहिती हवी आहे? सांगा — मराठीत, हिंदीत, किंवा कोणत्याही भाषेत।',
  },
  'en-IN': {
    msg1: 'Hello! I am Suvidha Assistant.',
    msg2: 'Which government scheme would you like to know about? Tell me in Hindi, Marathi, or English.',
  },
  'ta-IN': {
    msg1: 'வணக்கம்! நான் சுவிதா உதவியாளர்.',
    msg2: 'நீங்கள் எந்த அரசு திட்டத்தைப் பற்றி அறிய விரும்புகிறீர்கள்? தமிழில், இந்தியில், மராத்தியில் அல்லது எந்த மொழியிலும் சொல்லுங்கள்.',
  },
  'te-IN': {
    msg1: 'నమస్కారం! నేను సువిధా సహాయకుడిని.',
    msg2: 'మీరు ఏ ప్రభుత్వ పథకం గురించి తెలుసుకోవాలనుకుంటున్నారు? తెలుగులో, హిందీలో, మరాఠీలో లేదా ఏ భాషలోనైనా చెప్పండి.',
  },
  'kn-IN': {
    msg1: 'ನಮಸ್ಕಾರ! ನಾನು ಸುವಿಧಾ ಸಹಾಯಕ.',
    msg2: 'ನೀವು ಯಾವ ಸರ್ಕಾರಿ ಯೋಜನೆಯ ಬಗ್ಗೆ ತಿಳಿದುಕೊಳ್ಳಲು ಬಯಸುತ್ತೀರಿ? ಕನ್ನಡದಲ್ಲಿ, ಹಿಂದಿಯಲ್ಲಿ, ಮರಾಠಿಯಲ್ಲಿ ಅಥವಾ ಯಾವುದೇ ಭಾಷೆಯಲ್ಲಿ ಹೇಳಿ.',
  },
  'ml-IN': {
    msg1: 'നമസ്കാരം! ഞാൻ സുവിധ അസിസ്റ്റന്റ് ആണ്.',
    msg2: 'നിങ്ങൾക്ക് ഏത് സർക്കാർ പദ്ധതിയെക്കുറിച്ചാണ് അറിയേണ്ടത്? മലയാളത്തിൽ, ഹിന്ദിയിൽ, മറാഠിയിൽ അല്ലെങ്കിൽ ഏത് ഭാഷയിലും പറയൂ.',
  },
  'bn-IN': {
    msg1: 'নমস্কার! আমি সুবিধা সহায়ক।',
    msg2: 'আপনি কোন সরকারি প্রকল্প সম্পর্কে জানতে চান? বাংলায়, হিন্দিতে, মারাঠিতে বা যেকোনো ভাষায় বলুন।',
  },
  'gu-IN': {
    msg1: 'નમસ્તે! હું સુવિધા સહાયક છું.',
    msg2: 'તમે કઈ સરકારી યોજના વિશે જાણવા માંગો છો? ગુજરાતીમાં, હિન્દીમાં, મરાઠીમાં અથવા કોઈપણ ભાષામાં કહો.',
  },
  'pa-IN': {
    msg1: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਸੁਵਿਧਾ ਸਹਾਇਕ ਹਾਂ।',
    msg2: 'ਤੁਸੀਂ ਕਿਹੜੀ ਸਰਕਾਰੀ ਯੋਜਨਾ ਬਾਰੇ ਜਾਣਨਾ ਚਾਹੁੰਦੇ ਹੋ? ਪੰਜਾਬੀ ਵਿੱਚ, ਹਿੰਦੀ ਵਿੱਚ, ਮਰਾਠੀ ਵਿੱਚ ਜਾਂ ਕਿਸੇ ਵੀ ਭਾਸ਼ਾ ਵਿੱਚ ਦੱਸੋ।',
  },
};

const botResponses = {
  'hi-IN': {
    processing: 'ठीक है, आपकी जानकारी के आधार पर, यहाँ कुछ योजनाएँ हैं:',
    recommendation: (name: string) => 'सबसे पहले ' + name + ' करें — सबसे आसान और सबसे ज़्यादा फायदा।',
    prepPromptText: 'CSC जाने से पहले क्या मैं आपको दस्तावेज़ जाँच में मदद करूं?',
    prepDecline: 'ठीक है। जब तैयार हों तब नीचे CSC खोजें दबाएं।',
    cscOpened: 'Google Maps खुल गया — नज़दीकी CSC केंद्र दिखाए गए हैं।',
    locationDenied: 'Location नहीं मिली। अपना Pin Code बताइए।',
    pincodeResult: (pin: string) => 'Google Maps खुल गया — ' + pin + ' के नज़दीकी CSC केंद्र दिखाए गए हैं।',
    docWhere: (location: string) => 'यह यहाँ मिलेगा: ' + location,
  },
  'mr-IN': {
    processing: 'ठीक आहे, तुमच्या माहितीच्या आधारावर, येथे काही योजना आहेत:',
    recommendation: (name: string) => 'प्रथम ' + name + ' करा — सर्वात सोपे आणि सर्वाधिक फायदा।',
    prepPromptText: 'CSC ला जाण्यापूर्वी मी तुम्हाला कागदपत्र तपासणीत मदत करू का?',
    prepDecline: 'ठीक आहे। तयार असाल तेव्हा खाली CSC शोधा दाबा।',
    cscOpened: 'Google Maps उघडले — जवळचे CSC केंद्र दाखवले आहेत।',
    locationDenied: 'Location मिळाले नाही। तुमचा Pin Code सांगा।',
    pincodeResult: (pin: string) => 'Google Maps उघडले — ' + pin + ' जवळचे CSC केंद्र दाखवले आहेत।',
    docWhere: (location: string) => 'हे येथे मिळेल: ' + location,
  },
  'en-IN': {
    processing: 'Based on your information, here are some schemes for you:',
    recommendation: (name: string) => 'Start with ' + name + ' first — it is the easiest and most beneficial.',
    prepPromptText: 'Before going to the CSC, shall I help you with a document check?',
    prepDecline: 'Okay. When you are ready, tap Find Nearest CSC below.',
    cscOpened: 'Google Maps opened — nearby CSC centres are shown.',
    locationDenied: 'Could not get your location. Please enter your Pin Code.',
    pincodeResult: (pin: string) => 'Google Maps opened — CSC centres near ' + pin + ' are shown.',
    docWhere: (location: string) => 'You can get this at: ' + location,
  },
  'ta-IN': {
    processing: 'சரி, உங்கள் தகவலின் அடிப்படையில், சில திட்டங்கள் இதோ:',
    recommendation: (name: string) => 'முதலில் ' + name + ' செய்யுங்கள் — எளிமையானது மற்றும் அதிக பயனுள்ளது.',
    prepPromptText: 'CSC-க்குச் செல்வதற்கு முன், நான் உங்களுக்கு ஆவண சரிபார்ப்பில் உதவலாமா?',
    prepDecline: 'சரி. தயாராக இருக்கும்போது கீழே CSC தேடு பொத்தானை அழுத்தவும்.',
    cscOpened: 'Google Maps திறக்கப்பட்டது — அருகிலுள்ள CSC மையங்கள் காட்டப்பட்டுள்ளன.',
    locationDenied: 'இருப்பிடம் கிடைக்கவில்லை. உங்கள் Pin Code-ஐ சொல்லுங்கள்.',
    pincodeResult: (pin: string) => 'Google Maps திறக்கப்பட்டது — ' + pin + ' அருகிலுள்ள CSC மையங்கள் காட்டப்பட்டுள்ளன.',
    docWhere: (location: string) => 'இது இங்கே கிடைக்கும்: ' + location,
  },
  'te-IN': {
    processing: 'సరే, మీ సమాచారం ఆధారంగా, ఇక్కడ కొన్ని పథకాలు ఉన్నాయి:',
    recommendation: (name: string) => 'ముందుగా ' + name + ' చేయండి — సులభమైనది మరియు అత్యంత ప్రయోజనకరమైనది.',
    prepPromptText: 'CSCకి వెళ్లే ముందు, నేను మీకు పత్రాల తనిఖీలో సహాయం చేయనా?',
    prepDecline: 'సరే. మీరు సిద్ధంగా ఉన్నప్పుడు క్రింద CSC వెతకండి నొక్కండి.',
    cscOpened: 'Google Maps తెరవబడింది — సమీప CSC కేంద్రాలు చూపబడ్డాయి.',
    locationDenied: 'లొకేషన్ దొరకలేదు. మీ Pin Code చెప్పండి.',
    pincodeResult: (pin: string) => 'Google Maps తెరవబడింది — ' + pin + ' సమీప CSC కేంద్రాలు చూపబడ్డాయి.',
    docWhere: (location: string) => 'ఇది ఇక్కడ దొరుకుతుంది: ' + location,
  },
  'kn-IN': {
    processing: 'ಸರಿ, ನಿಮ್ಮ ಮಾಹಿತಿಯ ಆಧಾರದ ಮೇಲೆ, ಇಲ್ಲಿ ಕೆಲವು ಯೋಜನೆಗಳಿವೆ:',
    recommendation: (name: string) => 'ಮೊದಲು ' + name + ' ಮಾಡಿ — ಸುಲಭ ಮತ್ತು ಹೆಚ್ಚು ಪ್ರಯೋಜನಕಾರಿ.',
    prepPromptText: 'CSCಗೆ ಹೋಗುವ ಮೊದಲು, ನಾನು ನಿಮಗೆ ದಾಖಲೆ ಪರಿಶೀಲನೆಯಲ್ಲಿ ಸಹಾಯ ಮಾಡಲೇ?',
    prepDecline: 'ಸರಿ. ನೀವು ಸಿದ್ಧರಾದಾಗ ಕೆಳಗೆ CSC ಹುಡುಕಿ ಒತ್ತಿ.',
    cscOpened: 'Google Maps ತೆರೆಯಿತು — ಹತ್ತಿರದ CSC ಕೇಂದ್ರಗಳನ್ನು ತೋರಿಸಲಾಗಿದೆ.',
    locationDenied: 'ಸ್ಥಳ ಸಿಗಲಿಲ್ಲ. ನಿಮ್ಮ Pin Code ತಿಳಿಸಿ.',
    pincodeResult: (pin: string) => 'Google Maps ತೆರೆಯಿತು — ' + pin + ' ಹತ್ತಿರದ CSC ಕೇಂದ್ರಗಳನ್ನು ತೋರಿಸಲಾಗಿದೆ.',
    docWhere: (location: string) => 'ಇದು ಇಲ್ಲಿ ಸಿಗುತ್ತದೆ: ' + location,
  },
  'ml-IN': {
    processing: 'ശരി, നിങ്ങളുടെ വിവരങ്ങളുടെ അടിസ്ഥാനത്തിൽ, ഇതാ ചില പദ്ധതികൾ:',
    recommendation: (name: string) => 'ആദ്യം ' + name + ' ചെയ്യൂ — ഏറ്റവും എളുപ്പവും കൂടുതൽ പ്രയോജനകരവും.',
    prepPromptText: 'CSC-യിലേക്ക് പോകുന്നതിന് മുമ്പ്, ഞാൻ നിങ്ങളെ രേഖ പരിശോധനയിൽ സഹായിക്കട്ടെയോ?',
    prepDecline: 'ശരി. തയ്യാറാകുമ്പോൾ താഴെ CSC കണ്ടെത്തുക അമർത്തുക.',
    cscOpened: 'Google Maps തുറന്നു — അടുത്തുള്ള CSC കേന്ദ്രങ്ങൾ കാണിച്ചിരിക്കുന്നു.',
    locationDenied: 'ലൊക്കേഷൻ ലഭിച്ചില്ല. നിങ്ങളുടെ Pin Code പറയൂ.',
    pincodeResult: (pin: string) => 'Google Maps തുറന്നു — ' + pin + ' അടുത്തുള്ള CSC കേന്ദ്രങ്ങൾ കാണിച്ചിരിക്കുന്നു.',
    docWhere: (location: string) => 'ഇത് ഇവിടെ ലഭിക്കും: ' + location,
  },
  'bn-IN': {
    processing: 'ঠিক আছে, আপনার তথ্যের ভিত্তিতে, এখানে কিছু প্রকল্প আছে:',
    recommendation: (name: string) => 'প্রথমে ' + name + ' করুন — সবচেয়ে সহজ এবং সবচেয়ে বেশি লাভজনক।',
    prepPromptText: 'CSC-তে যাওয়ার আগে, আমি কি আপনাকে নথি যাচাইয়ে সাহায্য করব?',
    prepDecline: 'ঠিক আছে। প্রস্তুত হলে নিচে CSC খুঁজুন চাপুন।',
    cscOpened: 'Google Maps খুলেছে — নিকটবর্তী CSC কেন্দ্র দেখানো হয়েছে।',
    locationDenied: 'অবস্থান পাওয়া যায়নি। আপনার Pin Code বলুন।',
    pincodeResult: (pin: string) => 'Google Maps খুলেছে — ' + pin + ' এর নিকটবর্তী CSC কেন্দ্র দেখানো হয়েছে।',
    docWhere: (location: string) => 'এটি এখানে পাবেন: ' + location,
  },
  'gu-IN': {
    processing: 'સારું, તમારી માહિતીના આધારે, અહીં કેટલીક યોજનાઓ છે:',
    recommendation: (name: string) => 'પહેલા ' + name + ' કરો — સૌથી સરળ અને સૌથી વધુ ફાયદાકારક.',
    prepPromptText: 'CSC પર જતાં પહેલાં, શું હું તમને દસ્તાવેજ ચકાસણીમાં મદદ કરું?',
    prepDecline: 'ઠીક છે. તૈયાર થાઓ ત્યારે નીચે CSC શોધો દબાવો.',
    cscOpened: 'Google Maps ખૂલ્યું — નજીકના CSC કેન્દ્રો બતાવવામાં આવ્યા છે.',
    locationDenied: 'સ્થાન મળ્યું નથી. તમારો Pin Code જણાવો.',
    pincodeResult: (pin: string) => 'Google Maps ખૂલ્યું — ' + pin + ' ની નજીકના CSC કેન્દ્રો બતાવવામાં આવ્યા છે.',
    docWhere: (location: string) => 'આ અહીં મળશે: ' + location,
  },
  'pa-IN': {
    processing: "ਠੀਕ ਹੈ, ਤੁਹਾਡੀ ਜਾਣਕਾਰੀ ਦੇ ਆਧਾਰ 'ਤੇ, ਇੱਥੇ ਕੁਝ ਯੋਜਨਾਵਾਂ ਹਨ:",
    recommendation: (name: string) => 'ਪਹਿਲਾਂ ' + name + ' ਕਰੋ — ਸਭ ਤੋਂ ਆਸਾਨ ਅਤੇ ਸਭ ਤੋਂ ਵੱਧ ਲਾਭਦਾਇਕ।',
    prepPromptText: 'CSC ਜਾਣ ਤੋਂ ਪਹਿਲਾਂ, ਕੀ ਮੈਂ ਤੁਹਾਡੀ ਦਸਤਾਵੇਜ਼ ਜਾਂਚ ਵਿੱਚ ਮਦਦ ਕਰਾਂ?',
    prepDecline: 'ਠੀਕ ਹੈ। ਜਦੋਂ ਤਿਆਰ ਹੋਵੋ ਤਾਂ ਹੇਠਾਂ CSC ਲੱਭੋ ਦਬਾਓ।',
    cscOpened: 'Google Maps ਖੁੱਲ੍ਹ ਗਿਆ — ਨਜ਼ਦੀਕੀ CSC ਕੇਂਦਰ ਦਿਖਾਏ ਗਏ ਹਨ।',
    locationDenied: 'Location ਨਹੀਂ ਮਿਲੀ। ਆਪਣਾ Pin Code ਦੱਸੋ।',
    pincodeResult: (pin: string) => 'Google Maps ਖੁੱਲ੍ਹ ਗਿਆ — ' + pin + ' ਦੇ ਨਜ਼ਦੀਕੀ CSC ਕੇਂਦਰ ਦਿਖਾਏ ਗਏ ਹਨ।',
    docWhere: (location: string) => 'ਇਹ ਇੱਥੇ ਮਿਲੇਗਾ: ' + location,
  },
}

const DOC_NAMES: Record<string, Record<UiLang, string>> = {
  aadhaar: { 'hi-IN': 'आधार कार्ड', 'mr-IN': 'आधार कार्ड', 'en-IN': 'Aadhaar Card', 'ta-IN': 'ஆதார் அட்டை', 'te-IN': 'ఆధార్ కార్డు', 'kn-IN': 'ಆಧಾರ್ ಕಾರ್ಡ್', 'ml-IN': 'ആധാർ കാർഡ്', 'bn-IN': 'আধার কার্ড', 'gu-IN': 'આધાર કાર્ડ', 'pa-IN': 'ਆਧਾਰ ਕਾਰਡ' },
  passbook: { 'hi-IN': 'बैंक पासबुक', 'mr-IN': 'बँक पासबुक', 'en-IN': 'Bank Passbook', 'ta-IN': 'வங்கி பாஸ்புக்', 'te-IN': 'బ్యాంక్ పాస్‌బుక్', 'kn-IN': 'ಬ್ಯಾಂಕ್ ಪಾಸ್‌ಬುಕ್', 'ml-IN': 'ബാങ്ക് പാസ്ബുക്ക്', 'bn-IN': 'ব্যাংক পাসবই', 'gu-IN': 'બેંક પાસબુક', 'pa-IN': 'ਬੈਂਕ ਪਾਸਬੁੱਕ' },
  khasra: { 'hi-IN': 'ज़मीन के कागज़', 'mr-IN': 'जमिनीचे कागद', 'en-IN': 'Khasra / Khatauni', 'ta-IN': 'கசரா / கதவுனி', 'te-IN': 'ఖస్రా / ఖతౌనీ', 'kn-IN': 'ಖಸ್ರಾ / ಖತೌನಿ', 'ml-IN': 'ഖസ്ര / ഖതൗനി', 'bn-IN': 'খসরা / খতৌনি', 'gu-IN': 'ખસરા / ખતૌની', 'pa-IN': 'ਖਸਰਾ / ਖਤੌਨੀ' },
  mobile: { 'hi-IN': 'मोबाइल नंबर', 'mr-IN': 'मोबाइल क्रमांक (आधार लिंक)', 'en-IN': 'Mobile Number (Aadhaar linked)', 'ta-IN': 'மொபைல் எண் (ஆதார் இணைக்கப்பட்டது)', 'te-IN': 'మొబైల్ నంబర్ (ఆధార్ లింక్)', 'kn-IN': 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (ಆಧಾರ್ ಲಿಂಕ್)', 'ml-IN': 'മൊബൈൽ നമ്പർ (ആധാർ ലിങ്ക്)', 'bn-IN': 'মোবাইল নম্বর (আধার লিংক)', 'gu-IN': 'મોબાઇલ નંબર (આધાર લિંક)', 'pa-IN': 'ਮੋਬਾਈਲ ਨੰਬਰ (ਆਧਾਰ ਲਿੰਕ)' },
  photo: { 'hi-IN': 'पासपोर्ट फोटो', 'mr-IN': 'पासपोर्ट फोटो', 'en-IN': 'Passport Size Photos', 'ta-IN': 'பாஸ்போர்ட் அளவு புகைப்படங்கள்', 'te-IN': 'పాస్‌పోర్ట్ సైజు ఫోటోలు', 'kn-IN': 'ಪಾಸ್‌ಪೋರ್ಟ್ ಗಾತ್ರದ ಫೋಟೋಗಳು', 'ml-IN': 'പാസ്‌പോർട്ട് സൈസ് ഫോട്ടോകൾ', 'bn-IN': 'পাসপোর্ট সাইজের ছবি', 'gu-IN': 'પાસપોર્ટ સાઈઝ ફોટા', 'pa-IN': 'ਪਾਸਪੋਰਟ ਸਾਈਜ਼ ਫੋਟੋਆਂ' },
  ration: { 'hi-IN': 'राशन कार्ड', 'mr-IN': 'रेशन कार्ड (BPL)', 'en-IN': 'Ration Card (BPL)', 'ta-IN': 'ரேஷன் கார்டு (BPL)', 'te-IN': 'రేషన్ కార్డు (BPL)', 'kn-IN': 'ಪಡಿತರ ಚೀಟಿ (BPL)', 'ml-IN': 'റേഷൻ കാർഡ് (BPL)', 'bn-IN': 'রেশন কার্ড (BPL)', 'gu-IN': 'રેશન કાર્ડ (BPL)', 'pa-IN': 'ਰਾਸ਼ਨ ਕਾਰਡ (BPL)' },
  marriage: { 'hi-IN': 'विवाह प्रमाण पत्र', 'mr-IN': 'विवाह प्रमाणपत्र', 'en-IN': 'Marriage Certificate', 'ta-IN': 'திருமண சான்றிதழ்', 'te-IN': 'వివాహ ధృవీకరణ పత్రం', 'kn-IN': 'ಮದುವೆ ಪ್ರಮಾಣಪತ್ರ', 'ml-IN': 'വിവാഹ സർട്ടിഫിക്കറ്റ്', 'bn-IN': 'বিবাহ সার্টিফিকেট', 'gu-IN': 'લગ્ન પ્રમાણપત્ર', 'pa-IN': 'ਵਿਆਹ ਸਰਟੀਫਿਕੇਟ' },
  marksheet: { 'hi-IN': '12वीं की मार्कशीट', 'mr-IN': '12वीची गुणपत्रिका', 'en-IN': '12th Marksheet', 'ta-IN': '12ஆம் வகுப்பு மார்க்ஷீட்', 'te-IN': '12వ తరగతి మార్క్‌షీట్', 'kn-IN': '12ನೇ ತರಗತಿ ಅಂಕಪಟ್ಟಿ', 'ml-IN': '12-ാം ക്ലാസ് മാർക്ക്ഷീറ്റ്', 'bn-IN': '১২শ শ্রেণীর মার্কশিট', 'gu-IN': '12મા ધોરણની માર્કશીટ', 'pa-IN': '12ਵੀਂ ਦੀ ਮਾਰਕਸ਼ੀਟ' },
  bonafide: { 'hi-IN': 'बोनाफाइड सर्टिफिकेट', 'mr-IN': 'बोनाफाईड प्रमाणपत्र', 'en-IN': 'Bonafide / Admission Letter', 'ta-IN': 'போனஃபைடு / சேர்க்கை கடிதம்', 'te-IN': 'బోనఫైడ్ / అడ్మిషన్ లేఖ', 'kn-IN': 'ಬೊನಾಫೈಡ್ / ಪ್ರವೇಶ ಪತ್ರ', 'ml-IN': 'ബോണഫൈഡ് / അഡ്മിഷൻ ലെറ്റർ', 'bn-IN': 'বোনাফাইড / ভর্তি পত্র', 'gu-IN': 'બોનાફાઇડ / પ્રવેશ પત્ર', 'pa-IN': 'ਬੋਨਾਫਾਈਡ / ਦਾਖਲਾ ਪੱਤਰ' },
  income: { 'hi-IN': 'आय प्रमाण पत्र', 'mr-IN': 'उत्पन्नाचा दाखला', 'en-IN': 'Income Certificate', 'ta-IN': 'வருமான சான்றிதழ்', 'te-IN': 'ఆదాయ ధృవీకరణ పత్రం', 'kn-IN': 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ', 'ml-IN': 'വരുമാന സർട്ടിഫിക്കറ്റ്', 'bn-IN': 'আয়ের সার্টিফিকেট', 'gu-IN': 'આવકનું પ્રમાણપત્ર', 'pa-IN': 'ਆਮਦਨ ਸਰਟੀਫਿਕੇਟ' },
  age: { 'hi-IN': 'उम्र का प्रमाण', 'mr-IN': 'वयाचा दाखला', 'en-IN': 'Age Proof (Birth Certificate)', 'ta-IN': 'வயது சான்று (பிறப்பு சான்றிதழ்)', 'te-IN': 'వయస్సు రుజువు (జనన ధృవీకరణ పత్రం)', 'kn-IN': 'ವಯಸ್ಸಿನ ಪುರಾವೆ (ಜನನ ಪ್ರಮಾಣಪತ್ರ)', 'ml-IN': 'വയസ്സ് തെളിവ് (ജനന സർട്ടിഫിക്കറ്റ്)', 'bn-IN': 'বয়সের প্রমাণ (জন্ম সনদ)', 'gu-IN': 'ઉંમરનો પુરાવો (જન્મ પ્રમાણપત્ર)', 'pa-IN': 'ਉਮਰ ਦਾ ਸਬੂਤ (ਜਨਮ ਸਰਟੀਫਿਕੇਟ)' },
  pan: { 'hi-IN': 'पैन कार्ड', 'mr-IN': 'पॅन कार्ड', 'en-IN': 'PAN Card', 'ta-IN': 'PAN அட்டை', 'te-IN': 'PAN కార్డు', 'kn-IN': 'PAN ಕಾರ್ಡ್', 'ml-IN': 'PAN കാർഡ്', 'bn-IN': 'PAN কার্ড', 'gu-IN': 'PAN કાર્ડ', 'pa-IN': 'PAN ਕਾਰਡ' },
  business_reg: { 'hi-IN': 'व्यापार प्रमाण', 'mr-IN': 'व्यवसाय नोंदणी / उद्यम', 'en-IN': 'Business Registration / Udyam', 'ta-IN': 'வணிக பதிவு / உத்யம்', 'te-IN': 'వ్యాపార నమోదు / ఉద్యమ్', 'kn-IN': 'ವ್ಯಾಪಾರ ನೋಂದಣಿ / ಉದ್ಯಮ್', 'ml-IN': 'ബിസിനസ് രജിസ്ട്രേഷൻ / ഉദ്യം', 'bn-IN': 'ব্যবসা নিবন্ধন / উদ্যম', 'gu-IN': 'વ્યવસાય નોંધણી / ઉદ્યમ', 'pa-IN': 'ਕਾਰੋਬਾਰ ਰਜਿਸਟ੍ਰੇਸ਼ਨ / ਉਦਯਮ' },
};

function docName(id: keyof typeof DOC_NAMES, imgSrc: string, fallbackColor: string, required: boolean, tip: Record<UiLang, string>) {
  return { id, name: DOC_NAMES[id], tip, imgSrc, fallbackColor, required };
}

const documentData = {
  farmer: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'नाम ज़मीन के कागज़ से बिल्कुल मेल खाना चाहिए', 'mr-IN': 'नाव जमिनीच्या कागदपत्रांशी तंतोतंत जुळावे', 'en-IN': 'Name must exactly match your land records', 'ta-IN': 'பெயர் நில ஆவணங்களுடன் சரியாகப் பொருந்த வேண்டும்', 'te-IN': 'పేరు మీ భూమి పత్రాలతో ఖచ్చితంగా సరిపోలాలి', 'kn-IN': 'ಹೆಸರು ನಿಮ್ಮ ಭೂ ದಾಖಲೆಗಳೊಂದಿಗೆ ನಿಖರವಾಗಿ ಹೊಂದಿಕೆಯಾಗಬೇಕು', 'ml-IN': 'പേര് നിങ്ങളുടെ ഭൂരേഖകളുമായി കൃത്യമായി പൊരുത്തപ്പെടണം', 'bn-IN': 'নাম আপনার জমির কাগজপত্রের সাথে হুবহু মিলতে হবে', 'gu-IN': 'નામ તમારા જમીનના કાગળો સાથે બરાબર મેળ ખાવું જોઈએ', 'pa-IN': 'ਨਾਮ ਤੁਹਾਡੇ ਜ਼ਮੀਨ ਦੇ ਕਾਗਜ਼ਾਂ ਨਾਲ ਬਿਲਕੁਲ ਮੇਲ ਖਾਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': 'आधार इस खाते से लिंक होना चाहिए', 'mr-IN': 'आधार या खात्याशी जोडलेले असावे', 'en-IN': 'Aadhaar must be linked to this account', 'ta-IN': 'இந்த கணக்குடன் ஆதார் இணைக்கப்பட்டிருக்க வேண்டும்', 'te-IN': 'ఈ ఖాతాకు ఆధార్ లింక్ చేయబడి ఉండాలి', 'kn-IN': 'ಈ ಖಾತೆಗೆ ಆಧಾರ್ ಲಿಂಕ್ ಆಗಿರಬೇಕು', 'ml-IN': 'ഈ അക്കൗണ്ടിലേക്ക് ആധാർ ലിങ്ക് ചെയ്തിരിക്കണം', 'bn-IN': 'এই অ্যাকাউন্টের সাথে আধার লিংক থাকতে হবে', 'gu-IN': 'આ ખાતા સાથે આધાર લિંક હોવું જોઈએ', 'pa-IN': 'ਇਸ ਖਾਤੇ ਨਾਲ ਆਧਾਰ ਲਿੰਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('khasra', '/docs/doc-khasra-khatauni.jpg', '#E8690B', true, { 'hi-IN': 'खसरा नंबर और क्षेत्रफल ज़रूरी है — पटवारी से लें', 'mr-IN': 'खसरा क्रमांक आणि क्षेत्रफळ आवश्यक — पटवारीकडून घ्या', 'en-IN': 'Khasra number and area required — get it from the Patwari', 'ta-IN': 'கசரா எண் மற்றும் பரப்பளவு தேவை — பட்வாரியிடம் இருந்து பெறவும்', 'te-IN': 'ఖస్రా నంబర్ మరియు విస్తీర్ణం అవసరం — పట్వారీ నుండి పొందండి', 'kn-IN': 'ಖಸ್ರಾ ಸಂಖ್ಯೆ ಮತ್ತು ವಿಸ್ತೀರ್ಣ ಅಗತ್ಯ — ಪಟವಾರಿಯಿಂದ ಪಡೆಯಿರಿ', 'ml-IN': 'ഖസ്ര നമ്പറും വിസ്തീർണവും ആവശ്യമാണ് — പട്വാരിയിൽ നിന്ന് വാങ്ങുക', 'bn-IN': 'খসরা নম্বর এবং আয়তন প্রয়োজন — পাটোয়ারির কাছ থেকে নিন', 'gu-IN': 'ખસરા નંબર અને ક્ષેત્રફળ જરૂરી — પટવારી પાસેથી મેળવો', 'pa-IN': 'ਖਸਰਾ ਨੰਬਰ ਅਤੇ ਰਕਬਾ ਜ਼ਰੂਰੀ ਹੈ — ਪਟਵਾਰੀ ਤੋਂ ਲਓ' }),
    docName('mobile', '/docs/doc-mobile-number.jpg', '#7C3AED', true, { 'hi-IN': 'आधार से जुड़ा नंबर होना चाहिए', 'mr-IN': 'आधारशी जोडलेला क्रमांक असावा', 'en-IN': 'Must be the number linked to Aadhaar', 'ta-IN': 'ஆதாருடன் இணைக்கப்பட்ட எண்ணாக இருக்க வேண்டும்', 'te-IN': 'ఆధార్‌కు లింక్ చేసిన నంబర్ అయి ఉండాలి', 'kn-IN': 'ಆಧಾರ್‌ಗೆ ಲಿಂಕ್ ಆಗಿರುವ ಸಂಖ್ಯೆಯೇ ಆಗಿರಬೇಕು', 'ml-IN': 'ആധാറുമായി ലിങ്ക് ചെയ്ത നമ്പർ ആയിരിക്കണം', 'bn-IN': 'আধারের সাথে যুক্ত নম্বর হতে হবে', 'gu-IN': 'આધાર સાથે લિંક થયેલો નંબર હોવો જોઈએ', 'pa-IN': 'ਆਧਾਰ ਨਾਲ ਲਿੰਕ ਨੰਬਰ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('photo', '/docs/doc-passport-photo.jpg', '#0F766E', true, { 'hi-IN': '2 से 4 हाल की फोटो', 'mr-IN': '2 ते 4 अलीकडील फोटो', 'en-IN': '2 to 4 recent photos', 'ta-IN': '2 முதல் 4 சமீபத்திய புகைப்படங்கள்', 'te-IN': '2 నుండి 4 ఇటీవలి ఫోటోలు', 'kn-IN': '2 ರಿಂದ 4 ಇತ್ತೀಚಿನ ಫೋಟೋಗಳು', 'ml-IN': '2 മുതൽ 4 വരെ സമീപകാല ഫോട്ടോകൾ', 'bn-IN': '২ থেকে ৪টি সাম্প্রতিক ছবি', 'gu-IN': '2 થી 4 તાજેતરના ફોટા', 'pa-IN': '2 ਤੋਂ 4 ਹਾਲੀਆ ਫੋਟੋਆਂ' }),
  ],
  women: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'नाम बिल्कुल सही होना चाहिए', 'mr-IN': 'नाव पूर्णपणे बरोबर असावे', 'en-IN': 'Name must be entirely correct', 'ta-IN': 'பெயர் முழுமையாக சரியாக இருக்க வேண்டும்', 'te-IN': 'పేరు పూర్తిగా సరిగ్గా ఉండాలి', 'kn-IN': 'ಹೆಸರು ಸಂಪೂರ್ಣವಾಗಿ ಸರಿಯಾಗಿರಬೇಕು', 'ml-IN': 'പേര് പൂർണ്ണമായും ശരിയായിരിക്കണം', 'bn-IN': 'নাম সম্পূর্ণ সঠিক হতে হবে', 'gu-IN': 'નામ સંપૂર્ણપણે સાચું હોવું જોઈએ', 'pa-IN': 'ਨਾਮ ਪੂਰੀ ਤਰ੍ਹਾਂ ਸਹੀ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('ration', '/docs/doc-ration-card.jpg', '#DC2626', true, { 'hi-IN': 'BPL राशन कार्ड होना ज़रूरी है', 'mr-IN': 'BPL रेशन कार्ड असणे आवश्यक आहे', 'en-IN': 'A BPL ration card is required', 'ta-IN': 'BPL ரேஷன் கார்டு அவசியம்', 'te-IN': 'BPL రేషన్ కార్డు అవసరం', 'kn-IN': 'BPL ಪಡಿತರ ಚೀಟಿ ಅಗತ್ಯ', 'ml-IN': 'BPL റേഷൻ കാർഡ് ആവശ്യമാണ്', 'bn-IN': 'BPL রেশন কার্ড প্রয়োজন', 'gu-IN': 'BPL રેશન કાર્ડ જરૂરી છે', 'pa-IN': 'BPL ਰਾਸ਼ਨ ਕਾਰਡ ਜ਼ਰੂਰੀ ਹੈ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': 'महिला के नाम का खाता होना चाहिए', 'mr-IN': 'खाते महिलेच्या नावावर असावे', 'en-IN': "Account must be in the woman's name", 'ta-IN': 'கணக்கு பெண்ணின் பெயரில் இருக்க வேண்டும்', 'te-IN': 'ఖాతా మహిళ పేరు మీద ఉండాలి', 'kn-IN': 'ಖಾತೆ ಮಹಿಳೆಯ ಹೆಸರಿನಲ್ಲಿ ಇರಬೇಕು', 'ml-IN': 'അക്കൗണ്ട് സ്ത്രീയുടെ പേരിൽ ആയിരിക്കണം', 'bn-IN': 'অ্যাকাউন্ট নারীর নামে হতে হবে', 'gu-IN': 'ખાતું મહિલાના નામે હોવું જોઈએ', 'pa-IN': "ਖਾਤਾ ਔਰਤ ਦੇ ਨਾਮ 'ਤੇ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ" }),
    docName('marriage', '/docs/doc-marriage-certificate.jpg', '#BE185D', false, { 'hi-IN': 'विवाहित महिलाओं के लिए ज़रूरी', 'mr-IN': 'विवाहित महिलांसाठी आवश्यक', 'en-IN': 'Required for married women', 'ta-IN': 'திருமணமான பெண்களுக்கு அவசியம்', 'te-IN': 'వివాహిత మహిళలకు అవసరం', 'kn-IN': 'ವಿವಾಹಿತ ಮಹಿಳೆಯರಿಗೆ ಅಗತ್ಯ', 'ml-IN': 'വിവാഹിതരായ സ്ത്രീകൾക്ക് ആവശ്യമാണ്', 'bn-IN': 'বিবাহিত নারীদের জন্য প্রয়োজন', 'gu-IN': 'પરિણીત મહિલાઓ માટે જરૂરી', 'pa-IN': 'ਵਿਆਹੀਆਂ ਔਰਤਾਂ ਲਈ ਜ਼ਰੂਰੀ' }),
    docName('photo', '/docs/doc-passport-photo.jpg', '#0F766E', true, { 'hi-IN': '2 से 4 हाल की फोटो', 'mr-IN': '2 ते 4 अलीकडील फोटो', 'en-IN': '2 to 4 recent photos', 'ta-IN': '2 முதல் 4 சமீபத்திய புகைப்படங்கள்', 'te-IN': '2 నుండి 4 ఇటీవలి ఫోటోలు', 'kn-IN': '2 ರಿಂದ 4 ಇತ್ತೀಚಿನ ಫೋಟೋಗಳು', 'ml-IN': '2 മുതൽ 4 വരെ സമീപകാല ഫോട്ടോകൾ', 'bn-IN': '২ থেকে ৪টি সাম্প্রতিক ছবি', 'gu-IN': '2 થી 4 તાજેતરના ફોટા', 'pa-IN': '2 ਤੋਂ 4 ਹਾਲੀਆ ਫੋਟੋਆਂ' }),
  ],
  student: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'नाम marksheet से मेल खाना चाहिए', 'mr-IN': 'नाव गुणपत्रिकेशी जुळावे', 'en-IN': 'Name must match your marksheet', 'ta-IN': 'பெயர் உங்கள் மார்க்ஷீட்டுடன் பொருந்த வேண்டும்', 'te-IN': 'పేరు మీ మార్క్‌షీట్‌తో సరిపోలాలి', 'kn-IN': 'ಹೆಸರು ನಿಮ್ಮ ಅಂಕಪಟ್ಟಿಯೊಂದಿಗೆ ಹೊಂದಿಕೆಯಾಗಬೇಕು', 'ml-IN': 'പേര് നിങ്ങളുടെ മാർക്ക്ഷീറ്റുമായി പൊരുത്തപ്പെടണം', 'bn-IN': 'নাম আপনার মার্কশিটের সাথে মিলতে হবে', 'gu-IN': 'નામ તમારી માર્કશીટ સાથે મેળ ખાવું જોઈએ', 'pa-IN': 'ਨਾਮ ਤੁਹਾਡੀ ਮਾਰਕਸ਼ੀਟ ਨਾਲ ਮੇਲ ਖਾਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('marksheet', '/docs/doc-12th-marksheet.jpg', '#E65100', true, { 'hi-IN': 'न्यूनतम 60% अंक होने चाहिए', 'mr-IN': 'किमान 60% गुण आवश्यक', 'en-IN': 'Minimum 60% marks required', 'ta-IN': 'குறைந்தபட்சம் 60% மதிப்பெண்கள் தேவை', 'te-IN': 'కనీసం 60% మార్కులు అవసరం', 'kn-IN': 'ಕನಿಷ್ಠ 60% ಅಂಕಗಳು ಅಗತ್ಯ', 'ml-IN': 'കുറഞ്ഞത് 60% മാർക്ക് ആവശ്യമാണ്', 'bn-IN': 'ন্যূনতম 60% নম্বর প্রয়োজন', 'gu-IN': 'ઓછામાં ઓછા 60% ગુણ જરૂરી', 'pa-IN': 'ਘੱਟੋ-ਘੱਟ 60% ਅੰਕ ਜ਼ਰੂਰੀ' }),
    docName('bonafide', '/docs/doc-bonafide-certificate.jpg', '#0369A1', true, { 'hi-IN': 'College में enrollment का प्रमाण — College से लें', 'mr-IN': 'कॉलेजमध्ये प्रवेशाचा पुरावा — कॉलेजकडून घ्या', 'en-IN': 'Proof of enrollment — get it from your college', 'ta-IN': 'சேர்க்கை சான்று — உங்கள் கல்லூரியில் இருந்து பெறவும்', 'te-IN': 'నమోదు రుజువు — మీ కళాశాల నుండి పొందండి', 'kn-IN': 'ದಾಖಲಾತಿ ಪುರಾವೆ — ನಿಮ್ಮ ಕಾಲೇಜಿನಿಂದ ಪಡೆಯಿರಿ', 'ml-IN': 'എൻറോൾമെന്റ് തെളിവ് — നിങ്ങളുടെ കോളേജിൽ നിന്ന് വാങ്ങുക', 'bn-IN': 'ভর্তির প্রমাণ — আপনার কলেজ থেকে নিন', 'gu-IN': 'નોંધણીનો પુરાવો — તમારી કોલેજમાંથી મેળવો', 'pa-IN': 'ਦਾਖਲੇ ਦਾ ਸਬੂਤ — ਆਪਣੇ ਕਾਲਜ ਤੋਂ ਲਓ' }),
    docName('income', '/docs/doc-income-certificate.jpg', '#854D0E', true, { 'hi-IN': 'परिवार की सालाना आय का प्रमाण — तहसील से लें', 'mr-IN': 'कुटुंबाच्या वार्षिक उत्पन्नाचा पुरावा — तहसील कार्यालयातून घ्या', 'en-IN': 'Proof of annual family income — get it from Tehsil office', 'ta-IN': 'குடும்ப ஆண்டு வருமான சான்று — தாலுகா அலுவலகத்தில் இருந்து பெறவும்', 'te-IN': 'వార్షిక కుటుంబ ఆదాయ రుజువు — తహసీల్ కార్యాలయం నుండి పొందండి', 'kn-IN': 'ವಾರ್ಷಿಕ ಕುಟುಂಬ ಆದಾಯದ ಪುರಾವೆ — ತಹಸೀಲ್ ಕಚೇರಿಯಿಂದ ಪಡೆಯಿರಿ', 'ml-IN': 'വാർഷിക കുടുംബ വരുമാന തെളിവ് — തഹസിൽ ഓഫീസിൽ നിന്ന് വാങ്ങുക', 'bn-IN': 'বার্ষিক পারিবারিক আয়ের প্রমাণ — তহসিল অফিস থেকে নিন', 'gu-IN': 'વાર્ષિક કુટુંબની આવકનો પુરાવો — તહસીલ કચેરીમાંથી મેળવો', 'pa-IN': 'ਸਲਾਨਾ ਪਰਿਵਾਰਕ ਆਮਦਨ ਦਾ ਸਬੂਤ — ਤਹਿਸੀਲ ਦਫ਼ਤਰ ਤੋਂ ਲਓ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': 'छात्र के नाम का खाता', 'mr-IN': 'खाते विद्यार्थ्याच्या नावावर असावे', 'en-IN': "Account must be in the student's name", 'ta-IN': 'கணக்கு மாணவரின் பெயரில் இருக்க வேண்டும்', 'te-IN': 'ఖాతా విద్యార్థి పేరు మీద ఉండాలి', 'kn-IN': 'ಖಾತೆ ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರಿನಲ್ಲಿ ಇರಬೇಕು', 'ml-IN': 'അക്കൗണ്ട് വിദ്യാർത്ഥിയുടെ പേരിൽ ആയിരിക്കണം', 'bn-IN': 'অ্যাকাউন্ট শিক্ষার্থীর নামে হতে হবে', 'gu-IN': 'ખાતું વિદ્યાર્થીના નામે હોવું જોઈએ', 'pa-IN': "ਖਾਤਾ ਵਿਦਿਆਰਥੀ ਦੇ ਨਾਮ 'ਤੇ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ" }),
  ],
  housing: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'नाम सभी कागज़ों से मेल खाना चाहिए', 'mr-IN': 'नाव सर्व कागदपत्रांशी जुळावे', 'en-IN': 'Name must match all documents', 'ta-IN': 'பெயர் அனைத்து ஆவணங்களுடன் பொருந்த வேண்டும்', 'te-IN': 'పేరు అన్ని పత్రాలతో సరిపోలాలి', 'kn-IN': 'ಹೆಸರು ಎಲ್ಲಾ ದಾಖಲೆಗಳೊಂದಿಗೆ ಹೊಂದಿಕೆಯಾಗಬೇಕು', 'ml-IN': 'പേര് എല്ലാ രേഖകളുമായി പൊരുത്തപ്പെടണം', 'bn-IN': 'নাম সব নথির সাথে মিলতে হবে', 'gu-IN': 'નામ બધા દસ્તાવેજો સાથે મેળ ખાવું જોઈએ', 'pa-IN': 'ਨਾਮ ਸਾਰੇ ਦਸਤਾਵੇਜ਼ਾਂ ਨਾਲ ਮੇਲ ਖਾਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('ration', '/docs/doc-ration-card.jpg', '#DC2626', true, { 'hi-IN': 'SECC 2011 सूची में नाम होना चाहिए', 'mr-IN': 'SECC 2011 यादीत नाव असावे', 'en-IN': 'Name must be in the SECC 2011 list', 'ta-IN': 'SECC 2011 பட்டியலில் பெயர் இருக்க வேண்டும்', 'te-IN': 'SECC 2011 జాబితాలో పేరు ఉండాలి', 'kn-IN': 'SECC 2011 ಪಟ್ಟಿಯಲ್ಲಿ ಹೆಸರು ಇರಬೇಕು', 'ml-IN': 'SECC 2011 ലിസ്റ്റിൽ പേര് ഉണ്ടായിരിക്കണം', 'bn-IN': 'SECC 2011 তালিকায় নাম থাকতে হবে', 'gu-IN': 'SECC 2011 યાદીમાં નામ હોવું જોઈએ', 'pa-IN': 'SECC 2011 ਸੂਚੀ ਵਿੱਚ ਨਾਮ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('income', '/docs/doc-income-certificate.jpg', '#854D0E', true, { 'hi-IN': 'परिवार की आय 3 लाख से कम होनी चाहिए', 'mr-IN': 'कुटुंबाचे उत्पन्न ₹3 लाखांपेक्षा कमी असावे', 'en-IN': 'Family income must be under ₹3 lakh', 'ta-IN': 'குடும்ப வருமானம் ₹3 லட்சத்திற்கும் குறைவாக இருக்க வேண்டும்', 'te-IN': 'కుటుంబ ఆదాయం ₹3 లక్షలలోపు ఉండాలి', 'kn-IN': 'ಕುಟುಂಬ ಆದಾಯ ₹3 ಲಕ್ಷಕ್ಕಿಂತ ಕಡಿಮೆ ಇರಬೇಕು', 'ml-IN': 'കുടുംബ വരുമാനം ₹3 ലക്ഷത്തിൽ താഴെ ആയിരിക്കണം', 'bn-IN': 'পারিবারিক আয় ₹৩ লাখের কম হতে হবে', 'gu-IN': 'કુટુંબની આવક ₹3 લાખથી ઓછી હોવી જોઈએ', 'pa-IN': 'ਪਰਿਵਾਰਕ ਆਮਦਨ ₹3 ਲੱਖ ਤੋਂ ਘੱਟ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': 'DBT के लिए आधार से लिंक होना चाहिए', 'mr-IN': 'DBT साठी आधारशी जोडलेले असावे', 'en-IN': 'Must be Aadhaar-linked for DBT', 'ta-IN': 'DBTக்காக ஆதார் இணைக்கப்பட்டிருக்க வேண்டும்', 'te-IN': 'DBT కోసం ఆధార్ లింక్ చేయబడి ఉండాలి', 'kn-IN': 'DBT ಗಾಗಿ ಆಧಾರ್ ಲಿಂಕ್ ಆಗಿರಬೇಕು', 'ml-IN': 'DBT-ക്ക് ആധാർ ലിങ്ക് ചെയ്തിരിക്കണം', 'bn-IN': 'DBT-এর জন্য আধার লিংক থাকতে হবে', 'gu-IN': 'DBT માટે આધાર લિંક હોવું જોઈએ', 'pa-IN': 'DBT ਲਈ ਆਧਾਰ ਲਿੰਕ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('photo', '/docs/doc-passport-photo.jpg', '#0F766E', true, { 'hi-IN': '4 हाल की पासपोर्ट साइज़ फोटो', 'mr-IN': '4 अलीकडील पासपोर्ट साईज फोटो', 'en-IN': '4 recent passport size photos', 'ta-IN': '4 சமீபத்திய பாஸ்போர்ட் அளவு புகைப்படங்கள்', 'te-IN': '4 ఇటీవలి పాస్‌పోర్ట్ సైజు ఫోటోలు', 'kn-IN': '4 ಇತ್ತೀಚಿನ ಪಾಸ್‌ಪೋರ್ಟ್ ಗಾತ್ರದ ಫೋಟೋಗಳು', 'ml-IN': '4 സമീപകാല പാസ്‌പോർട്ട് സൈസ് ഫോട്ടോകൾ', 'bn-IN': '৪টি সাম্প্রতিক পাসপোর্ট সাইজের ছবি', 'gu-IN': '4 તાજેતરના પાસપોર્ટ સાઈઝ ફોટા', 'pa-IN': '4 ਹਾਲੀਆ ਪਾਸਪੋਰਟ ਸਾਈਜ਼ ਫੋਟੋਆਂ' }),
  ],
  senior: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'उम्र का प्रमाण — 60 साल से अधिक', 'mr-IN': 'वयाचा पुरावा — 60 वर्षांपेक्षा जास्त', 'en-IN': 'Proof of age — above 60 years', 'ta-IN': 'வயது சான்று — 60 வயதுக்கு மேல்', 'te-IN': 'వయస్సు రుజువు — 60 సంవత్సరాలకు పైన', 'kn-IN': 'ವಯಸ್ಸಿನ ಪುರಾವೆ — 60 ವರ್ಷಕ್ಕಿಂತ ಮೇಲ್ಪಟ್ಟು', 'ml-IN': 'വയസ്സ് തെളിവ് — 60 വയസ്സിന് മുകളിൽ', 'bn-IN': 'বয়সের প্রমাণ — ৬০ বছরের বেশি', 'gu-IN': 'ઉંમરનો પુરાવો — 60 વર્ષથી વધુ', 'pa-IN': 'ਉਮਰ ਦਾ ਸਬੂਤ — 60 ਸਾਲ ਤੋਂ ਵੱਧ' }),
    docName('age', '/docs/doc-birth-certificate.jpg', '#7C3AED', true, { 'hi-IN': 'जन्म प्रमाण पत्र या 10वीं मार्कशीट — ग्राम पंचायत से लें', 'mr-IN': 'जन्म दाखला किंवा 10वीची गुणपत्रिका — ग्रामपंचायतीकडून घ्या', 'en-IN': 'Birth certificate or 10th marksheet — get it from Gram Panchayat', 'ta-IN': 'பிறப்பு சான்றிதழ் அல்லது 10ஆம் வகுப்பு மார்க்ஷீட் — கிராம பஞ்சாயத்தில் இருந்து பெறவும்', 'te-IN': 'జనన ధృవీకరణ పత్రం లేదా 10వ తరగతి మార్క్‌షీట్ — గ్రామ పంచాయతీ నుండి పొందండి', 'kn-IN': 'ಜನನ ಪ್ರಮಾಣಪತ್ರ ಅಥವಾ 10ನೇ ತರಗತಿ ಅಂಕಪಟ್ಟಿ — ಗ್ರಾಮ ಪಂಚಾಯತ್‌ನಿಂದ ಪಡೆಯಿರಿ', 'ml-IN': 'ജനന സർട്ടിഫിക്കറ്റ് അല്ലെങ്കിൽ 10-ാം ക്ലാസ് മാർക്ക്ഷീറ്റ് — ഗ്രാമപഞ്ചായത്തിൽ നിന്ന് വാങ്ങുക', 'bn-IN': 'জন্ম সনদ বা ১০ম শ্রেণীর মার্কশিট — গ্রাম পঞ্চায়েত থেকে নিন', 'gu-IN': 'જન્મ પ્રમાણપત્ર અથવા 10મા ધોરણની માર્કશીટ — ગ્રામ પંચાયતમાંથી મેળવો', 'pa-IN': 'ਜਨਮ ਸਰਟੀਫਿਕੇਟ ਜਾਂ 10ਵੀਂ ਦੀ ਮਾਰਕਸ਼ੀਟ — ਗ੍ਰਾਮ ਪੰਚਾਇਤ ਤੋਂ ਲਓ' }),
    docName('ration', '/docs/doc-ration-card.jpg', '#DC2626', true, { 'hi-IN': 'BPL सूची में नाम होना ज़रूरी है', 'mr-IN': 'BPL यादीत नाव असणे आवश्यक आहे', 'en-IN': 'Name must be in the BPL list', 'ta-IN': 'BPL பட்டியலில் பெயர் இருக்க வேண்டும்', 'te-IN': 'BPL జాబితాలో పేరు ఉండాలి', 'kn-IN': 'BPL ಪಟ್ಟಿಯಲ್ಲಿ ಹೆಸರು ಇರಬೇಕು', 'ml-IN': 'BPL ലിസ്റ്റിൽ പേര് ഉണ്ടായിരിക്കണം', 'bn-IN': 'BPL তালিকায় নাম থাকতে হবে', 'gu-IN': 'BPL યાદીમાં નામ હોવું જોઈએ', 'pa-IN': 'BPL ਸੂਚੀ ਵਿੱਚ ਨਾਮ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': 'पेंशन इसी खाते में आएगी', 'mr-IN': 'निवृत्तीवेतन याच खात्यात येईल', 'en-IN': 'Pension will come into this account', 'ta-IN': 'ஓய்வூதியம் இந்த கணக்கில் வரும்', 'te-IN': 'పింఛను ఈ ఖాతాలోకి వస్తుంది', 'kn-IN': 'ಪಿಂಚಣಿ ಈ ಖಾತೆಗೆ ಬರುತ್ತದೆ', 'ml-IN': 'പെൻഷൻ ഈ അക്കൗണ്ടിലേക്ക് വരും', 'bn-IN': 'পেনশন এই অ্যাকাউন্টে আসবে', 'gu-IN': 'પેન્શન આ ખાતામાં આવશે', 'pa-IN': 'ਪੈਨਸ਼ਨ ਇਸ ਖਾਤੇ ਵਿੱਚ ਆਵੇਗੀ' }),
    docName('photo', '/docs/doc-passport-photo.jpg', '#0F766E', true, { 'hi-IN': '2 हाल की पासपोर्ट साइज़ फोटो', 'mr-IN': '2 अलीकडील पासपोर्ट साईज फोटो', 'en-IN': '2 recent passport size photos', 'ta-IN': '2 சமீபத்திய பாஸ்போர்ட் அளவு புகைப்படங்கள்', 'te-IN': '2 ఇటీవలి పాస్‌పోర్ట్ సైజు ఫోటోలు', 'kn-IN': '2 ಇತ್ತೀಚಿನ ಪಾಸ್‌ಪೋರ್ಟ್ ಗಾತ್ರದ ಫೋಟೋಗಳು', 'ml-IN': '2 സമീപകാല പാസ്‌പോർട്ട് സൈസ് ഫോട്ടോകൾ', 'bn-IN': '২টি সাম্প্রতিক পাসপোর্ট সাইজের ছবি', 'gu-IN': '2 તાજેતરના પાસપોર્ટ સાઈઝ ફોટા', 'pa-IN': '2 ਹਾਲੀਆ ਪਾਸਪੋਰਟ ਸਾਈਜ਼ ਫੋਟੋਆਂ' }),
  ],
  business: [
    docName('aadhaar', '/docs/doc-aadhaar.jpg', '#1565C0', true, { 'hi-IN': 'व्यापार मालिक का आधार', 'mr-IN': 'व्यवसाय मालकाचे आधार', 'en-IN': 'Aadhaar of the business owner', 'ta-IN': 'வணிக உரிமையாளரின் ஆதார்', 'te-IN': 'వ్యాపార యజమాని ఆధార్', 'kn-IN': 'ವ್ಯಾಪಾರ ಮಾಲೀಕರ ಆಧಾರ್', 'ml-IN': 'ബിസിനസ് ഉടമയുടെ ആധാർ', 'bn-IN': 'ব্যবসার মালিকের আধার', 'gu-IN': 'વ્યવસાય માલિકનું આધાર', 'pa-IN': 'ਕਾਰੋਬਾਰ ਦੇ ਮਾਲਕ ਦਾ ਆਧਾਰ' }),
    docName('pan', '/docs/doc-pan.jpg', '#D97706', true, { 'hi-IN': '1 लाख से अधिक के loan के लिए ज़रूरी', 'mr-IN': '₹1 लाखांपेक्षा जास्त कर्जासाठी आवश्यक', 'en-IN': 'Required for loans above ₹1 lakh', 'ta-IN': '₹1 லட்சத்திற்கு மேற்பட்ட கடனுக்கு அவசியம்', 'te-IN': '₹1 లక్ష కంటే ఎక్కువ రుణాలకు అవసరం', 'kn-IN': '₹1 ಲಕ್ಷಕ್ಕಿಂತ ಹೆಚ್ಚಿನ ಸಾಲಗಳಿಗೆ ಅಗತ್ಯ', 'ml-IN': '₹1 ലക്ഷത്തിന് മുകളിലുള്ള വായ്പകൾക്ക് ആവശ്യമാണ്', 'bn-IN': '₹১ লাখের বেশি ঋণের জন্য প্রয়োজন', 'gu-IN': '₹1 લાખથી વધુની લોન માટે જરૂરી', 'pa-IN': '₹1 ਲੱਖ ਤੋਂ ਵੱਧ ਦੇ ਕਰਜ਼ੇ ਲਈ ਜ਼ਰੂਰੀ' }),
    docName('passbook', '/docs/doc-bank-passbook.jpg', '#1A6B3C', true, { 'hi-IN': '6 महीने का statement भी चाहिए होगा', 'mr-IN': '6 महिन्यांचे स्टेटमेंटही लागेल', 'en-IN': 'A 6-month statement will also be needed', 'ta-IN': '6 மாத கணக்கு அறிக்கையும் தேவைப்படும்', 'te-IN': '6 నెలల స్టేట్‌మెంట్ కూడా అవసరం', 'kn-IN': '6 ತಿಂಗಳ ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಸಹ ಬೇಕಾಗುತ್ತದೆ', 'ml-IN': '6 മാസത്തെ സ്റ്റേറ്റ്മെന്റും ആവശ്യമായി വരും', 'bn-IN': '৬ মাসের স্টেটমেন্টও লাগবে', 'gu-IN': '6 મહિનાનું સ્ટેટમેન્ટ પણ જોઈશે', 'pa-IN': '6 ਮਹੀਨਿਆਂ ਦਾ ਸਟੇਟਮੈਂਟ ਵੀ ਚਾਹੀਦਾ ਹੋਵੇਗਾ' }),
    docName('business_reg', '/docs/doc-business-registration.jpg', '#0369A1', false, { 'hi-IN': 'Udyam Aadhar या Municipal Trade Licence', 'mr-IN': 'उद्यम आधार किंवा महानगरपालिका व्यापार परवाना', 'en-IN': 'Udyam Aadhaar or Municipal Trade Licence', 'ta-IN': 'உத்யம் ஆதார் அல்லது நகராட்சி வர்த்தக உரிமம்', 'te-IN': 'ఉద్యమ్ ఆధార్ లేదా మునిసిపల్ ట్రేడ్ లైసెన్స్', 'kn-IN': 'ಉದ್ಯಮ್ ಆಧಾರ್ ಅಥವಾ ಪುರಸಭೆ ವ್ಯಾಪಾರ ಪರವಾನಗಿ', 'ml-IN': 'ഉദ്യം ആധാർ അല്ലെങ്കിൽ മുനിസിപ്പൽ ട്രേഡ് ലൈസൻസ്', 'bn-IN': 'উদ্যম আধার বা পৌরসভা ট্রেড লাইসেন্স', 'gu-IN': 'ઉદ્યમ આધાર અથવા મ્યુનિસિપલ ટ્રેડ લાયસન્સ', 'pa-IN': 'ਉਦਯਮ ਆਧਾਰ ਜਾਂ ਮਿਉਂਸਪਲ ਟਰੇਡ ਲਾਇਸੈਂਸ' }),
    docName('photo', '/docs/doc-passport-photo.jpg', '#0F766E', true, { 'hi-IN': '2 हाल की पासपोर्ट साइज़ फोटो', 'mr-IN': '2 अलीकडील पासपोर्ट साईज फोटो', 'en-IN': '2 recent passport size photos', 'ta-IN': '2 சமீபத்திய பாஸ்போர்ட் அளவு புகைப்படங்கள்', 'te-IN': '2 ఇటీవలి పాస్‌పోర్ట్ సైజు ఫోటోలు', 'kn-IN': '2 ಇತ್ತೀಚಿನ ಪಾಸ್‌ಪೋರ್ಟ್ ಗಾತ್ರದ ಫೋಟೋಗಳು', 'ml-IN': '2 സമീപകാല പാസ്‌പോർട്ട് സൈസ് ഫോട്ടോകൾ', 'bn-IN': '২টি সাম্প্রতিক পাসপোর্ট সাইজের ছবি', 'gu-IN': '2 તાજેતરના પાસપોર્ટ સાઈઝ ફોટા', 'pa-IN': '2 ਹਾਲੀਆ ਪਾਸਪੋਰਟ ਸਾਈਜ਼ ਫੋਟੋਆਂ' }),
  ],
};

function getDocName(doc: DocumentItem, lang: UiLang): string {
  return doc.name[lang];
}
function getDocTip(doc: DocumentItem, lang: UiLang): string {
  return doc.tip[lang];
}

const visitScripts = {
  farmer: {
    hindi: 'नमस्ते। मुझे PM Kisan Samman Nidhi के लिए registration करवाना है। मैं एक किसान हूँ। कृपया New Farmer Registration में मदद करें।',
    marathi: 'नमस्कार। मला PM Kisan Samman Nidhi साठी registration करायचे आहे. मी एक शेतकरी आहे. कृपया New Farmer Registration मध्ये मदत करा.',
    english: 'Hello. I want to register for PM Kisan Samman Nidhi. I am a farmer. Please help me with New Farmer Registration.',
  },
  women: {
    hindi: 'नमस्ते। मुझे उज्ज्वला योजना के लिए आवेदन करना है। कृपया form भरने में मदद करें।',
    marathi: 'नमस्कार। मला उज्ज्वला योजनेसाठी अर्ज करायचा आहे. कृपया form भरण्यात मदत करा.',
    english: 'Hello. I want to apply for PM Ujjwala Yojana. Please help me fill the application form.',
  },
  student: {
    hindi: 'नमस्ते। मुझे PM Scholarship के लिए apply करना है। मैं अभी College में पढ़ता हूँ। कृपया मदद करें।',
    marathi: 'नमस्कार। मला PM Scholarship साठी apply करायचे आहे. मी सध्या College मध्ये शिकतो. कृपया मदत करा.',
    english: 'Hello. I want to apply for PM Scholarship. I am currently a college student. Please help me.',
  },
  housing: {
    hindi: 'नमस्ते। मुझे PM Awas Yojana के लिए registration करवाना है। कृपया form और process के बारे में बताएं।',
    marathi: 'नमस्कार। मला PM Awas Yojana साठी registration करायचे आहे. कृपया form आणि process बद्दल सांगा.',
    english: 'Hello. I want to register for PM Awas Yojana. Please tell me about the form and process.',
  },
  senior: {
    hindi: 'नमस्ते। मुझे वृद्धावस्था पेंशन और Ayushman Card के लिए apply करना है। कृपया मदद करें।',
    marathi: 'नमस्कार। मला वृद्धापकाळ निवृत्तीवेतन आणि Ayushman Card साठी apply करायचे आहे. कृपया मदत करा.',
    english: 'Hello. I want to apply for old age pension and Ayushman Card. Please help me.',
  },
  business: {
    hindi: 'नमस्ते। मुझे Mudra Loan के लिए apply करना है। मेरा छोटा व्यापार है। कृपया process बताएं।',
    marathi: 'नमस्कार। मला Mudra Loan साठी apply करायचे आहे. माझा लहान व्यवसाय आहे. कृपया process सांगा.',
    english: 'Hello. I want to apply for Mudra Loan. I have a small business. Please explain the process.',
  },
};

const docLocationMap: Record<string, Record<UiLang, string>> = {
  aadhaar: { 'hi-IN': 'आधार केंद्र या Post Office', 'mr-IN': 'आधार केंद्र किंवा पोस्ट ऑफिस', 'en-IN': 'Aadhaar Centre or Post Office', 'ta-IN': 'ஆதார் மையம் அல்லது Post Office', 'te-IN': 'ఆధార్ కేంద్రం లేదా Post Office', 'kn-IN': 'ಆಧಾರ್ ಕೇಂದ್ರ ಅಥವಾ Post Office', 'ml-IN': 'ആധാർ കേന്ദ്രം അല്ലെങ്കിൽ Post Office', 'bn-IN': 'আধার কেন্দ্র বা Post Office', 'gu-IN': 'આધાર કેન્દ્ર અથવા Post Office', 'pa-IN': 'ਆਧਾਰ ਕੇਂਦਰ ਜਾਂ Post Office' },
  passbook: { 'hi-IN': 'नज़दीकी बैंक शाखा', 'mr-IN': 'जवळची बँक शाखा', 'en-IN': 'Nearest bank branch', 'ta-IN': 'அருகிலுள்ள வங்கி கிளை', 'te-IN': 'సమీప బ్యాంక్ శాఖ', 'kn-IN': 'ಹತ್ತಿರದ ಬ್ಯಾಂಕ್ ಶಾಖೆ', 'ml-IN': 'അടുത്തുള്ള ബാങ്ക് ശാഖ', 'bn-IN': 'নিকটবর্তী ব্যাংক শাখা', 'gu-IN': 'નજીકની બેંક શાખા', 'pa-IN': 'ਨਜ਼ਦੀਕੀ ਬੈਂਕ ਸ਼ਾਖਾ' },
  khasra: { 'hi-IN': 'पटवारी कार्यालय या तहसील', 'mr-IN': 'तलाठी कार्यालय किंवा तहसील', 'en-IN': 'Patwari office or Tehsil office', 'ta-IN': 'பட்வாரி அலுவலகம் அல்லது தாலுகா அலுவலகம்', 'te-IN': 'పట్వారీ కార్యాలయం లేదా తహసీల్ కార్యాలయం', 'kn-IN': 'ಪಟವಾರಿ ಕಚೇರಿ ಅಥವಾ ತಹಸೀಲ್ ಕಚೇರಿ', 'ml-IN': 'പട്വാരി ഓഫീസ് അല്ലെങ്കിൽ തഹസിൽ ഓഫീസ്', 'bn-IN': 'পাটোয়ারি অফিস বা তহসিল অফিস', 'gu-IN': 'પટવારી કચેરી અથવા તહસીલ કચેરી', 'pa-IN': 'ਪਟਵਾਰੀ ਦਫ਼ਤਰ ਜਾਂ ਤਹਿਸੀਲ ਦਫ਼ਤਰ' },
  ration: { 'hi-IN': 'ग्राम पंचायत या राशन दुकान', 'mr-IN': 'ग्रामपंचायत किंवा रेशन दुकान', 'en-IN': 'Gram Panchayat or ration shop', 'ta-IN': 'கிராம பஞ்சாயத்து அல்லது ரேஷன் கடை', 'te-IN': 'గ్రామ పంచాయతీ లేదా రేషన్ దుకాణం', 'kn-IN': 'ಗ್ರಾಮ ಪಂಚಾಯತ್ ಅಥವಾ ರೇಷನ್ ಅಂಗಡಿ', 'ml-IN': 'ഗ്രാമപഞ്ചായത്ത് അല്ലെങ്കിൽ റേഷൻ കട', 'bn-IN': 'গ্রাম পঞ্চায়েত বা রেশন দোকান', 'gu-IN': 'ગ્રામ પંચાયત અથવા રેશન દુકાન', 'pa-IN': 'ਗ੍ਰਾਮ ਪੰਚਾਇਤ ਜਾਂ ਰਾਸ਼ਨ ਦੀ ਦੁਕਾਨ' },
  income: { 'hi-IN': 'तहसील कार्यालय', 'mr-IN': 'तहसील कार्यालय', 'en-IN': 'Tehsil office', 'ta-IN': 'தாலுகா அலுவலகம்', 'te-IN': 'తహసీల్ కార్యాలయం', 'kn-IN': 'ತಹಸೀಲ್ ಕಚೇರಿ', 'ml-IN': 'തഹസിൽ ഓഫീസ്', 'bn-IN': 'তহসিল অফিস', 'gu-IN': 'તહસીલ કચેરી', 'pa-IN': 'ਤਹਿਸੀਲ ਦਫ਼ਤਰ' },
  mobile: { 'hi-IN': 'आधार केंद्र — आधार update के लिए', 'mr-IN': 'आधार केंद्र — आधार अपडेटसाठी', 'en-IN': 'Aadhaar Centre — to update Aadhaar', 'ta-IN': 'ஆதார் மையம் — ஆதார் புதுப்பிக்க', 'te-IN': 'ఆధార్ కేంద్రం — ఆధార్ అప్‌డేట్ కోసం', 'kn-IN': 'ಆಧಾರ್ ಕೇಂದ್ರ — ಆಧಾರ್ ಅಪ್‌ಡೇಟ್‌ಗಾಗಿ', 'ml-IN': 'ആധാർ കേന്ദ്രം — ആധാർ അപ്ഡേറ്റ് ചെയ്യാൻ', 'bn-IN': 'আধার কেন্দ্র — আধার আপডেটের জন্য', 'gu-IN': 'આધાર કેન્દ્ર — આધાર અપડેટ માટે', 'pa-IN': 'ਆਧਾਰ ਕੇਂਦਰ — ਆਧਾਰ ਅੱਪਡੇਟ ਲਈ' },
  photo: { 'hi-IN': 'नज़दीकी फोटो स्टूडियो', 'mr-IN': 'जवळचा फोटो स्टुडिओ', 'en-IN': 'Nearest photo studio', 'ta-IN': 'அருகிலுள்ள போட்டோ ஸ்டுடியோ', 'te-IN': 'సమీప ఫోటో స్టూడియో', 'kn-IN': 'ಹತ್ತಿರದ ಫೋಟೋ ಸ್ಟುಡಿಯೋ', 'ml-IN': 'അടുത്തുള്ള ഫോട്ടോ സ്റ്റുഡിയോ', 'bn-IN': 'নিকটবর্তী ফটো স্টুডিও', 'gu-IN': 'નજીકનો ફોટો સ્ટુડિયો', 'pa-IN': 'ਨਜ਼ਦੀਕੀ ਫੋਟੋ ਸਟੂਡੀਓ' },
  marksheet: { 'hi-IN': 'स्कूल या कॉलेज से', 'mr-IN': 'शाळा किंवा कॉलेजमधून', 'en-IN': 'From your school or college', 'ta-IN': 'உங்கள் பள்ளி அல்லது கல்லூரியில் இருந்து', 'te-IN': 'మీ పాఠశాల లేదా కళాశాల నుండి', 'kn-IN': 'ನಿಮ್ಮ ಶಾಲೆ ಅಥವಾ ಕಾಲೇಜಿನಿಂದ', 'ml-IN': 'നിങ്ങളുടെ സ്കൂൾ അല്ലെങ്കിൽ കോളേജിൽ നിന്ന്', 'bn-IN': 'আপনার স্কুল বা কলেজ থেকে', 'gu-IN': 'તમારી શાળા અથવા કોલેજમાંથી', 'pa-IN': 'ਤੁਹਾਡੇ ਸਕੂਲ ਜਾਂ ਕਾਲਜ ਤੋਂ' },
  bonafide: { 'hi-IN': 'कॉलेज प्रशासन से', 'mr-IN': 'कॉलेज प्रशासनाकडून', 'en-IN': 'From your college administration', 'ta-IN': 'உங்கள் கல்லூரி நிர்வாகத்தில் இருந்து', 'te-IN': 'మీ కళాశాల పరిపాలన నుండి', 'kn-IN': 'ನಿಮ್ಮ ಕಾಲೇಜು ಆಡಳಿತದಿಂದ', 'ml-IN': 'നിങ്ങളുടെ കോളേജ് അഡ്മിനിസ്ട്രേഷനിൽ നിന്ന്', 'bn-IN': 'আপনার কলেজ প্রশাসন থেকে', 'gu-IN': 'તમારા કોલેજ વહીવટીતંત્રમાંથી', 'pa-IN': 'ਤੁਹਾਡੇ ਕਾਲਜ ਪ੍ਰਸ਼ਾਸਨ ਤੋਂ' },
  pan: { 'hi-IN': 'NSDL वेबसाइट या Post Office', 'mr-IN': 'NSDL वेबसाइट किंवा पोस्ट ऑफिस', 'en-IN': 'NSDL website or Post Office', 'ta-IN': 'NSDL வலைத்தளம் அல்லது Post Office', 'te-IN': 'NSDL వెబ్‌సైట్ లేదా Post Office', 'kn-IN': 'NSDL ವೆಬ್‌ಸೈಟ್ ಅಥವಾ Post Office', 'ml-IN': 'NSDL വെബ്സൈറ്റ് അല്ലെങ്കിൽ Post Office', 'bn-IN': 'NSDL ওয়েবসাইট বা Post Office', 'gu-IN': 'NSDL વેબસાઇટ અથવા Post Office', 'pa-IN': 'NSDL ਵੈੱਬਸਾਈਟ ਜਾਂ Post Office' },
  age: { 'hi-IN': 'ग्राम पंचायत या नगर पालिका', 'mr-IN': 'ग्रामपंचायत किंवा नगरपालिका', 'en-IN': 'Gram Panchayat or municipal office', 'ta-IN': 'கிராம பஞ்சாயத்து அல்லது நகராட்சி அலுவலகம்', 'te-IN': 'గ్రామ పంచాయతీ లేదా మునిసిపల్ కార్యాలయం', 'kn-IN': 'ಗ್ರಾಮ ಪಂಚಾಯತ್ ಅಥವಾ ಪುರಸಭೆ ಕಚೇರಿ', 'ml-IN': 'ഗ്രാമപഞ്ചായത്ത് അല്ലെങ്കിൽ മുനിസിപ്പൽ ഓഫീസ്', 'bn-IN': 'গ্রাম পঞ্চায়েত বা পৌরসভা অফিস', 'gu-IN': 'ગ્રામ પંચાયત અથવા નગરપાલિકા કચેરી', 'pa-IN': 'ਗ੍ਰਾਮ ਪੰਚਾਇਤ ਜਾਂ ਨਗਰ ਪਾਲਿਕਾ ਦਫ਼ਤਰ' },
  marriage: { 'hi-IN': 'तहसील कार्यालय', 'mr-IN': 'तहसील कार्यालय', 'en-IN': 'Tehsil office', 'ta-IN': 'தாலுகா அலுவலகம்', 'te-IN': 'తహసీల్ కార్యాలయం', 'kn-IN': 'ತಹಸೀಲ್ ಕಚೇರಿ', 'ml-IN': 'തഹസിൽ ഓഫീസ്', 'bn-IN': 'তহসিল অফিস', 'gu-IN': 'તહસીલ કચેરી', 'pa-IN': 'ਤਹਿਸੀਲ ਦਫ਼ਤਰ' },
  business_reg: { 'hi-IN': 'udyamregistration.gov.in पर', 'mr-IN': 'udyamregistration.gov.in वर', 'en-IN': 'At udyamregistration.gov.in', 'ta-IN': 'udyamregistration.gov.in இல்', 'te-IN': 'udyamregistration.gov.in వద్ద', 'kn-IN': 'udyamregistration.gov.in ನಲ್ಲಿ', 'ml-IN': 'udyamregistration.gov.in ൽ', 'bn-IN': 'udyamregistration.gov.in এ', 'gu-IN': 'udyamregistration.gov.in પર', 'pa-IN': "udyamregistration.gov.in 'ਤੇ" },
  default: { 'hi-IN': 'नज़दीकी सरकारी कार्यालय', 'mr-IN': 'जवळचे सरकारी कार्यालय', 'en-IN': 'Nearest government office', 'ta-IN': 'அருகிலுள்ள அரசு அலுவலகம்', 'te-IN': 'సమీప ప్రభుత్వ కార్యాలయం', 'kn-IN': 'ಹತ್ತಿರದ ಸರ್ಕಾರಿ ಕಚೇರಿ', 'ml-IN': 'അടുത്തുള്ള സർക്കാർ ഓഫീസ്', 'bn-IN': 'নিকটবর্তী সরকারি অফিস', 'gu-IN': 'નજીકની સરકારી કચેરી', 'pa-IN': 'ਨਜ਼ਦੀਕੀ ਸਰਕਾਰੀ ਦਫ਼ਤਰ' },
};

type DocumentItem = (typeof documentData)[SchemeCategory][number];

function getSchemesForQuery(query: string): SchemeCategory {
  const q = query.toLowerCase();
  if (q.includes('किसान') || q.includes('kisan') || q.includes('farmer') || q.includes('खेती') || q.includes('fasal') || q.includes('फसल') || q.includes('किसान कर्ज़') || q.includes('शेतकरी') || q.includes('शेती')) return 'farmer';
  if (q.includes('महिला') || q.includes('women') || q.includes('woman') || q.includes('widow') || q.includes('विधवा') || q.includes('beti') || q.includes('maternity') || q.includes('घरासाठी') || q.includes('मुलगी')) return 'women';
  if (q.includes('student') || q.includes('छात्र') || q.includes('पढ़ाई') || q.includes('scholarship') || q.includes('शिक्षा') || q.includes('education') || q.includes('बच्चों की पढ़ाई') || q.includes('विद्यार्थी') || q.includes('शिक्षण') || q.includes('मुलांचे')) return 'student';
  if (q.includes('घर') || q.includes('housing') || q.includes('awas') || q.includes('home') || q.includes('makaan') || q.includes('घर की मदद') || q.includes('घरासाठी मदत')) return 'housing';
  if (q.includes('pension') || q.includes('पेंशन') || q.includes('बुज़ुर्ग') || q.includes('senior') || q.includes('old age') || q.includes('ज्येष्ठ') || q.includes('वृद्ध')) return 'senior';
  if (q.includes('business') || q.includes('loan') || q.includes('mudra') || q.includes('कर्ज़') || q.includes('उद्योग') || q.includes('कर्ज') || q.includes('व्यवसाय')) return 'business';
  if (q.includes('दवाइयाँ') || q.includes('health') || q.includes('hospital') || q.includes('ayushman') || q.includes('इलाज') || q.includes('औषध') || q.includes('आरोग्य')) return 'senior';
  return 'farmer';
}

type AddMsgFn = (msg: Omit<Message, 'id'> & { id?: number }) => void;

function DocVisualCard({
  doc,
  status,
  onMark,
  addMsg,
  getTime,
  ui,
  resp,
  lang,
  readinessResult,
  onOpenCheck,
}: {
  doc: DocumentItem;
  status: DocCheckStatus;
  onMark: (docId: string, answer: 'yes' | 'no') => void;
  addMsg: AddMsgFn;
  getTime: () => string;
  ui: UiStringsBundle;
  resp: typeof botResponses[UiLang];
  lang: UiLang;
  readinessResult?: DocumentReadinessResult;
  onOpenCheck: (docId: string) => void;
}) {
  const borderColor = status === 'yes' ? '#1A6B3C' : status === 'no' ? '#DC2626' : '#E7E0D8';
  const nameColor = status === 'yes' ? '#1A6B3C' : status === 'no' ? '#DC2626' : '#1C1917';
  const docName = getDocName(doc, lang);
  const docTip = getDocTip(doc, lang);
  const firstChar = Array.from(docName)[0] ?? '?';

  const handleWhereClick = () => {
    const locMap = docLocationMap[doc.id] ?? docLocationMap.default;
    const loc = locMap[lang] ?? locMap['hi-IN'];
    addMsg({ type: 'bot', text: resp.docWhere(loc), timestamp: getTime() });
  };

  return (
    <div
      className="w-[155px] shrink-0 rounded-[10px] overflow-hidden cursor-pointer transition-[border-color,transform] duration-200 hover:-translate-y-0.5"
      style={{ borderWidth: 2, borderStyle: 'solid', borderColor }}
    >
      <div className="relative overflow-hidden w-full h-[110px]" style={{ backgroundColor: `${doc.fallbackColor}26` }}>
        <div className="absolute inset-0 flex items-center justify-center h-[110px]" style={{ backgroundColor: doc.fallbackColor }}>
          <span className="text-[40px] font-bold text-white" style={{ fontFamily: 'serif' }}>
            {firstChar}
          </span>
        </div>
        <img
          src={doc.imgSrc}
          alt={docName}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
        />
        <div className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-white">
          {status === 'yes' && (
            <span className="w-[22px] h-[22px] rounded-full bg-[#1A6B3C] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="2,6 5,9 10,3" />
              </svg>
            </span>
          )}
          {status === 'no' && (
            <span className="w-[22px] h-[22px] rounded-full bg-[#DC2626] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </span>
          )}
          {status === 'unchecked' && (
            <span className="w-[22px] h-[22px] rounded-full bg-[rgba(0,0,0,0.15)] flex items-center justify-center text-[10px] text-white font-bold">?</span>
          )}
        </div>
      </div>
      <div className="px-[9px] py-2">
        <span className="text-[12px] font-extrabold block mb-px" style={{ color: nameColor }}>
          {docName}
        </span>
        <span className="text-[9px] text-[#78716C] leading-[1.4] block mb-1.5">{docTip}</span>
        {doc.required && (
          <div className="flex items-center gap-1 mb-1">
            <span className="w-1 h-1 rounded-full bg-[#DC2626]" />
            <span className="text-[8px] text-[#DC2626]">{ui.required}</span>
          </div>
        )}
        {status === 'unchecked' && (
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] rounded-md py-1 px-1 text-[10px] font-bold hover:bg-[#1A6B3C] hover:text-white"
              onClick={() => onMark(doc.id, 'yes')}
            >
              {ui.hasIt}
            </button>
            <button
              type="button"
              className="flex-1 bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded-md py-1 px-1 text-[10px] font-bold hover:bg-[#DC2626] hover:text-white"
              onClick={() => onMark(doc.id, 'no')}
            >
              {ui.noIt}
            </button>
          </div>
        )}
        {status === 'yes' && (
          <div className="space-y-1">
            <div className="text-center py-1.5 text-[11px] text-[#15803D] font-bold bg-[#F0FDF4] border border-[#BBF7D0] rounded-md">{ui.readyStrip}</div>
            {readinessResult ? (
              <button
                type="button"
                onClick={() => onOpenCheck(doc.id)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-md border"
                style={{
                  color: readinessResult.status === 'ready' ? '#15803D' : readinessResult.status === 'unclear' ? '#78716C' : '#B45309',
                  borderColor: readinessResult.status === 'ready' ? '#BBF7D0' : readinessResult.status === 'unclear' ? '#E7E0D8' : '#FDE68A',
                  background: readinessResult.status === 'ready' ? '#F0FDF4' : readinessResult.status === 'unclear' ? '#F4F1EC' : '#FFFBEB',
                }}
              >
                <ScanLine size={11} aria-hidden="true" />
                {drt(DR.status[readinessResult.status], lang)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenCheck(doc.id)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-md border border-[#FED7AA] bg-[#FFF8F1] text-[#C2570A] hover:bg-[#FFEEDC]"
              >
                <ScanLine size={11} aria-hidden="true" />
                {drt(DR.common.checkDocument, lang)}
              </button>
            )}
          </div>
        )}
        {status === 'no' && (
          <button type="button" className="w-full text-center py-1.5 text-[11px] text-[#DC2626] font-bold bg-[#FEF2F2] border border-[#FECACA] rounded-md cursor-pointer" onClick={handleWhereClick}>
            {ui.notHave}
          </button>
        )}
      </div>
    </div>
  );
}

function DocCheckCard({
  category,
  docCheckState,
  setDocCheckState,
  findNearestCSC,
  addMsg,
  getTime,
  scriptLang,
  setScriptLang,
  ui,
  resp,
  lang,
}: {
  category: SchemeCategory;
  docCheckState: Record<string, DocCheckStatus>;
  setDocCheckState: Dispatch<SetStateAction<Record<string, DocCheckStatus>>>;
  findNearestCSC: () => void;
  addMsg: AddMsgFn;
  getTime: () => string;
  scriptLang: ScriptLang;
  setScriptLang: Dispatch<SetStateAction<ScriptLang>>;
  ui: UiStringsBundle;
  resp: typeof botResponses[UiLang];
  lang: UiLang;
}) {
  const docs = documentData[category] || documentData.farmer;
  const checkedCount = Object.values(docCheckState).filter((v) => v === 'yes').length;
  const totalCount = docs.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const allAnswered = docs.every((d) => docCheckState[d.id] && docCheckState[d.id] !== 'unchecked');
  const missingDocs = docs.filter((d) => docCheckState[d.id] === 'no');
  const allReady = allAnswered && missingDocs.length === 0;

  const handleMark = (docId: string, answer: 'yes' | 'no') => {
    setDocCheckState((prev) => ({ ...prev, [docId]: answer }));
  };

  const scriptText =
    visitScripts[category]?.[scriptLang] ?? visitScripts.farmer.hindi;

  // Document Readiness Check (OCR-based) — layered on top of the existing Yes/No checklist above.
  const [readinessResults, setReadinessResults] = useState<Partial<Record<string, DocumentReadinessResult>>>({});
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');

  const openDoc = docs.find((d) => d.id === openDocId) ?? null;

  const nameComparisons: NameComparison[] = docs
    .map((d) => ({ doc: d, result: readinessResults[d.id] }))
    .filter((x): x is { doc: DocumentItem; result: DocumentReadinessResult } => !!x.result && !!x.result.extractedName)
    .map(({ doc, result }) => {
      const cmp = compareNames(userName, result.extractedName);
      return { documentType: mapSimpleDocIdToType(doc.id), extractedName: result.extractedName ?? '', label: cmp.label, similarity: cmp.similarity };
    });

  const checkedDocsForScore = docs.filter((d) => docCheckState[d.id] === 'yes');
  const anyReadinessChecked = checkedDocsForScore.some((d) => readinessResults[d.id]);

  const simpleScore: ReadinessScoreOutput = (() => {
    let score = 100;
    let ready = 0, attention = 0, checkedN = 0;
    checkedDocsForScore.forEach((d) => {
      const r = readinessResults[d.id];
      if (!r) { score -= 20; return; }
      checkedN++;
      if (r.status === 'ready') { ready++; return; }
      attention++;
      if (r.status === 'unclear' || r.status === 'error') { score -= 10; return; }
      r.issues.forEach((issue) => {
        score -= issue.code === 'doc_type_mismatch' ? 20 : issue.code === 'certificate_outdated' ? 15 : issue.severity === 'critical' ? 10 : 5;
      });
    });
    score -= nameComparisons.filter((c) => c.label === 'mismatch').length * 15;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const band: ReadinessScoreOutput['band'] = score >= 80 ? 'ready' : score >= 55 ? 'review' : 'fix';
    return { score, band, documentsRequired: checkedDocsForScore.length, documentsChecked: checkedN, documentsReady: ready, documentsNeedingAttention: attention };
  })();

  return (
    <div className="self-start w-full max-w-[680px]">
      <div className="bg-[#1A6B3C] rounded-t-xl py-3 px-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.2)] flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="8" y1="12" x2="14" y2="12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white">{ui.docCheckTitle}</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.65)]">{ui.progressLabel(checkedCount, totalCount)}</div>
        </div>
        <div className="w-20 h-1 rounded-sm bg-[rgba(255,255,255,0.2)] shrink-0 overflow-hidden">
          <div className="h-full rounded-sm bg-[#4ADE80] transition-[width] duration-300 ease-out" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-b-xl border-[1.5px] border-t-0 border-[#E7E0D8] p-4">
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] py-2 px-2.5 flex gap-1.5 items-start mb-2.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <p className="text-[11px] text-[#92400E] leading-[1.5]">{ui.warningNote}</p>
        </div>

        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[7px] py-2 px-2.5 mb-3.5">
          <p className="text-[10px] text-[#1D4ED8] leading-[1.5]">{drt(DR.common.purposeStatement, lang)}</p>
          <p className="text-[10px] text-[#1D4ED8] leading-[1.5] mt-1 opacity-80">{drt(DR.common.safetyNotice, lang)}</p>
        </div>

        <div className="doc-scroll flex gap-2.5 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {docs.map((doc) => (
            <DocVisualCard
              key={doc.id}
              doc={doc}
              status={docCheckState[doc.id] ?? 'unchecked'}
              onMark={handleMark}
              addMsg={addMsg}
              getTime={getTime}
              ui={ui}
              resp={resp}
              lang={lang}
              readinessResult={readinessResults[doc.id]}
              onOpenCheck={setOpenDocId}
            />
          ))}
        </div>

        {anyReadinessChecked && (
          <div className="space-y-2.5 mt-3">
            <NameConsistencyCard lang={lang} profileName={userName || '—'} comparisons={nameComparisons} compact />
            <ReadinessSummary lang={lang} score={simpleScore} compact />
          </div>
        )}

        <Dialog open={!!openDocId} onOpenChange={(open) => !open && setOpenDocId(null)}>
          <DialogContent className="max-w-[420px] max-h-[85vh] overflow-y-auto bg-white p-5">
            <DialogHeader>
              <DialogTitle className="sr-only">{openDoc ? getDocName(openDoc, lang) : drt(DR.common.title, lang)}</DialogTitle>
            </DialogHeader>
            {openDoc && (
              <DocumentReadinessCheck
                key={openDoc.id}
                lang={lang}
                documentType={mapSimpleDocIdToType(openDoc.id)}
                displayLabel={getDocName(openDoc, lang)}
                expectedProfileName={userName || undefined}
                onProfileNameProvided={setUserName}
                compact
                initialResult={readinessResults[openDoc.id] ?? null}
                onResult={(result) => {
                  setReadinessResults((prev) => {
                    const next = { ...prev };
                    if (result) next[openDoc.id] = result;
                    else delete next[openDoc.id];
                    return next;
                  });
                }}
                inputIdPrefix={`simple-${openDoc.id}`}
              />
            )}
          </DialogContent>
        </Dialog>

        {allAnswered && (
          <>
            <div className="h-px bg-[#E7E0D8] my-3" />
            {allReady ? (
              <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-[10px] p-3.5">
                <div className="text-[17px] font-bold text-[#1A6B3C] mb-1" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  {ui.allReady}
                </div>
                <div className="text-[12px] text-[#57534E] mb-2.5">{ui.allReadySub}</div>
                <div className="space-y-1.5 mb-2.5">
                  {docs
                    .filter((d) => docCheckState[d.id] === 'yes')
                    .map((d) => (
                      <div key={d.id} className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full bg-[#1A6B3C] flex items-center justify-center shrink-0">
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                            <polyline points="1 5 4 8 9 2" />
                          </svg>
                        </span>
                        <span className="text-[12px] text-[#15803D] font-semibold">{getDocName(d, lang)}</span>
                      </div>
                    ))}
                </div>
                <button type="button" className="w-full bg-[#1A6B3C] text-white rounded-[9px] py-2.5 text-[13px] font-bold border-none cursor-pointer" onClick={findNearestCSC}>
                  {ui.findCSCMaps}
                </button>

                <div className="bg-[#1C1917] rounded-[10px] p-3.5 mt-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="text-[10px] uppercase text-[rgba(255,255,255,0.45)] tracking-[0.07em]">{ui.cscSays}</span>
                  </div>
                  <p className="text-[13px] text-[rgba(255,255,255,0.82)] leading-[1.65] italic my-2.5">{scriptText}</p>
                  <div className="flex gap-1.5 mb-2.5">
                    {(['hindi', 'marathi', 'english'] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={`text-[10px] font-bold py-0.5 px-2.5 rounded-[3px] border-none cursor-pointer ${scriptLang === lang ? 'bg-[#E8690B] text-white' : 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.35)]'}`}
                        style={{ fontFamily: 'var(--font-mukta)' }}
                        onClick={() => setScriptLang(lang)}
                      >
                        {lang === 'hindi' ? 'हिंदी' : lang === 'marathi' ? 'मराठी' : 'English'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="w-full bg-[#25D366] text-white rounded-lg py-2 text-[12px] font-bold border-none cursor-pointer flex items-center justify-center gap-1.5"
                    onClick={() => {
                      const script = visitScripts[category]?.[scriptLang] ?? visitScripts.farmer.hindi;
                      window.open(`https://wa.me/?text=${encodeURIComponent(script)}`, '_blank');
                    }}
                  >
                    <svg viewBox="0 0 32 32" width="14" height="14" fill="white">
                      <path d="M16.04 3.2C8.95 3.2 3.2 8.95 3.2 16.04c0 2.27.6 4.47 1.74 6.4L3.2 28.8l6.55-1.7a12.73 12.73 0 0 0 6.29 1.64c7.09 0 12.84-5.75 12.84-12.84S23.13 3.2 16.04 3.2z" />
                    </svg>
                    {ui.sendWhatsApp}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] p-3.5">
                <div className="text-[17px] font-bold text-[#D97706] mb-1" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                  {ui.notReady}
                </div>
                <div className="text-[12px] text-[#57534E] mb-2.5">{ui.missingDocs(missingDocs.length)}</div>
                <ul className="space-y-1.5 mb-2.5">
                  {missingDocs.map((d) => (
                    <li key={d.id} className="flex items-start gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="shrink-0 mt-0.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      </svg>
                      <span className="text-[12px] text-[#92400E] font-bold">
                        {getDocName(d, lang)}
                        <span className="text-[11px] text-[#A8A29E] font-normal">
                          {' '}
                          → {(docLocationMap[d.id] ?? docLocationMap.default)[lang]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="w-full bg-[#D97706] text-white rounded-[9px] py-2.5 text-[13px] font-bold border-none cursor-pointer"
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/${encodeURIComponent((docLocationMap[missingDocs[0].id] ?? docLocationMap.default)[lang])}`,
                      '_blank'
                    )
                  }
                >
                  {ui.findOnMaps}
                </button>
                <button
                  type="button"
                  className="w-full bg-white text-[#1A6B3C] border border-[#BBF7D0] rounded-[9px] py-2 text-[12px] font-bold cursor-pointer mt-1.5"
                  onClick={findNearestCSC}
                >
                  {ui.goAnyway}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Waveform({ isRecording }: { isRecording: boolean }) {
  const bars = [8, 12, 18, 24, 18, 12, 8, 14];
  return (
    <div className="flex items-center gap-1">
      {bars.map((h, i) => (
        <div
          key={`wave-${h}-${i}`}
          className="w-[3px] rounded-[3px] animate-[waveScale_1s_ease-in-out_infinite_alternate]"
          style={{ 
            height: `${h}px`, 
            animationDelay: `${[0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1][i]}s`, 
            backgroundColor: isRecording ? '#1A6B3C' : '#E7E0D8' 
          }}
        />
      ))}
    </div>
  );
}

export default function SimpleModePage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const msgIdRef = useRef(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationStage, setConversationStage] = useState<ConversationStage>('greeting');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [docCheckState, setDocCheckState] = useState<Record<string, DocCheckStatus>>({});
  const [docCheckCategory, setDocCheckCategory] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [selectedLang, setSelectedLang] = useState<UiLang>('hi-IN');
  const [showPincodeInput, setShowPincodeInput] = useState(false);
  const [pincodeText, setPincodeText] = useState('');
  const [scriptLang, setScriptLang] = useState<ScriptLang>('hindi');
  const [schemeDetailsCache, setSchemeDetailsCache] = useState<Record<string, ApiSchemeDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const autoSpeakRef = useRef(autoSpeak);
  const selectedLangRef = useRef(selectedLang);
  const hasSpokenGreetingRef = useRef(false);
  const greetingStartedRef = useRef(false);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!hasSpokenGreetingRef.current) {
        hasSpokenGreetingRef.current = true;
        const lang = selectedLangRef.current as UiLang;
        const g = greetings[lang];
        speak(g.msg1, lang);
        setTimeout(() => speak(g.msg2, lang), 3000);
      }
    };
    window.addEventListener('click', handleFirstInteraction, { once: true });
    window.addEventListener('touchstart', handleFirstInteraction, { once: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  const nextId = () => {
    msgIdRef.current += 1;
    return msgIdRef.current;
  };

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  const speakGreetingIfNeeded = useCallback(() => {
    if (!hasSpokenGreetingRef.current) {
      hasSpokenGreetingRef.current = true;
      const lang = selectedLangRef.current as UiLang;
      const g = greetings[lang];
      speak(g.msg1, lang);
      setTimeout(() => speak(g.msg2, lang), 2800);
    }
  }, []);

  const matchedSchemes = useMemo(() => {
    const lastSchemes = [...messages].reverse().find((m) => m.type === 'schemes' && m.schemes);
    return lastSchemes?.schemes ?? [];
  }, [messages]);

  const addMsg = useCallback((partial: Omit<Message, 'id'> & { id?: number }) => {
    const newMsg = { ...partial, id: nextId() };
    setMessages(prev => [...prev, newMsg]);
    if (newMsg.type === 'bot' && newMsg.text) {
      const textToSpeak = newMsg.text;
      setTimeout(() => {
        if (autoSpeakRef.current && selectedLangRef.current) {
          speak(textToSpeak, selectedLangRef.current as UiLang);
        }
      }, 400);
    }
  }, []);

  const startGreeting = useCallback(() => {
    const t1 = setTimeout(() => {
      const lang = selectedLangRef.current;
      const g = greetings[lang];
      const msg1 = { type: 'bot' as const, isHindi: true, text: g.msg1, timestamp: getTime() };
      setMessages((prev) => [...prev, { ...msg1, id: nextId() }]);
    }, 600);
    const t2 = setTimeout(() => {
      const lang = selectedLangRef.current;
      const g = greetings[lang];
      const msg2text = g.msg2;
      const msg2 = { type: 'bot' as const, text: msg2text, showChips: true, timestamp: getTime() };
      setMessages((prev) => [...prev, { ...msg2, id: nextId() }]);
      setConversationStage('waiting');
    }, 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const conversationStageRef = useRef(conversationStage);
  useEffect(() => {
    conversationStageRef.current = conversationStage;
  }, [conversationStage]);

  useEffect(() => {
  selectedLangRef.current = selectedLang;
}, [selectedLang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
  if (!greetingStartedRef.current) {
    greetingStartedRef.current = true;
    startGreeting();
  }
}, [startGreeting]);

  const findNearestCSC = useCallback(() => {
    const lang = selectedLangRef.current as UiLang;
    const resp = botResponses[lang];
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const url = 'https://www.google.com/maps/search/Common+Service+Centre+CSC/@' + lat + ',' + lng + ',14z';
          window.open(url, '_blank');
          addMsg({ type: 'bot', text: resp.cscOpened, timestamp: getTime() });
        },
        () => {
          setShowPincodeInput(true);
          addMsg({ type: 'bot', text: resp.locationDenied, timestamp: getTime() });
        }
      );
    } else {
      window.open('https://www.google.com/maps/search/Common+Service+Centre+CSC', '_blank');
    }
  }, [addMsg]);

  const handleSend = useCallback(async (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return
  setInputText('')
  addMsg({ type: 'user', text: trimmed, timestamp: getTime() })
  setIsTyping(true)

  // getSchemesForQuery() only drives the (unrelated, client-side) document
  // readiness demo below — the actual scheme results come from the real
  // POST /schemes/search call.
  const category = getSchemesForQuery(trimmed)
  setDocCheckCategory(category)
  const uiLang = selectedLangRef.current as UiLang
  const resp = botResponses[uiLang]

  setTimeout(() => {
    setIsTyping(false)
    addMsg({ type: 'bot', text: resp.processing, timestamp: getTime() })
  }, 1200)

  let items: SchemeItem[] = []
  try {
    const matches = await apiSearchSchemes(trimmed, toApiLanguage(uiLang), 6)
    items = matches.map((m, i) => apiMatchToSimpleScheme(m, i))
  } catch (err) {
    setTimeout(() => {
      setIsTyping(false)
      const message = err instanceof ApiError ? err.message : 'Could not reach the backend.'
      addMsg({ type: 'bot', text: message, timestamp: getTime() })
    }, 1800)
    return
  }

  if (items.length === 0) {
    setTimeout(() => {
      setIsTyping(false)
      const noResultsText = uiLang === 'hi-IN' ? 'कोई योजना नहीं मिली।' : uiLang === 'mr-IN' ? 'कोणतीही योजना सापडली नाही.' : 'No schemes found for that.'
      addMsg({ type: 'bot', text: noResultsText, timestamp: getTime() })
    }, 1800)
    return
  }

  setTimeout(() => {
    addMsg({ type: 'schemes', category, schemes: items, timestamp: getTime() })
    const curLang = selectedLangRef.current as UiLang;
    const names = items.slice(0, 3).map(s => getSchemeName(s, curLang)).join(', ');
    const summaryTexts: Record<UiLang, string> = {
      'hi-IN': `आपके लिए ${items.length} योजनाएं मिलीं: ${names}`,
      'mr-IN': `तुमच्यासाठी ${items.length} योजना सापडल्या: ${names}`,
      'en-IN': `Found ${items.length} schemes for you: ${names}`,
      'ta-IN': `உங்களுக்காக ${items.length} திட்டங்கள் கிடைத்தன: ${names}`,
      'te-IN': `మీ కోసం ${items.length} పథకాలు లభించాయి: ${names}`,
      'kn-IN': `ನಿಮಗಾಗಿ ${items.length} ಯೋಜನೆಗಳು ಸಿಕ್ಕಿವೆ: ${names}`,
      'ml-IN': `നിങ്ങൾക്കായി ${items.length} പദ്ധതികൾ ലഭിച്ചു: ${names}`,
      'bn-IN': `আপনার জন্য ${items.length}টি প্রকল্প পাওয়া গেছে: ${names}`,
      'gu-IN': `તમારા માટે ${items.length} યોજનાઓ મળી: ${names}`,
      'pa-IN': `ਤੁਹਾਡੇ ਲਈ ${items.length} ਯੋਜਨਾਵਾਂ ਮਿਲੀਆਂ: ${names}`,
    };
    const summaryText = summaryTexts[curLang];
    setTimeout(() => {
      if (autoSpeakRef.current) speak(summaryText, curLang);
    }, 400);
  }, 1800)

    const firstEligible = items.find(s => s.eligible) || items[0]

    setTimeout(() => {
      const curLang = selectedLangRef.current as UiLang;
      addMsg({ type: 'bot', text: resp.recommendation(getSchemeName(firstEligible, curLang)), timestamp: getTime() })
    }, 2600)

    setTimeout(() => {
    const curLang = selectedLangRef.current as UiLang;
    const curResp = botResponses[curLang];
    addMsg({ type: 'prepPrompt', category, timestamp: getTime() })
    setConversationStage('results_shown')
    setIsTyping(false)
    setTimeout(() => {
      if (autoSpeakRef.current) speak(curResp.prepPromptText, curLang);
    }, 400);
  }, 3400)
}, [addMsg]);

  const ui = uiStrings[selectedLang];
  const lang = selectedLang;

  const openWhatsAppWithSchemes = () => {
    const lines = matchedSchemes.map((s: SchemeItem) => `• ${getSchemeName(s, lang)}: ${s.amount} (${getSchemeUnit(s, lang)})`).join('\n');
    const text = `${ui.whatsappHeader}\n${lines}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleLanguageChange = (newLang: UiLang) => {
    window.speechSynthesis?.cancel();
    setSelectedLang(newLang);
    selectedLangRef.current = newLang;
    setMessages([]);
    setConversationStage('greeting');
    setIsTyping(false);
    setInputText('');
    setExpandedCard(null);
    setDocCheckState({});
    setDocCheckCategory('');
    setShowPincodeInput(false);
    setPincodeText('');
    hasSpokenGreetingRef.current = false;
    setTimeout(() => startGreeting(), 300);
  };

  return (
    <div className="h-screen grid grid-cols-[220px_1fr] bg-[#FAF7F2] min-h-0" style={{ fontFamily: 'var(--font-mukta)' }}>
      <aside className="h-screen min-h-0 bg-[#1A6B3C] flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] bg-[#E8690B] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="2.5" rx="1.25" fill="white" />
                <rect x="5" y="10.5" width="14" height="2.5" rx="1.25" fill="white" />
                <rect x="7" y="16" width="10" height="2.5" rx="1.25" fill="white" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-[15px] leading-none" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                <span className="text-white">Suvidha</span>
                <span className="text-[#FFD700]">AI</span>
              </div>
              <div className="text-[8px] text-[rgba(255,255,255,0.45)] uppercase tracking-[0.08em] mt-1">{ui.govSchemeHelper}</div>
            </div>
          </div>

          <div className="border-t border-[rgba(255,255,255,0.1)] my-3" />

          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.15)] flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-bold text-white leading-none">SuvidhaAI</div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
                <div className="text-[10px] text-[rgba(255,255,255,0.65)]">{ui.sarkariSahayak}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgba(255,255,255,0.1)] my-3" />

          <div className="text-[9px] uppercase text-[rgba(255,255,255,0.4)] tracking-[0.08em] mb-1.5">{ui.activeConversation}</div>
          <div className="bg-[rgba(255,255,255,0.12)] rounded-[8px] py-[9px] px-[11px]">
            <div className="text-[12px] font-bold text-white">{ui.farmerSearch}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-0.5">{ui.farmerSearchSub}</div>
          </div>
        </div>

        <div className="mt-auto p-[14px] flex flex-col gap-[7px]">
          <button
            className="bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-[8px] py-[10px] px-[13px] flex items-center gap-2 text-white text-[12px] font-bold hover:opacity-80 transition-opacity duration-150"
            onClick={openWhatsAppWithSchemes}
          >
            <svg viewBox="0 0 32 32" width="16" height="16" fill="white">
              <path d="M16.04 3.2C8.95 3.2 3.2 8.95 3.2 16.04c0 2.27.6 4.47 1.74 6.4L3.2 28.8l6.55-1.7a12.73 12.73 0 0 0 6.29 1.64c7.09 0 12.84-5.75 12.84-12.84S23.13 3.2 16.04 3.2zm7.49 18.12c-.31.88-1.8 1.69-2.48 1.79-.64.1-1.43.15-2.31-.13-.54-.17-1.23-.4-2.12-.78-3.72-1.61-6.15-5.56-6.34-5.81-.18-.24-1.5-1.99-1.5-3.79 0-1.79.94-2.68 1.27-3.04.34-.36.74-.45.99-.45.25 0 .5 0 .72.01.23.01.54-.08.84.63.31.73 1.05 2.52 1.14 2.7.09.18.15.4.03.64-.12.24-.18.4-.36.62-.18.21-.38.48-.54.64-.18.18-.37.38-.16.74.22.36.96 1.57 2.05 2.54 1.4 1.25 2.58 1.64 2.95 1.82.37.18.58.15.79-.09.22-.24.92-1.07 1.17-1.44.24-.36.49-.3.82-.18.34.12 2.13 1.01 2.49 1.19.37.18.61.27.7.42.09.15.09.88-.22 1.76z" />
            </svg>
            {ui.whatsapp}
          </button>
          <button
            className="bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-[8px] py-[10px] px-[13px] flex items-center gap-2 text-white text-[12px] font-bold hover:opacity-80 transition-opacity duration-150"
            onClick={() => window.open('tel:155261')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 010 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.12.91.34 1.8.65 2.65a2 2 0 01-.45 2.11L6.1 7.9a16 16 0 006 6l1.42-1.12a2 2 0 012.11-.45c.85.31 1.74.53 2.65.65A2 2 0 0122 16.92z" />
            </svg>
            {ui.helpline}
          </button>
          <button
            className="bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-[8px] py-[10px] px-[13px] flex items-center gap-2 text-white text-[12px] font-bold hover:opacity-80 transition-opacity duration-150"
            onClick={findNearestCSC}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {ui.csc}
          </button>
        </div>
      </aside>

      <main className="flex flex-col h-screen min-h-0 overflow-hidden">
        <div className="h-14 shrink-0 bg-[#1A6B3C] px-5 flex items-center gap-3">
          <button className="bg-transparent border-none p-0 cursor-pointer" onClick={() => router.push('/')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button 
            onClick={() => router.push('/')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span style={{ 
              fontSize: '8px', 
              color: 'rgba(255,255,255,0.5)', 
              textAlign: 'center' 
            }}>
              {ui.homeLabel}
            </span>
          </button>

          <div className="w-[38px] h-[38px] rounded-full bg-[#E8690B] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
            </svg>
          </div>

          <div>
            <div className="text-white text-[14px] font-bold flex items-center gap-1.5">
              SuvidhaAI
              <span className="w-[14px] h-[14px] rounded-full bg-[#1565C0] inline-flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                  <polyline points="2 6.5 4.8 9.2 10 3.5" />
                </svg>
              </span>
            </div>
            <div className="text-[10px] text-[rgba(255,255,255,0.65)]">{ui.sarkaricSahayakSub}</div>
          </div>

          <div className="ml-auto bg-[rgba(0,0,0,0.2)] rounded-full p-[3px] flex items-center">
            <span className="bg-white text-[#1A6B3C] text-[11px] font-bold px-3 py-1 rounded-full">{ui.simpleMode}</span>
            <button className="text-[11px] text-[rgba(255,255,255,0.6)] px-3 py-1" onClick={() => router.push('/full')}>
              {ui.detailedMode}
            </button>
          </div>

          <button className="w-[30px] h-[30px] rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <select
            value={selectedLang}
            onChange={(e) => handleLanguageChange(e.target.value as UiLang)}
            className="bg-white border border-[rgba(255,255,255,0.4)] rounded-[5px] py-1 px-2 text-[11px] font-bold cursor-pointer outline-none"
            style={{ fontFamily: 'var(--font-mukta)', color: '#1C1917' }}
          >
            <option value="hi-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>हिंदी</option>
            <option value="mr-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>मराठी</option>
            <option value="en-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>English</option>
            <option value="ta-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>தமிழ்</option>
            <option value="te-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>తెలుగు</option>
            <option value="kn-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>ಕನ್ನಡ</option>
            <option value="ml-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>മലയാളം</option>
            <option value="bn-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>বাংলা</option>
            <option value="gu-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>ગુજરાતી</option>
            <option value="pa-IN" style={{ color: '#1C1917', backgroundColor: 'white' }}>ਪੰਜਾਬੀ</option>
          </select>
          <button
            type="button"
            className="w-[30px] h-[30px] rounded-full border-none cursor-pointer flex items-center justify-center transition-all duration-200 bg-[rgba(255,255,255,0.1)]"
            onClick={() => {
              setAutoSpeak((v) => !v);
              window.speechSynthesis.cancel();
            }}
            aria-label={autoSpeak ? 'Mute voice' : 'Enable voice'}
          >
            {autoSpeak ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            )}
          </button>
          <button className="w-[30px] h-[30px] rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-scroll bg-[#EFEFEF] py-4 px-6 flex flex-col gap-2">
          <div className="self-center bg-[rgba(0,0,0,0.07)] rounded-full py-[3px] px-[14px] text-[10px] text-[#78716C]">{ui.today}</div>

          {messages.map((message) => {
            if (message.type === 'user') {
              return (
                <div key={message.id} className="self-end max-w-[65%]">
                  <div className="bg-[#1A6B3C] rounded-[18px_4px_18px_18px] py-3 px-4 text-[14px] text-white leading-[1.65]">{message.text}</div>
                  <div className="text-right text-[9px] text-[#A8A29E] mt-1">{message.timestamp}</div>
                </div>
              );
            }

            if (message.type === 'typing') {
              return (
                <div key={message.id} className="self-start">
                  <div className="flex items-end gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-[#1A6B3C] flex items-center justify-center shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                      </svg>
                    </div>
                    <div className="bg-white rounded-[4px_18px_18px_18px] py-3 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
                      <div className="flex items-center gap-[5px] py-1">
                        {[0, 0.15, 0.3].map((delay, idx) => (
                          <span key={idx} className="w-[9px] h-[9px] rounded-full bg-[#C0C0C0] inline-block animate-[typingDot_0.5s_ease-in-out_infinite_alternate]" style={{ animationDelay: `${delay}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pl-[34px] text-[9px] text-[#A8A29E] mt-1">{message.timestamp}</div>
                </div>
              );
            }

            if (message.type === 'schemes' && message.schemes) {
              return (
                <div key={message.id} className="self-start w-full">
                  <div className="simple-scroll flex gap-[14px] overflow-x-auto px-1 pt-1 pb-3">
                    {message.schemes.map((scheme) => {
                      const schemeName = getSchemeName(scheme, lang);
                      const schemeUnit = getSchemeUnit(scheme, lang);
                      const schemeDesc = getSchemeDesc(scheme, lang);
                      const schemeWarning = getSchemeWarning(scheme, lang);
                      const detailCacheKey = `${scheme.schemeId}:${selectedLang}`;
                      const detail = schemeDetailsCache[detailCacheKey];
                      const isExpanded = expandedCard === scheme.id;
                      const toggleExpand = () => {
                        const willExpand = expandedCard !== scheme.id;
                        setExpandedCard(willExpand ? scheme.id : null);
                        if (willExpand && !schemeDetailsCache[detailCacheKey]) {
                          setDetailLoadingId(detailCacheKey);
                          apiGetScheme(scheme.schemeId, toApiLanguage(selectedLang))
                            .then((d) => setSchemeDetailsCache((prev) => ({ ...prev, [detailCacheKey]: d })))
                            .catch(() => {})
                            .finally(() => setDetailLoadingId((id) => (id === detailCacheKey ? null : id)));
                        }
                      };
                      return (
                      <div key={scheme.schemeId} className="flex flex-col items-start shrink-0 cursor-pointer transition-transform duration-200 hover:-translate-y-[3px]">
                        <div className="h-3 w-20 rounded-[6px_6px_0_0]" style={{ backgroundColor: scheme.headerColor }} />
                        <div
                          className="w-[240px] bg-white rounded-[0_12px_12px_12px] border-2 overflow-hidden shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
                          style={{ borderColor: scheme.headerColor }}
                        >
                          <div className="h-16 py-[10px] px-3 flex items-center gap-[9px]" style={{ backgroundColor: scheme.headerColor }}>
                            <div className="w-9 h-9 bg-white rounded-full overflow-hidden border-[1.5px] border-[rgba(255,255,255,0.4)] shrink-0 flex items-center justify-center">
                              <Image src={scheme.logo} alt={schemeName} width={32} height={32} style={{ objectFit: 'contain' }} />
                            </div>
                            <div className="text-[13px] leading-[1.25] text-white font-bold flex-1">{schemeName}</div>
                            {scheme.eligible ? (
                              <span className="text-[9px] font-bold py-[2px] px-[7px] rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] whitespace-nowrap">{ui.eligibleBadge}</span>
                            ) : (
                              <span className="text-[9px] font-bold py-[2px] px-[7px] rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] whitespace-nowrap">{ui.verifyBadge}</span>
                            )}
                          </div>

                          <div className="p-3">
                            <div className="flex justify-between items-start">
                              <div className="text-[26px] font-bold text-[#1C1917] leading-none" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
                                {scheme.amount}
                              </div>
                              <div
                                className="w-[52px] h-[52px] rounded-full border-2 flex flex-col items-center justify-center -rotate-12"
                                style={{
                                  borderColor: scheme.eligible ? '#1A6B3C' : '#D97706',
                                  backgroundColor: scheme.eligible ? '#F0FDF4' : '#FFFBEB',
                                  color: scheme.eligible ? '#1A6B3C' : '#D97706',
                                }}
                              >
                                {scheme.eligible ? (
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="2 6.5 4.8 9.2 10 3.5" />
                                  </svg>
                                ) : (
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="3" y1="3" x2="9" y2="9" />
                                    <line x1="9" y1="3" x2="3" y2="9" />
                                  </svg>
                                )}
                                <div className="text-[8px] font-bold leading-none mt-0.5">{ui.eligibleBadge.replace('✓ ', '')}</div>
                              </div>
                            </div>
                            <div className="text-[13px] font-bold text-[#57534E] mt-0.5">{schemeUnit}</div>
                            <div className="text-[11px] text-[#78716C] leading-[1.5] mt-1">{schemeDesc}</div>

                            {schemeWarning && (
                              <div className="mt-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] py-[7px] px-[9px] flex gap-[5px] items-start">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                </svg>
                                <div className="text-[10px] text-[#92400E] leading-[1.4]">{schemeWarning}</div>
                              </div>
                            )}

                            <div className="mt-1.5 text-[10px] font-bold" style={{ color: scheme.matchColor }}>
                              {ui.matchStatusLabel} {scheme.matchTier === 'high' ? ui.matchHigh : ui.matchMedium}
                            </div>

                            <button
                              className="mt-2.5 w-full bg-[#E8690B] text-white border-none rounded-[9px] py-2.5 text-[13px] font-bold hover:bg-[#C2570A] transition-all duration-150"
                              onClick={toggleExpand}
                            >
                              {ui.howToGet}
                            </button>

                            <div
                              className="bg-[#F0FDF4] border-t border-[#BBF7D0] rounded-[0_0_10px_10px] mt-2 overflow-hidden transition-all duration-300 ease-in-out"
                              style={{
                                maxHeight: isExpanded ? '500px' : '0px',
                                opacity: isExpanded ? 1 : 0,
                                padding: isExpanded ? '10px 12px' : '0 12px',
                              }}
                            >
                              <div className="text-[9px] uppercase font-bold text-[#1A6B3C] mb-[7px]">{ui.appStepsLabel}</div>
                              {detailLoadingId === detailCacheKey && !detail && (
                                <div className="text-[11px] text-[#78716C]">…</div>
                              )}
                              {detail && detail.application_modes.map((mode, idx) => (
                                <div key={mode} className="flex gap-[7px] py-1">
                                  <div className="w-5 h-5 rounded-full bg-[#1A6B3C] text-white text-[9px] font-bold shrink-0 flex items-center justify-center">{idx + 1}</div>
                                  <div className="text-[11px] text-[#1C1917] leading-[1.5]">Apply via {mode}</div>
                                </div>
                              ))}
                              {detail && (
                                <div className="text-[9px] text-[#A8A29E] mt-1.5">
                                  {ui.documentsLabel} {detail.documents_required.join(', ') || '—'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (message.type === 'prepPrompt' && message.category) {
              const msg = message;
              const brPrep = botResponses[selectedLang];
              return (
                <div key={message.id} className="self-start">
                  <div className="flex items-end gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-[#1A6B3C] flex items-center justify-center shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                      </svg>
                    </div>
                    <div className="bg-white rounded-[4px_18px_18px_18px] py-3 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.12)] max-w-[65%] self-start">
                      <p className="text-[14px] text-[#1C1917] leading-[1.6] mb-3">{brPrep.prepPromptText}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 bg-[#1A6B3C] text-white rounded-[9px] py-2.5 text-[13px] font-bold border-none cursor-pointer"
                          onClick={() => {
                            const initialState: Record<string, DocCheckStatus> = {};
                            const docs = documentData[msg.category!] || documentData.farmer;
                            docs.forEach((d) => {
                              initialState[d.id] = 'unchecked';
                            });
                            setDocCheckState(initialState);
                            setDocCheckCategory(msg.category!);
                            addMsg({ type: 'docCheck', category: msg.category, timestamp: getTime() });
                          }}
                        >
                          {ui.prepYes}
                        </button>
                        <button
                          type="button"
                          className="flex-1 bg-white text-[#57534E] border-[1.5px] border-[#E7E0D8] rounded-[9px] py-2.5 text-[13px] font-bold cursor-pointer"
                          onClick={() =>
                            addMsg({
                              type: 'bot',
                              text: botResponses[selectedLangRef.current].prepDecline,
                              timestamp: getTime(),
                            })
                          }
                        >
                          {ui.prepNo}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="pl-[34px] text-[9px] text-[#A8A29E] mt-1">{message.timestamp}</div>
                </div>
              );
            }

            if (message.type === 'docCheck' && message.category) {
              return (
                <DocCheckCard
                  key={message.id}
                  category={message.category}
                  docCheckState={docCheckState}
                  setDocCheckState={setDocCheckState}
                  findNearestCSC={findNearestCSC}
                  addMsg={addMsg}
                  getTime={getTime}
                  scriptLang={scriptLang}
                  setScriptLang={setScriptLang}
                  ui={ui}
                  resp={botResponses[selectedLangRef.current as UiLang]}
                  lang={selectedLang}
                />
              );
            }

            return (
              <div key={message.id} className="self-start">
                <div className="flex items-end gap-1.5">
                  <div className="w-7 h-7 rounded-full bg-[#1A6B3C] flex items-center justify-center shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                    </svg>
                  </div>
                  <div
                    className={`bg-white rounded-[4px_18px_18px_18px] py-3 px-4 text-[14px] leading-[1.65] text-[#1C1917] shadow-[0_1px_2px_rgba(0,0,0,0.12)] max-w-[65%] ${
                      message.isHindi ? 'border-l-[3px] border-l-[#1A6B3C] text-[#1A6B3C] font-bold text-[15px]' : ''
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
                <div className="pl-[34px] text-[9px] text-[#A8A29E] mt-1">{message.timestamp}</div>

                {message.showChips && (
                  <div className="pl-[34px] flex flex-wrap gap-[7px] mt-2">
                    {ui.chipList.map((chip) => (
                      <button
                        key={chip}
                        className="text-[12px] font-semibold py-1.5 px-3.5 rounded-full border-[1.5px] border-[#1A6B3C] bg-white text-[#1A6B3C] hover:bg-[#1A6B3C] hover:text-white transition-all duration-150"
                        onClick={() => {
                          handleSend(chip);
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isTyping && (
            <div className="self-start">
              <div className="flex items-end gap-1.5">
                <div className="w-7 h-7 rounded-full bg-[#1A6B3C] flex items-center justify-center shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M6 20.5c0-2 3-3 6-3s6 1 6 3" />
                  </svg>
                </div>
                <div className="bg-white rounded-[4px_18px_18px_18px] py-3 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center gap-[5px] py-1">
                    {[0, 0.15, 0.3].map((delay, idx) => (
                      <span key={idx} className="w-[9px] h-[9px] rounded-full bg-[#C0C0C0] inline-block animate-[typingDot_0.5s_ease-in-out_infinite_alternate]" style={{ animationDelay: `${delay}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showPincodeInput && (
            <div className="self-start max-w-[300px] mt-1 bg-white rounded-xl py-3 px-3.5 border-[1.5px] border-[#E7E0D8]">
              <label className="text-[12px] font-bold text-[#1C1917] block mb-2">{ui.pincodeLabel}</label>
              <div className="flex gap-2 items-stretch">
                <input
                  type="tel"
                  maxLength={6}
                  value={pincodeText}
                  onChange={(e) => setPincodeText(e.target.value)}
                  className="flex-1 border-[1.5px] border-[#E7E0D8] rounded-lg py-2 px-3 text-[14px] text-[#1C1917] outline-none focus:border-[#E8690B]"
                  style={{ fontFamily: 'var(--font-mukta)' }}
                />
                <button
                  type="button"
                  className="bg-[#E8690B] text-white border-none rounded-lg py-2 px-3.5 text-[13px] font-bold cursor-pointer shrink-0"
                  onClick={() => {
                    if (pincodeText.length === 6) {
                      window.open(`https://www.google.com/maps/search/Common+Service+Centre+CSC+${pincodeText}`, '_blank');
                      setShowPincodeInput(false);
                      const pc = pincodeText;
                      setPincodeText('');
                      addMsg({ type: 'bot', text: botResponses[selectedLangRef.current as UiLang].pincodeResult(pc), timestamp: getTime() });
                    }
                  }}
                >
                  {ui.goBtn}
                </button>
              </div>
            </div>
          )}

          {conversationStage === 'results_shown' && (
            <div className="flex justify-center mt-2 pb-1">
              <button
                type="button"
                className="text-[12px] font-semibold text-[#E8690B] bg-transparent border border-[#FED7AA] rounded-full py-1.5 px-[18px] cursor-pointer transition-all duration-150 hover:bg-[#FFF8F1]"
                onClick={() => {
                  hasSpokenGreetingRef.current = false;
                  setMessages([]);
                  setConversationStage('greeting');
                  setExpandedCard(null);
                  setInputText('');
                  setDocCheckState({});
                  setDocCheckCategory('');
                  setShowPincodeInput(false);
                  setPincodeText('');
                  window.speechSynthesis.cancel();
                  setTimeout(() => startGreeting(), 400);
                }}
              >
                {ui.newSearch}
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 bg-white border-t border-[#E7E0D8] flex flex-col" style={{ maxHeight: '28vh' }}>
          <div className="py-2.5 px-5 flex items-center gap-2.5">
            <input
              className="flex-1 border-[1.5px] border-[#E7E0D8] rounded-[20px] py-[9px] px-4 text-[13px] text-[#1C1917] bg-[#FAF7F2] outline-none focus:border-[#E8690B] focus:bg-white"
              placeholder={ui.typeHere}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSend(inputText);
                }
              }}
            />
            <button
              className="w-9 h-9 rounded-full bg-[#E8690B] border-none flex items-center justify-center"
              onClick={() => {
                handleSend(inputText);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <line x1="22" y1="2" x2="11" y2="13" stroke="white" strokeWidth="2" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          <div className="pt-1 pb-2.5 px-5 flex items-center justify-center gap-4">
            <Waveform isRecording={isRecording} />

            <button
              className={`w-12 h-12 rounded-full border-none cursor-pointer flex items-center justify-center animate-[micPulse_2.5s_ease-in-out_infinite] ${
                isRecording ? 'bg-[#DC2626]' : 'bg-[#E8690B]'
              }`}
              onClick={() => {
                if (isRecording) {
                  setIsRecording(false);
                  return;
                }
                setIsRecording(true);
                setTimeout(() => {
                  setIsRecording(false);
                  handleSend(ui.voiceQuery);
                }, 3000);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0014 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>

            <Waveform isRecording={isRecording} />
          </div>

          <div className="text-center text-[11px] font-bold text-[#57534E] -mt-1">{isRecording ? ui.recording : ui.speakBtn}</div>

          <div className="grid grid-cols-3 gap-2 px-4 pt-2 pb-3">
            <button
              className="border-none rounded-[10px] py-[11px] px-2 flex items-center justify-center gap-[7px] text-[13px] font-bold bg-[#25D366] text-white hover:opacity-85 transition-opacity duration-150"
              onClick={openWhatsAppWithSchemes}
            >
              <svg viewBox="0 0 32 32" width="14" height="14" fill="white">
                <path d="M16.04 3.2C8.95 3.2 3.2 8.95 3.2 16.04c0 2.27.6 4.47 1.74 6.4L3.2 28.8l6.55-1.7a12.73 12.73 0 0 0 6.29 1.64c7.09 0 12.84-5.75 12.84-12.84S23.13 3.2 16.04 3.2z" />
              </svg>
              {ui.shareBtn}
            </button>
            <button
              className="border-none rounded-[10px] py-[11px] px-2 flex items-center justify-center gap-[7px] text-[13px] font-bold bg-[#1A6B3C] text-white hover:opacity-85 transition-opacity duration-150"
              onClick={() => window.open('tel:155261')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81" />
              </svg>
              {ui.helplineBtn}
            </button>
            <button
              className="border-none rounded-[10px] py-[11px] px-2 flex items-center justify-center gap-[7px] text-[13px] font-bold bg-[#1565C0] text-white hover:opacity-85 transition-opacity duration-150"
              onClick={findNearestCSC}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {ui.findCSC}
            </button>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .simple-scroll::-webkit-scrollbar {
          height: 3px;
        }
        .simple-scroll::-webkit-scrollbar-thumb {
          background: #e8690b;
          border-radius: 99px;
        }
        .doc-scroll::-webkit-scrollbar {
          height: 3px;
        }
        .doc-scroll::-webkit-scrollbar-thumb {
          background: #e8690b;
          border-radius: 99px;
        }
        @keyframes typingDot {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(-5px);
          }
        }
        @keyframes waveScale {
          from {
            transform: scaleY(0.3);
          }
          to {
            transform: scaleY(1);
          }
        }
        @keyframes micPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(232, 105, 11, 0);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(232, 105, 11, 0.15);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(232, 105, 11, 0);
          }
        }
      `}</style>
    </div>
  );
}

