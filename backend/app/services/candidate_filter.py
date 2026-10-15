"""
Deterministic, language-independent candidate selection that runs BEFORE the LLM.
Semantic search cannot tell Maharashtra from Madhya Pradesh, so we (a) drop schemes
restricted to a state the user is NOT in, and (b) rank nationwide schemes first
when the user's state is unknown.
"""
import logging
import re

logger = logging.getLogger(__name__)

STATES_UTS = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
    "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar", "Chandigarh",
    "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
    "Lakshadweep", "Puducherry",
]
_PATTERNS = [
    (s, re.compile(r"\b" + re.escape(s) + r"\b", re.IGNORECASE))
    for s in sorted(STATES_UTS, key=len, reverse=True)
]
_CANON = {s.lower(): s for s in STATES_UTS}
_RESIDENCY = re.compile(
    r"\b(?:resident|residents|native|natives|domicile|domiciled|belong(?:s|ing)? to)\b", re.IGNORECASE
)


def canonical_state(name):
    return _CANON.get((name or "").strip().lower())


def _states_in(text):
    found, remaining = set(), text or ""
    for state, pat in _PATTERNS:
        if pat.search(remaining):
            found.add(state)
            remaining = pat.sub(" ", remaining)
    return found


def _states_from_eligibility_text(text):
    """States named right after residency words, e.g. 'native of Madhya Pradesh'."""
    found = set()
    for m in _RESIDENCY.finditer(text or ""):
        tail = text[m.end(): m.end() + 80].split(".")[0]
        found |= _states_in(tail)
    return found


def scheme_state_scope(scheme):
    """States a scheme is restricted to. Empty set = nationwide or unknown."""
    from_ministry = _states_in(scheme.ministry or "")
    if from_ministry:
        return from_ministry
    rules = scheme.eligibility_rules or {}
    # Auto-extracted (unreviewed) state lists are unreliable; only trust reviewed ones.
    if not rules.get("needs_review", False) and rules.get("states"):
        return {canonical_state(s) or s for s in rules["states"]}
    return _states_from_eligibility_text(scheme.eligibility_text or "")


_AFFINITY = [
    (lambda p: p.get("gender") == "female",
     re.compile(r"\b(girl|girls|women|woman|female|mahila|widow)\b", re.I), 0.15),
    (lambda p: p.get("is_student") is True,
     re.compile(r"\b(student|students|scholarship|fellowship|education)\b", re.I), 0.15),
    (lambda p: p.get("is_farmer") is True,
     re.compile(r"\b(farmer|farmers|agricultur\w*|kisan|crop)\b", re.I), 0.15),
    (lambda p: p.get("is_widow") is True, re.compile(r"\bwidow\w*\b", re.I), 0.15),
    (lambda p: bool(p.get("disability_percentage")),
     re.compile(r"\b(disab\w*|divyang|handicap\w*)\b", re.I), 0.15),
    (lambda p: isinstance(p.get("age"), (int, float)) and p["age"] >= 60,
     re.compile(r"\b(old age|senior citizen|pension)\b", re.I), 0.10),
]


def _affinity(profile, scheme):
    text = f"{scheme.name or ''} {(scheme.eligibility_text or '')[:600]}"
    total = sum(w for applies, pat, w in _AFFINITY if applies(profile) and pat.search(text))
    return min(total, 0.3)


def _interleave(scored):
    """Nationwide first, then state-scoped schemes round-robin across states."""
    national = sorted([x for x in scored if not x[3]], key=lambda x: (-x[0], x[1]))
    groups = {}
    for x in sorted([x for x in scored if x[3]], key=lambda x: (-x[0], x[1])):
        groups.setdefault(min(x[3]), []).append(x)
    queues = sorted(groups.values(), key=lambda q: (-q[0][0], q[0][1]))
    ordered = list(national)
    while any(queues):
        for q in queues:
            if q:
                ordered.append(q.pop(0))
    return ordered


def rank_candidates(profile, results):
    """results: hybrid_search output (best semantic match first), each a dict with 'scheme'."""
    user_state = canonical_state(profile.get("state"))
    age = profile.get("age")
    total = max(len(results), 1)
    scored, seen = [], set()
    duplicates = dropped_state = dropped_age = 0
    for rank, r in enumerate(results):
        s = r["scheme"]
        if s.scheme_code in seen:
            duplicates += 1
            continue
        seen.add(s.scheme_code)
        rules = s.eligibility_rules or {}
        scope = scheme_state_scope(s)
        if user_state and scope and user_state not in scope:
            dropped_state += 1
            continue
        # Age limits only from reviewed rules; the LLM checks age from the text for the rest.
        if age and not rules.get("needs_review", False):
            lo, hi = rules.get("min_age"), rules.get("max_age")
            if (isinstance(lo, (int, float)) and age < lo) or (isinstance(hi, (int, float)) and age > hi):
                dropped_age += 1
                continue
        score = (1.0 - rank / total) + _affinity(profile, s)
        if user_state and scope:
            score += 0.15
        scored.append((score, rank, r, scope))
    ordered = sorted(scored, key=lambda x: (-x[0], x[1])) if user_state else _interleave(scored)
    logger.info(
        "Candidate ranking: %d in, %d duplicates, %d dropped (other state), %d dropped (age), "
        "%d kept, %d without known state scope",
        len(results), duplicates, dropped_state, dropped_age, len(ordered),
        sum(1 for x in ordered if not x[3]),
    )
    return [x[2] for x in ordered]