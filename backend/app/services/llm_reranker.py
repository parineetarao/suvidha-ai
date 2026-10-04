"""
app/services/llm_reranker.py

Takes a user profile + a list of candidate schemes and uses an LLM to:
1. REJECT schemes the user clearly doesn't qualify for
2. Flag INSUFFICIENT_INFORMATION when eligibility can't be determined
3. MATCH schemes the user likely qualifies for
4. Generate a reason in the user's own language

This is what prevents "professor gets student schemes" from reaching the
final response — even if semantic search retrieves a student scheme as
a candidate, the LLM reads its eligibility text and rejects it because
the user is a professor, not a student.

The LLM NEVER invents scheme details — it only reads what's in the DB.
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
MAX_CANDIDATES_PER_CALL = 15  # balance between context size and coverage


def rerank_schemes(user_profile: dict, candidates: list[dict], response_language: str = "en") -> list[dict]:
    """
    Takes extracted user profile + list of candidate scheme dicts,
    returns only the matched ones with reasons.

    Each candidate dict should have: scheme_code, name, description,
    eligibility_text, eligibility_rules, benefits, warning.

    Returns list of:
    {
        "scheme_code": str,
        "name": str,
        "decision": "match" | "insufficient_information",
        "reason": str,  # in user's language
        "missing_information": list[str],
        "match_score": int  # 0-100
    }
    """
    if not candidates:
        return []

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping LLM reranking")
        return []

    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq not installed — skipping LLM reranking")
        return []

    language_instructions = {
        "hi": "Respond in Hindi. The 'reason' field must be in Hindi.",
        "mr": "Respond in Marathi. The 'reason' field must be in Marathi.",
        "ta": "Respond in Tamil. The 'reason' field must be in Tamil.",
        "te": "Respond in Telugu. The 'reason' field must be in Telugu.",
        "kn": "Respond in Kannada. The 'reason' field must be in Kannada.",
        "ml": "Respond in Malayalam. The 'reason' field must be in Malayalam.",
        "bn": "Respond in Bengali. The 'reason' field must be in Bengali.",
        "gu": "Respond in Gujarati. The 'reason' field must be in Gujarati.",
        "pa": "Respond in Punjabi. The 'reason' field must be in Punjabi.",
    }.get(response_language, "Respond in English. The 'reason' field must be in English.")

    # Format candidates compactly to stay within context limits
    schemes_text = ""
    for i, s in enumerate(candidates[:MAX_CANDIDATES_PER_CALL], 1):
        rules = s.get("eligibility_rules", {})
        # Remove internal fields before sending to LLM
        display_rules = {k: v for k, v in rules.items()
                        if k not in ("needs_review", "_field_sources") and v not in (None, [], {})}
        schemes_text += f"""
SCHEME {i}: {s.get('scheme_code')}
Name: {s.get('name')}
Description: {s.get('description', '')[:300]}
Eligibility: {s.get('eligibility_text', '')[:400]}
Structured rules: {json.dumps(display_rules)}
Benefits: {s.get('benefits', '')[:200]}
---"""

    user_summary = _summarize_profile(user_profile)

    prompt = f"""You are an Indian government scheme eligibility advisor.

USER PROFILE:
{user_summary}

CANDIDATE SCHEMES TO EVALUATE:
{schemes_text}

{language_instructions}

For each scheme, evaluate whether this specific user is eligible based ONLY on the information provided.
Do NOT invent eligibility conditions. Do NOT assume information not provided by the user.

IMPORTANT RULES:
- If a scheme is clearly for students but the user is a working professional: REJECT it
- If a scheme is restricted to a specific caste/category not mentioned by the user: mark INSUFFICIENT_INFORMATION
- If the scheme has no eligibility conditions that the user fails: MATCH it
- A scheme open to "all citizens" or with no restrictions: MATCH it if the user meets any age/state conditions
- Be CONSERVATIVE: it is better to ask for missing info than to wrongly reject or wrongly match

Output a JSON array with one object per scheme:
[
  {{
    "scheme_code": "<code>",
    "name": "<name>",
    "decision": "match" | "reject" | "insufficient_information",
    "reason": "<explanation in the specified language, 1-2 sentences>",
    "missing_information": ["<field1>", "<field2>"],
    "match_score": <0-100, confidence this user qualifies>
  }},
  ...
]

Only include schemes with decision "match" or "insufficient_information" in the output.
Reject clearly ineligible schemes silently (omit them from output).
"""

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        # Groq with json_object mode wraps arrays in an object sometimes
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # unwrap if needed
            for key in ("results", "schemes", "matches"):
                if key in parsed and isinstance(parsed[key], list):
                    parsed = parsed[key]
                    break
            else:
                parsed = list(parsed.values())[0] if parsed else []
        return sorted(parsed, key=lambda x: x.get("match_score", 0), reverse=True)
    except Exception:
        logger.exception("LLM reranking failed — returning empty list")
        return []
    finally:
        time.sleep(GROQ_RATE_LIMIT_SECONDS)


def _summarize_profile(profile: dict) -> str:
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
        parts.append(f"Annual income: ₹{profile['income_annual_inr']:,}")
    if profile.get("categories"):
        parts.append(f"Category: {', '.join(profile['categories'])}")
    if profile.get("is_student") is True:
        parts.append("Status: Currently a student")
    elif profile.get("is_student") is False:
        parts.append("Status: Not a student (working professional)")
    if profile.get("is_farmer") is True:
        parts.append("Status: Farmer")
    if profile.get("is_widow") is True:
        parts.append("Status: Widow")
    if profile.get("is_bpl") is True:
        parts.append("Status: BPL (Below Poverty Line)")
    if profile.get("disability_percentage"):
        parts.append(f"Disability: {profile['disability_percentage']}%")
    return "\n".join(parts) if parts else "No profile information provided"