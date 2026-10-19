"""
app/services/query_understanding.py

Extracts a structured user profile from a natural-language query using
the shared LLM client.

This helps prevent mismatched recommendations, such as giving student
schemes to a professor, by understanding the user's actual circumstances
before searching.

Supports multilingual queries through the configured LLM providers.
"""

import logging
import re

from dotenv import load_dotenv

from app.services.llm_client import LLMError, chat_json, parse_json

load_dotenv()

logger = logging.getLogger(__name__)


def _extract_profile_uncached(query: str) -> dict:
    """
    Takes a free-text user query in any supported language and returns
    a structured profile dictionary.

    Always returns a dictionary, using None for unknown fields and
    an empty list for categories when extraction fails.

    Example:
        "I am a 46 year old professor in Maharashtra"

    Returns a profile containing:
        age: 46
        occupation: "professor"
        state: "Maharashtra"
        is_student: False
    """

    prompt = f"""You are a profile extraction assistant for an Indian
government scheme recommendation system.

The user has described their situation in natural language, possibly
Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati,
Punjabi, or English. Extract a structured profile.

CRITICAL RULES:
- is_student: true ONLY if the person explicitly says they are
  currently studying. A professor, teacher, or other professional
  is NOT a student merely because they work in education.
- occupation: the person's actual job or profession, not their
  subject of interest. "Professor" -> "professor", never "student".
- If a field is not mentioned, use null, or [] for lists.
- Do not infer or guess fields that are not explicitly mentioned.
- For Indian states, use the full English name, e.g. "Maharashtra"
  or "Tamil Nadu".
- is_student should be false when a professional occupation is
  explicitly stated and there is no indication that the person is
  also currently studying. Use null if the situation is unclear.
- is_bpl, is_widow, is_farmer, is_student: set to true ONLY if the user states it. Set false ONLY if they explicitly say they are NOT (for example "I am not a student"). If the topic is not mentioned, it MUST be null. Never infer false from silence or from other details such as occupation, gender, or age.
- Detect the language of the user's query and return its language
  code in raw_language.
- Output valid JSON only, with no additional text.

User query:
{query}

Output this JSON structure:
{{
  "age": <number or null>,
  "occupation": <string or null — their job/profession, ALWAYS written in English>,
  "occupation_group": <one of "farmer","agricultural_laborer","student","teacher_faculty","engineer_scientist","health_worker","construction_worker","unorganised_worker","artisan_craftsperson","fisherman","ex_serviceman","government_employee","entrepreneur","self_employed","unemployed","homemaker","artist_performer","other", or null if not stated>,
  "life_stage": <"child" if clearly under 18; "adult" if their own words imply a working-age adult (an occupation such as farmer, professor, housewife, driver); "senior" if retired or elderly; otherwise null. Never guess a number>,
  "state": <string or null>,
  "gender": <"male", "female", "other", or null>,
  "income_annual_inr": <number or null>,
  "categories": <list of "SC", "ST", "OBC", "General", "BPL", "PVTG">,
  "disability_percentage": <number or null>,
  "is_student": <true, false, or null>,
  "is_farmer": <true, false, or null>,
  "is_widow": <true, false, or null>,
  "is_bpl": <true, false, or null>,
  "has_land": <true, false, or null>,
  "family_size": <number or null>,
  "raw_language": <language code, e.g. "en", "hi", or "mr">
}}"""

    try:
        parsed = parse_json(chat_json(prompt))
        profile = {**_empty_profile(), **parsed}
        low = query.lower()
        denied = bool(re.search(r"\bnot\b|\bno\b|n't|नहीं|नही", low))
        for key in ("is_bpl", "is_widow", "is_farmer", "is_student"):
            if profile.get(key) is False and not denied:
                profile[key] = None      # a "false" with no negation in the query is an invented fact
        logger.info("Extracted profile: %s", profile)
        return profile

    except (LLMError, ValueError):
        logger.exception(
            "Profile extraction failed - returning empty profile"
        )
        return _empty_profile()


def _empty_profile() -> dict:
    """Return a profile with all fields initialized to safe defaults."""
    return {
        "age": None,
        "occupation": None,
        "occupation_group": None,
        "life_stage": None,
        "state": None,
        "gender": None,
        "income_annual_inr": None,
        "categories": [],
        "disability_percentage": None,
        "is_student": None,
        "is_farmer": None,
        "is_widow": None,
        "is_bpl": None,
        "has_land": None,
        "family_size": None,
        "raw_language": "en",
    }
import json
import threading
from pathlib import Path

_CACHE_FILE = Path(__file__).resolve().parents[2] / "profile_cache.json"
_PCACHE = None
_LOCK = threading.Lock()


def _load_cache():
    global _PCACHE
    if _PCACHE is None:
        try:
            _PCACHE = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            _PCACHE = {}
    return _PCACHE


def extract_profile_from_query(query):
    """Cached on disk, so repeated queries (and demo-day bursts) don't spend LLM quota."""
    key = " ".join((query or "").lower().split())
    with _LOCK:
        hit = _load_cache().get(key)
    if hit is not None:
        return dict(hit)
    profile = _extract_profile_uncached(query)
    if any(v not in (None, [], "") for k, v in profile.items() if k != "raw_language"):
        with _LOCK:
            cache = _load_cache()
            cache[key] = profile
            try:
                _CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            except Exception:
                pass
    return profile