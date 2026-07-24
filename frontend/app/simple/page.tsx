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
  lang?: string;
  timestamp: string;
};

type SchemeItem = {
  id: number;
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
};

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

type UiLang = 'hi-IN' | 'mr-IN' | 'en-IN';

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
  }
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
  }
}

const schemeData: Record<SchemeCategory, SchemeItem[]> = {
  farmer: [
    {
      id: 1,
      nameHindi: 'पीएम किसान सम्मान निधि',
      nameEnglish: 'PM Kisan Samman Nidhi',
      nameMr: 'पीएम किसान सन्मान निधी',
      logo: '/images/scheme-kisan.jpg',
      headerColor: '#1A6B3C',
      amount: '₹6,000',
      unit: 'सालाना',
      unitEnglish: 'per year',
      unitMr: 'वार्षिक',
      desc: 'सीधे बैंक खाते में · 3 किस्तों में',
      descEnglish: 'Directly to bank account · in 3 installments',
      descMr: 'थेट बँक खात्यात · 3 हप्त्यांमध्ये',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'आधार को बैंक खाते से लिंक करना ज़रूरी है।',
      warningEnglish: 'Aadhaar must be linked to your bank account.',
      warningMr: 'आधार बँक खात्याशी जोडणे आवश्यक आहे.',
      steps: ['pmkisan.gov.in पर जाएं या CSC केंद्र जाएं', 'New Farmer Registration पर क्लिक करें', 'आधार नंबर डालें', 'ज़मीन के कागज़ और बैंक नंबर भरें', 'Submit करें और Reference Number नोट करें'],
      stepsEnglish: ['Visit pmkisan.gov.in or a CSC centre', 'Click New Farmer Registration', 'Enter your Aadhaar number', 'Fill land records and bank account number', 'Submit and note the Reference Number'],
      stepsMr: ['pmkisan.gov.in वर जा किंवा CSC केंद्रात जा', 'New Farmer Registration वर क्लिक करा', 'आधार क्रमांक टाका', 'जमिनीचे कागद आणि बँक क्रमांक भरा', 'Submit करा आणि Reference Number नोंदवा'],
    },
    {
      id: 2,
      nameHindi: 'प्रधानमंत्री फसल बीमा',
      nameEnglish: 'PM Fasal Bima Yojana',
      nameMr: 'पंतप्रधान पीक विमा योजना',
      logo: '/images/scheme-fasal-bima.png',
      headerColor: '#E8690B',
      amount: 'फसल बीमा',
      unit: 'पूरे नुकसान की भरपाई',
      unitEnglish: 'Full loss coverage',
      unitMr: 'संपूर्ण नुकसान भरपाई',
      desc: 'बाढ़, सूखा, ओले — किसी भी नुकसान का मुआवज़ा',
      descEnglish: 'Flood, drought, hail — compensation for any crop loss',
      descMr: 'पूर, दुष्काळ, गारपीट — कोणत्याही नुकसानीची भरपाई',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'बुआई के 2 हफ्ते के अंदर आवेदन करना ज़रूरी है।',
      warningEnglish: 'You must apply within 2 weeks of sowing.',
      warningMr: 'पेरणीच्या 2 आठवड्यांच्या आत अर्ज करणे आवश्यक आहे.',
      steps: ['बैंक या CSC केंद्र पर जाएं', 'PMFBY Form भरें', 'खसरा नंबर और बुआई जानकारी दें', 'प्रीमियम का भुगतान करें', 'बीमा Certificate लें'],
      stepsEnglish: ['Visit a bank or CSC centre', 'Fill the PMFBY form', 'Give Khasra number and sowing details', 'Pay the premium amount', 'Collect the insurance certificate'],
      stepsMr: ['बँक किंवा CSC केंद्रात जा', 'PMFBY फॉर्म भरा', 'खसरा क्रमांक आणि पेरणीची माहिती द्या', 'प्रीमियम भरा', 'विमा प्रमाणपत्र घ्या'],
    },
    {
      id: 3,
      nameHindi: 'किसान क्रेडिट कार्ड',
      nameEnglish: 'Kisan Credit Card',
      nameMr: 'किसान क्रेडिट कार्ड',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1565C0',
      amount: '₹3 लाख',
      unit: '4% ब्याज पर',
      unitEnglish: 'at 4% interest',
      unitMr: '4% व्याजदराने',
      desc: 'खेती के लिए सस्ते कर्ज़ का सबसे आसान तरीका',
      descEnglish: 'The easiest way to get low-interest loans for farming',
      descMr: 'शेतीसाठी स्वस्त कर्ज मिळवण्याचा सर्वात सोपा मार्ग',
      eligible: false,
      matchTier: 'medium',
      matchColor: '#D97706',
      warning: 'ज़मीन आपके नाम होनी चाहिए।',
      warningEnglish: 'Land must be registered in your own name.',
      warningMr: 'जमीन तुमच्या नावावर असणे आवश्यक आहे.',
      steps: ['नज़दीकी बैंक में KCC Form लें', 'ज़मीन के कागज़ और पहचान पत्र लाएं', 'बैंक अधिकारी से बात करें', 'Form जमा करें', '7 दिन में Card मिलेगा'],
      stepsEnglish: ['Get the KCC form at your nearest bank', 'Bring land records and ID proof', 'Speak with the bank officer', 'Submit the form', 'You will get the card within 7 days'],
      stepsMr: ['जवळच्या बँकेत KCC फॉर्म घ्या', 'जमिनीचे कागद आणि ओळखपत्र आणा', 'बँक अधिकाऱ्याशी बोला', 'फॉर्म जमा करा', '7 दिवसांत कार्ड मिळेल'],
    },
  ],
  women: [
    {
      id: 4,
      nameHindi: 'पीएम उज्ज्वला योजना',
      nameEnglish: 'PM Ujjwala Yojana',
      nameMr: 'पीएम उज्ज्वला योजना',
      logo: '/images/scheme-ujjwala.png',
      headerColor: '#6A1B9A',
      amount: 'मुफ्त LPG',
      unit: 'गैस कनेक्शन',
      unitEnglish: 'gas connection',
      unitMr: 'गॅस कनेक्शन',
      desc: 'BPL परिवार की महिलाओं के लिए मुफ्त गैस कनेक्शन',
      descEnglish: 'Free gas connection for women from BPL families',
      descMr: 'BPL कुटुंबातील महिलांसाठी मोफत गॅस कनेक्शन',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'BPL राशन कार्ड होना ज़रूरी है।',
      warningEnglish: 'A BPL ration card is required.',
      warningMr: 'BPL रेशन कार्ड असणे आवश्यक आहे.',
      steps: ['नज़दीकी LPG वितरक के पास जाएं', 'Ujjwala Application Form लें', 'BPL कार्ड और आधार जमा करें', 'Verification के बाद Connection मिलेगा', 'पहला Cylinder मुफ्त मिलेगा'],
      stepsEnglish: ['Visit your nearest LPG distributor', 'Get the Ujjwala application form', 'Submit BPL card and Aadhaar', 'You will get the connection after verification', 'The first cylinder is free'],
      stepsMr: ['जवळच्या LPG वितरकाकडे जा', 'उज्ज्वला अर्ज फॉर्म घ्या', 'BPL कार्ड आणि आधार जमा करा', 'पडताळणीनंतर कनेक्शन मिळेल', 'पहिला सिलेंडर मोफत मिळेल'],
    },
    {
      id: 5,
      nameHindi: 'सुकन्या समृद्धि योजना',
      nameEnglish: 'Sukanya Samridhi Yojana',
      nameMr: 'सुकन्या समृद्धी योजना',
      logo: '/images/scheme-sukanya.png',
      headerColor: '#880E4F',
      amount: '8.2% ब्याज',
      unit: 'बेटी के लिए बचत',
      unitEnglish: 'savings for your daughter',
      unitMr: 'मुलीसाठी बचत',
      desc: '10 साल से कम उम्र की बेटी के लिए बचत खाता',
      descEnglish: 'A savings account for a daughter under 10 years of age',
      descMr: '10 वर्षांखालील मुलीसाठी बचत खाते',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'बेटी की उम्र 10 साल से कम होनी चाहिए।',
      warningEnglish: 'The daughter must be under 10 years of age.',
      warningMr: 'मुलीचे वय 10 वर्षांपेक्षा कमी असणे आवश्यक आहे.',
      steps: ['नज़दीकी Post Office या बैंक जाएं', 'Sukanya Samridhi Form लें', 'बेटी का Birth Certificate और आधार दें', 'न्यूनतम ₹250 से खाता खुलेगा', 'हर साल जमा करते रहें'],
      stepsEnglish: ['Visit your nearest Post Office or bank', 'Get the Sukanya Samridhi form', 'Give daughter\'s birth certificate and Aadhaar', 'Account opens with a minimum of ₹250', 'Keep depositing every year'],
      stepsMr: ['जवळच्या पोस्ट ऑफिस किंवा बँकेत जा', 'सुकन्या समृद्धी फॉर्म घ्या', 'मुलीचे जन्म प्रमाणपत्र आणि आधार द्या', 'किमान ₹250 ने खाते उघडेल', 'दरवर्षी रक्कम भरत राहा'],
    },
    {
      id: 6,
      nameHindi: 'मातृत्व वंदना योजना',
      nameEnglish: 'Pradhan Mantri Matru Vandana Yojana',
      nameMr: 'मातृत्व वंदना योजना',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#E8690B',
      amount: '₹5,000',
      unit: 'पहले बच्चे पर',
      unitEnglish: 'for the first child',
      unitMr: 'पहिल्या मुलासाठी',
      desc: 'गर्भवती और स्तनपान कराने वाली महिलाओं के लिए',
      descEnglish: 'For pregnant and breastfeeding women',
      descMr: 'गरोदर आणि स्तनपान करणाऱ्या महिलांसाठी',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'पहले जीवित बच्चे के जन्म पर ही लागू।',
      warningEnglish: 'Applicable only for the birth of the first living child.',
      warningMr: 'फक्त पहिल्या जिवंत मुलाच्या जन्मासाठी लागू.',
      steps: ['नज़दीकी आंगनवाड़ी केंद्र जाएं', 'PMMVY Form-1A भरें', 'Bank Passbook और आधार दें', 'तीन किस्तों में पैसे मिलेंगे', 'आंगनवाड़ी कार्यकर्ता से मदद लें'],
      stepsEnglish: ['Visit your nearest Anganwadi centre', 'Fill PMMVY Form-1A', 'Give bank passbook and Aadhaar', 'You will get money in three installments', 'Take help from the Anganwadi worker'],
      stepsMr: ['जवळच्या अंगणवाडी केंद्रात जा', 'PMMVY फॉर्म-1A भरा', 'बँक पासबुक आणि आधार द्या', 'तीन हप्त्यांमध्ये पैसे मिळतील', 'अंगणवाडी सेविकेची मदत घ्या'],
    },
  ],
  student: [
    {
      id: 7,
      nameHindi: 'पीएम छात्रवृत्ति योजना',
      nameEnglish: 'PM Scholarship Scheme',
      nameMr: 'पीएम शिष्यवृत्ती योजना',
      logo: '/images/scheme-pmkvy.png',
      headerColor: '#E65100',
      amount: '₹36,000',
      unit: 'सालाना छात्रवृत्ति',
      unitEnglish: 'annual scholarship',
      unitMr: 'वार्षिक शिष्यवृत्ती',
      desc: 'पूर्व सैनिकों के बच्चों के लिए उच्च शिक्षा',
      descEnglish: 'Higher education support for children of ex-servicemen',
      descMr: 'माजी सैनिकांच्या मुलांसाठी उच्च शिक्षण',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: '12वीं में 60% से अधिक अंक होने चाहिए।',
      warningEnglish: 'You must have scored above 60% in 12th grade.',
      warningMr: '12वी मध्ये 60% पेक्षा जास्त गुण असणे आवश्यक आहे.',
      steps: ['ksb.gov.in पर जाएं', 'PM Scholarship के लिए Register करें', 'Mark Sheets और Documents Upload करें', 'Online Application Submit करें', 'Result एक महीने में आएगा'],
      stepsEnglish: ['Visit ksb.gov.in', 'Register for the PM Scholarship', 'Upload mark sheets and documents', 'Submit the online application', 'Result comes within one month'],
      stepsMr: ['ksb.gov.in वर जा', 'PM Scholarship साठी नोंदणी करा', 'गुणपत्रिका आणि कागदपत्रे अपलोड करा', 'ऑनलाइन अर्ज सबमिट करा', 'निकाल एका महिन्यात येईल'],
    },
    {
      id: 8,
      nameHindi: 'PMKVY कौशल विकास',
      nameEnglish: 'PMKVY Skill Development',
      nameMr: 'PMKVY कौशल्य विकास',
      logo: '/images/scheme-pmkvy.png',
      headerColor: '#1565C0',
      amount: 'मुफ्त Training',
      unit: 'Certificate के साथ',
      unitEnglish: 'with certificate',
      unitMr: 'प्रमाणपत्रासह',
      desc: 'युवाओं के लिए मुफ्त कौशल प्रशिक्षण और रोज़गार',
      descEnglish: 'Free skill training and employment for youth',
      descMr: 'युवकांसाठी मोफत कौशल्य प्रशिक्षण आणि रोजगार',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: null,
      warningEnglish: null,
      warningMr: null,
      steps: ['pmkvyofficial.org पर जाएं', 'नज़दीकी Training Centre ढूंढें', 'Registration करें', 'Training Complete करें', 'Certificate और Job Placement पाएं'],
      stepsEnglish: ['Visit pmkvyofficial.org', 'Find your nearest training centre', 'Complete registration', 'Complete the training', 'Get certificate and job placement'],
      stepsMr: ['pmkvyofficial.org वर जा', 'जवळचे प्रशिक्षण केंद्र शोधा', 'नोंदणी करा', 'प्रशिक्षण पूर्ण करा', 'प्रमाणपत्र आणि नोकरी मिळवा'],
    },
    {
      id: 9,
      nameHindi: 'नेशनल मेरिट स्कॉलरशिप',
      nameEnglish: 'National Merit Scholarship',
      nameMr: 'राष्ट्रीय गुणवत्ता शिष्यवृत्ती',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#1A6B3C',
      amount: '₹12,000',
      unit: 'सालाना',
      unitEnglish: 'per year',
      unitMr: 'वार्षिक',
      desc: 'मेधावी छात्रों के लिए राष्ट्रीय छात्रवृत्ति',
      descEnglish: 'National scholarship for meritorious students',
      descMr: 'हुशार विद्यार्थ्यांसाठी राष्ट्रीय शिष्यवृत्ती',
      eligible: false,
      matchTier: 'medium',
      matchColor: '#D97706',
      warning: 'परिवार की आय ₹1.5 लाख से कम होनी चाहिए।',
      warningEnglish: 'Family income must be less than ₹1.5 lakh.',
      warningMr: 'कुटुंबाचे उत्पन्न ₹1.5 लाखांपेक्षा कमी असणे आवश्यक आहे.',
      steps: ['scholarships.gov.in पर जाएं', 'National Scholarship Portal पर Register करें', 'Institute और Course Details भरें', 'Income Certificate Upload करें', 'Submit करके Tracking ID नोट करें'],
      stepsEnglish: ['Visit scholarships.gov.in', 'Register on the National Scholarship Portal', 'Fill institute and course details', 'Upload income certificate', 'Submit and note the tracking ID'],
      stepsMr: ['scholarships.gov.in वर जा', 'National Scholarship Portal वर नोंदणी करा', 'संस्था आणि अभ्यासक्रमाचे तपशील भरा', 'उत्पन्नाचा दाखला अपलोड करा', 'सबमिट करून Tracking ID नोंदवा'],
    },
  ],
  housing: [
    {
      id: 10,
      nameHindi: 'पीएम आवास योजना ग्रामीण',
      nameEnglish: 'PM Awas Yojana (Rural)',
      nameMr: 'पीएम आवास योजना ग्रामीण',
      logo: '/images/scheme-awas.png',
      headerColor: '#1565C0',
      amount: '₹1.3 लाख',
      unit: 'घर बनाने के लिए',
      unitEnglish: 'to build a house',
      unitMr: 'घर बांधण्यासाठी',
      desc: 'ग्रामीण BPL परिवारों के लिए पक्के घर की सहायता',
      descEnglish: 'Pucca house support for rural BPL families',
      descMr: 'ग्रामीण BPL कुटुंबांसाठी पक्क्या घराची मदत',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'SECC 2011 सूची में नाम होना ज़रूरी है।',
      warningEnglish: 'Your name must be in the SECC 2011 list.',
      warningMr: 'SECC 2011 यादीत नाव असणे आवश्यक आहे.',
      steps: ['ग्राम पंचायत कार्यालय जाएं', 'PMAY-G के लिए आवेदन करें', 'BPL Card और आधार जमा करें', 'Survey के लिए Wait करें', 'स्वीकृति के बाद किस्तों में राशि मिलेगी'],
      stepsEnglish: ['Visit the Gram Panchayat office', 'Apply for PMAY-G', 'Submit BPL card and Aadhaar', 'Wait for the survey', 'Amount comes in installments after approval'],
      stepsMr: ['ग्रामपंचायत कार्यालयात जा', 'PMAY-G साठी अर्ज करा', 'BPL कार्ड आणि आधार जमा करा', 'सर्वेक्षणाची वाट पाहा', 'मंजुरीनंतर हप्त्यांमध्ये रक्कम मिळेल'],
    },
    {
      id: 11,
      nameHindi: 'पीएम आवास योजना शहरी',
      nameEnglish: 'PM Awas Yojana (Urban)',
      nameMr: 'पीएम आवास योजना शहरी',
      logo: '/images/scheme-awas.png',
      headerColor: '#E8690B',
      amount: '₹2.67 लाख',
      unit: 'Home Loan Subsidy',
      unitEnglish: 'home loan subsidy',
      unitMr: 'गृहकर्ज अनुदान',
      desc: 'शहरी गरीबों के लिए किफायती आवास',
      descEnglish: 'Affordable housing for the urban poor',
      descMr: 'शहरी गरिबांसाठी परवडणारी घरे',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'पहले से कोई पक्का घर नहीं होना चाहिए।',
      warningEnglish: 'You must not already own a pucca house.',
      warningMr: 'आधीच पक्के घर नसावे.',
      steps: ['pmaymis.gov.in पर जाएं', 'Online Apply करें', 'Income और Property Documents दें', 'Bank Home Loan के लिए Apply करें', 'Subsidy सीधे Loan Account में आएगी'],
      stepsEnglish: ['Visit pmaymis.gov.in', 'Apply online', 'Give income and property documents', 'Apply to the bank for a home loan', 'Subsidy comes directly into the loan account'],
      stepsMr: ['pmaymis.gov.in वर जा', 'ऑनलाइन अर्ज करा', 'उत्पन्न आणि मालमत्तेची कागदपत्रे द्या', 'बँकेकडे गृहकर्जासाठी अर्ज करा', 'अनुदान थेट कर्ज खात्यात येईल'],
    },
    {
      id: 12,
      nameHindi: 'स्वच्छ भारत मिशन शौचालय',
      nameEnglish: 'Swachh Bharat Mission Toilet',
      nameMr: 'स्वच्छ भारत मिशन शौचालय',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1A6B3C',
      amount: '₹12,000',
      unit: 'शौचालय निर्माण',
      unitEnglish: 'toilet construction',
      unitMr: 'शौचालय बांधकाम',
      desc: 'ग्रामीण परिवारों के लिए शौचालय बनाने की सहायता',
      descEnglish: 'Support for rural families to build a toilet',
      descMr: 'ग्रामीण कुटुंबांना शौचालय बांधण्यासाठी मदत',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: null,
      warningEnglish: null,
      warningMr: null,
      steps: ['ग्राम पंचायत से संपर्क करें', 'SBM Application Form भरें', 'आधार और Bank Details दें', 'शौचालय बनाएं', 'Completion Photo submit करें और ₹12,000 पाएं'],
      stepsEnglish: ['Contact the Gram Panchayat', 'Fill the SBM application form', 'Give Aadhaar and bank details', 'Build the toilet', 'Submit completion photo and get ₹12,000'],
      stepsMr: ['ग्रामपंचायतीशी संपर्क साधा', 'SBM अर्ज फॉर्म भरा', 'आधार आणि बँक तपशील द्या', 'शौचालय बांधा', 'पूर्णत्वाचा फोटो सबमिट करा आणि ₹12,000 मिळवा'],
    },
  ],
  senior: [
    {
      id: 13,
      nameHindi: 'इंदिरा गांधी वृद्धावस्था पेंशन',
      nameEnglish: 'Indira Gandhi Old Age Pension',
      nameMr: 'इंदिरा गांधी वृद्धापकाळ निवृत्तीवेतन',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1A6B3C',
      amount: '₹200-500',
      unit: 'हर महीने',
      unitEnglish: 'every month',
      unitMr: 'दरमहा',
      desc: '60 साल से अधिक उम्र के BPL नागरिकों के लिए पेंशन',
      descEnglish: 'Pension for BPL citizens above 60 years of age',
      descMr: '60 वर्षांवरील BPL नागरिकांसाठी निवृत्तीवेतन',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'BPL सूची में नाम होना ज़रूरी है।',
      warningEnglish: 'Your name must be in the BPL list.',
      warningMr: 'BPL यादीत नाव असणे आवश्यक आहे.',
      steps: ['ग्राम पंचायत या नगर पालिका जाएं', 'IGNOAPS Application Form लें', 'Age Proof और BPL Card जमा करें', 'Application Submit करें', 'Approval के बाद हर महीने पेंशन मिलेगी'],
      stepsEnglish: ['Visit Gram Panchayat or municipal office', 'Get the IGNOAPS application form', 'Submit age proof and BPL card', 'Submit the application', 'Pension comes every month after approval'],
      stepsMr: ['ग्रामपंचायत किंवा नगरपालिकेत जा', 'IGNOAPS अर्ज फॉर्म घ्या', 'वयाचा दाखला आणि BPL कार्ड जमा करा', 'अर्ज सबमिट करा', 'मंजुरीनंतर दरमहा निवृत्तीवेतन मिळेल'],
    },
    {
      id: 14,
      nameHindi: 'आयुष्मान भारत PMJAY',
      nameEnglish: 'Ayushman Bharat PMJAY',
      nameMr: 'आयुष्मान भारत PMJAY',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#FF671F',
      amount: '₹5 लाख',
      unit: 'हर साल स्वास्थ्य बीमा',
      unitEnglish: 'health cover per year',
      unitMr: 'दरवर्षी आरोग्य विमा',
      desc: 'गरीब परिवारों के लिए मुफ्त अस्पताल इलाज',
      descEnglish: 'Free hospital treatment for poor families',
      descMr: 'गरीब कुटुंबांसाठी मोफत रुग्णालय उपचार',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: null,
      warningEnglish: null,
      warningMr: null,
      steps: ['pmjay.gov.in पर Eligibility Check करें', 'नज़दीकी Empanelled Hospital जाएं', 'Ayushman Card बनवाएं', 'इलाज के समय Card दिखाएं', '₹5 लाख तक मुफ्त इलाज मिलेगा'],
      stepsEnglish: ['Check eligibility at pmjay.gov.in', 'Visit your nearest empanelled hospital', 'Get your Ayushman Card made', 'Show the card during treatment', 'Get free treatment up to ₹5 lakh'],
      stepsMr: ['pmjay.gov.in वर पात्रता तपासा', 'जवळच्या नोंदणीकृत रुग्णालयात जा', 'आयुष्मान कार्ड बनवा', 'उपचारावेळी कार्ड दाखवा', '₹5 लाखांपर्यंत मोफत उपचार मिळतील'],
    },
    {
      id: 15,
      nameHindi: 'प्रधानमंत्री वय वंदना योजना',
      nameEnglish: 'PM Vaya Vandana Yojana',
      nameMr: 'प्रधानमंत्री वय वंदना योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#1565C0',
      amount: '8% ब्याज',
      unit: 'गारंटीड पेंशन',
      unitEnglish: 'guaranteed pension',
      unitMr: 'हमी निवृत्तीवेतन',
      desc: '60 साल से अधिक उम्र के नागरिकों के लिए निवेश योजना',
      descEnglish: 'An investment scheme for citizens above 60 years',
      descMr: '60 वर्षांवरील नागरिकांसाठी गुंतवणूक योजना',
      eligible: true,
      matchTier: 'medium',
      matchColor: '#D97706',
      warning: 'अधिकतम ₹15 लाख तक निवेश कर सकते हैं।',
      warningEnglish: 'You can invest up to a maximum of ₹15 lakh.',
      warningMr: 'जास्तीत जास्त ₹15 लाखांपर्यंत गुंतवणूक करता येते.',
      steps: ['LIC की वेबसाइट या नज़दीकी शाखा जाएं', 'PMVVY Policy खरीदें', 'निवेश राशि तय करें', 'Monthly Pension Option चुनें', '8% सालाना Guaranteed Return पाएं'],
      stepsEnglish: ['Visit the LIC website or your nearest branch', 'Buy the PMVVY policy', 'Decide the investment amount', 'Choose the monthly pension option', 'Get 8% guaranteed annual return'],
      stepsMr: ['LIC वेबसाइट किंवा जवळच्या शाखेत जा', 'PMVVY पॉलिसी खरेदी करा', 'गुंतवणुकीची रक्कम ठरवा', 'मासिक निवृत्तीवेतन पर्याय निवडा', '8% वार्षिक हमी परतावा मिळवा'],
    },
  ],
  business: [
    {
      id: 16,
      nameHindi: 'पीएम मुद्रा योजना',
      nameEnglish: 'PM Mudra Yojana',
      nameMr: 'पीएम मुद्रा योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#E8690B',
      amount: '₹10 लाख',
      unit: 'बिना Guarantee के',
      unitEnglish: 'without guarantee',
      unitMr: 'हमीशिवाय',
      desc: 'छोटे व्यापार के लिए आसान कर्ज़',
      descEnglish: 'Easy loans for small businesses',
      descMr: 'लहान व्यवसायासाठी सोपे कर्ज',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'व्यापार का कोई पूर्व अनुभव होना चाहिए।',
      warningEnglish: 'Some prior business experience is required.',
      warningMr: 'व्यवसायाचा काही आधीचा अनुभव असणे आवश्यक आहे.',
      steps: ['नज़दीकी बैंक जाएं', 'Mudra Loan Form लें', 'Business Plan और Documents दें', 'Shishu/Kishore/Tarun का चुनाव करें', 'Loan Approval के बाद Mudra Card मिलेगा'],
      stepsEnglish: ['Visit your nearest bank', 'Get the Mudra loan form', 'Give business plan and documents', 'Choose Shishu/Kishore/Tarun category', 'You get the Mudra Card after loan approval'],
      stepsMr: ['जवळच्या बँकेत जा', 'मुद्रा कर्ज फॉर्म घ्या', 'व्यवसाय योजना आणि कागदपत्रे द्या', 'शिशु/किशोर/तरुण श्रेणी निवडा', 'कर्ज मंजुरीनंतर मुद्रा कार्ड मिळेल'],
    },
    {
      id: 17,
      nameHindi: 'PM SVANidhi योजना',
      nameEnglish: 'PM SVANidhi Yojana',
      nameMr: 'PM SVANidhi योजना',
      logo: '/images/scheme-svanidhi.png',
      headerColor: '#1A6B3C',
      amount: '₹50,000',
      unit: 'Street Vendor Loan',
      unitEnglish: 'street vendor loan',
      unitMr: 'फेरीवाला कर्ज',
      desc: 'फुटपाथ दुकानदारों के लिए आसान कर्ज़',
      descEnglish: 'Easy loans for street vendors',
      descMr: 'फेरीवाल्यांसाठी सोपे कर्ज',
      eligible: true,
      matchTier: 'high',
      matchColor: '#1A6B3C',
      warning: 'Street Vendor Certificate होना ज़रूरी है।',
      warningEnglish: 'A Street Vendor Certificate is required.',
      warningMr: 'फेरीवाला प्रमाणपत्र असणे आवश्यक आहे.',
      steps: ['pmsvanidhi.mohua.gov.in पर जाएं', 'Vending Certificate बनवाएं', 'Bank में Application दें', '₹10,000 से शुरुआत होगी', 'समय पर चुकाने पर ₹50,000 तक मिलेगा'],
      stepsEnglish: ['Visit pmsvanidhi.mohua.gov.in', 'Get your vending certificate made', 'Submit application at the bank', 'Starts with ₹10,000', 'Get up to ₹50,000 with timely repayment'],
      stepsMr: ['pmsvanidhi.mohua.gov.in वर जा', 'विक्री प्रमाणपत्र बनवा', 'बँकेत अर्ज द्या', '₹10,000 पासून सुरुवात होईल', 'वेळेवर परतफेड केल्यास ₹50,000 पर्यंत मिळेल'],
    },
    {
      id: 18,
      nameHindi: 'PMEGP उद्यमिता योजना',
      nameEnglish: 'PMEGP Entrepreneurship Scheme',
      nameMr: 'PMEGP उद्योजकता योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#1565C0',
      amount: '35% सब्सिडी',
      unit: 'Manufacturing Unit पर',
      unitEnglish: 'on a manufacturing unit',
      unitMr: 'उत्पादन युनिटवर',
      desc: 'नया Manufacturing या Service उद्यम शुरू करने पर सब्सिडी',
      descEnglish: 'Subsidy for starting a new manufacturing or service business',
      descMr: 'नवीन उत्पादन किंवा सेवा व्यवसाय सुरू केल्यास अनुदान',
      eligible: false,
      matchTier: 'medium',
      matchColor: '#D97706',
      warning: '8वीं पास होना और उम्र 18 से अधिक होना ज़रूरी है।',
      warningEnglish: 'You must have passed 8th grade and be above 18 years old.',
      warningMr: '8वी उत्तीर्ण आणि वय 18 वर्षांपेक्षा जास्त असणे आवश्यक आहे.',
      steps: ['kviconline.gov.in पर जाएं', 'PMEGP Application भरें', 'Project Report तैयार करें', 'DIC Office में Submit करें', 'Bank Interview के बाद Loan और Subsidy मिलेगी'],
      stepsEnglish: ['Visit kviconline.gov.in', 'Fill the PMEGP application', 'Prepare a project report', 'Submit at the DIC office', 'Get loan and subsidy after the bank interview'],
      stepsMr: ['kviconline.gov.in वर जा', 'PMEGP अर्ज भरा', 'प्रकल्प अहवाल तयार करा', 'DIC कार्यालयात सबमिट करा', 'बँक मुलाखतीनंतर कर्ज आणि अनुदान मिळेल'],
    },
  ],
};

const documentData = {
  farmer: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'नाम ज़मीन के कागज़ से बिल्कुल मेल खाना चाहिए', tipEnglish: 'Name must exactly match your land records', tipMr: 'नाव जमिनीच्या कागदपत्रांशी तंतोतंत जुळावे', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: 'आधार इस खाते से लिंक होना चाहिए', tipEnglish: 'Aadhaar must be linked to this account', tipMr: 'आधार या खात्याशी जोडलेले असावे', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'khasra', nameHindi: 'ज़मीन के कागज़', nameEnglish: 'Khasra / Khatauni', nameMr: 'जमिनीचे कागद', tip: 'खसरा नंबर और क्षेत्रफल ज़रूरी है — पटवारी से लें', tipEnglish: 'Khasra number and area required — get it from the Patwari', tipMr: 'खसरा क्रमांक आणि क्षेत्रफळ आवश्यक — पटवारीकडून घ्या', imgSrc: '/docs/doc-khasra-khatauni.jpg', fallbackColor: '#E8690B', required: true },
    { id: 'mobile', nameHindi: 'मोबाइल नंबर', nameEnglish: 'Mobile Number (Aadhaar linked)', nameMr: 'मोबाइल क्रमांक (आधार लिंक)', tip: 'आधार से जुड़ा नंबर होना चाहिए', tipEnglish: 'Must be the number linked to Aadhaar', tipMr: 'आधारशी जोडलेला क्रमांक असावा', imgSrc: '/docs/doc-mobile-number.jpg', fallbackColor: '#7C3AED', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', nameMr: 'पासपोर्ट फोटो', tip: '2 से 4 हाल की फोटो', tipEnglish: '2 to 4 recent photos', tipMr: '2 ते 4 अलीकडील फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  women: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'नाम बिल्कुल सही होना चाहिए', tipEnglish: 'Name must be entirely correct', tipMr: 'नाव पूर्णपणे बरोबर असावे', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', nameMr: 'रेशन कार्ड (BPL)', tip: 'BPL राशन कार्ड होना ज़रूरी है', tipEnglish: 'A BPL ration card is required', tipMr: 'BPL रेशन कार्ड असणे आवश्यक आहे', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: 'महिला के नाम का खाता होना चाहिए', tipEnglish: 'Account must be in the woman\'s name', tipMr: 'खाते महिलेच्या नावावर असावे', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'marriage', nameHindi: 'विवाह प्रमाण पत्र', nameEnglish: 'Marriage Certificate', nameMr: 'विवाह प्रमाणपत्र', tip: 'विवाहित महिलाओं के लिए ज़रूरी', tipEnglish: 'Required for married women', tipMr: 'विवाहित महिलांसाठी आवश्यक', imgSrc: '/docs/doc-marriage-certificate.jpg', fallbackColor: '#BE185D', required: false },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', nameMr: 'पासपोर्ट फोटो', tip: '2 से 4 हाल की फोटो', tipEnglish: '2 to 4 recent photos', tipMr: '2 ते 4 अलीकडील फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  student: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'नाम marksheet से मेल खाना चाहिए', tipEnglish: 'Name must match your marksheet', tipMr: 'नाव गुणपत्रिकेशी जुळावे', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'marksheet', nameHindi: '12वीं की मार्कशीट', nameEnglish: '12th Marksheet', nameMr: '12वीची गुणपत्रिका', tip: 'न्यूनतम 60% अंक होने चाहिए', tipEnglish: 'Minimum 60% marks required', tipMr: 'किमान 60% गुण आवश्यक', imgSrc: '/docs/doc-12th-marksheet.jpg', fallbackColor: '#E65100', required: true },
    { id: 'bonafide', nameHindi: 'बोनाफाइड सर्टिफिकेट', nameEnglish: 'Bonafide / Admission Letter', nameMr: 'बोनाफाईड प्रमाणपत्र', tip: 'College में enrollment का प्रमाण — College से लें', tipEnglish: 'Proof of enrollment — get it from your college', tipMr: 'कॉलेजमध्ये प्रवेशाचा पुरावा — कॉलेजकडून घ्या', imgSrc: '/docs/doc-bonafide-certificate.jpg', fallbackColor: '#0369A1', required: true },
    { id: 'income', nameHindi: 'आय प्रमाण पत्र', nameEnglish: 'Income Certificate', nameMr: 'उत्पन्नाचा दाखला', tip: 'परिवार की सालाना आय का प्रमाण — तहसील से लें', tipEnglish: 'Proof of annual family income — get it from Tehsil office', tipMr: 'कुटुंबाच्या वार्षिक उत्पन्नाचा पुरावा — तहसील कार्यालयातून घ्या', imgSrc: '/docs/doc-income-certificate.jpg', fallbackColor: '#854D0E', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: 'छात्र के नाम का खाता', tipEnglish: 'Account must be in the student\'s name', tipMr: 'खाते विद्यार्थ्याच्या नावावर असावे', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
  ],
  housing: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'नाम सभी कागज़ों से मेल खाना चाहिए', tipEnglish: 'Name must match all documents', tipMr: 'नाव सर्व कागदपत्रांशी जुळावे', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', nameMr: 'रेशन कार्ड (BPL)', tip: 'SECC 2011 सूची में नाम होना चाहिए', tipEnglish: 'Name must be in the SECC 2011 list', tipMr: 'SECC 2011 यादीत नाव असावे', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'income', nameHindi: 'आय प्रमाण पत्र', nameEnglish: 'Income Certificate', nameMr: 'उत्पन्नाचा दाखला', tip: 'परिवार की आय 3 लाख से कम होनी चाहिए', tipEnglish: 'Family income must be under ₹3 lakh', tipMr: 'कुटुंबाचे उत्पन्न ₹3 लाखांपेक्षा कमी असावे', imgSrc: '/docs/doc-income-certificate.jpg', fallbackColor: '#854D0E', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: 'DBT के लिए आधार से लिंक होना चाहिए', tipEnglish: 'Must be Aadhaar-linked for DBT', tipMr: 'DBT साठी आधारशी जोडलेले असावे', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', nameMr: 'पासपोर्ट फोटो', tip: '4 हाल की पासपोर्ट साइज़ फोटो', tipEnglish: '4 recent passport size photos', tipMr: '4 अलीकडील पासपोर्ट साईज फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  senior: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'उम्र का प्रमाण — 60 साल से अधिक', tipEnglish: 'Proof of age — above 60 years', tipMr: 'वयाचा पुरावा — 60 वर्षांपेक्षा जास्त', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'age', nameHindi: 'उम्र का प्रमाण', nameEnglish: 'Age Proof (Birth Certificate)', nameMr: 'वयाचा दाखला', tip: 'जन्म प्रमाण पत्र या 10वीं मार्कशीट — ग्राम पंचायत से लें', tipEnglish: 'Birth certificate or 10th marksheet — get it from Gram Panchayat', tipMr: 'जन्म दाखला किंवा 10वीची गुणपत्रिका — ग्रामपंचायतीकडून घ्या', imgSrc: '/docs/doc-birth-certificate.jpg', fallbackColor: '#7C3AED', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', nameMr: 'रेशन कार्ड (BPL)', tip: 'BPL सूची में नाम होना ज़रूरी है', tipEnglish: 'Name must be in the BPL list', tipMr: 'BPL यादीत नाव असणे आवश्यक आहे', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: 'पेंशन इसी खाते में आएगी', tipEnglish: 'Pension will come into this account', tipMr: 'निवृत्तीवेतन याच खात्यात येईल', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', nameMr: 'पासपोर्ट फोटो', tip: '2 हाल की पासपोर्ट साइज़ फोटो', tipEnglish: '2 recent passport size photos', tipMr: '2 अलीकडील पासपोर्ट साईज फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  business: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', nameMr: 'आधार कार्ड', tip: 'व्यापार मालिक का आधार', tipEnglish: 'Aadhaar of the business owner', tipMr: 'व्यवसाय मालकाचे आधार', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'pan', nameHindi: 'पैन कार्ड', nameEnglish: 'PAN Card', nameMr: 'पॅन कार्ड', tip: '1 लाख से अधिक के loan के लिए ज़रूरी', tipEnglish: 'Required for loans above ₹1 lakh', tipMr: '₹1 लाखांपेक्षा जास्त कर्जासाठी आवश्यक', imgSrc: '/docs/doc-pan.jpg', fallbackColor: '#D97706', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', nameMr: 'बँक पासबुक', tip: '6 महीने का statement भी चाहिए होगा', tipEnglish: 'A 6-month statement will also be needed', tipMr: '6 महिन्यांचे स्टेटमेंटही लागेल', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'business_reg', nameHindi: 'व्यापार प्रमाण', nameEnglish: 'Business Registration / Udyam', nameMr: 'व्यवसाय नोंदणी / उद्यम', tip: 'Udyam Aadhar या Municipal Trade Licence', tipEnglish: 'Udyam Aadhaar or Municipal Trade Licence', tipMr: 'उद्यम आधार किंवा महानगरपालिका व्यापार परवाना', imgSrc: '/docs/doc-business-registration.jpg', fallbackColor: '#0369A1', required: false },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', nameMr: 'पासपोर्ट फोटो', tip: '2 हाल की पासपोर्ट साइज़ फोटो', tipEnglish: '2 recent passport size photos', tipMr: '2 अलीकडील पासपोर्ट साईज फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
};

function getDocName(doc: DocumentItem, lang: UiLang): string {
  if (lang === 'en-IN') return doc.nameEnglish;
  if (lang === 'mr-IN') return doc.nameMr;
  return doc.nameHindi;
}
function getDocTip(doc: DocumentItem, lang: UiLang): string {
  if (lang === 'en-IN') return doc.tipEnglish;
  if (lang === 'mr-IN') return doc.tipMr;
  return doc.tip;
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
  aadhaar: { 'hi-IN': 'आधार केंद्र या Post Office', 'mr-IN': 'आधार केंद्र किंवा पोस्ट ऑफिस', 'en-IN': 'Aadhaar Centre or Post Office' },
  passbook: { 'hi-IN': 'नज़दीकी बैंक शाखा', 'mr-IN': 'जवळची बँक शाखा', 'en-IN': 'Nearest bank branch' },
  khasra: { 'hi-IN': 'पटवारी कार्यालय या तहसील', 'mr-IN': 'तलाठी कार्यालय किंवा तहसील', 'en-IN': 'Patwari office or Tehsil office' },
  ration: { 'hi-IN': 'ग्राम पंचायत या राशन दुकान', 'mr-IN': 'ग्रामपंचायत किंवा रेशन दुकान', 'en-IN': 'Gram Panchayat or ration shop' },
  income: { 'hi-IN': 'तहसील कार्यालय', 'mr-IN': 'तहसील कार्यालय', 'en-IN': 'Tehsil office' },
  mobile: { 'hi-IN': 'आधार केंद्र — आधार update के लिए', 'mr-IN': 'आधार केंद्र — आधार अपडेटसाठी', 'en-IN': 'Aadhaar Centre — to update Aadhaar' },
  photo: { 'hi-IN': 'नज़दीकी फोटो स्टूडियो', 'mr-IN': 'जवळचा फोटो स्टुडिओ', 'en-IN': 'Nearest photo studio' },
  marksheet: { 'hi-IN': 'स्कूल या कॉलेज से', 'mr-IN': 'शाळा किंवा कॉलेजमधून', 'en-IN': 'From your school or college' },
  bonafide: { 'hi-IN': 'कॉलेज प्रशासन से', 'mr-IN': 'कॉलेज प्रशासनाकडून', 'en-IN': 'From your college administration' },
  pan: { 'hi-IN': 'NSDL वेबसाइट या Post Office', 'mr-IN': 'NSDL वेबसाइट किंवा पोस्ट ऑफिस', 'en-IN': 'NSDL website or Post Office' },
  age: { 'hi-IN': 'ग्राम पंचायत या नगर पालिका', 'mr-IN': 'ग्रामपंचायत किंवा नगरपालिका', 'en-IN': 'Gram Panchayat or municipal office' },
  marriage: { 'hi-IN': 'तहसील कार्यालय', 'mr-IN': 'तहसील कार्यालय', 'en-IN': 'Tehsil office' },
  business_reg: { 'hi-IN': 'udyamregistration.gov.in पर', 'mr-IN': 'udyamregistration.gov.in वर', 'en-IN': 'At udyamregistration.gov.in' },
  default: { 'hi-IN': 'नज़दीकी सरकारी कार्यालय', 'mr-IN': 'जवळचे सरकारी कार्यालय', 'en-IN': 'Nearest government office' },
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

function resolveUiLang(code: string): UiLang {
  if (code === 'mr-IN' || code === 'en-IN') return code;
  return 'hi-IN';
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
  const [selectedLang, setSelectedLang] = useState('hi-IN');
  const [showPincodeInput, setShowPincodeInput] = useState(false);
  const [pincodeText, setPincodeText] = useState('');
  const [scriptLang, setScriptLang] = useState<ScriptLang>('hindi');

  const autoSpeakRef = useRef(autoSpeak);
  const selectedLangRef = useRef(selectedLang);
  const hasSpokenGreetingRef = useRef(false);
  const greetingStartedRef = useRef(false);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!hasSpokenGreetingRef.current) {
        hasSpokenGreetingRef.current = true;
        const lang = selectedLangRef.current as UiLang;
        const g = greetings[lang] || greetings['hi-IN'];
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
      const g = greetings[lang] || greetings['hi-IN'];
      speak(g.msg1, lang);
      setTimeout(() => speak(g.msg2, lang), 2800);
    }
  }, []);

  const latestCategory = useMemo(() => {
    const lastSchemes = [...messages].reverse().find((m) => m.type === 'schemes' && m.category);
    return (lastSchemes?.category as SchemeCategory | undefined) ?? 'farmer';
  }, [messages]);

  const matchedSchemes = schemeData[latestCategory];

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
      const lang = resolveUiLang(selectedLangRef.current);
      const g = greetings[lang];
      const msg1 = { type: 'bot' as const, isHindi: true, text: g.msg1, timestamp: getTime() };
      setMessages((prev) => [...prev, { ...msg1, id: nextId() }]);
    }, 600);
    const t2 = setTimeout(() => {
      const lang = resolveUiLang(selectedLangRef.current);
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
    const resp = botResponses[lang] || botResponses['hi-IN'];
    
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

  const handleSend = useCallback((text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return
  setInputText('')
  addMsg({ type: 'user', text: trimmed, timestamp: getTime() })
  setIsTyping(true)

  const category = getSchemesForQuery(trimmed)
  setDocCheckCategory(category)
  const lang = selectedLangRef.current as UiLang
  const resp = botResponses[lang] || botResponses['hi-IN']
  const schemes = schemeData[category] || schemeData.farmer
  const firstEligible = schemes.find(s => s.eligible) || schemes[0]

  setTimeout(() => {
    setIsTyping(false)
    addMsg({ type: 'bot', text: resp.processing, timestamp: getTime() })
  }, 1200)

  setTimeout(() => {
    addMsg({ type: 'schemes', category, timestamp: getTime() })
    const lang = selectedLangRef.current as UiLang;
    const schemes = schemeData[category] || schemeData.farmer;
    const names = schemes.slice(0, 3).map(s => getSchemeName(s, lang)).join(', ');
    const summaryTexts: Record<UiLang, string> = {
      'hi-IN': `आपके लिए ${schemes.length} योजनाएं मिलीं: ${names}`,
      'mr-IN': `तुमच्यासाठी ${schemes.length} योजना सापडल्या: ${names}`,
      'en-IN': `Found ${schemes.length} schemes for you: ${names}`,
    };
    const summaryText = summaryTexts[lang as UiLang] || summaryTexts['hi-IN'];
    setTimeout(() => {
      if (autoSpeakRef.current) speak(summaryText, lang);
    }, 400);
  }, 1800)

    setTimeout(() => {
      const curLang = selectedLangRef.current as UiLang;
      addMsg({ type: 'bot', text: resp.recommendation(getSchemeName(firstEligible, curLang)), timestamp: getTime() })
    }, 2600)

    setTimeout(() => {
    const lang = selectedLangRef.current as UiLang;
    const resp = botResponses[lang] || botResponses['hi-IN'];
    addMsg({ type: 'prepPrompt', category, timestamp: getTime() })
    setConversationStage('results_shown')
    setIsTyping(false)
    setTimeout(() => {
      if (autoSpeakRef.current) speak(resp.prepPromptText, lang);
    }, 400);
  }, 3400)
}, [addMsg]);

  const ui = uiStrings[selectedLang as UiLang] || uiStrings['hi-IN'];
  const lang = resolveUiLang(selectedLang);

  const openWhatsAppWithSchemes = () => {
    const lines = matchedSchemes.map((s: SchemeItem) => `• ${getSchemeName(s, lang)}: ${s.amount} (${getSchemeUnit(s, lang)})`).join('\n');
    const text = `${ui.whatsappHeader}\n${lines}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleLanguageChange = (newLang: string) => {
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
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.2)] rounded-[5px] py-1 px-2 text-[11px] font-bold text-white cursor-pointer outline-none"
            style={{ fontFamily: 'var(--font-mukta)' }}
          >
            <option value="hi-IN">हिंदी</option>
            <option value="mr-IN">मराठी</option>
            <option value="en-IN">English</option>
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

            if (message.type === 'schemes' && message.category) {
              return (
                <div key={message.id} className="self-start w-full">
                  <div className="simple-scroll flex gap-[14px] overflow-x-auto px-1 pt-1 pb-3">
                    {schemeData[message.category].map((scheme) => {
                      const schemeName = getSchemeName(scheme, lang);
                      const schemeUnit = getSchemeUnit(scheme, lang);
                      const schemeDesc = getSchemeDesc(scheme, lang);
                      const schemeWarning = getSchemeWarning(scheme, lang);
                      const schemeSteps = getSchemeSteps(scheme, lang);
                      return (
                      <div key={scheme.id} className="flex flex-col items-start shrink-0 cursor-pointer transition-transform duration-200 hover:-translate-y-[3px]">
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
                              onClick={() => setExpandedCard((prev) => (prev === scheme.id ? null : scheme.id))}
                            >
                              {ui.howToGet}
                            </button>

                            <div
                              className="bg-[#F0FDF4] border-t border-[#BBF7D0] rounded-[0_0_10px_10px] mt-2 overflow-hidden transition-all duration-300 ease-in-out"
                              style={{
                                maxHeight: expandedCard === scheme.id ? '500px' : '0px',
                                opacity: expandedCard === scheme.id ? 1 : 0,
                                padding: expandedCard === scheme.id ? '10px 12px' : '0 12px',
                              }}
                            >
                              <div className="text-[9px] uppercase font-bold text-[#1A6B3C] mb-[7px]">{ui.appStepsLabel}</div>
                              {schemeSteps.map((step, idx) => (
                                <div key={step} className="flex gap-[7px] py-1">
                                  <div className="w-5 h-5 rounded-full bg-[#1A6B3C] text-white text-[9px] font-bold shrink-0 flex items-center justify-center">{idx + 1}</div>
                                  <div className="text-[11px] text-[#1C1917] leading-[1.5]">{step}</div>
                                </div>
                              ))}
                              <div className="text-[9px] text-[#A8A29E] mt-1.5">{ui.documentsLabel} {ui.commonDocsList}</div>
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
              const brPrep = botResponses[resolveUiLang(selectedLang)];
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
                              text: botResponses[resolveUiLang(selectedLangRef.current)].prepDecline,
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
                  resp={botResponses[selectedLangRef.current as UiLang] || botResponses['hi-IN']}
                  lang={selectedLang as UiLang}
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

