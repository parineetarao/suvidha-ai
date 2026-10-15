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

from dotenv import load_dotenv

from app.services.llm_client import LLMError, chat_json, parse_json

load_dotenv()

logger = logging.getLogger(__name__)


def extract_profile_from_query(query: str) -> dict:
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