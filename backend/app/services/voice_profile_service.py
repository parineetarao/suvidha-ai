"""
app/services/voice_profile_service.py

Best-effort extraction of {gender, age} from a free-text sentence the user
spoke (already transcribed by voice_service.py). This is deliberately a
plain rule-based parser, not an LLM call — the inputs are short first-person
sentences ("I am a 21 year old woman...") and a keyword/regex approach is
fast, has zero extra infra cost, and is easy to extend per language.

Feeds app/services/matching_service.py's UserProfile.gender / .age, which in
turn drive the hard eligibility filter in POST /schemes/voice-search — so a
21-year-old woman and a 45-year-old man genuinely get different, real scheme
results instead of both hitting the same unfiltered list.
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


def _extract_age(text: str) -> int | None:
    """Finds a plausible human age (1-119) in `text`. Prefers a number that
    sits next to an age-unit word (e.g. 'year old', 'साल'); falls back to
    the first plausible standalone number if no unit word is found."""
    lowered = text.lower()

    # 1) digit + unit word nearby, e.g. "21 year old", "25 साल"
    for match in re.finditer(r"\b(\d{1,3})\b", text):
        start, end = match.span()
        window = lowered[max(0, start - 20):min(len(text), end + 25)]
        if any(unit.lower() in window for unit in AGE_UNIT_WORDS):
            value = int(match.group(1))
            if 1 <= value <= 119:
                return value

    # 2) English number words + unit word nearby, e.g. "twenty one years old"
    for match in _EN_NUMBER_WORD_RE.finditer(text):
        start, end = match.span()
        window = lowered[max(0, start - 5):min(len(text), end + 25)]
        if any(unit.lower() in window for unit in AGE_UNIT_WORDS if unit.isascii()):
            value = _words_to_int_en(match.group(1))
            if value is not None and 1 <= value <= 119:
                return value

    # 3) Hindi/Marathi number words + unit word nearby
    for match in _HI_MR_NUM_RE.finditer(text):
        start, end = match.span()
        window = text[max(0, start - 5):min(len(text), end + 15)]
        if any(unit in window for unit in AGE_UNIT_WORDS if not unit.isascii()):
            return _HI_MR_NUMBERS[match.group(0)]

    # 4) No unit word found anywhere — fall back to the first bare digit
    # number in a plausible age range, still requiring 2-3 digits so we
    # don't mistake "1" (as in "I have 1 child") for an age.
    for match in re.finditer(r"\b(\d{2,3})\b", text):
        value = int(match.group(1))
        if 1 <= value <= 119:
            return value

    return None


def _extract_gender(text: str, language: str) -> str | None:
    lowered = text.lower()
    female_words = FEMALE_WORDS.get(language, []) + (FEMALE_WORDS["en"] if language != "en" else [])
    male_words = MALE_WORDS.get(language, []) + (MALE_WORDS["en"] if language != "en" else [])

    for word in female_words:
        if word.lower() in lowered:
            return "female"
    for word in male_words:
        if word.lower() in lowered:
            return "male"
    return None


def parse_profile(text: str, language: str = "en") -> dict:
    """Extracts {gender, age} from a transcribed sentence. Both fields are
    None when not confidently detected — callers must treat None as
    'unknown / unrestricted', never as a wrong guess like 'male' or a
    specific age."""
    text = text or ""
    return {
        "gender": _extract_gender(text, language),
        "age": _extract_age(text),
    }
