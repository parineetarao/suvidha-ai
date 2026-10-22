"""
Decides whether a message actually asks for schemes. "my name is Rahul", "hello" or gibberish contain
nothing to search for, so the UI should ask for more details instead of showing unrelated schemes.
"""
import re

NEEDS_DETAILS_EN = (
    "I could not find a request for schemes in that message. Please tell me a little about yourself or "
    "what help you need, for example your age, state, occupation, or whether you are a student, farmer, "
    "woman, widow, senior citizen or person with a disability."
)

_GREETING_OR_NAME = re.compile(
    r"^\s*(?:hi+|hello+|hey+|namaste|namaskar|good\s+(?:morning|afternoon|evening)"
    r"|my\s+name\s+is|my\s+name's|i\s+am\s+called|i'm\s+called|this\s+is|call\s+me|name\s*[:\-]"
    r"|मेरा\s+नाम|मेरी\s+नाम|माझे\s+नाव|माझं\s+नाव|नमस्ते|नमस्कार|हेलो|हैलो)"
    r"(?=[\s,.!?:;]|$)",
    re.I,
)
_REQUEST_WORDS = re.compile(
    r"\b(?:need|want|looking|require|help|apply|scheme|yojana|yojna|scholarship|pension|loan|insurance|"
    r"house|housing|benefit|subsid|job|employ|farm|crop|student|study|school|college|widow|disab|handicap|"
    r"senior|retire|elder|old|pregnan|girl|woman|women|man|boy|child|poor|bpl|income|salary|business|"
    r"worker|labou?r|age|aged)"
    r"|\d+\s*(?:years?|yrs?|वर्ष|साल|वर्षे)"
    r"|योजना|चाहिए|चाहता|चाहती|पेंशन|किसान|छात्र|विधवा|मदद|नौकरी|बीमा|मकान|शिक्षा"
    r"|हवी|हवे|शेतकरी|विद्यार्थी|मदत|नोकरी|कर्ज|वर्षांचा|वर्षांची",
    re.I,
)


def needs_details_pure(query, profile, facts, pinned):
    """True when the message gives us nothing to search for."""
    if pinned:                       # the user named a scheme
        return False
    q = (query or "").strip()
    if not re.search(r"\w", q):
        return True
    if _GREETING_OR_NAME.match(q) and not _REQUEST_WORDS.search(q):
        return True                  # only a greeting or a name (even if the extractor guessed a gender)
    if (profile or {}).get("has_request") is False and not facts:
        return True
    return False


def query_needs_details(db, query, language, profile):
    import app.db.base  # noqa: F401
    from app.models.scheme import Scheme
    from app.services.match_spec import has_facts, normalize_profile
    from app.services.name_match import find_name_matches

    facts = has_facts(normalize_profile(profile))
    rows = (db.query(Scheme.scheme_code, Scheme.name, Scheme.translations)
            .filter(Scheme.is_published.is_(True)).all())
    pinned = bool(find_name_matches(rows, query, language))
    return needs_details_pure(query, profile, facts, pinned)