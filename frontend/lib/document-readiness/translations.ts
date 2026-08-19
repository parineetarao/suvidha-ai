import type { Lang } from '@/lib/strings'

type Dict = Partial<Record<Lang, string>>
type DictFn = Partial<Record<Lang, (n: string | number) => string>>

function pick(d: Dict, lang: Lang): string {
  return d[lang] ?? d['en-IN'] ?? ''
}
function pickFn(d: DictFn, lang: Lang, arg: string | number): string {
  const fn = d[lang] ?? d['en-IN']
  return fn ? fn(arg) : ''
}

export const DR = {
  common: {
    title: { 'hi-IN': 'दस्तावेज़ तैयारी जाँच', 'mr-IN': 'कागदपत्र तयारी तपासणी', 'en-IN': 'Document Readiness Check' } as Dict,
    purposeStatement: {
      'hi-IN': 'SuvidhaAI यह जाँच नहीं करता कि दस्तावेज़ असली है या नहीं। यह जाँचता है कि अपलोड किया गया दस्तावेज़ पढ़ने योग्य है और क्या सामान्य समस्याएँ आवेदन अस्वीकृत होने का कारण बन सकती हैं।',
      'mr-IN': 'SuvidhaAI कागदपत्र खरे आहे की नाही हे तपासत नाही. ते तपासते की अपलोड केलेले कागदपत्र वाचनीय आहे का आणि कोणत्या सामान्य समस्यांमुळे अर्ज नाकारला जाऊ शकतो.',
      'en-IN': 'SuvidhaAI does not verify whether a document is genuine. It checks whether the uploaded document is readable and whether common issues may cause an application to be rejected.',
    } as Dict,
    safetyNotice: {
      'hi-IN': 'यह जाँच पढ़ने में कठिनाई और जानकारी की असंगतता जैसी सामान्य समस्याएँ पहचानती है। यह दस्तावेज़ की प्रामाणिकता या योजना की मंज़ूरी की गारंटी नहीं देती।',
      'mr-IN': 'ही तपासणी वाचनीयता आणि माहितीतील विसंगती यांसारख्या सामान्य समस्या ओळखते. ती कागदपत्राची सत्यता किंवा योजनेची मंजुरी हमी देत नाही.',
      'en-IN': 'This check identifies common readability and consistency issues. It does not authenticate documents or guarantee scheme approval.',
    } as Dict,
    privacyNotice: {
      'hi-IN': 'आपका दस्तावेज़ इसी ब्राउज़र में प्रोसेस होता है। यह SuvidhaAI के सर्वर पर अपलोड नहीं किया जाता।',
      'mr-IN': 'तुमचे कागदपत्र याच ब्राउझरमध्ये प्रक्रिया केले जाते. ते SuvidhaAI सर्व्हरवर अपलोड केले जात नाही.',
      'en-IN': 'Your document is processed in this browser. It is not uploaded to a SuvidhaAI server.',
    } as Dict,
    disclaimerNote: {
      'hi-IN': 'दस्तावेज़ की आवश्यकताएं राज्य, योजना के संस्करण और आवेदन के तरीके के अनुसार बदल सकती हैं। कृपया आधिकारिक पोर्टल या CSC पर अंतिम सूची की पुष्टि करें।',
      'mr-IN': 'कागदपत्रांच्या गरजा राज्य, योजनेची आवृत्ती आणि अर्ज करण्याच्या पद्धतीनुसार बदलू शकतात. कृपया अधिकृत पोर्टलवर किंवा CSC वर अंतिम यादीची खात्री करा.',
      'en-IN': 'Document requirements may vary by state, scheme version and application channel. Confirm the final list on the official portal or at the CSC.',
    } as Dict,
    takePhotoOrUpload: { 'hi-IN': 'फोटो लें या अपलोड करें', 'mr-IN': 'फोटो काढा किंवा अपलोड करा', 'en-IN': 'Take photo or upload' } as Dict,
    takePhoto: { 'hi-IN': 'फोटो लें', 'mr-IN': 'फोटो काढा', 'en-IN': 'Take Photo' } as Dict,
    uploadFile: { 'hi-IN': 'फ़ाइल अपलोड करें', 'mr-IN': 'फाईल अपलोड करा', 'en-IN': 'Upload File' } as Dict,
    checkDocument: { 'hi-IN': 'दस्तावेज़ जाँचें', 'mr-IN': 'कागदपत्र तपासा', 'en-IN': 'Check document' } as Dict,
    checking: { 'hi-IN': 'जाँच हो रही है...', 'mr-IN': 'तपासणी सुरू आहे...', 'en-IN': 'Checking...' } as Dict,
    retakePhoto: { 'hi-IN': 'दोबारा फोटो लें', 'mr-IN': 'पुन्हा फोटो काढा', 'en-IN': 'Retake photo' } as Dict,
    replaceImage: { 'hi-IN': 'फोटो बदलें', 'mr-IN': 'फोटो बदला', 'en-IN': 'Replace image' } as Dict,
    removeImage: { 'hi-IN': 'फोटो हटाएं', 'mr-IN': 'फोटो काढून टाका', 'en-IN': 'Remove image' } as Dict,
    retry: { 'hi-IN': 'फिर कोशिश करें', 'mr-IN': 'पुन्हा प्रयत्न करा', 'en-IN': 'Retry' } as Dict,
    recheck: { 'hi-IN': 'फिर से जाँचें', 'mr-IN': 'पुन्हा तपासा', 'en-IN': 'Recheck' } as Dict,
    cancel: { 'hi-IN': 'रद्द करें', 'mr-IN': 'रद्द करा', 'en-IN': 'Cancel' } as Dict,
    close: { 'hi-IN': 'बंद करें', 'mr-IN': 'बंद करा', 'en-IN': 'Close' } as Dict,
    listen: { 'hi-IN': 'सुनें', 'mr-IN': 'ऐका', 'en-IN': 'Listen' } as Dict,
    whatWasRead: { 'hi-IN': 'दस्तावेज़ से क्या पढ़ा गया?', 'mr-IN': 'कागदपत्रातून काय वाचले गेले?', 'en-IN': 'What was read from the document?' } as Dict,
    nameReadFromDocument: { 'hi-IN': 'दस्तावेज़ से पढ़ा गया नाम', 'mr-IN': 'कागदपत्रातून वाचलेले नाव', 'en-IN': 'Name read from document' } as Dict,
    correctName: { 'hi-IN': 'नाम ठीक करें', 'mr-IN': 'नाव दुरुस्त करा', 'en-IN': 'Correct name' } as Dict,
    save: { 'hi-IN': 'सहेजें', 'mr-IN': 'जतन करा', 'en-IN': 'Save' } as Dict,
    yourName: { 'hi-IN': 'आपका नाम', 'mr-IN': 'तुमचे नाव', 'en-IN': 'Your name' } as Dict,
    enterYourName: { 'hi-IN': 'कृपया अपना पूरा नाम डालें', 'mr-IN': 'कृपया तुमचे पूर्ण नाव टाका', 'en-IN': 'Please enter your full name' } as Dict,
    required: { 'hi-IN': 'आवश्यक', 'mr-IN': 'आवश्यक', 'en-IN': 'Required' } as Dict,
    optional: { 'hi-IN': 'वैकल्पिक', 'mr-IN': 'ऐच्छिक', 'en-IN': 'Optional' } as Dict,
    clearData: { 'hi-IN': 'दस्तावेज़ जाँच डेटा हटाएं', 'mr-IN': 'कागदपत्र तपासणी डेटा हटवा', 'en-IN': 'Clear document check data' } as Dict,
    demoLabel: { 'hi-IN': 'प्रदर्शन नमूना', 'mr-IN': 'प्रात्यक्षिक नमुना', 'en-IN': 'Demonstration sample' } as Dict,
    useDemoSample: { 'hi-IN': 'प्रदर्शन दस्तावेज़ उपयोग करें', 'mr-IN': 'प्रात्यक्षिक कागदपत्र वापरा', 'en-IN': 'Use demonstration document' } as Dict,
  },

  stages: {
    preparing_image: { 'hi-IN': 'तस्वीर तैयार हो रही है...', 'mr-IN': 'प्रतिमा तयार होत आहे...', 'en-IN': 'Preparing image...' } as Dict,
    loading_language_model: { 'hi-IN': 'भाषा मॉडल लोड हो रहा है...', 'mr-IN': 'भाषा मॉडेल लोड होत आहे...', 'en-IN': 'Loading language model...' } as Dict,
    reading_document: { 'hi-IN': 'दस्तावेज़ पढ़ा जा रहा है...', 'mr-IN': 'कागदपत्र वाचले जात आहे...', 'en-IN': 'Reading document...' } as Dict,
    extracting_fields: { 'hi-IN': 'जानकारी निकाली जा रही है...', 'mr-IN': 'माहिती काढली जात आहे...', 'en-IN': 'Extracting fields...' } as Dict,
    checking_issues: { 'hi-IN': 'सामान्य समस्याएं जाँची जा रही हैं...', 'mr-IN': 'सामान्य समस्या तपासल्या जात आहेत...', 'en-IN': 'Checking common issues...' } as Dict,
    preparing_result: { 'hi-IN': 'परिणाम तैयार हो रहा है...', 'mr-IN': 'निकाल तयार होत आहे...', 'en-IN': 'Preparing result...' } as Dict,
  },

  errors: {
    ocrFailed: {
      'hi-IN': 'हम इस तस्वीर को साफ़ तौर पर नहीं पढ़ पाए। अच्छी रोशनी में दोबारा फोटो लें, पूरा दस्तावेज़ फ्रेम में रखें और चमक (glare) से बचें।',
      'mr-IN': 'आम्ही ही प्रतिमा स्पष्टपणे वाचू शकलो नाही. चांगल्या प्रकाशात पुन्हा फोटो काढा, संपूर्ण कागदपत्र फ्रेममध्ये ठेवा आणि चमक टाळा.',
      'en-IN': 'We could not read this image clearly. Retake the photo in good lighting, keep the complete document inside the frame and avoid glare.',
    } as Dict,
    invalidFileType: { 'hi-IN': 'कृपया JPG, PNG या WEBP फॉर्मेट की इमेज चुनें।', 'mr-IN': 'कृपया JPG, PNG किंवा WEBP फॉरमॅटची प्रतिमा निवडा.', 'en-IN': 'Please choose a JPG, PNG or WEBP image file.' } as Dict,
    fileTooLarge: { 'hi-IN': 'फ़ाइल का आकार 10 MB से कम होना चाहिए।', 'mr-IN': 'फाईलचा आकार 10 MB पेक्षा कमी असावा.', 'en-IN': 'File size must be under 10 MB.' } as Dict,
    workerLoadFailed: {
      'hi-IN': 'दस्तावेज़ पढ़ने वाला टूल लोड नहीं हो सका। कृपया इंटरनेट जाँचें और फिर कोशिश करें।',
      'mr-IN': 'कागदपत्र वाचणारे टूल लोड होऊ शकले नाही. कृपया इंटरनेट तपासा आणि पुन्हा प्रयत्न करा.',
      'en-IN': 'The document reader could not load. Please check your internet connection and try again.',
    } as Dict,
    marathiUnavailable: {
      'hi-IN': 'मराठी पहचान अभी लोड नहीं हो सकी। अंग्रेज़ी और हिंदी का उपयोग करके पढ़ा जा रहा है।',
      'mr-IN': 'मराठी ओळख सध्या लोड होऊ शकली नाही. इंग्रजी आणि हिंदी वापरून वाचले जात आहे.',
      'en-IN': 'Marathi recognition could not load right now. Reading using English and Hindi instead.',
    } as Dict,
    emptyResult: {
      'hi-IN': 'इस तस्वीर में कोई पाठ नहीं मिला। कृपया दोबारा कोशिश करें।',
      'mr-IN': 'या प्रतिमेत कोणताही मजकूर सापडला नाही. कृपया पुन्हा प्रयत्न करा.',
      'en-IN': 'No text was found in this image. Please try again.',
    } as Dict,
    genericError: { 'hi-IN': 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।', 'mr-IN': 'काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.', 'en-IN': 'Something went wrong. Please try again.' } as Dict,
  },

  imageQuality: {
    too_small: { 'hi-IN': 'तस्वीर का आकार बहुत छोटा है।', 'mr-IN': 'प्रतिमेचा आकार खूप लहान आहे.', 'en-IN': 'The image resolution is too small.' } as Dict,
    too_dark: { 'hi-IN': 'तस्वीर बहुत गहरी (अंधेरी) लग रही है।', 'mr-IN': 'प्रतिमा खूप गडद दिसत आहे.', 'en-IN': 'The image appears too dark.' } as Dict,
    too_bright: { 'hi-IN': 'तस्वीर बहुत तेज़ रोशनी वाली या धुली हुई लग रही है।', 'mr-IN': 'प्रतिमा खूप उजळ किंवा फिकट दिसत आहे.', 'en-IN': 'The image appears too bright or washed out.' } as Dict,
    low_contrast: { 'hi-IN': 'पाठ और पृष्ठभूमि के बीच का अंतर (कॉन्ट्रास्ट) कम है।', 'mr-IN': 'मजकूर आणि पार्श्वभूमीमधील फरक (कॉन्ट्रास्ट) कमी आहे.', 'en-IN': 'Text contrast is low.' } as Dict,
    possibly_blurry: { 'hi-IN': 'फोटो धुंधली (blurry) हो सकती है।', 'mr-IN': 'फोटो अस्पष्ट (blurry) असू शकतो.', 'en-IN': 'The photo may be blurry.' } as Dict,
    outOfFrame: { 'hi-IN': 'दस्तावेज़ का कुछ हिस्सा फ्रेम से बाहर हो सकता है।', 'mr-IN': 'कागदपत्राचा काही भाग फ्रेमबाहेर असू शकतो.', 'en-IN': 'Part of the document may be outside the frame.' } as Dict,
  },

  status: {
    not_uploaded: { 'hi-IN': 'अपलोड नहीं किया गया', 'mr-IN': 'अपलोड केलेले नाही', 'en-IN': 'Not uploaded' } as Dict,
    processing: { 'hi-IN': 'जाँच हो रही है', 'mr-IN': 'तपासणी सुरू आहे', 'en-IN': 'Checking' } as Dict,
    ready: { 'hi-IN': 'तैयार', 'mr-IN': 'तयार', 'en-IN': 'Ready' } as Dict,
    warning: { 'hi-IN': 'ध्यान देने की आवश्यकता है', 'mr-IN': 'लक्ष देण्याची गरज आहे', 'en-IN': 'Needs attention' } as Dict,
    unclear: { 'hi-IN': 'स्पष्ट नहीं', 'mr-IN': 'अस्पष्ट', 'en-IN': 'Unclear' } as Dict,
    error: { 'hi-IN': 'त्रुटि', 'mr-IN': 'त्रुटी', 'en-IN': 'Error' } as Dict,
    missing: { 'hi-IN': 'गुम', 'mr-IN': 'गहाळ', 'en-IN': 'Missing' } as Dict,
    not_checked: { 'hi-IN': 'जाँचा नहीं गया', 'mr-IN': 'तपासलेले नाही', 'en-IN': 'Not checked' } as Dict,
  },

  simpleStatus: {
    ready: { 'hi-IN': 'यह दस्तावेज़ साफ़ दिख रहा है और कोई सामान्य समस्या नहीं मिली।', 'mr-IN': 'हे कागदपत्र स्पष्ट दिसत आहे आणि कोणतीही सामान्य समस्या आढळली नाही.', 'en-IN': 'This document looks clear and no common issue was found.' } as Dict,
    warning: { 'hi-IN': 'इस दस्तावेज़ पर आवेदन से पहले ध्यान देने की ज़रूरत है।', 'mr-IN': 'या कागदपत्रावर अर्ज करण्यापूर्वी लक्ष देण्याची गरज आहे.', 'en-IN': 'This document needs attention before you apply.' } as Dict,
    unclear: { 'hi-IN': 'हम इस दस्तावेज़ को साफ़ तौर पर नहीं पढ़ पाए। कृपया दूसरी फोटो लें।', 'mr-IN': 'आम्ही हे कागदपत्र स्पष्टपणे वाचू शकलो नाही. कृपया दुसरा फोटो काढा.', 'en-IN': 'We could not read this document clearly. Please take another photo.' } as Dict,
    mismatch: { 'hi-IN': 'इस दस्तावेज़ पर नाम आपके दूसरे दस्तावेज़ से अलग हो सकता है।', 'mr-IN': 'या कागदपत्रावरील नाव तुमच्या दुसऱ्या कागदपत्रापेक्षा वेगळे असू शकते.', 'en-IN': 'The name on this document may be different from your other document.' } as Dict,
  },

  successMessage: { 'hi-IN': 'इस तस्वीर में कोई सामान्य तैयारी समस्या नहीं मिली।', 'mr-IN': 'या प्रतिमेत कोणतीही सामान्य तयारी समस्या आढळली नाही.', 'en-IN': 'No common readiness issue was detected in this image.' } as Dict,

  mismatchWarning: {
    'hi-IN': (name: string | number) => `यह तस्वीर चुने गए दस्तावेज़ से मेल नहीं खा रही है। आपने ${name} चुना था, लेकिन अपलोड की गई तस्वीर कोई और दस्तावेज़ लग रही है।`,
    'mr-IN': (name: string | number) => `ही प्रतिमा निवडलेल्या कागदपत्राशी जुळत नाही. तुम्ही ${name} निवडले होते, पण अपलोड केलेली प्रतिमा दुसरे कागदपत्र दिसत आहे.`,
    'en-IN': (name: string | number) => `This image may not be the selected document. You selected ${name}, but the uploaded image appears to be another document.`,
  } as DictFn,

  documentTypes: {
    aadhaar: { 'hi-IN': 'आधार कार्ड', 'mr-IN': 'आधार कार्ड', 'en-IN': 'Aadhaar Card' } as Dict,
    bank_passbook: { 'hi-IN': 'बैंक पासबुक', 'mr-IN': 'बँक पासबुक', 'en-IN': 'Bank Passbook' } as Dict,
    income_certificate: { 'hi-IN': 'आय प्रमाण पत्र', 'mr-IN': 'उत्पन्नाचा दाखला', 'en-IN': 'Income Certificate' } as Dict,
    ration_card: { 'hi-IN': 'राशन कार्ड', 'mr-IN': 'रेशन कार्ड', 'en-IN': 'Ration Card' } as Dict,
    land_record: { 'hi-IN': 'ज़मीन के कागज़ (7/12)', 'mr-IN': 'जमिनीचे कागद (सातबारा)', 'en-IN': 'Land Record (7/12)' } as Dict,
    caste_certificate: { 'hi-IN': 'जाति प्रमाण पत्र', 'mr-IN': 'जात प्रमाणपत्र', 'en-IN': 'Caste Certificate' } as Dict,
    domicile_certificate: { 'hi-IN': 'अधिवास प्रमाण पत्र', 'mr-IN': 'अधिवास प्रमाणपत्र', 'en-IN': 'Domicile Certificate' } as Dict,
    passport_photo: { 'hi-IN': 'पासपोर्ट फोटो', 'mr-IN': 'पासपोर्ट फोटो', 'en-IN': 'Passport Photo' } as Dict,
    other: { 'hi-IN': 'अन्य दस्तावेज़', 'mr-IN': 'इतर कागदपत्र', 'en-IN': 'Other Document' } as Dict,
  },

  reasons: {
    identityProof: { 'hi-IN': 'पहचान प्रमाण के लिए', 'mr-IN': 'ओळख पुराव्यासाठी', 'en-IN': 'For identity proof' } as Dict,
    directBenefitTransfer: { 'hi-IN': 'सीधे लाभ हस्तांतरण के लिए', 'mr-IN': 'थेट लाभ हस्तांतरणासाठी', 'en-IN': 'For direct benefit transfer' } as Dict,
    incomeProof: { 'hi-IN': 'आय प्रमाण के लिए', 'mr-IN': 'उत्पन्न पुराव्यासाठी', 'en-IN': 'For income proof' } as Dict,
    householdProof: { 'hi-IN': 'परिवार के प्रमाण के लिए', 'mr-IN': 'कुटुंब पुराव्यासाठी', 'en-IN': 'For household proof' } as Dict,
    landOwnershipProof: { 'hi-IN': 'ज़मीन के स्वामित्व के प्रमाण के लिए', 'mr-IN': 'जमीन मालकीच्या पुराव्यासाठी', 'en-IN': 'For land ownership proof' } as Dict,
    categoryProof: { 'hi-IN': 'श्रेणी प्रमाण के लिए', 'mr-IN': 'प्रवर्ग पुराव्यासाठी', 'en-IN': 'For category proof' } as Dict,
    residenceProof: { 'hi-IN': 'निवास प्रमाण के लिए', 'mr-IN': 'रहिवासी पुराव्यासाठी', 'en-IN': 'For residence proof' } as Dict,
    photoRequirement: { 'hi-IN': 'फॉर्म पर फोटो के लिए', 'mr-IN': 'फॉर्मवरील फोटोसाठी', 'en-IN': 'For the application photo' } as Dict,
  },

  issues: {
    // shared
    docTypeMismatch: {
      messageKey: 'issue.docTypeMismatch.message',
      suggestionKey: 'issue.docTypeMismatch.suggestion',
      message: { 'hi-IN': 'अपलोड की गई तस्वीर चुने गए दस्तावेज़ से मेल नहीं खा रही है।', 'mr-IN': 'अपलोड केलेली प्रतिमा निवडलेल्या कागदपत्राशी जुळत नाही.', 'en-IN': 'The uploaded image does not appear to match the selected document type.' } as Dict,
      suggestion: { 'hi-IN': 'सही दस्तावेज़ की फोटो दोबारा अपलोड करें।', 'mr-IN': 'योग्य कागदपत्राचा फोटो पुन्हा अपलोड करा.', 'en-IN': 'Please upload a photo of the correct document.' } as Dict,
    },
    textTooShort: {
      message: { 'hi-IN': 'दस्तावेज़ से पर्याप्त पाठ नहीं मिल पाया।', 'mr-IN': 'कागदपत्रातून पुरेसा मजकूर सापडला नाही.', 'en-IN': 'Not enough readable text was found on this document.' } as Dict,
      suggestion: { 'hi-IN': 'अच्छी रोशनी में, पास से और सीधी फोटो लें।', 'mr-IN': 'चांगल्या प्रकाशात, जवळून आणि सरळ फोटो काढा.', 'en-IN': 'Take a straight, close-up photo in good lighting.' } as Dict,
    },
    nameUnreadable: {
      message: { 'hi-IN': 'नाम स्पष्ट रूप से नहीं पढ़ा जा सका।', 'mr-IN': 'नाव स्पष्टपणे वाचता आले नाही.', 'en-IN': 'The name could not be read clearly.' } as Dict,
      suggestion: { 'hi-IN': 'दस्तावेज़ पर नाम वाला हिस्सा साफ़ और सीधा दिखे, ऐसी फोटो लें।', 'mr-IN': 'कागदपत्रावरील नावाचा भाग स्पष्ट आणि सरळ दिसेल असा फोटो काढा.', 'en-IN': 'Take a photo where the name section is sharp and unobstructed.' } as Dict,
    },
    nameMismatch: {
      message: { 'hi-IN': 'इस दस्तावेज़ का नाम आपकी प्रोफ़ाइल के नाम से मेल नहीं खाता।', 'mr-IN': 'या कागदपत्रावरील नाव तुमच्या प्रोफाइलमधील नावाशी जुळत नाही.', 'en-IN': 'The name on this document does not match your profile name.' } as Dict,
      suggestion: { 'hi-IN': 'कुछ योजनाओं या CSC प्रक्रियाओं में नाम अलग होने पर दस्तावेज़ अस्वीकृत हो सकता है। आवेदन से पहले नाम जाँचें या ठीक करें।', 'mr-IN': 'काही योजना किंवा CSC प्रक्रियांमध्ये नाव वेगळे असल्यास कागदपत्र नाकारले जाऊ शकते. अर्ज करण्यापूर्वी नाव तपासा किंवा दुरुस्त करा.', 'en-IN': 'Some schemes or CSC workflows may reject documents when names differ. Confirm or correct the name before applying.' } as Dict,
    },
    // aadhaar
    aadhaarNumberNotFound: {
      message: { 'hi-IN': 'आधार जैसी 12-अंकों की संख्या नहीं मिली।', 'mr-IN': 'आधारसारखी 12-अंकी संख्या सापडली नाही.', 'en-IN': 'A 12-digit Aadhaar-like number was not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि आधार नंबर वाला हिस्सा फोटो में साफ़ दिखे।', 'mr-IN': 'आधार क्रमांक असलेला भाग फोटोमध्ये स्पष्ट दिसेल याची खात्री करा.', 'en-IN': 'Make sure the section with the Aadhaar number is clearly visible.' } as Dict,
    },
    dobNotFound: {
      message: { 'hi-IN': 'जन्म तिथि या जन्म वर्ष नहीं मिला।', 'mr-IN': 'जन्मतारीख किंवा जन्म वर्ष सापडले नाही.', 'en-IN': 'A date of birth or year of birth was not found.' } as Dict,
      suggestion: { 'hi-IN': 'DOB वाला हिस्सा फोटो में साफ़ दिखे, यह सुनिश्चित करें।', 'mr-IN': 'DOB असलेला भाग फोटोमध्ये स्पष्ट दिसेल याची खात्री करा.', 'en-IN': 'Make sure the DOB section is clearly visible in the photo.' } as Dict,
    },
    // bank
    accountNumberNotFound: {
      message: { 'hi-IN': 'खाता संख्या जैसा पाठ नहीं मिला।', 'mr-IN': 'खाते क्रमांकासारखा मजकूर सापडला नाही.', 'en-IN': 'An account-number-like sequence was not found.' } as Dict,
      suggestion: { 'hi-IN': 'पासबुक का पहला पन्ना अपलोड करें जिसमें खाता संख्या हो।', 'mr-IN': 'ज्यावर खाते क्रमांक आहे ते पासबुकचे पहिले पान अपलोड करा.', 'en-IN': 'Upload the first/details page of the passbook that shows the account number.' } as Dict,
    },
    ifscNotFound: {
      message: { 'hi-IN': 'IFSC कोड नहीं मिला।', 'mr-IN': 'IFSC कोड सापडला नाही.', 'en-IN': 'An IFSC code was not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि पन्ने पर IFSC कोड दिखे।', 'mr-IN': 'पानावर IFSC कोड दिसत आहे याची खात्री करा.', 'en-IN': 'Make sure the IFSC code is visible on the page you photographed.' } as Dict,
    },
    notDetailsPage: {
      message: { 'hi-IN': 'यह पासबुक का लेन-देन पृष्ठ लग रहा है, विवरण पृष्ठ नहीं।', 'mr-IN': 'हे पासबुकचे व्यवहार पान वाटते, तपशील पान नाही.', 'en-IN': 'This looks like a transaction page, not the details page.' } as Dict,
      suggestion: { 'hi-IN': 'पासबुक का पहला पन्ना अपलोड करें जिसमें नाम, खाता संख्या और IFSC हो।', 'mr-IN': 'ज्यावर नाव, खाते क्रमांक आणि IFSC आहे ते पहिले पान अपलोड करा.', 'en-IN': 'Upload the first page that shows the name, account number and IFSC.' } as Dict,
    },
    // income certificate
    incomeAmountNotFound: {
      message: { 'hi-IN': 'आय राशि साफ़ तौर पर नहीं मिली।', 'mr-IN': 'उत्पन्नाची रक्कम स्पष्टपणे सापडली नाही.', 'en-IN': 'An income amount was not clearly found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि आय राशि वाला हिस्सा फोटो में साफ़ हो।', 'mr-IN': 'उत्पन्नाची रक्कम असलेला भाग फोटोमध्ये स्पष्ट असल्याची खात्री करा.', 'en-IN': 'Make sure the section showing the income amount is clear in the photo.' } as Dict,
    },
    issuingAuthorityNotFound: {
      message: { 'hi-IN': 'जारीकर्ता प्राधिकारी (जैसे तहसीलदार) नहीं मिला।', 'mr-IN': 'जारी करणारा अधिकारी (उदा. तहसीलदार) सापडला नाही.', 'en-IN': 'The issuing authority (e.g. Tehsildar) was not found.' } as Dict,
      suggestion: { 'hi-IN': 'सील और हस्ताक्षर वाला हिस्सा फोटो में शामिल करें।', 'mr-IN': 'शिक्का आणि स्वाक्षरी असलेला भाग फोटोमध्ये समाविष्ट करा.', 'en-IN': 'Include the section with the stamp and signature in the photo.' } as Dict,
    },
    certificateOutdated: {
      message: { 'hi-IN': 'यह प्रमाण पत्र कुछ योजनाओं की मान्य अवधि से पुराना हो सकता है। योजना की वर्तमान आवश्यकता की पुष्टि करें।', 'mr-IN': 'हे प्रमाणपत्र काही योजनांच्या वैधता कालावधीपेक्षा जुने असू शकते. योजनेच्या सध्याच्या गरजेची खात्री करा.', 'en-IN': 'This certificate may be older than the validity period accepted by some schemes. Confirm the scheme’s current requirement.' } as Dict,
      suggestion: { 'hi-IN': 'यदि आवश्यक हो तो नया आय प्रमाण पत्र बनवाएं।', 'mr-IN': 'आवश्यक असल्यास नवीन उत्पन्नाचा दाखला काढा.', 'en-IN': 'Get a fresh income certificate if the scheme requires a recent one.' } as Dict,
    },
    // ration card
    rationTermsNotFound: {
      message: { 'hi-IN': 'राशन कार्ड या खाद्य विभाग से जुड़े शब्द नहीं मिले।', 'mr-IN': 'रेशन कार्ड किंवा अन्न विभागाशी संबंधित शब्द सापडले नाहीत.', 'en-IN': 'Ration card or food department terms were not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि यह राशन कार्ड की फोटो है और शीर्षक वाला हिस्सा दिखे।', 'mr-IN': 'हे रेशन कार्डचा फोटो आहे आणि मथळ्याचा भाग दिसत आहे याची खात्री करा.', 'en-IN': 'Make sure this is a ration card photo and the heading is visible.' } as Dict,
    },
    familyInfoNotFound: {
      message: { 'hi-IN': 'परिवार के सदस्यों की जानकारी नहीं मिली।', 'mr-IN': 'कुटुंबातील सदस्यांची माहिती सापडली नाही.', 'en-IN': 'Family/household member details were not found.' } as Dict,
      suggestion: { 'hi-IN': 'वह पन्ना अपलोड करें जिसमें परिवार के सदस्यों की सूची हो।', 'mr-IN': 'ज्यावर कुटुंबातील सदस्यांची यादी आहे ते पान अपलोड करा.', 'en-IN': 'Upload the page that lists the family members.' } as Dict,
    },
    // land record
    landIdentifierNotFound: {
      message: { 'hi-IN': 'सर्वे/गट/खाता नंबर जैसी पहचान नहीं मिली।', 'mr-IN': 'सर्वे/गट/खाते क्रमांकासारखी ओळख सापडली नाही.', 'en-IN': 'A Survey/Gat/Khata-like identifier was not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि सर्वे नंबर वाला हिस्सा फोटो में साफ़ दिखे।', 'mr-IN': 'सर्वे क्रमांक असलेला भाग फोटोमध्ये स्पष्ट दिसेल याची खात्री करा.', 'en-IN': 'Make sure the survey number section is clearly visible.' } as Dict,
    },
    ownerNameInitials: {
      message: { 'hi-IN': 'मालिक का नाम संक्षिप्त रूप (initials) में लग रहा है।', 'mr-IN': 'मालकाचे नाव संक्षिप्त रूपात (initials) दिसत आहे.', 'en-IN': 'The owner’s name appears to be abbreviated with initials.' } as Dict,
      suggestion: { 'hi-IN': 'संक्षिप्त नाम कभी-कभी अस्वीकृति का कारण बनते हैं। पूरा नाम दिखाने वाला दस्तावेज़ भी साथ रखें।', 'mr-IN': 'संक्षिप्त नावांमुळे कधीकधी नकार मिळू शकतो. पूर्ण नाव दाखवणारे कागदपत्रही सोबत ठेवा.', 'en-IN': 'Abbreviated names can sometimes cause rejection. Keep a document showing the full name as well.' } as Dict,
    },
    // caste certificate
    casteTermsNotFound: {
      message: { 'hi-IN': 'जाति प्रमाण पत्र से जुड़े शब्द नहीं मिले।', 'mr-IN': 'जात प्रमाणपत्राशी संबंधित शब्द सापडले नाहीत.', 'en-IN': 'Caste certificate related terms were not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि यह जाति प्रमाण पत्र की फोटो है।', 'mr-IN': 'हे जात प्रमाणपत्राचा फोटो आहे याची खात्री करा.', 'en-IN': 'Make sure this is a photo of the caste certificate.' } as Dict,
    },
    referenceNumberNotFound: {
      message: { 'hi-IN': 'प्रमाण पत्र/संदर्भ संख्या नहीं मिली।', 'mr-IN': 'प्रमाणपत्र/संदर्भ क्रमांक सापडला नाही.', 'en-IN': 'A certificate/reference number was not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि संख्या वाला हिस्सा फोटो में साफ़ हो।', 'mr-IN': 'क्रमांक असलेला भाग फोटोमध्ये स्पष्ट असल्याची खात्री करा.', 'en-IN': 'Make sure the reference number section is clear in the photo.' } as Dict,
    },
    // domicile
    domicileTermsNotFound: {
      message: { 'hi-IN': 'अधिवास/निवास प्रमाण पत्र से जुड़े शब्द नहीं मिले।', 'mr-IN': 'अधिवास/रहिवासी प्रमाणपत्राशी संबंधित शब्द सापडले नाहीत.', 'en-IN': 'Domicile/residence certificate terms were not found.' } as Dict,
      suggestion: { 'hi-IN': 'सुनिश्चित करें कि यह अधिवास प्रमाण पत्र की फोटो है।', 'mr-IN': 'हे अधिवास प्रमाणपत्राचा फोटो आहे याची खात्री करा.', 'en-IN': 'Make sure this is a photo of the domicile certificate.' } as Dict,
    },
    dateOrRefNotFound: {
      message: { 'hi-IN': 'दिनांक या संदर्भ संख्या नहीं मिली।', 'mr-IN': 'दिनांक किंवा संदर्भ क्रमांक सापडला नाही.', 'en-IN': 'A date or reference number was not found.' } as Dict,
      suggestion: { 'hi-IN': 'पूरा दस्तावेज़ फ्रेम में रखकर दोबारा फोटो लें।', 'mr-IN': 'संपूर्ण कागदपत्र फ्रेममध्ये ठेवून पुन्हा फोटो काढा.', 'en-IN': 'Retake the photo with the full document inside the frame.' } as Dict,
    },
  },

  nameMatch: {
    label: {
      match: { 'hi-IN': 'मेल खाता है', 'mr-IN': 'जुळते', 'en-IN': 'Match' } as Dict,
      minor_variation: { 'hi-IN': 'थोड़ा अंतर हो सकता है', 'mr-IN': 'थोडा फरक असू शकतो', 'en-IN': 'Possible minor variation' } as Dict,
      mismatch: { 'hi-IN': 'मेल नहीं खाता', 'mr-IN': 'जुळत नाही', 'en-IN': 'Mismatch' } as Dict,
      insufficient: { 'hi-IN': 'पर्याप्त जानकारी नहीं', 'mr-IN': 'पुरेशी माहिती नाही', 'en-IN': 'Not enough information' } as Dict,
    },
    initialsWarning: {
      'hi-IN': 'नाम में संक्षिप्त अक्षर (initials) हैं — इससे कुछ जगह अस्वीकृति हो सकती है।',
      'mr-IN': 'नावात संक्षिप्त अक्षरे (initials) आहेत — यामुळे काही ठिकाणी नकार मिळू शकतो.',
      'en-IN': 'The name uses initials — this may cause rejection in some workflows.',
    } as Dict,
    generalCaution: {
      'hi-IN': 'कुछ योजनाओं या CSC प्रक्रियाओं में नाम अलग होने पर दस्तावेज़ अस्वीकृत हो सकता है। आवेदन से पहले नाम जाँचें या ठीक करें।',
      'mr-IN': 'काही योजना किंवा CSC प्रक्रियांमध्ये नाव वेगळे असल्यास कागदपत्र नाकारले जाऊ शकते. अर्ज करण्यापूर्वी नाव तपासा किंवा दुरुस्त करा.',
      'en-IN': 'Some schemes or CSC workflows may reject documents when names differ. Confirm or correct the name before applying.',
    } as Dict,
    simpleFoundDifferent: { 'hi-IN': 'हमें आपके नाम के अलग-अलग रूप मिले', 'mr-IN': 'आम्हाला तुमच्या नावाची वेगवेगळी रूपे आढळली', 'en-IN': 'We found different versions of your name' } as Dict,
    simpleCheckPrompt: { 'hi-IN': 'कृपया जाँचें कि दोनों दस्तावेज़ों पर एक जैसा पूरा नाम है या नहीं।', 'mr-IN': 'कृपया दोन्ही कागदपत्रांवर एकसारखे पूर्ण नाव आहे का ते तपासा.', 'en-IN': 'Please check whether both documents use the same complete name.' } as Dict,
    tableHeaderDocument: { 'hi-IN': 'दस्तावेज़', 'mr-IN': 'कागदपत्र', 'en-IN': 'Document' } as Dict,
    tableHeaderName: { 'hi-IN': 'पढ़ा गया नाम', 'mr-IN': 'वाचलेले नाव', 'en-IN': 'Name read' } as Dict,
    tableHeaderComparison: { 'hi-IN': 'तुलना', 'mr-IN': 'तुलना', 'en-IN': 'Comparison' } as Dict,
    tableHeaderAction: { 'hi-IN': 'कार्रवाई', 'mr-IN': 'कृती', 'en-IN': 'Action' } as Dict,
    crossDocTitle: { 'hi-IN': 'दस्तावेज़ों में नाम की तुलना', 'mr-IN': 'कागदपत्रांमधील नावांची तुलना', 'en-IN': 'Cross-document name comparison' } as Dict,
  },

  score: {
    title: { 'hi-IN': 'तैयारी स्कोर', 'mr-IN': 'तयारी स्कोअर', 'en-IN': 'Readiness score' } as Dict,
    applicationReadiness: { 'hi-IN': 'आवेदन तैयारी', 'mr-IN': 'अर्ज तयारी', 'en-IN': 'Application Readiness' } as Dict,
    readyToProceed: { 'hi-IN': 'आगे बढ़ने के लिए तैयार', 'mr-IN': 'पुढे जाण्यासाठी तयार', 'en-IN': 'Ready to proceed' } as Dict,
    reviewIssues: { 'hi-IN': 'कुछ समस्याओं की समीक्षा करें', 'mr-IN': 'काही समस्यांचे पुनरावलोकन करा', 'en-IN': 'Review a few issues' } as Dict,
    fixIssues: { 'hi-IN': 'CSC जाने से पहले ज़रूरी समस्याएं ठीक करें', 'mr-IN': 'CSC ला जाण्यापूर्वी महत्त्वाच्या समस्या दुरुस्त करा', 'en-IN': 'Fix important issues before visiting the CSC' } as Dict,
    documentsRequired: { 'hi-IN': 'आवश्यक दस्तावेज़', 'mr-IN': 'आवश्यक कागदपत्रे', 'en-IN': 'Documents required' } as Dict,
    documentsChecked: { 'hi-IN': 'जाँचे गए दस्तावेज़', 'mr-IN': 'तपासलेली कागदपत्रे', 'en-IN': 'Documents checked' } as Dict,
    documentsReady: { 'hi-IN': 'तैयार दस्तावेज़', 'mr-IN': 'तयार कागदपत्रे', 'en-IN': 'Documents ready' } as Dict,
    documentsAttention: { 'hi-IN': 'ध्यान चाहिए', 'mr-IN': 'लक्ष हवे', 'en-IN': 'Need attention' } as Dict,
    nextAction: { 'hi-IN': 'अगला ज़रूरी कदम', 'mr-IN': 'पुढील महत्त्वाचे पाऊल', 'en-IN': 'Most important next action' } as Dict,
    nextActionUpload: { 'hi-IN': 'बाकी दस्तावेज़ अपलोड करें', 'mr-IN': 'उरलेली कागदपत्रे अपलोड करा', 'en-IN': 'Upload the remaining documents' } as Dict,
    nextActionFix: { 'hi-IN': 'चिह्नित समस्याओं को ठीक करें', 'mr-IN': 'चिन्हांकित समस्या दुरुस्त करा', 'en-IN': 'Fix the flagged issues' } as Dict,
    nextActionDone: { 'hi-IN': 'आप CSC जाने के लिए तैयार हैं', 'mr-IN': 'तुम्ही CSC ला जाण्यासाठी तयार आहात', 'en-IN': 'You are ready to visit the CSC' } as Dict,
  },

  simpleFlow: {
    checkMyDocuments: { 'hi-IN': 'मेरे दस्तावेज़ जाँचें', 'mr-IN': 'माझी कागदपत्रे तपासा', 'en-IN': 'Check my documents' } as Dict,
    doYouHaveThis: { 'hi-IN': 'क्या आपके पास यह दस्तावेज़ है?', 'mr-IN': 'तुमच्याकडे हे कागदपत्र आहे का?', 'en-IN': 'Do you have this document?' } as Dict,
    yes: { 'hi-IN': 'हाँ', 'mr-IN': 'हो', 'en-IN': 'Yes' } as Dict,
    no: { 'hi-IN': 'नहीं', 'mr-IN': 'नाही', 'en-IN': 'No' } as Dict,
    nextDocument: { 'hi-IN': 'अगला दस्तावेज़', 'mr-IN': 'पुढील कागदपत्र', 'en-IN': 'Next document' } as Dict,
    checkAgain: { 'hi-IN': 'फिर से जाँचें', 'mr-IN': 'पुन्हा तपासा', 'en-IN': 'Check again' } as Dict,
    prepareForCSC: { 'hi-IN': 'CSC के लिए तैयारी करें', 'mr-IN': 'CSC साठी तयारी करा', 'en-IN': 'Prepare for CSC' } as Dict,
    shareSummary: { 'hi-IN': 'सारांश भेजें', 'mr-IN': 'सारांश पाठवा', 'en-IN': 'Share summary' } as Dict,
    findNearestCSC: { 'hi-IN': 'नज़दीकी CSC खोजें', 'mr-IN': 'जवळचे CSC शोधा', 'en-IN': 'Find nearest CSC' } as Dict,
    summaryTitle: { 'hi-IN': 'आपकी तैयारी का सारांश', 'mr-IN': 'तुमच्या तयारीचा सारांश', 'en-IN': 'Your readiness summary' } as Dict,
    startedFrom: { 'hi-IN': 'दस्तावेज़ जाँच शुरू करते हैं', 'mr-IN': 'कागदपत्र तपासणी सुरू करूया', 'en-IN': 'Let’s check your documents' } as Dict,
  },

  full: {
    tabTitle: { 'hi-IN': 'दस्तावेज़ तैयारी', 'mr-IN': 'कागदपत्र तयारी', 'en-IN': 'Document Readiness' } as Dict,
    requiredDocuments: { 'hi-IN': 'आवश्यक दस्तावेज़', 'mr-IN': 'आवश्यक कागदपत्रे', 'en-IN': 'Required Documents' } as Dict,
    selectedScheme: { 'hi-IN': 'चुनी गई योजना', 'mr-IN': 'निवडलेली योजना', 'en-IN': 'Selected Scheme' } as Dict,
    extractedFields: { 'hi-IN': 'निकाली गई जानकारी', 'mr-IN': 'काढलेली माहिती', 'en-IN': 'Extracted Fields' } as Dict,
    issuesAndSuggestions: { 'hi-IN': 'समस्याएं और सुझाव', 'mr-IN': 'समस्या आणि सूचना', 'en-IN': 'Issues & Suggestions' } as Dict,
    confidence: { 'hi-IN': 'भरोसे का स्तर', 'mr-IN': 'विश्वासार्हतेची पातळी', 'en-IN': 'Confidence' } as Dict,
    confidenceHigh: { 'hi-IN': 'उच्च', 'mr-IN': 'उच्च', 'en-IN': 'High' } as Dict,
    confidenceMedium: { 'hi-IN': 'मध्यम', 'mr-IN': 'मध्यम', 'en-IN': 'Medium' } as Dict,
    confidenceLow: { 'hi-IN': 'कम', 'mr-IN': 'कमी', 'en-IN': 'Low' } as Dict,
    selectADocument: { 'hi-IN': 'परिणाम देखने के लिए एक दस्तावेज़ चुनें', 'mr-IN': 'निकाल पाहण्यासाठी एक कागदपत्र निवडा', 'en-IN': 'Select a document to see the result' } as Dict,
    noProfileNamePrompt: { 'hi-IN': 'नाम तुलना के लिए कृपया अपना नाम डालें।', 'mr-IN': 'नाव तुलनेसाठी कृपया तुमचे नाव टाका.', 'en-IN': 'Please enter your name to run the name comparison.' } as Dict,
    preparationSummary: { 'hi-IN': 'अंतिम तैयारी सारांश', 'mr-IN': 'अंतिम तयारी सारांश', 'en-IN': 'Final Preparation Summary' } as Dict,
    demoSectionTitle: { 'hi-IN': 'प्रदर्शन के लिए (डेमो)', 'mr-IN': 'प्रात्यक्षिकासाठी (डेमो)', 'en-IN': 'For Demonstration' } as Dict,
  },

  demoScenarios: {
    aadhaarReady: { 'hi-IN': 'आधार — तैयार', 'mr-IN': 'आधार — तयार', 'en-IN': 'Aadhaar — Ready' } as Dict,
    bankMissingIfsc: { 'hi-IN': 'बैंक पासबुक — IFSC गुम', 'mr-IN': 'बँक पासबुक — IFSC गहाळ', 'en-IN': 'Bank Passbook — Missing IFSC' } as Dict,
    incomeOutdated: { 'hi-IN': 'आय प्रमाण पत्र — शायद पुराना', 'mr-IN': 'उत्पन्नाचा दाखला — कदाचित जुना', 'en-IN': 'Income Certificate — Potentially Outdated' } as Dict,
    landNameMismatch: { 'hi-IN': 'ज़मीन के कागज़ — नाम में अंतर', 'mr-IN': 'जमिनीचे कागद — नावात फरक', 'en-IN': 'Land Record — Abbreviated Name Mismatch' } as Dict,
    blurryUnclear: { 'hi-IN': 'धुंधली तस्वीर — अस्पष्ट परिणाम', 'mr-IN': 'अस्पष्ट फोटो — अस्पष्ट निकाल', 'en-IN': 'Blurry Image — Unclear Result' } as Dict,
  },

  a11y: {
    uploadInputLabel: { 'hi-IN': 'दस्तावेज़ की तस्वीर अपलोड करें', 'mr-IN': 'कागदपत्राचा फोटो अपलोड करा', 'en-IN': 'Upload document photo' } as Dict,
    cameraInputLabel: { 'hi-IN': 'दस्तावेज़ की तस्वीर लें', 'mr-IN': 'कागदपत्राचा फोटो काढा', 'en-IN': 'Take document photo' } as Dict,
    progressLabel: { 'hi-IN': 'दस्तावेज़ जाँच प्रगति', 'mr-IN': 'कागदपत्र तपासणी प्रगती', 'en-IN': 'Document check progress' } as Dict,
    removeImageLabel: { 'hi-IN': 'अपलोड की गई तस्वीर हटाएं', 'mr-IN': 'अपलोड केलेला फोटो काढून टाका', 'en-IN': 'Remove uploaded image' } as Dict,
  },
} as const

export function drt(dict: Dict, lang: Lang): string {
  return pick(dict, lang)
}
export function drtf(dict: DictFn, lang: Lang, arg: string | number): string {
  return pickFn(dict, lang, arg)
}
