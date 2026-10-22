"""
Deterministic eligibility matching. Each scheme has a structured match_spec (extracted once by
scripts/extract_match_specs.py, stored in eligibility_rules["match_spec"]). At search time a
profile is compared against it in plain code, so results are consistent and language-independent.
"""
import re

from app.services.candidate_filter import canonical_state

OCCUPATION_GROUPS = [
    "farmer", "agricultural_laborer", "student", "teacher_faculty", "engineer_scientist",
    "health_worker", "construction_worker", "unorganised_worker", "artisan_craftsperson",
    "fisherman", "ex_serviceman", "government_employee", "entrepreneur", "self_employed",
    "unemployed", "homemaker", "artist_performer", "other",
]
# A mismatch on these excludes a scheme. The rest can overlap with another job.
STRICT_GROUPS = {
    "farmer", "agricultural_laborer", "student", "teacher_faculty", "engineer_scientist",
    "health_worker", "construction_worker", "artisan_craftsperson", "fisherman",
    "ex_serviceman", "homemaker", "artist_performer",
}
CATEGORIES = ["SC", "ST", "OBC", "General", "PVTG", "Minority"]
FLAGS = ["widow", "disabled", "bpl", "senior_citizen", "transgender"]
FLAG_LABELS = {
    "widow": "widow status", "disabled": "disability", "bpl": "BPL status",
    "senior_citizen": "senior citizen status (age 60+)", "transgender": "gender identity",
}
# Rough age windows for a coarse life stage implied by the user's own words (used only when no age is given).
LIFE_STAGES = {"child": (0, 17), "adult": (18, 64), "senior": (60, 120)}
_OCC_KEYWORDS = [
    ("teacher_faculty", r"professor|lecturer|teacher|faculty|academic"),
    ("farmer", r"farm|kisan|agricultur|cultivat"),
    ("engineer_scientist", r"engineer|scientist|researcher"),
    ("health_worker", r"doctor|nurse|\basha\b|anganwadi|health"),
    ("construction_worker", r"construction|mason"),
    ("fisherman", r"fisher"),
    ("artisan_craftsperson", r"artisan|weaver|potter|craft|carpenter|blacksmith"),
    ("student", r"student|pupil"),
    ("unemployed", r"unemployed|jobless"),
    ("homemaker", r"homemaker|housewife"),
    ("entrepreneur", r"entrepreneur|business"),
    ("self_employed", r"self.?employed|shopkeeper|vendor|hawker"),
    ("ex_serviceman", r"ex.?serviceman|veteran|soldier|army"),
    ("government_employee", r"government employee|civil servant|clerk|officer"),
    ("unorganised_worker", r"labou?r|worker|driver|helper"),
]


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _int(v, lo=0, hi=10**9):
    if v is None or isinstance(v, bool):
        return None
    try:
        n = int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def normalize_profile(p):
    """Turns the LLM-extracted profile into facts the matcher can compare. None = unknown."""
    p = p or {}
    cats_raw = [c for c in (p.get("categories") or []) if isinstance(c, str)]
    age = _num(p.get("age"))
    dp = _num(p.get("disability_percentage"))
    gender = p.get("gender") if p.get("gender") in ("male", "female", "other") else None
    bpl = True if (p.get("is_bpl") is True or "BPL" in cats_raw) else p.get("is_bpl")
    groups = set()
    og = p.get("occupation_group")
    if og in OCCUPATION_GROUPS and og != "other":
        groups.add(og)
    occ = p.get("occupation")
    if gender is None and isinstance(occ, str) and re.search(r"housewife|house wife|गृहिणी", occ, re.I):
        gender = "female"      # the word itself implies it; the extractor sometimes leaves gender empty
    if not groups and isinstance(occ, str):
        for grp, pat in _OCC_KEYWORDS:
            if re.search(pat, occ, re.I):
                groups.add(grp)
                break
    if p.get("is_student") is True:
        groups.add("student")
    if p.get("is_farmer") is True:
        groups.add("farmer")
    not_groups = set()
    if p.get("is_student") is False:
        not_groups.add("student")
    if p.get("is_farmer") is False:
        not_groups.add("farmer")
    stage = p.get("life_stage") if p.get("life_stage") in LIFE_STAGES else None
    if age is not None:
        stage = "child" if age < 18 else ("senior" if age >= 60 else "adult")
    return {
        "age": age,
        "stage": stage,
        "state": canonical_state(p.get("state")),
        "gender": gender,
        "income": _num(p.get("income_annual_inr")),
        "categories": {c for c in cats_raw if c in CATEGORIES},
        "flags": {
            "widow": p.get("is_widow") if isinstance(p.get("is_widow"), bool) else None,
            "disabled": True if ((dp and dp > 0) or p.get("is_disabled") is True) else None,
            "bpl": bpl if isinstance(bpl, bool) else None,
            "senior_citizen": (age >= 60) if age is not None else (True if stage == "senior" else None),
            "transgender": True if gender == "other" else (False if gender in ("male", "female") else None),
        },
        "groups": groups,
        "not_groups": not_groups,
    }


def has_facts(prof):
    """True if the user gave at least one personal fact (negations like 'not a farmer' don't count)."""
    return bool(
        prof["age"] is not None or prof["state"] or prof["gender"] or prof["income"] is not None
        or prof["categories"] or prof["groups"] or prof["stage"]
        or any(v is not None for v in prof["flags"].values())
    )


def normalize_spec(raw):
    """Validates an LLM-extracted spec against the fixed vocabulary; drops anything else."""
    raw = raw if isinstance(raw, dict) else {}

    def lst(key, allowed=None):
        vals = raw.get(key) or []
        if isinstance(vals, str):
            vals = [vals]
        out = []
        for v in vals if isinstance(vals, list) else []:
            if isinstance(v, str):
                v = v.strip()
                if v and (allowed is None or v in allowed) and v not in out:
                    out.append(v)
        return out

    return {
        "v": 1,
        "institutional": raw.get("institutional") is True,
        "states": [canonical_state(s) for s in lst("states") if canonical_state(s)],
        "gender": raw.get("gender") if raw.get("gender") in ("male", "female") else None,
        "age_min": _int(raw.get("age_min"), 0, 120),
        "age_max": _int(raw.get("age_max"), 0, 120),
        "income_max": _int(raw.get("income_max"), 1, 10**9),
        "categories_any": lst("categories_any", CATEGORIES),
        "flags_all": lst("flags_all", FLAGS),
        "occupations_any": [o for o in lst("occupations_any", OCCUPATION_GROUPS) if o != "other"],
        "other_conditions": [o[:140] for o in lst("other_conditions")][:4],
    }


def has_basis(spec):
    """True if we hold at least one real eligibility fact about this scheme."""
    if not isinstance(spec, dict):
        return False
    if spec.get("institutional"):
        return True
    for key in ("states", "categories_any", "flags_all", "occupations_any"):
        if spec.get(key):
            return True
    for key in ("gender", "age_min", "age_max", "income_max"):
        if spec.get(key) is not None:
            return True
    return any(isinstance(o, str) and "not stated" not in o.lower()
               for o in (spec.get("other_conditions") or []))


def evaluate(spec, prof, scope=frozenset()):
    """Compares one scheme spec with one normalized profile.
    scope: states the scheme is limited to (from ministry/reviewed rules); overrides spec states."""
    ev = {"excluded": False, "violations": [], "core_unknown": [], "sec_unknown": [],
          "core_sat": 0, "sec_sat": 0, "matched": [],
          "other": list(spec.get("other_conditions") or [])}

    def violate(msg):
        ev["excluded"] = True
        ev["violations"].append(msg)

    if spec.get("institutional"):
        violate("for institutions, not individuals")
        return ev

    # ---- core: who the scheme is FOR. Unknown here lowers confidence a lot. ----
    gender = spec.get("gender")
    if gender:
        if prof["gender"] in ("male", "female"):
            if prof["gender"] == gender:
                ev["core_sat"] += 1
                ev["matched"].append(f"gender ({gender})")
            else:
                violate(f"only for {gender} applicants")
        else:
            ev["core_unknown"].append("gender")

    cats = spec.get("categories_any") or []
    if cats:
        if prof["categories"]:
            common = prof["categories"] & set(cats)
            if common:
                ev["core_sat"] += 1
                ev["matched"].append("category (" + "/".join(sorted(common)) + ")")
            else:
                violate("restricted to " + "/".join(cats))
        else:
            ev["core_unknown"].append("caste category")

    for flag in spec.get("flags_all") or []:
        val = prof["flags"].get(flag)
        if val is True:
            ev["core_sat"] += 1
            ev["matched"].append(FLAG_LABELS[flag])
        elif val is False:
            # a stated negative ("I am not a widow") excludes; reaching here means the extractor reported it
            violate(f"requires {FLAG_LABELS[flag]}")
        else:
            ev["core_unknown"].append(FLAG_LABELS[flag])

    occ = spec.get("occupations_any") or []
    if occ:
        wanted = set(occ)
        label = "/".join(sorted(wanted)).replace("_", " ")
        if prof["groups"] & wanted:
            ev["core_sat"] += 1
            ev["matched"].append("occupation (" + "/".join(sorted(prof["groups"] & wanted)).replace("_", " ") + ")")
        elif prof["groups"]:
            if wanted <= STRICT_GROUPS:
                violate(f"for {label} only")
            else:
                ev["core_unknown"].append("occupation")
        elif wanted <= prof["not_groups"]:
            violate(f"for {label} only")
        else:
            ev["core_unknown"].append("occupation")

    # ---- age: a life-stage bound (children / seniors) defines the audience, so it counts as core ----
    lo, hi = spec.get("age_min"), spec.get("age_max")
    if lo is not None or hi is not None:
        narrow = (hi is not None and hi < 25) or (lo is not None and lo >= 50)
        bucket = LIFE_STAGES.get(prof.get("stage"))
        if prof["age"] is not None:
            if lo is not None and prof["age"] < lo:
                violate(f"minimum age {lo}")
            elif hi is not None and prof["age"] > hi:
                violate(f"maximum age {hi}")
            else:
                ev["core_sat" if narrow else "sec_sat"] += 1
                ev["matched"].append("age range" if narrow else "age")
        elif bucket and ((hi is not None and bucket[0] > hi) or (lo is not None and bucket[1] < lo)):
            violate("age range does not fit your life stage")
        elif bucket and (lo is None or bucket[0] >= lo) and (hi is None or bucket[1] <= hi):
            ev["core_sat" if narrow else "sec_sat"] += 1
            ev["matched"].append("age range" if narrow else "age group")
        elif prof.get("stage") == "senior" and hi is None and lo is not None and 60 < lo <= 70:
            ev["core_sat"] += 1
            ev["matched"].append("age range")
            ev["other"].append(f"minimum age {lo}")      # a senior may still be under the 65+ cut-off
        else:
            ev["core_unknown" if narrow else "sec_unknown"].append("age")

    # ---- secondary: limits. Unknown here lowers confidence a little. ----
    states = set(scope) if scope else set(spec.get("states") or [])
    if states:
        if prof["state"]:
            if prof["state"] in states:
                ev["sec_sat"] += 1
                ev["matched"].append(f"state ({prof['state']})")
            else:
                violate("limited to " + "/".join(sorted(states)))
        else:
            ev["sec_unknown"].append("state of residence")

    inc = spec.get("income_max")
    if inc:
        if prof["income"] is None:
            ev["sec_unknown"].append("annual income")
        elif prof["income"] > inc:
            violate(f"income limit {inc}")
        else:
            ev["sec_sat"] += 1
            ev["matched"].append("income")
    return ev


def confidence(ev, rel):
    """0-100. Verified facts dominate; query relevance (rel 0-1) only breaks ties."""
    s = 35 + 10 * max(0.0, min(1.0, rel))
    s += 15 * min(ev["core_sat"], 2) + 5 * min(ev["sec_sat"], 3)
    s -= (22 * min(len(ev["core_unknown"]), 2) + 5 * min(len(ev["sec_unknown"]), 3)
          + 3 * min(len(ev["other"]), 3))
    if ev["other"]:
        s = min(s, 92)         # unverified extra conditions: never present as certain
    return int(max(0, min(100, round(s))))


def status_of(ev):
    if ev["core_unknown"] or ev["sec_unknown"] or ev["other"]:
        return "check_eligibility"
    return "likely_match" if (ev["core_sat"] + ev["sec_sat"]) > 0 else "check_eligibility"


def explain_en(ev):
    parts = []
    if ev["matched"]:
        parts.append("Matches your details: " + ", ".join(ev["matched"]) + ".")
    unknown = list(dict.fromkeys(ev["core_unknown"] + ev["sec_unknown"]))
    if unknown:
        parts.append("To confirm eligibility we need: " + ", ".join(unknown) + ".")
    if ev["other"]:
        parts.append("Also check: " + "; ".join(ev["other"]) + ".")
    return " ".join(parts) or "No eligibility details are available; please check the official scheme page."