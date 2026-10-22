import re

_EVENTS = {
    "pregnancy": {
        "query": re.compile(r"pregnan|lactating|maternity|delivery|childbirth|newborn|new born|expecting|गर्भ|प्रसूति|गरोदर|बाळंतपण|नवजात", re.I),
        "scheme": re.compile(r"janani|matru|matritva|maternity|pregnan|prasuti|shishu|lactating", re.I),
    },
    "marriage": {
        "query": re.compile(r"marriage|wedding|get(?:ting)? married|marry|shaadi|shadi|vivah|विवाह|शादी|लग्न", re.I),
        "scheme": re.compile(r"marriage|vivah|kanyadan|wedding|marrying", re.I),
    },
    "death": {
        "query": re.compile(r"death|died|funeral|deceased|passed away|मृत्यु|मृत्यू|निधन|अंतिम संस्कार", re.I),
        "scheme": re.compile(r"funeral|death|last rites|antim", re.I),
    },
}


def blocked_event(name, spec, query):
    """True if the scheme is built around a life event the user did not mention."""
    other = " ".join((spec or {}).get("other_conditions") or [])
    for ev in _EVENTS.values():
        if ev["query"].search(query or ""):
            continue
        if ev["scheme"].search(name or "") or ev["scheme"].search(other):
            return True
    return False

_ENROLMENT = re.compile(
    r"\b(?:pursu\w+|enrol\w*|admitted|admission|currently\s+studying|studying\s+in"
    r"|full[- ]time\s+(?:student|m\.?\s?phil|ph\.?\s?d))\b", re.I)
_WORKING = {"teacher_faculty", "farmer", "engineer_scientist", "health_worker", "government_employee",
            "construction_worker", "artisan_craftsperson", "fisherman", "ex_serviceman", "entrepreneur",
            "self_employed"}


def blocked_enrolment(name, spec, eligibility_text, prof):
    """Hide schemes that require being enrolled in a course when the user described a working life."""
    groups = set((prof or {}).get("groups") or [])
    if not (groups & _WORKING) or "student" in groups:
        return False
    other = " ".join((spec or {}).get("other_conditions") or [])
    return bool(_ENROLMENT.search(other) or _ENROLMENT.search((eligibility_text or "")[:500]))