"""
app/services/voice_profile_service.py

Best-effort extraction of an eligibility profile (gender, age, state,
occupation, caste, BPL, income, disability) from a free-text sentence the
user spoke or typed (already transcribed by voice_service.py). This is deliberately a
plain rule-based parser, not an LLM call — the inputs are short first-person
sentences ("I am a 21 year old woman...") and a keyword/regex approach is
fast, has zero extra infra cost, and is easy to extend per language.

Feeds app/services/matching_service.py's UserProfile, which drives the
strict eligibility filter in POST /schemes/voice-search — a scheme is only
returned when every rule it has is satisfied by what the user said.
Keywords cover English, Hindi and Marathi for every field; gender and age
also cover the other 7 supported languages.
"""

import re

# Gender keyword lists, best-effort per supported language. Matched as
# whole-word/substring checks against the lowercased transcript. Female
# checked before male in parse_profile so a sentence mentioning both (e.g.
# "not a boy, a girl") — an edge case we don't try to resolve — picks the
# first list checked; not perfect, good enough for a free-text hint.
FEMALE_WORDS: dict[str, list[str]] = {
    "en": ["woman", "female", "girl", "daughter", "wife", "mother", "lady"],
    "hi": ["महिला", "औरत", "लड़की", "स्त्री", "बेटी", "पत्नी"],
    "mr": ["महिला", "स्त्री", "मुलगी", "बायको"],
    "ta": ["பெண்", "பெண்மணி", "மகள்"],
    "te": ["మహిళ", "స్త్రీ", "అమ్మాయి", "కూతురు"],
    "kn": ["ಮಹಿಳೆ", "ಹೆಣ್ಣು", "ಹುಡುಗಿ", "ಮಗಳು"],
    "ml": ["സ്ത്രീ", "പെൺകുട്ടി", "സ്ത്രീയാണ്", "മകൾ"],
    "bn": ["মহিলা", "নারী", "মেয়ে", "কন্যা"],
    "gu": ["મહિલા", "સ્ત્રી", "છોકરી", "દીકરી"],
    "pa": ["ਔਰਤ", "ਕੁੜੀ", "ਇਸਤਰੀ", "ਧੀ"],
}

MALE_WORDS: dict[str, list[str]] = {
    "en": ["man", "male", "boy", "son", "husband", "father"],
    "hi": ["पुरुष", "आदमी", "लड़का", "बेटा", "पति"],
    "mr": ["पुरुष", "माणूस", "मुलगा", "नवरा"],
    "ta": ["ஆண்", "ஆண்மகன்", "மகன்"],
    "te": ["పురుషుడు", "మగవాడు", "అబ్బాయి", "కొడుకు"],
    "kn": ["ಪುರುಷ", "ಗಂಡು", "ಹುಡುಗ", "ಮಗ"],
    "ml": ["പുരുഷൻ", "ആൺകുട്ടി", "മകൻ"],
    "bn": ["পুরুষ", "ছেলে", "পুত্র"],
    "gu": ["પુરુષ", "છોકરો", "દીકરો"],
    "pa": ["ਆਦਮੀ", "ਮੁੰਡਾ", "ਪੁਰਖ", "ਪੁੱਤਰ"],
}

# Age-unit words used near a number ("21 year old", "25 साल", "45 वर्षांचा").
# Kept broad on purpose — used only to disambiguate which number in the
# sentence is the age when more than one number is present.
AGE_UNIT_WORDS = [
    "year", "years", "yr",
    "साल", "वर्ष", "वर्षा", "वर्षांची", "वर्षांचा", "वर्षांचे",
    "वयस्सुள்ள", "வயது",
    "సంవత్సరాల", "వయస్సు",
    "ವರ್ಷದ", "ವಯಸ್ಸಿನ",
    "വയസ്സുള്ള", "വയസ്സ്",
    "বছর", "বয়সী",
    "વર્ષની", "વર્ષનો", "ઉંમર",
    "ਸਾਲ", "ਉਮਰ",
]

# English/Hindi/Marathi number words -> digits. Whisper often normalizes
# spoken numbers into digits already (e.g. "twenty one" -> "21"), but this
# covers the cases where it doesn't, for the 3 languages exercised in the
# required end-to-end proof (English, Hindi, + one more = Marathi).
_EN_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_EN_TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90,
}


def _words_to_int_en(text: str) -> int | None:
    """Parses a run like 'twenty one' or 'forty-five' into 45. Returns None
    if the run doesn't look like an age-shaped number word sequence."""
    tokens = re.split(r"[\s-]+", text.lower().strip())
    tokens = [t for t in tokens if t]
    if not tokens:
        return None
    if len(tokens) == 1:
        if tokens[0] in _EN_ONES:
            return _EN_ONES[tokens[0]]
        if tokens[0] in _EN_TENS:
            return _EN_TENS[tokens[0]]
        return None
    if len(tokens) == 2 and tokens[0] in _EN_TENS and tokens[1] in _EN_ONES:
        return _EN_TENS[tokens[0]] + _EN_ONES[tokens[1]]
    return None


_EN_NUMBER_WORD_RE = re.compile(
    r"\b((?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)"
    r"(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?"
    r"|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))\b",
    re.IGNORECASE,
)

# Hindi/Marathi number words (1-100, shared across both languages in Devanagari)
_HI_MR_NUMBERS = {
    "अठारह": 18, "उन्नीस": 19, "बीस": 20, "इक्कीस": 21, "बाईस": 22,
    "तेईस": 23, "चौबीस": 24, "पच्चीस": 25, "छब्बीस": 26, "सत्ताईस": 27,
    "अठ्ठाईस": 28, "उनतीस": 29, "तीस": 30, "पैंतीस": 35, "चालीस": 40,
    "पैंतालीस": 45, "पचास": 50, "पचपन": 55, "साठ": 60, "सत्तर": 70,
    "अस्सी": 80, "नब्बे": 90,
}
_HI_MR_NUM_RE = re.compile("|".join(re.escape(k) for k in sorted(_HI_MR_NUMBERS, key=len, reverse=True)))


def _extract_age(text: str, skip_spans: list[tuple[int, int]] = ()) -> int | None:
    """Finds a plausible human age (1-119) in `text`. Prefers a number that
    sits next to an age-unit word (e.g. 'year old', 'साल'); falls back to
    the first plausible standalone number if no unit word is found."""
    lowered = text.lower()

    def _taken(span: tuple[int, int]) -> bool:
        # Numbers already claimed by the income parser ("50 thousand per
        # year") must never be re-read as an age.
        return any(s <= span[0] < e for s, e in skip_spans)

    # 1) digit + unit word nearby, e.g. "21 year old", "25 साल"
    for match in re.finditer(r"\b(\d{1,3})\b", text):
        if _taken(match.span()):
            continue
        start, end = match.span()
        window = lowered[max(0, start - 20):min(len(text), end + 25)]
        if any(unit.lower() in window for unit in AGE_UNIT_WORDS):
            value = int(match.group(1))
            if 1 <= value <= 119:
                return value

    # 2) English number words + unit word nearby, e.g. "twenty one years old"
    for match in _EN_NUMBER_WORD_RE.finditer(text):
        if _taken(match.span()):
            continue
        start, end = match.span()
        window = lowered[max(0, start - 5):min(len(text), end + 25)]
        if any(unit.lower() in window for unit in AGE_UNIT_WORDS if unit.isascii()):
            value = _words_to_int_en(match.group(1))
            if value is not None and 1 <= value <= 119:
                return value

    # 3) Hindi/Marathi number words + unit word nearby
    for match in _HI_MR_NUM_RE.finditer(text):
        if _taken(match.span()):
            continue
        start, end = match.span()
        window = text[max(0, start - 5):min(len(text), end + 15)]
        if any(unit in window for unit in AGE_UNIT_WORDS if not unit.isascii()):
            return _HI_MR_NUMBERS[match.group(0)]

    # 4) No unit word found anywhere — fall back to the first bare digit
    # number in a plausible age range, still requiring 2-3 digits so we
    # don't mistake "1" (as in "I have 1 child") for an age.
    for match in re.finditer(r"\b(\d{2,3})\b", text):
        if _taken(match.span()):
            continue
        value = int(match.group(1))
        if 1 <= value <= 119:
            return value

    return None


def _has_word(lowered: str, word: str) -> bool:
    """Latin-script keywords are matched as whole words, so "son" doesn't
    fire inside "person" or "man" inside "manager". Indic-script keywords
    stay plain substring checks — `\\b` is unreliable around combining
    vowel signs, and those words carry inflected suffixes anyway."""
    word = word.lower()
    if word.isascii():
        return re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", lowered) is not None
    return word in lowered


TRANSGENDER_WORDS = ["transgender", "trans woman", "trans man", "third gender", "kinnar", "hijra", "eunuch",
                     "किन्नर", "ट्रांसजेंडर", "तृतीयपंथी", "तृतीय लिंग"]


def _extract_gender(text: str, language: str) -> str | None:
    lowered = text.lower()
    # Checked first: "transgender woman" must not fall through to "woman".
    if any(_has_word(lowered, w) for w in TRANSGENDER_WORDS):
        return "transgender"
    female_words = FEMALE_WORDS.get(language, []) + (FEMALE_WORDS["en"] if language != "en" else [])
    male_words = MALE_WORDS.get(language, []) + (MALE_WORDS["en"] if language != "en" else [])

    for word in female_words:
        if _has_word(lowered, word):
            return "female"
    for word in male_words:
        if _has_word(lowered, word):
            return "male"
    return None


# ── Occupation ──────────────────────────────────────────────────────────
# Canonical values match the strings used in schemes.eligibility_rules
# ["occupations"] (after matching_service.normalize_occupation), so a parsed
# occupation can be compared directly against a scheme's list. Occupations
# that no published scheme targets (driver, teacher, …) are still detected:
# knowing someone IS a driver lets the matcher rule out farmer-only schemes
# instead of treating the occupation as unknown.
OCCUPATION_WORDS: dict[str, list[str]] = {
    "farmer": ["farmer", "farming", "kisan", "cultivator", "agriculture", "agricultural labourer",
               "किसान", "खेती", "कृषक", "शेतकरी", "शेती"],
    "fisherman": ["fisherman", "fishermen", "fisher", "fisherwoman", "fish farmer", "fishing",
                  "मछुआरा", "मछुआरे", "मछली पालन", "मच्छीमार", "कोळी"],
    "student": ["student", "studying", "i study", "college", "school", "university",
                "छात्र", "छात्रा", "विद्यार्थी", "विद्यार्थिनी", "पढ़ता", "पढ़ती", "पढ़ाई", "शिकतो", "शिकते"],
    "business owner": ["business", "businessman", "businesswoman", "entrepreneur", "shopkeeper", "shop owner",
                       "self employed", "self-employed", "startup",
                       "व्यापार", "व्यापारी", "व्यवसाय", "दुकान", "उद्यमी", "धंदा", "उद्योजक"],
    # Bare "construction" is deliberately absent — "loan for house
    # construction" is a need, not an occupation.
    "construction worker": ["construction worker", "construction labourer", "construction labour", "mason",
                            "building worker",
                            "निर्माण मजदूर", "बांधकाम कामगार", "राजमिस्त्री"],
    "sanitation worker": ["sanitation worker", "sanitation", "safai karmachari", "safai karamchari", "sweeper",
                          "सफाई कर्मचारी", "सफाई कामगार", "सफाई"],
    "tailor": ["tailor", "tailoring", "stitching", "silai", "दर्जी", "सिलाई", "शिंपी"],
    "government employee": ["government employee", "govt employee", "government job", "government servant",
                            "सरकारी कर्मचारी", "सरकारी नौकरी", "शासकीय कर्मचारी"],
    "ex-serviceman": ["ex-serviceman", "ex serviceman", "ex-army", "retired army", "veteran", "retired soldier",
                      "पूर्व सैनिक", "माजी सैनिक"],
    "engineer": ["engineer", "इंजीनियर", "अभियंता"],
    "folk artist": ["folk artist", "folk singer", "folk dancer", "लोक कलाकार", "लोककलाकार"],
    # Detected-but-untargeted occupations (see note above).
    "driver": ["driver", "ड्राइवर", "चालक"],
    "teacher": ["teacher", "शिक्षक", "अध्यापक"],
    "labourer": ["labourer", "laborer", "daily wage", "mazdoor", "मजदूर", "मज़दूर", "कामगार"],
    "domestic worker": ["domestic worker", "maid", "घरेलू कामगार", "घरकाम"],
    "street vendor": ["street vendor", "hawker", "रेहड़ी", "फेरीवाला"],
    "homemaker": ["homemaker", "housewife", "गृहिणी"],
    "unemployed": ["unemployed", "jobless", "no job", "बेरोजगार", "बेरोज़गार"],
}


def _extract_occupations(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for occupation, words in OCCUPATION_WORDS.items():
        if occupation == "farmer" and re.search(r"fish\s+farm", lowered):
            # "fish farmer" is a fisherman, not a land-cultivating farmer —
            # only count farmer if it also appears on its own elsewhere.
            if not any(_has_word(re.sub(r"fish\s+farm\w*", "", lowered), w) for w in words):
                continue
        if any(_has_word(lowered, w) for w in words):
            found.append(occupation)
    return found


# ── State / UT ──────────────────────────────────────────────────────────
# Canonical names match schemes.eligibility_rules["states"]. Devanagari
# aliases cover Hindi + Marathi transcripts.
STATE_NAMES: dict[str, list[str]] = {
    "Andhra Pradesh": ["andhra pradesh", "andhra", "आंध्र प्रदेश"],
    "Arunachal Pradesh": ["arunachal pradesh", "arunachal", "अरुणाचल"],
    "Assam": ["assam", "असम", "आसाम"],
    "Bihar": ["bihar", "बिहार"],
    "Chhattisgarh": ["chhattisgarh", "chattisgarh", "छत्तीसगढ़", "छत्तीसगड"],
    "Goa": ["goa", "गोवा"],
    "Gujarat": ["gujarat", "गुजरात"],
    "Haryana": ["haryana", "हरियाणा"],
    "Himachal Pradesh": ["himachal pradesh", "himachal", "हिमाचल"],
    "Jharkhand": ["jharkhand", "झारखंड"],
    "Karnataka": ["karnataka", "कर्नाटक"],
    "Kerala": ["kerala", "केरल", "केरळ"],
    "Madhya Pradesh": ["madhya pradesh", "मध्य प्रदेश", "मध्यप्रदेश"],
    "Maharashtra": ["maharashtra", "महाराष्ट्र"],
    "Manipur": ["manipur", "मणिपुर"],
    "Meghalaya": ["meghalaya", "मेघालय"],
    "Mizoram": ["mizoram", "मिजोरम"],
    "Nagaland": ["nagaland", "नागालैंड"],
    "Odisha": ["odisha", "orissa", "ओडिशा", "ओड़िशा"],
    "Punjab": ["punjab", "पंजाब"],
    "Rajasthan": ["rajasthan", "राजस्थान"],
    "Sikkim": ["sikkim", "सिक्किम"],
    "Tamil Nadu": ["tamil nadu", "tamilnadu", "तमिलनाडु", "तमिल नाडु"],
    "Telangana": ["telangana", "तेलंगाना"],
    "Tripura": ["tripura", "त्रिपुरा"],
    "Uttar Pradesh": ["uttar pradesh", "उत्तर प्रदेश"],
    "Uttarakhand": ["uttarakhand", "uttaranchal", "उत्तराखंड"],
    "West Bengal": ["west bengal", "bengal", "पश्चिम बंगाल", "बंगाल"],
    "Andaman and Nicobar Islands": ["andaman", "अंडमान"],
    "Chandigarh": ["chandigarh", "चंडीगढ़"],
    "Dadra and Nagar Haveli and Daman and Diu": ["dadra", "daman", "दमन"],
    "Delhi": ["delhi", "दिल्ली"],
    "Jammu and Kashmir": ["jammu", "kashmir", "जम्मू", "कश्मीर"],
    "Ladakh": ["ladakh", "लद्दाख"],
    "Lakshadweep": ["lakshadweep", "लक्षद्वीप"],
    "Puducherry": ["puducherry", "pondicherry", "पुडुचेरी", "पांडिचेरी"],
}


def _extract_state(text: str) -> str | None:
    lowered = text.lower()
    # Longest alias first, so "west bengal" wins over "bengal" and
    # "uttar pradesh" can't be shadowed by a shorter name.
    aliases = sorted(
        ((alias, state) for state, names in STATE_NAMES.items() for alias in names),
        key=lambda pair: len(pair[0]),
        reverse=True,
    )
    for alias, state in aliases:
        if _has_word(lowered, alias):
            return state
    return None


# ── Social category (caste) + BPL ───────────────────────────────────────
# Values match schemes.eligibility_rules["categories"]: SC / ST / OBC /
# General for caste, and the separate "BPL" economic marker. Acronyms are
# matched case-sensitively so "B.Sc" or "1st" can't read as SC / ST.
CASTE_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("ST", re.compile(r"\bST\b|(?i:\bst\s+(?:category|caste|community)\b|scheduled\s+tribes?|\btribal\b|adivasi)"
                      r"|अनुसूचित जनजाति|अनुसूचित जमाती|आदिवासी|एसटी")),
    ("SC", re.compile(r"\bSC\b|(?i:\bsc\s+(?:category|caste|community)\b|scheduled\s+castes?|\bdalit\b)"
                      r"|अनुसूचित जाति|अनुसूचित जाती|दलित|एससी")),
    ("OBC", re.compile(r"\b(?:OBC|EBC)\b|(?i:\bobc\b|backward\s+class(?:es)?)"
                       r"|ओबीसी|पिछड़ा वर्ग|पिछड़ी जाति|इतर मागास")),
    ("General", re.compile(r"(?i:general\s+(?:category|caste)|open\s+category)"
                           r"|सामान्य वर्ग|सामान्य श्रेणी|खुला प्रवर्ग")),
]

BPL_PATTERN = re.compile(
    r"\bBPL\b|below\s+(the\s+)?poverty\s+line|antyodaya|बीपीएल|गरीबी रेखा|दारिद्र्य रेषा|अंत्योदय",
    re.IGNORECASE | re.UNICODE,
)


def _extract_caste(text: str) -> str | None:
    for caste, pattern in CASTE_PATTERNS:
        if pattern.search(text):
            return caste
    return None


def _extract_bpl(text: str) -> bool | None:
    if not BPL_PATTERN.search(text):
        return None
    return not _negated(text, BPL_PATTERN)


# ── Disability ──────────────────────────────────────────────────────────
DISABILITY_PATTERN = re.compile(
    r"disab|handicap|divyang|differently[\s-]abled|wheelchair|\bblind\b|\bdeaf\b"
    r"|दिव्यांग|विकलांग|अपंग|दृष्टिहीन",
    re.IGNORECASE | re.UNICODE,
)
_NEGATION = re.compile(r"\b(no|not|without|don'?t have|do not have)\b|नहीं|नाही", re.IGNORECASE | re.UNICODE)


def _negated(text: str, pattern: re.Pattern) -> bool:
    """True when the first hit of `pattern` has a negation just before it
    ("I am not disabled", "no disability", "विकलांग नहीं") or just after it
    for Hindi/Marathi word order."""
    match = pattern.search(text)
    before = text[max(0, match.start() - 15):match.start()]
    after = text[match.end():match.end() + 12]
    return bool(_NEGATION.search(before)) or bool(re.search(r"नहीं|नाही", after))


def _extract_disability(text: str) -> bool | None:
    if not DISABILITY_PATTERN.search(text):
        return None
    return not _negated(text, DISABILITY_PATTERN)


# ── Annual income ───────────────────────────────────────────────────────
_MULTIPLIERS = {
    "lakh": 100_000, "lakhs": 100_000, "lac": 100_000, "lacs": 100_000, "लाख": 100_000,
    "thousand": 1_000, "k": 1_000, "hazar": 1_000, "hazaar": 1_000, "हज़ार": 1_000, "हजार": 1_000,
    "crore": 10_000_000, "crores": 10_000_000, "करोड़": 10_000_000,
}
_SPOKEN_AMOUNTS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
    "डेढ़": 1.5, "ढाई": 2.5, "दीड": 1.5, "अडीच": 2.5,
}
_AMOUNT_RE = re.compile(
    r"(?P<cur>₹|rs\.?|inr|rupees?)?\s*"
    r"(?P<num>\d+(?:[.,]\d+)*|" + "|".join(re.escape(w) for w in _SPOKEN_AMOUNTS) + r")"
    r"\s*(?P<mult>" + "|".join(re.escape(m) for m in sorted(_MULTIPLIERS, key=len, reverse=True)) + r")?"
    r"(?![a-z])\s*(?P<cur2>rupees?|rs\.?|₹|रुपये|रुपए|रुपया|रुपयांचे)?",
    re.IGNORECASE | re.UNICODE,
)
INCOME_WORDS = ["income", "earn", "earning", "earnings", "salary", "kamai", "aay",
                "आय", "आमदनी", "कमाई", "कमाता", "कमाती", "वेतन", "तनख्वाह", "उत्पन्न", "पगार", "कमावतो", "कमावते"]
MONTHLY_WORDS = ["month", "monthly", "महीना", "महीने", "मासिक", "महिना", "महिन्याला", "महिन्याचे"]
NO_INCOME = re.compile(r"\b(no|zero)\s+income\b|कोई आय नहीं|आय नहीं|उत्पन्न नाही", re.IGNORECASE | re.UNICODE)


def _extract_income(text: str) -> tuple[int | None, list[tuple[int, int]]]:
    """Returns (annual income in ₹, spans of the text it consumed). An
    amount counts as income only if it carries a currency marker or a
    lakh/thousand multiplier, or sits right after an income word — so a
    bare "40" stays available for the age parser. Monthly amounts
    ("15000 per month") are annualised."""
    if NO_INCOME.search(text):
        return 0, []
    lowered = text.lower()
    for match in _AMOUNT_RE.finditer(text):
        num_text = match.group("num")
        if num_text.lower() in _SPOKEN_AMOUNTS and not match.group("mult"):
            continue  # "one" / "दो" on their own are not money
        before = lowered[max(0, match.start() - 30):match.start()]
        has_marker = bool(match.group("cur") or match.group("cur2") or match.group("mult"))
        near_income_word = any(_has_word(before, w) for w in INCOME_WORDS)
        if not (has_marker or near_income_word):
            continue
        try:
            value = _SPOKEN_AMOUNTS.get(num_text.lower()) or float(num_text.replace(",", ""))
        except ValueError:
            continue
        mult = match.group("mult")
        if mult:
            value *= _MULTIPLIERS[mult.lower()]
        if value < 100 and not mult:
            continue  # "income is in 2 parts" etc. — not a plausible amount
        after = lowered[match.end():match.end() + 25]
        if any(w in after for w in MONTHLY_WORDS):
            value *= 12
        return int(value), [match.span()]
    return None, []


def parse_profile(text: str, language: str = "en") -> dict:
    """Extracts every eligibility-relevant fact a short first-person
    sentence can carry. Every field is None (or [] for occupations) when not
    confidently detected — callers must treat that as 'unknown', never as a
    guessed value."""
    text = text or ""
    income, income_spans = _extract_income(text)
    return {
        "gender": _extract_gender(text, language),
        "age": _extract_age(text, skip_spans=income_spans),
        "state": _extract_state(text),
        "occupations": _extract_occupations(text),
        "caste": _extract_caste(text),
        "bpl": _extract_bpl(text),
        "annual_income": income,
        "disability": _extract_disability(text),
    }
