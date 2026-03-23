'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

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
  logo: string;
  headerColor: string;
  amount: string;
  unit: string;
  desc: string;
  eligible: boolean;
  matchLabel: string;
  matchColor: string;
  warning: string | null;
  steps: string[];
};

const getTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function speak(text: string, lang = 'hi-IN') {
  if (typeof window === 'undefined') return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.82;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

type UiLang = 'hi-IN' | 'mr-IN' | 'en-IN';

const uiStrings = {
  'hi-IN': {
    govSchemeHelper: 'GOVERNMENT SCHEME HELPER',
    sarkariSahayak: 'सरकारी सहायक',
    activeConversation: 'ACTIVE CONVERSATION',
    farmerSearch: 'Farmer schemes search',
    farmerSearchSub: 'मैं महाराष्ट्र से एक किसान...',
    whatsapp: 'WhatsApp पर भेजें',
    helpline: 'Helpline · 155261',
    csc: 'नज़दीकी CSC खोजें',
    simpleMode: 'सरल मोड',
    detailedMode: 'विस्तृत',
    sarkaricSahayakSub: 'सरकारी सहायक · Simple Mode',
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
  },
  'mr-IN': {
    govSchemeHelper: 'GOVERNMENT SCHEME HELPER',
    sarkariSahayak: 'सरकारी सहाय्यक',
    activeConversation: 'सक्रिय संभाषण',
    farmerSearch: 'शेतकरी योजना शोध',
    farmerSearchSub: 'मी महाराष्ट्रातून एक शेतकरी...',
    whatsapp: 'WhatsApp वर पाठवा',
    helpline: 'Helpline · 155261',
    csc: 'जवळचे CSC शोधा',
    simpleMode: 'सरल मोड',
    detailedMode: 'तपशील',
    sarkaricSahayakSub: 'सरकारी सहाय्यक · Simple Mode',
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
      logo: '/images/scheme-kisan.jpg',
      headerColor: '#1A6B3C',
      amount: '₹6,000',
      unit: 'सालाना',
      desc: 'सीधे बैंक खाते में · 3 किस्तों में',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'आधार को बैंक खाते से लिंक करना ज़रूरी है।',
      steps: ['pmkisan.gov.in पर जाएं या CSC केंद्र जाएं', 'New Farmer Registration पर क्लिक करें', 'आधार नंबर डालें', 'ज़मीन के कागज़ और बैंक नंबर भरें', 'Submit करें और Reference Number नोट करें'],
    },
    {
      id: 2,
      nameHindi: 'प्रधानमंत्री फसल बीमा',
      logo: '/images/scheme-fasal-bima.png',
      headerColor: '#E8690B',
      amount: 'फसल बीमा',
      unit: 'पूरे नुकसान की भरपाई',
      desc: 'बाढ़, सूखा, ओले — किसी भी नुकसान का मुआवज़ा',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'बुआई के 2 हफ्ते के अंदर आवेदन करना ज़रूरी है।',
      steps: ['बैंक या CSC केंद्र पर जाएं', 'PMFBY Form भरें', 'खसरा नंबर और बुआई जानकारी दें', 'प्रीमियम का भुगतान करें', 'बीमा Certificate लें'],
    },
    {
      id: 3,
      nameHindi: 'किसान क्रेडिट कार्ड',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1565C0',
      amount: '₹3 लाख',
      unit: '4% ब्याज पर',
      desc: 'खेती के लिए सस्ते कर्ज़ का सबसे आसान तरीका',
      eligible: false,
      matchLabel: 'Medium Match',
      matchColor: '#D97706',
      warning: 'ज़मीन आपके नाम होनी चाहिए।',
      steps: ['नज़दीकी बैंक में KCC Form लें', 'ज़मीन के कागज़ और पहचान पत्र लाएं', 'बैंक अधिकारी से बात करें', 'Form जमा करें', '7 दिन में Card मिलेगा'],
    },
  ],
  women: [
    {
      id: 4,
      nameHindi: 'पीएम उज्ज्वला योजना',
      logo: '/images/scheme-ujjwala.png',
      headerColor: '#6A1B9A',
      amount: 'मुफ्त LPG',
      unit: 'गैस कनेक्शन',
      desc: 'BPL परिवार की महिलाओं के लिए मुफ्त गैस कनेक्शन',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'BPL राशन कार्ड होना ज़रूरी है।',
      steps: ['नज़दीकी LPG वितरक के पास जाएं', 'Ujjwala Application Form लें', 'BPL कार्ड और आधार जमा करें', 'Verification के बाद Connection मिलेगा', 'पहला Cylinder मुफ्त मिलेगा'],
    },
    {
      id: 5,
      nameHindi: 'सुकन्या समृद्धि योजना',
      logo: '/images/scheme-sukanya.png',
      headerColor: '#880E4F',
      amount: '8.2% ब्याज',
      unit: 'बेटी के लिए बचत',
      desc: '10 साल से कम उम्र की बेटी के लिए बचत खाता',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'बेटी की उम्र 10 साल से कम होनी चाहिए।',
      steps: ['नज़दीकी Post Office या बैंक जाएं', 'Sukanya Samridhi Form लें', 'बेटी का Birth Certificate और आधार दें', 'न्यूनतम ₹250 से खाता खुलेगा', 'हर साल जमा करते रहें'],
    },
    {
      id: 6,
      nameHindi: 'मातृत्व वंदना योजना',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#E8690B',
      amount: '₹5,000',
      unit: 'पहले बच्चे पर',
      desc: 'गर्भवती और स्तनपान कराने वाली महिलाओं के लिए',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'पहले जीवित बच्चे के जन्म पर ही लागू।',
      steps: ['नज़दीकी आंगनवाड़ी केंद्र जाएं', 'PMMVY Form-1A भरें', 'Bank Passbook और आधार दें', 'तीन किस्तों में पैसे मिलेंगे', 'आंगनवाड़ी कार्यकर्ता से मदद लें'],
    },
  ],
  student: [
    {
      id: 7,
      nameHindi: 'पीएम छात्रवृत्ति योजना',
      logo: '/images/scheme-pmkvy.png',
      headerColor: '#E65100',
      amount: '₹36,000',
      unit: 'सालाना छात्रवृत्ति',
      desc: 'पूर्व सैनिकों के बच्चों के लिए उच्च शिक्षा',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: '12वीं में 60% से अधिक अंक होने चाहिए।',
      steps: ['ksb.gov.in पर जाएं', 'PM Scholarship के लिए Register करें', 'Mark Sheets और Documents Upload करें', 'Online Application Submit करें', 'Result एक महीने में आएगा'],
    },
    {
      id: 8,
      nameHindi: 'PMKVY कौशल विकास',
      logo: '/images/scheme-pmkvy.png',
      headerColor: '#1565C0',
      amount: 'मुफ्त Training',
      unit: 'Certificate के साथ',
      desc: 'युवाओं के लिए मुफ्त कौशल प्रशिक्षण और रोज़गार',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: null,
      steps: ['pmkvyofficial.org पर जाएं', 'नज़दीकी Training Centre ढूंढें', 'Registration करें', 'Training Complete करें', 'Certificate और Job Placement पाएं'],
    },
    {
      id: 9,
      nameHindi: 'नेशनल मेरिट स्कॉलरशिप',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#1A6B3C',
      amount: '₹12,000',
      unit: 'सालाना',
      desc: 'मेधावी छात्रों के लिए राष्ट्रीय छात्रवृत्ति',
      eligible: false,
      matchLabel: 'Medium Match',
      matchColor: '#D97706',
      warning: 'परिवार की आय ₹1.5 लाख से कम होनी चाहिए।',
      steps: ['scholarships.gov.in पर जाएं', 'National Scholarship Portal पर Register करें', 'Institute और Course Details भरें', 'Income Certificate Upload करें', 'Submit करके Tracking ID नोट करें'],
    },
  ],
  housing: [
    {
      id: 10,
      nameHindi: 'पीएम आवास योजना ग्रामीण',
      logo: '/images/scheme-awas.png',
      headerColor: '#1565C0',
      amount: '₹1.3 लाख',
      unit: 'घर बनाने के लिए',
      desc: 'ग्रामीण BPL परिवारों के लिए पक्के घर की सहायता',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'SECC 2011 सूची में नाम होना ज़रूरी है।',
      steps: ['ग्राम पंचायत कार्यालय जाएं', 'PMAY-G के लिए आवेदन करें', 'BPL Card और आधार जमा करें', 'Survey के लिए Wait करें', 'स्वीकृति के बाद किस्तों में राशि मिलेगी'],
    },
    {
      id: 11,
      nameHindi: 'पीएम आवास योजना शहरी',
      logo: '/images/scheme-awas.png',
      headerColor: '#E8690B',
      amount: '₹2.67 लाख',
      unit: 'Home Loan Subsidy',
      desc: 'शहरी गरीबों के लिए किफायती आवास',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'पहले से कोई पक्का घर नहीं होना चाहिए।',
      steps: ['pmaymis.gov.in पर जाएं', 'Online Apply करें', 'Income और Property Documents दें', 'Bank Home Loan के लिए Apply करें', 'Subsidy सीधे Loan Account में आएगी'],
    },
    {
      id: 12,
      nameHindi: 'स्वच्छ भारत मिशन शौचालय',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1A6B3C',
      amount: '₹12,000',
      unit: 'शौचालय निर्माण',
      desc: 'ग्रामीण परिवारों के लिए शौचालय बनाने की सहायता',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: null,
      steps: ['ग्राम पंचायत से संपर्क करें', 'SBM Application Form भरें', 'आधार और Bank Details दें', 'शौचालय बनाएं', 'Completion Photo submit करें और ₹12,000 पाएं'],
    },
  ],
  senior: [
    {
      id: 13,
      nameHindi: 'इंदिरा गांधी वृद्धावस्था पेंशन',
      logo: '/images/scheme-jandhan.png',
      headerColor: '#1A6B3C',
      amount: '₹200-500',
      unit: 'हर महीने',
      desc: '60 साल से अधिक उम्र के BPL नागरिकों के लिए पेंशन',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'BPL सूची में नाम होना ज़रूरी है।',
      steps: ['ग्राम पंचायत या नगर पालिका जाएं', 'IGNOAPS Application Form लें', 'Age Proof और BPL Card जमा करें', 'Application Submit करें', 'Approval के बाद हर महीने पेंशन मिलेगी'],
    },
    {
      id: 14,
      nameHindi: 'आयुष्मान भारत PMJAY',
      logo: '/images/scheme-ayushman.png',
      headerColor: '#FF671F',
      amount: '₹5 लाख',
      unit: 'हर साल स्वास्थ्य बीमा',
      desc: 'गरीब परिवारों के लिए मुफ्त अस्पताल इलाज',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: null,
      steps: ['pmjay.gov.in पर Eligibility Check करें', 'नज़दीकी Empanelled Hospital जाएं', 'Ayushman Card बनवाएं', 'इलाज के समय Card दिखाएं', '₹5 लाख तक मुफ्त इलाज मिलेगा'],
    },
    {
      id: 15,
      nameHindi: 'प्रधानमंत्री वय वंदना योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#1565C0',
      amount: '8% ब्याज',
      unit: 'गारंटीड पेंशन',
      desc: '60 साल से अधिक उम्र के नागरिकों के लिए निवेश योजना',
      eligible: true,
      matchLabel: 'Medium Match',
      matchColor: '#D97706',
      warning: 'अधिकतम ₹15 लाख तक निवेश कर सकते हैं।',
      steps: ['LIC की वेबसाइट या नज़दीकी शाखा जाएं', 'PMVVY Policy खरीदें', 'निवेश राशि तय करें', 'Monthly Pension Option चुनें', '8% सालाना Guaranteed Return पाएं'],
    },
  ],
  business: [
    {
      id: 16,
      nameHindi: 'पीएम मुद्रा योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#E8690B',
      amount: '₹10 लाख',
      unit: 'बिना Guarantee के',
      desc: 'छोटे व्यापार के लिए आसान कर्ज़',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'व्यापार का कोई पूर्व अनुभव होना चाहिए।',
      steps: ['नज़दीकी बैंक जाएं', 'Mudra Loan Form लें', 'Business Plan और Documents दें', 'Shishu/Kishore/Tarun का चुनाव करें', 'Loan Approval के बाद Mudra Card मिलेगा'],
    },
    {
      id: 17,
      nameHindi: 'PM SVANidhi योजना',
      logo: '/images/scheme-svanidhi.png',
      headerColor: '#1A6B3C',
      amount: '₹50,000',
      unit: 'Street Vendor Loan',
      desc: 'फुटपाथ दुकानदारों के लिए आसान कर्ज़',
      eligible: true,
      matchLabel: 'High Match',
      matchColor: '#1A6B3C',
      warning: 'Street Vendor Certificate होना ज़रूरी है।',
      steps: ['pmsvanidhi.mohua.gov.in पर जाएं', 'Vending Certificate बनवाएं', 'Bank में Application दें', '₹10,000 से शुरुआत होगी', 'समय पर चुकाने पर ₹50,000 तक मिलेगा'],
    },
    {
      id: 18,
      nameHindi: 'PMEGP उद्यमिता योजना',
      logo: '/images/scheme-mudra.png',
      headerColor: '#1565C0',
      amount: '35% सब्सिडी',
      unit: 'Manufacturing Unit पर',
      desc: 'नया Manufacturing या Service उद्यम शुरू करने पर सब्सिडी',
      eligible: false,
      matchLabel: 'Medium Match',
      matchColor: '#D97706',
      warning: '8वीं पास होना और उम्र 18 से अधिक होना ज़रूरी है।',
      steps: ['kviconline.gov.in पर जाएं', 'PMEGP Application भरें', 'Project Report तैयार करें', 'DIC Office में Submit करें', 'Bank Interview के बाद Loan और Subsidy मिलेगी'],
    },
  ],
};

const documentData = {
  farmer: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'नाम ज़मीन के कागज़ से बिल्कुल मेल खाना चाहिए', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: 'आधार इस खाते से लिंक होना चाहिए', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'khasra', nameHindi: 'ज़मीन के कागज़', nameEnglish: 'Khasra / Khatauni', tip: 'खसरा नंबर और क्षेत्रफल ज़रूरी है — पटवारी से लें', imgSrc: '/docs/doc-khasra-khatauni.jpg', fallbackColor: '#E8690B', required: true },
    { id: 'mobile', nameHindi: 'मोबाइल नंबर', nameEnglish: 'Mobile Number (Aadhaar linked)', tip: 'आधार से जुड़ा नंबर होना चाहिए', imgSrc: '/docs/doc-mobile-number.jpg', fallbackColor: '#7C3AED', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', tip: '2 से 4 हाल की फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  women: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'नाम बिल्कुल सही होना चाहिए', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', tip: 'BPL राशन कार्ड होना ज़रूरी है', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: 'महिला के नाम का खाता होना चाहिए', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'marriage', nameHindi: 'विवाह प्रमाण पत्र', nameEnglish: 'Marriage Certificate', tip: 'विवाहित महिलाओं के लिए ज़रूरी', imgSrc: '/docs/doc-marriage-certificate.jpg', fallbackColor: '#BE185D', required: false },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', tip: '2 से 4 हाल की फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  student: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'नाम marksheet से मेल खाना चाहिए', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'marksheet', nameHindi: '12वीं की मार्कशीट', nameEnglish: '12th Marksheet', tip: 'न्यूनतम 60% अंक होने चाहिए', imgSrc: '/docs/doc-12th-marksheet.jpg', fallbackColor: '#E65100', required: true },
    { id: 'bonafide', nameHindi: 'बोनाफाइड सर्टिफिकेट', nameEnglish: 'Bonafide / Admission Letter', tip: 'College में enrollment का प्रमाण — College से लें', imgSrc: '/docs/doc-bonafide-certificate.jpg', fallbackColor: '#0369A1', required: true },
    { id: 'income', nameHindi: 'आय प्रमाण पत्र', nameEnglish: 'Income Certificate', tip: 'परिवार की सालाना आय का प्रमाण — तहसील से लें', imgSrc: '/docs/doc-income-certificate.jpg', fallbackColor: '#854D0E', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: 'छात्र के नाम का खाता', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
  ],
  housing: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'नाम सभी कागज़ों से मेल खाना चाहिए', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', tip: 'SECC 2011 सूची में नाम होना चाहिए', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'income', nameHindi: 'आय प्रमाण पत्र', nameEnglish: 'Income Certificate', tip: 'परिवार की आय 3 लाख से कम होनी चाहिए', imgSrc: '/docs/doc-income-certificate.jpg', fallbackColor: '#854D0E', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: 'DBT के लिए आधार से लिंक होना चाहिए', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', tip: '4 हाल की पासपोर्ट साइज़ फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  senior: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'उम्र का प्रमाण — 60 साल से अधिक', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'age', nameHindi: 'उम्र का प्रमाण', nameEnglish: 'Age Proof (Birth Certificate)', tip: 'जन्म प्रमाण पत्र या 10वीं मार्कशीट — ग्राम पंचायत से लें', imgSrc: '/docs/doc-birth-certificate.jpg', fallbackColor: '#7C3AED', required: true },
    { id: 'ration', nameHindi: 'राशन कार्ड', nameEnglish: 'Ration Card (BPL)', tip: 'BPL सूची में नाम होना ज़रूरी है', imgSrc: '/docs/doc-ration-card.jpg', fallbackColor: '#DC2626', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: 'पेंशन इसी खाते में आएगी', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', tip: '2 हाल की पासपोर्ट साइज़ फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
  business: [
    { id: 'aadhaar', nameHindi: 'आधार कार्ड', nameEnglish: 'Aadhaar Card', tip: 'व्यापार मालिक का आधार', imgSrc: '/docs/doc-aadhaar.jpg', fallbackColor: '#1565C0', required: true },
    { id: 'pan', nameHindi: 'पैन कार्ड', nameEnglish: 'PAN Card', tip: '1 लाख से अधिक के loan के लिए ज़रूरी', imgSrc: '/docs/doc-pan.jpg', fallbackColor: '#D97706', required: true },
    { id: 'passbook', nameHindi: 'बैंक पासबुक', nameEnglish: 'Bank Passbook', tip: '6 महीने का statement भी चाहिए होगा', imgSrc: '/docs/doc-bank-passbook.jpg', fallbackColor: '#1A6B3C', required: true },
    { id: 'business_reg', nameHindi: 'व्यापार प्रमाण', nameEnglish: 'Business Registration / Udyam', tip: 'Udyam Aadhar या Municipal Trade Licence', imgSrc: '/docs/doc-business-registration.jpg', fallbackColor: '#0369A1', required: false },
    { id: 'photo', nameHindi: 'पासपोर्ट फोटो', nameEnglish: 'Passport Size Photos', tip: '2 हाल की पासपोर्ट साइज़ फोटो', imgSrc: '/docs/doc-passport-photo.jpg', fallbackColor: '#0F766E', required: true },
  ],
};

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

const docLocationMap: Record<string, string> = {
  aadhaar: 'Aadhaar Centre या Post Office',
  passbook: 'नज़दीकी बैंक शाखा',
  khasra: 'पटवारी कार्यालय या तहसील',
  ration: 'ग्राम पंचायत या राशन दुकान',
  income: 'तहसील कार्यालय — Tehsildar',
  mobile: 'Aadhaar Centre — आधार update के लिए',
  photo: 'नज़दीकी Photo Studio',
  marksheet: 'School या College से',
  bonafide: 'College Administration से',
  pan: 'NSDL वेबसाइट या Post Office',
  age: 'ग्राम पंचायत या नगर पालिका',
  marriage: 'तहसील कार्यालय — Tehsildar',
  business_reg: 'udyamregistration.gov.in',
  default: 'नज़दीकी सरकारी कार्यालय',
};

type DocumentItem = (typeof documentData)[SchemeCategory][number];

function getSchemesForQuery(query: string): SchemeCategory {
  const q = query.toLowerCase();
  if (q.includes('किसान') || q.includes('kisan') || q.includes('farmer') || q.includes('खेती') || q.includes('fasal') || q.includes('फसल') || q.includes('किसान कर्ज़')) return 'farmer';
  if (q.includes('महिला') || q.includes('women') || q.includes('woman') || q.includes('widow') || q.includes('विधवा') || q.includes('beti') || q.includes('maternity')) return 'women';
  if (q.includes('student') || q.includes('छात्र') || q.includes('पढ़ाई') || q.includes('scholarship') || q.includes('शिक्षा') || q.includes('education') || q.includes('बच्चों की पढ़ाई')) return 'student';
  if (q.includes('घर') || q.includes('housing') || q.includes('awas') || q.includes('home') || q.includes('makaan') || q.includes('घर की मदद')) return 'housing';
  if (q.includes('pension') || q.includes('पेंशन') || q.includes('बुज़ुर्ग') || q.includes('senior') || q.includes('old age')) return 'senior';
  if (q.includes('business') || q.includes('loan') || q.includes('mudra') || q.includes('कर्ज़') || q.includes('उद्योग')) return 'business';
  if (q.includes('दवाइयाँ') || q.includes('health') || q.includes('hospital') || q.includes('ayushman') || q.includes('इलाज')) return 'senior';
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
}: {
  doc: DocumentItem;
  status: DocCheckStatus;
  onMark: (docId: string, answer: 'yes' | 'no') => void;
  addMsg: AddMsgFn;
  getTime: () => string;
  ui: UiStringsBundle;
  resp: typeof botResponses[UiLang];
}) {
  const borderColor = status === 'yes' ? '#1A6B3C' : status === 'no' ? '#DC2626' : '#E7E0D8';
  const nameColor = status === 'yes' ? '#1A6B3C' : status === 'no' ? '#DC2626' : '#1C1917';
  const firstChar = Array.from(doc.nameHindi)[0] ?? '?';

  const handleWhereClick = () => {
    const loc = docLocationMap[doc.id] ?? docLocationMap.default;
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
          alt={doc.nameHindi}
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
          {doc.nameHindi}
        </span>
        <span className="text-[10px] text-[#A8A29E] block mb-0.5">{doc.nameEnglish}</span>
        <span className="text-[9px] text-[#78716C] leading-[1.4] block mb-1.5">{doc.tip}</span>
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
          <div className="text-center py-1.5 text-[11px] text-[#15803D] font-bold bg-[#F0FDF4] border border-[#BBF7D0] rounded-md">{ui.readyStrip}</div>
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
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] py-2 px-2.5 flex gap-1.5 items-start mb-3.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <p className="text-[11px] text-[#92400E] leading-[1.5]">{ui.warningNote}</p>
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
            />
          ))}
        </div>

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
                        <span className="text-[12px] text-[#15803D] font-semibold">{d.nameHindi}</span>
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
                        {d.nameHindi}
                        <span className="text-[11px] text-[#A8A29E] font-normal">
                          {' '}
                          → {docLocationMap[d.id] ?? docLocationMap.default}
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
                      `https://www.google.com/maps/search/${encodeURIComponent(docLocationMap[missingDocs[0].id] ?? docLocationMap.default)}`,
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
    const names = schemes.slice(0, 3).map(s => s.nameHindi).join(', ');
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
      addMsg({ type: 'bot', text: resp.recommendation(firstEligible.nameHindi), timestamp: getTime() })
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

  const openWhatsAppWithSchemes = () => {
    const lines = matchedSchemes.map((s: SchemeItem) => `• ${s.nameHindi}: ${s.amount} (${s.unit})`).join('\n');
    const text = `SuvidhaAI योजनाएँ:\n${lines}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const ui = uiStrings[selectedLang as UiLang] || uiStrings['hi-IN'];

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
              Home
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
            <button className="text-[11px] text-[rgba(255,255,255,0.6)] px-3 py-1" onClick={() => alert('Full Mode — Coming Soon')}>
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
            onChange={(e) => setSelectedLang(e.target.value)}
            className="bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.2)] rounded-[5px] py-1 px-2 text-[11px] font-bold text-white cursor-pointer outline-none"
            style={{ fontFamily: 'var(--font-mukta)' }}
          >
            <option value="hi-IN">Hindi</option>
            <option value="mr-IN">Marathi</option>
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
                    {schemeData[message.category].map((scheme) => (
                      <div key={scheme.id} className="flex flex-col items-start shrink-0 cursor-pointer transition-transform duration-200 hover:-translate-y-[3px]">
                        <div className="h-3 w-20 rounded-[6px_6px_0_0]" style={{ backgroundColor: scheme.headerColor }} />
                        <div
                          className="w-[240px] bg-white rounded-[0_12px_12px_12px] border-2 overflow-hidden shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
                          style={{ borderColor: scheme.headerColor }}
                        >
                          <div className="h-16 py-[10px] px-3 flex items-center gap-[9px]" style={{ backgroundColor: scheme.headerColor }}>
                            <div className="w-9 h-9 bg-white rounded-full overflow-hidden border-[1.5px] border-[rgba(255,255,255,0.4)] shrink-0 flex items-center justify-center">
                              <Image src={scheme.logo} alt={scheme.nameHindi} width={32} height={32} style={{ objectFit: 'contain' }} />
                            </div>
                            <div className="text-[13px] leading-[1.25] text-white font-bold flex-1">{scheme.nameHindi}</div>
                            {scheme.eligible ? (
                              <span className="text-[9px] font-bold py-[2px] px-[7px] rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] whitespace-nowrap">✓ Eligible</span>
                            ) : (
                              <span className="text-[9px] font-bold py-[2px] px-[7px] rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] whitespace-nowrap">⚠ Verify</span>
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
                                <div className="text-[7px] font-bold uppercase leading-none mt-0.5">पात्र</div>
                                <div className="text-[8px] font-bold leading-none mt-0.5">Eligible</div>
                              </div>
                            </div>
                            <div className="text-[13px] font-bold text-[#57534E] mt-0.5">{scheme.unit}</div>
                            <div className="text-[11px] text-[#78716C] leading-[1.5] mt-1">{scheme.desc}</div>

                            {scheme.warning && (
                              <div className="mt-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] py-[7px] px-[9px] flex gap-[5px] items-start">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                </svg>
                                <div className="text-[10px] text-[#92400E] leading-[1.4]">{scheme.warning}</div>
                              </div>
                            )}

                            <div className="mt-1.5 text-[10px] font-bold" style={{ color: scheme.matchColor }}>
                              Match status: {scheme.matchLabel}
                            </div>

                            <button
                              className="mt-2.5 w-full bg-[#E8690B] text-white border-none rounded-[9px] py-2.5 text-[13px] font-bold hover:bg-[#C2570A] transition-all duration-150"
                              onClick={() => setExpandedCard((prev) => (prev === scheme.id ? null : scheme.id))}
                            >
                              कैसे मिलेगा?
                            </button>

                            <div
                              className="bg-[#F0FDF4] border-t border-[#BBF7D0] rounded-[0_0_10px_10px] mt-2 overflow-hidden transition-all duration-300 ease-in-out"
                              style={{
                                maxHeight: expandedCard === scheme.id ? '500px' : '0px',
                                opacity: expandedCard === scheme.id ? 1 : 0,
                                padding: expandedCard === scheme.id ? '10px 12px' : '0 12px',
                              }}
                            >
                              <div className="text-[9px] uppercase font-bold text-[#1A6B3C] mb-[7px]">आवेदन के चरण:</div>
                              {scheme.steps.map((step, idx) => (
                                <div key={step} className="flex gap-[7px] py-1">
                                  <div className="w-5 h-5 rounded-full bg-[#1A6B3C] text-white text-[9px] font-bold shrink-0 flex items-center justify-center">{idx + 1}</div>
                                  <div className="text-[11px] text-[#1C1917] leading-[1.5]">{step}</div>
                                </div>
                              ))}
                              <div className="text-[9px] text-[#A8A29E] mt-1.5">दस्तावेज़: आधार, बैंक पासबुक, पहचान पत्र</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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

