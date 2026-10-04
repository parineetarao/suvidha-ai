"""
app/services/query_understanding.py

Extracts a structured user profile from a natural-language query using
Groq's LLM. This is the key piece that fixes the "professor gets student
schemes" problem — by understanding what the user actually IS before
searching, rather than doing pure semantic similarity on their words.

Supports all 10 languages via the same model — no separate translation
needed, the LLM handles multilingual understanding internally.
"""

import json
import logging
import os
import time

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_RATE_LIMIT_SECONDS = 2.0


def extract_profile_from_query(query: str) -> dict:
    """
    Takes a free-text user query in any language and returns a structured
    profile dict. Always returns a dict (empty fields as None), never raises.

    Example:
        "I am a 46 year old professor in Maharashtra"
        ->
        {
            "age": 46,
            "occupation": "professor",
            "state": "Maharashtra",
            "gender": null,
            "income_max": null,
            "categories": [],
            "disability": null,
            "is_student": false,
            "is_farmer": false,
            "is_widow": false,
            "family_size": null,
            "has_land": null,
            "is_bpl": null
        }
    """
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping profile extraction, returning empty profile")
        return _empty_profile()

    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq not installed — returning empty profile")
        return _empty_profile()

    prompt = f"""You are a profile extraction assistant for an Indian government scheme recommendation system.

The user has described their situation in natural language (possibly Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati, Punjabi, or English). Extract a structured profile.

CRITICAL RULES:
- is_student: true ONLY if the person explicitly says they are currently studying. A professor, teacher, or any professional is NOT a student even if they work in education.
- occupation: the person's job/profession, not their subject of interest. "professor" -> "professor", never "student"
- If a field is not mentioned, set it to null (or [] for lists)
- Do not infer or guess fields not explicitly mentioned
- For Indian states, normalize to the full English name (e.g. "Maharashtra", "Tamil Nadu")
- Output valid JSON only, no other text

User query: "{query}"

Output this exact JSON structure:
{{
  "age": <number or null>,
  "occupation": <string or null — their job/profession>,
  "state": <string or null — Indian state they mentioned>,
  "gender": <"male"/"female"/"other" or null>,
  "income_annual_inr": <number or null>,
  "categories": <list of "SC"/"ST"/"OBC"/"General"/"BPL"/"PVTG" — only if explicitly mentioned>,
  "disability_percentage": <number or null>,
  "is_student": <true/false/null — null if unclear, false if they have a professional occupation>,
  "is_farmer": <true/false/null>,
  "is_widow": <true/false/null>,
  "is_bpl": <true/false/null>,
  "has_land": <true/false/null>,
  "family_size": <number or null>,
  "raw_language": <detected language code, e.g. "en", "hi", "mr">
}}"""

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
        logger.info("Extracted profile: %s", parsed)
        return parsed
    except Exception:
        logger.exception("Profile extraction failed — returning empty profile")
        return _empty_profile()
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


def _empty_profile() -> dict:
    return {
        "age": None, "occupation": None, "state": None, "gender": None,
        "income_annual_inr": None, "categories": [], "disability_percentage": None,
        "is_student": None, "is_farmer": None, "is_widow": None,
        "is_bpl": None, "has_land": None, "family_size": None,
        "raw_language": "en"
    }