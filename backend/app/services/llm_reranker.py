"""
Eligibility classifier. Language-independent statuses:
  likely_match      - known profile supports eligibility, nothing mandatory unknown
  check_eligibility - scheme fits the user's target group, a mandatory detail is unknown
  not_eligible      - a stated user fact conflicts with a mandatory requirement
  not_applicable    - institutional scheme, or unrelated to this kind of applicant
"""
import json
import logging
import os

from dotenv import load_dotenv

from app.services.llm_client import LLMError, chat_json, parse_json

load_dotenv()
logger = logging.getLogger(__name__)

MAX_CANDIDATES_PER_CALL = int(os.environ.get("LLM_MAX_CANDIDATES", "12"))
ELIGIBILITY_CHARS = int(os.environ.get("LLM_ELIGIBILITY_CHARS", "450"))
MIN_BATCH = 4

LANG_NAMES = {
    "en": "English", "hi": "Hindi", "mr": "Marathi", "ta": "Tamil", "te": "Telugu",
    "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali", "gu": "Gujarati", "pa": "Punjabi",
}
STATUSES = ("likely_match", "check_eligibility", "not_eligible", "not_applicable")
_LEGACY = {"match": "likely_match", "insufficient_information": "check_eligibility", "reject": "not_eligible"}
_CACHE: dict = {}

RULES = """You help a citizen discover Indian government schemes. For each scheme decide how it relates to this user, using ONLY the scheme text given.
Read the eligibility text, list the personal requirements it states, and check ONLY those against the profile. Profile facts the scheme does not mention are irrelevant: ignore them.
Statuses:
- likely_match: the scheme is meant for people like this user and every stated requirement is satisfied by the profile. Nothing mandatory is unknown.
- check_eligibility: the scheme is meant for people like this user (its target group fits the request and the known profile) but at least one mandatory requirement cannot be verified because the profile does not say (state of residence, caste/category, income, marks, disability, BPL, course, school type...). List each in missing_information.
- not_eligible: a fact the user clearly stated conflicts with a mandatory requirement (age outside range, other state, wrong gender, student-only while user is not a student, a named occupation, etc.).
- not_applicable: for institutions, organisations or departments; individuals do not apply directly; or its target group is unrelated to this user's request.
Missing information alone must NEVER make a scheme not_eligible. An unverified mandatory requirement must NEVER make a scheme likely_match. Never assume facts the user did not give. Empty auto-extracted Rules do NOT mean there are no requirements: read the Eligibility text.
If the request states no need and the profile is empty or meaningless (for example a greeting), return not_applicable for every scheme."""


def _empty(ok=False):
    return {"likely": [], "check": [], "excluded": [], "evaluated": [], "ok": ok}


def normalize_result(r):
    """Maps one raw LLM entry to a validated dict, or None if its status is unusable."""
    status = str(r.get("status") or r.get("decision") or "").strip().lower()
    status = _LEGACY.get(status, status)
    if status not in STATUSES:
        return None
    missing = r.get("missing_information") or []
    if isinstance(missing, str):
        missing = [missing]
    missing = [m.strip() for m in missing if isinstance(m, str) and m.strip()]
    if status == "likely_match" and missing:
        status = "check_eligibility"   # guard: an unverified requirement can't be a likely match
    try:
        score = int(float(r.get("match_score")))
    except (TypeError, ValueError):
        score = None
    if status == "likely_match":
        score = min(100, max(70, score if score is not None else 80))
    elif status == "check_eligibility":
        score = min(65, max(40, score if score is not None else 50))
    else:
        score = 0
    return {
        "scheme_code": r.get("scheme_code"),
        "status": status,
        "reason": str(r.get("reason") or "").strip(),
        "missing_information": missing,
        "match_score": score,
    }


def select_final(likely, check, max_return):
    """Verified matches first, then 'check eligibility'. Never padded with anything else."""
    likely = sorted(likely, key=lambda r: -r["match_score"])
    check = sorted(check, key=lambda r: -r["match_score"])
    return (likely + check)[:max_return]


def _build_prompt(profile, batch, lang, query):
    blocks = []
    for s in batch:
        rules = s.get("eligibility_rules") or {}
        shown = {k: v for k, v in rules.items()
                 if k not in ("needs_review", "_field_sources") and v not in (None, [], {}, "")}
        text = (s.get("eligibility_text") or "").strip()[:ELIGIBILITY_CHARS] or "(none given)"
        block = f"[{s['scheme_code']}] {(s.get('name') or '')[:90]}\nEligibility: {text}"
        if shown:
            block += f"\nRules (auto-extracted hints): {json.dumps(shown, ensure_ascii=False)}"
        blocks.append(block)
    request_line = f'USER REQUEST (their own words): "{query[:300]}"\n' if query else ""
    return f"""{RULES}

{request_line}USER PROFILE:
{_summarize_profile(profile)}

SCHEMES:
{chr(10).join(blocks)}

Write each reason (one short sentence) in {LANG_NAMES.get(lang, 'English')}. Write missing_information items as short English snake_case labels (e.g. state_of_residence, caste_category, annual_income).
Return JSON only, one entry per scheme, scheme_code copied exactly:
{{"results":[{{"scheme_code":"...","status":"likely_match|check_eligibility|not_eligible|not_applicable","reason":"...","missing_information":[],"match_score":0}}]}}
match_score: 70-100 likely_match, 40-65 check_eligibility, 0 otherwise."""


def rerank_schemes(user_profile, candidates, response_language="en", query=""):
    """One LLM call for up to MAX_CANDIDATES_PER_CALL candidates.
    Returns {"likely","check","excluded","evaluated","ok"}. ok=False means the call itself failed."""
    if not candidates:
        return _empty(ok=True)

    batch = candidates[:MAX_CANDIDATES_PER_CALL]
    cache_key = (json.dumps(user_profile, sort_keys=True, default=str), query,
                 tuple(c["scheme_code"] for c in batch), response_language)
    if cache_key in _CACHE:
        logger.info("Rerank cache hit")
        return _CACHE[cache_key]

    parsed = None
    for _ in range(3):
        logger.info("Classifying %d candidates: %s", len(batch), [c["scheme_code"] for c in batch])
        try:
            parsed = parse_json(chat_json(_build_prompt(user_profile, batch, response_language, query)))
            break
        except LLMError as exc:
            if 413 in exc.statuses and len(batch) > MIN_BATCH:
                batch = batch[: max(MIN_BATCH, len(batch) // 2)]
                logger.warning("payload too large; retrying with %d candidates", len(batch))
                continue
            logger.error("LLM classification failed: %s", exc)
            return _empty()
        except ValueError:
            logger.exception("Unparseable LLM reply")
            return _empty()
    if parsed is None:
        return _empty()

    raw = parsed.get("results", [])
    if not isinstance(raw, list):
        raw = []
    supplied = {c["scheme_code"] for c in batch}
    seen, likely, check, excluded = set(), [], [], []
    for r in raw:
        if not isinstance(r, dict):
            continue
        code = r.get("scheme_code")
        if code not in supplied or code in seen:
            continue          # ignore invented or duplicate codes
        item = normalize_result(r)
        if item is None:
            continue
        seen.add(code)
        logger.info("  %s -> %s | %s | missing=%s", code, item["status"], item["reason"][:120],
                    item["missing_information"])
        if item["status"] == "likely_match":
            likely.append(item)
        elif item["status"] == "check_eligibility":
            check.append(item)
        else:
            excluded.append(item)

    out = {"likely": likely, "check": check, "excluded": excluded,
           "evaluated": [c["scheme_code"] for c in batch], "ok": True}
    logger.info("Classification complete - likely: %d, check: %d, excluded: %d",
                len(likely), len(check), len(excluded))
    _CACHE[cache_key] = out
    return out


def _summarize_profile(profile):
    parts = []
    if profile.get("age"):
        parts.append(f"Age: {profile['age']}")
    if profile.get("occupation"):
        parts.append(f"Occupation: {profile['occupation']}")
    if profile.get("state"):
        parts.append(f"State: {profile['state']}")
    if profile.get("gender"):
        parts.append(f"Gender: {profile['gender']}")
    if profile.get("income_annual_inr"):
        parts.append(f"Annual income: Rs {profile['income_annual_inr']:,}")
    if profile.get("categories"):
        parts.append(f"Category: {', '.join(profile['categories'])}")
    for key, label in (("is_student", "Student"), ("is_farmer", "Farmer"),
                       ("is_widow", "Widow"), ("is_bpl", "BPL household")):
        if profile.get(key) is True:
            parts.append(f"{label}: YES")
        elif profile.get(key) is False:
            parts.append(f"{label}: NO")
    if profile.get("disability_percentage"):
        parts.append(f"Disability: {profile['disability_percentage']}%")
    return "\n".join(parts) if parts else "No profile information provided."