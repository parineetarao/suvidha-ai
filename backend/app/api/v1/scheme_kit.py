"""
Endpoints behind Full Mode's detail panel and the application-preparation flow.
  GET  /schemes/{code}/full       complete detail in the requested language
  GET  /schemes/{code}/apply-kit  document checklist + extra form fields + steps for ONE scheme
  POST /schemes/{code}/readiness  eligibility check + readiness score from what the user entered
  POST /schemes/understand        profile extracted from a free-text query (for the chips)
"""
import logging
import re
import uuid as uuidlib

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.db.base  # noqa: F401  (import before the model; avoids the circular import)
from app.db.session import get_db
from app.models.scheme import SUPPORTED_LANGUAGES, Scheme
from app.services.candidate_filter import scheme_state_scope
from app.services.lazy_translate import ensure_translated, translate_texts
from app.services.match_spec import CATEGORIES, evaluate, normalize_profile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/schemes", tags=["scheme-kit"])

_DOC_TYPES = [(t, re.compile(p, re.I)) for t, p in [
    ("bank_passbook", r"passbook|ifsc|cancel+ed cheque|bank\s*(?:account|statement|details|pass)"),
    ("aadhaar", r"aadhaar|aadhar|\buid\b"),
    ("pan_card", r"\bpan\b"),
    ("income_certificate", r"income\s*(?:certificate|proof)|salary\s*(?:certificate|slip)"),
    ("caste_certificate", r"caste|scheduled\s*(?:caste|tribe)|\bsc\b|\bst\b|\bobc\b|tribe\s*certificate"),
    ("domicile_certificate", r"domicile|residen|nativity|native\s*certificate"),
    ("ration_card", r"ration|\bbpl\b|antyodaya"),
    ("age_proof", r"age\s*proof|date\s*of\s*birth|birth\s*certificate|school\s*leaving"),
    ("land_record", r"\bland\b|7/12|khasra|khatauni|patta|survey\s*number"),
    ("disability_certificate", r"disab|udid|divyang|handicap"),
    ("death_certificate", r"death\s*certificate|husband.*death"),
    ("marriage_certificate", r"marriage|wedding"),
    ("education_certificate", r"marksheet|mark\s*sheet|result|degree|admission|bonafide|enrol|school|college|fee\s*receipt"),
    ("voter_id", r"voter"),
    ("passport_photo", r"photo"),
    ("mobile_linked", r"mobile\s*number|phone\s*number"),
]]
_GROUPS_EN = {
    "details": "Additional details", "farmer": "Farm details", "student": "Student details",
    "disability": "Disability details", "widow": "Widow details", "bank": "Bank details (last 4 digits only)",
    "maternity": "Maternity details", "marriage": "Marriage details",
}
_BLANK_EV = {"excluded": False, "violations": [], "core_unknown": [], "sec_unknown": [],
             "other": [], "matched": [], "core_sat": 0, "sec_sat": 0}


def classify_doc(label):
    for dtype, pat in _DOC_TYPES:
        if pat.search(label or ""):
            return dtype
    return "other"


def split_steps(text):
    t = (text or "").strip()
    if not t:
        return []
    parts = re.split(r"(?i)\bstep\s*0*\d+\s*[:.\-\u2013]?\s*", t)
    parts = [p.strip(" .;\n") for p in parts if p and p.strip(" .;\n")]
    if len(parts) >= 2:
        return parts[:15]
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+(?=[A-Z])", t) if len(p.strip()) > 3]
    return parts[:12]


def _lang(v):
    v = (v or "en").split("-")[0].split("_")[0].lower()
    return v if v in SUPPORTED_LANGUAGES else "en"


def _get_scheme(db, code):
    base = db.query(Scheme).filter(Scheme.is_published.is_(True))
    s = base.filter(Scheme.scheme_code == code).first()
    if s is None:
        s = base.filter(func.lower(Scheme.scheme_code) == code.lower()).first()
    if s is None:
        try:
            s = base.filter(Scheme.id == uuidlib.UUID(code)).first()
        except ValueError:
            s = None
    if s is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return s


def _spec(s):
    return (s.eligibility_rules or {}).get("match_spec") or {}


def _kit_english(s):
    spec = _spec(s)
    docs = []
    for i, raw in enumerate(s.documents_required or []):
        label = str(raw).strip()
        if not label:
            continue
        if "_" in label and " " not in label:
            label = label.replace("_", " ").title()
        docs.append({"key": f"doc{i}", "label": label, "doc_type": classify_doc(label)})
    types = {d["doc_type"] for d in docs}
    occ = set(spec.get("occupations_any") or [])
    flags = set(spec.get("flags_all") or [])
    blob = f"{s.name or ''} {(s.eligibility_text or '')[:400]}".lower()
    fields = []

    def add(key, label, ftype, group, options=None):
        fields.append({"key": key, "label": label, "type": ftype, "required": True,
                       "group": group, "options": options or []})

    if occ & {"farmer", "agricultural_laborer"} or "land_record" in types:
        add("land_area_acres", "Land you cultivate (acres)", "number", "farmer")
        add("land_ownership", "Land ownership", "select", "farmer",
            [{"value": "owner", "label": "Owner"}, {"value": "tenant", "label": "Tenant"},
             {"value": "sharecropper", "label": "Sharecropper"}])
    if "student" in occ or "education_certificate" in types:
        add("institution_name", "School or college name", "text", "student")
        add("course_or_class", "Class or course", "text", "student")
        add("last_exam_percentage", "Marks in last exam (%)", "number", "student")
    if "disabled" in flags or "disability_certificate" in types:
        add("disability_percentage", "Disability percentage", "number", "disability")
        add("udid_last4", "Last 4 digits of UDID card", "text", "disability")
    if "widow" in flags or "death_certificate" in types:
        add("spouse_death_year", "Year of spouse's death", "number", "widow")
    if "bank_passbook" in types:
        add("bank_name", "Bank name", "text", "bank")
        add("ifsc_code", "IFSC code", "text", "bank")
        add("account_last4", "Last 4 digits of account number", "text", "bank")
    if re.search(r"pregnan|maternity|lactating", blob):
        add("expected_delivery_date", "Expected delivery date", "date", "maternity")
    if re.search(r"marriage|wedding|vivah", (s.name or "").lower()):
        add("marriage_date", "Date of marriage", "date", "marriage")

    decls = [{"key": f"decl{i}", "label": c}
             for i, c in enumerate(spec.get("other_conditions") or [])
             if isinstance(c, str) and "not stated" not in c.lower()]
    needs = []
    if spec.get("states"):
        needs.append("state")
    if spec.get("age_min") is not None or spec.get("age_max") is not None or "senior_citizen" in flags:
        needs.append("age")
    if spec.get("income_max"):
        needs.append("annual_income")
    if spec.get("gender"):
        needs.append("gender")
    if spec.get("categories_any"):
        needs.append("category")
    if "widow" in flags:
        needs.append("is_widow")
    if "bpl" in flags:
        needs.append("is_bpl")
    if "disabled" in flags:
        needs.append("disability_percentage")
    if occ:
        needs.append("occupation_group")
    return {"documents": docs, "fields": fields, "declarations": decls,
            "needs": list(dict.fromkeys(needs)), "steps": split_steps(s.application_process)}


def _pick(s, lang, field):
    tr = (s.translations or {}).get(lang, {}) if lang != "en" else {}
    return tr.get(field) or getattr(s, field, None)


@router.get("/{code}/full")
def scheme_full(code: str, lang: str = Query("en"), db: Session = Depends(get_db)):
    lang = _lang(lang)
    s = _get_scheme(db, code)
    if lang != "en":
        ensure_translated(db, [s], lang,
                          fields=("name", "description", "benefits", "eligibility_text", "warning"))
    kit = _kit_english(s)
    docs_en = [d["label"] for d in kit["documents"]]
    steps_en = kit["steps"]
    faqs_src = [f for f in (s.faqs or []) if isinstance(f, dict) and f.get("question") and f.get("answer")][:5]
    texts = docs_en + steps_en + [f["question"] for f in faqs_src] + [str(f["answer"])[:300] for f in faqs_src]
    out = iter(translate_texts(texts, lang))
    docs = [next(out) for _ in docs_en]
    steps = [next(out) for _ in steps_en]
    qs = [next(out) for _ in faqs_src]
    ans = [next(out) for _ in faqs_src]
    return {
        "id": str(s.id), "scheme_code": s.scheme_code, "language": lang,
        "name": _pick(s, lang, "name"), "ministry": s.ministry, "category": s.category,
        "description": _pick(s, lang, "description"), "benefits": _pick(s, lang, "benefits"),
        "eligibility_text": _pick(s, lang, "eligibility_text"), "warning": _pick(s, lang, "warning"),
        "documents_required": docs, "steps": steps,
        "faqs": [{"question": q, "answer": a} for q, a in zip(qs, ans)],
        "rejection_risks": s.rejection_risks or [], "application_modes": s.application_modes or [],
        "application_url": s.application_url, "source_url": s.source_url,
        "available_languages": sorted((s.translations or {}).keys()),
    }


@router.get("/{code}/apply-kit")
def apply_kit(code: str, lang: str = Query("en"), db: Session = Depends(get_db)):
    lang = _lang(lang)
    s = _get_scheme(db, code)
    if lang != "en":
        ensure_translated(db, [s], lang)
    kit = _kit_english(s)
    used = sorted({f["group"] for f in kit["fields"]})
    texts = ([d["label"] for d in kit["documents"]] + [f["label"] for f in kit["fields"]]
             + [o["label"] for f in kit["fields"] for o in f["options"]]
             + [x["label"] for x in kit["declarations"]] + kit["steps"] + [_GROUPS_EN[g] for g in used])
    out = iter(translate_texts(texts, lang))
    for d in kit["documents"]:
        d["label_en"], d["label"] = d["label"], next(out)
    for f in kit["fields"]:
        f["label_en"], f["label"] = f["label"], next(out)
    for f in kit["fields"]:
        for o in f["options"]:
            o["label"] = next(out)
    for x in kit["declarations"]:
        x["label_en"], x["label"] = x["label"], next(out)
    steps = [next(out) for _ in kit["steps"]]
    groups = {g: next(out) for g in used}
    return {"scheme_code": s.scheme_code, "name": _pick(s, lang, "name"), "language": lang,
            "needs": kit["needs"], "documents": kit["documents"], "fields": kit["fields"],
            "declarations": kit["declarations"], "steps": steps, "groups": groups,
            "warning": _pick(s, lang, "warning"),
            "application_url": s.application_url, "source_url": s.source_url}


def _tri(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        t = v.strip().lower()
        if t in ("yes", "true", "y", "1"):
            return True
        if t in ("no", "false", "n", "0"):
            return False
    return None


def _num(v):
    try:
        return None if v in (None, "") else float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _matcher_profile(p):
    p = p or {}
    cat = p.get("category")
    og = p.get("occupation_group")
    income = p.get("annual_income") if p.get("annual_income") is not None else p.get("income_annual_inr")
    return {
        "age": _num(p.get("age")), "state": p.get("state"),
        "gender": p.get("gender") if p.get("gender") in ("male", "female", "other") else None,
        "income_annual_inr": _num(income), "categories": [cat] if cat in CATEGORIES else [],
        "disability_percentage": _num(p.get("disability_percentage")),
        "is_bpl": _tri(p.get("is_bpl")), "is_widow": _tri(p.get("is_widow")),
        "occupation_group": og, "occupation": p.get("occupation"),
        "is_student": (og == "student") if og else None,
        "is_farmer": (og == "farmer") if og else None,
    }


class ReadinessIn(BaseModel):
    profile: dict = Field(default_factory=dict)        # common profile: age, gender, state, annual_income, category, ...
    answers: dict = Field(default_factory=dict)        # answers to the scheme's extra fields, by field key
    confirmations: dict = Field(default_factory=dict)  # declaration key -> true/false
    documents: dict = Field(default_factory=dict)      # document key -> 0..100 score from the OCR check
    language: str = "en"


@router.post("/{code}/readiness")
def readiness(code: str, body: ReadinessIn, db: Session = Depends(get_db)):
    lang = _lang(body.language)
    s = _get_scheme(db, code)
    kit = _kit_english(s)
    spec = _spec(s)
    prof = normalize_profile(_matcher_profile(body.profile))
    ev = evaluate(spec, prof, scheme_state_scope(s)) if spec else dict(_BLANK_EV)
    unknown = list(dict.fromkeys(ev["core_unknown"] + ev["sec_unknown"]))

    scores = {}
    for d in kit["documents"]:
        n = _num(body.documents.get(d["key"]))
        scores[d["key"]] = max(0.0, min(100.0, n)) if n is not None else 0.0
    docs_avg = (sum(scores.values()) / len(scores) / 100.0) if scores else 1.0
    missing_fields = [f for f in kit["fields"] if body.answers.get(f["key"]) in (None, "")]
    unticked = [x for x in kit["declarations"] if not body.confirmations.get(x["key"])]
    total = len(kit["fields"]) + len(kit["declarations"])
    details_share = ((total - len(missing_fields) - len(unticked)) / total) if total else 1.0

    if ev["excluded"]:
        factor, status = 0.0, "not_eligible"
    elif unknown:
        factor, status = 0.6, "check_eligibility"
    else:
        factor = 1.0
        status = "likely_match" if (spec and not unticked) else "check_eligibility"
    score = round(50 * docs_avg + 30 * factor + 20 * details_share)
    if ev["excluded"]:
        score = min(score, 30)
    level = "not_eligible" if ev["excluded"] else ("ready" if score >= 80 else ("almost" if score >= 50 else "not_ready"))

    blockers = [f"You may not be eligible: {v}" for v in ev["violations"]]
    blockers += [f"Add your {u} (needed to check eligibility)" for u in unknown]
    for d in kit["documents"]:
        sc = scores[d["key"]]
        if sc <= 0:
            blockers.append(f"Upload and verify: {d['label']}")
        elif sc < 60:
            blockers.append(f"Re-scan more clearly: {d['label']}")
    blockers += [f"Fill in: {f['label']}" for f in missing_fields]
    blockers += [f"Confirm: {x['label']}" for x in unticked]

    out = iter(translate_texts(blockers + kit["steps"], lang))
    blockers_t = [next(out) for _ in blockers]
    steps_t = [next(out) for _ in kit["steps"]]
    return {
        "score": score, "level": level, "status": status,
        "breakdown": {"documents": round(docs_avg * 100), "eligibility": round(factor * 100),
                      "details": round(details_share * 100)},
        "eligibility": {"matched": ev["matched"], "unknown": unknown, "violations": ev["violations"]},
        "blockers": blockers_t,
        "guidelines": {"steps": steps_t, "warning": _pick(s, lang, "warning"),
                       "rejection_risks": s.rejection_risks or [],
                       "application_url": s.application_url, "source_url": s.source_url},
    }


class UnderstandIn(BaseModel):
    query: str
    language: str = "en"


@router.post("/understand")
def understand(body: UnderstandIn, db: Session = Depends(get_db)):
    from app.services.intent import NEEDS_DETAILS_EN, query_needs_details
    from app.services.query_understanding import extract_profile_from_query
    lang = _lang(body.language)
    p = extract_profile_from_query(body.query)
    if query_needs_details(db, body.query, lang, p):
        return {"intent": "needs_details",
                "message": translate_texts([NEEDS_DETAILS_EN], lang)[0],
                "profile": {}, "chips": []}
    raw = []

    def add(key, value, tr=True):
        if value not in (None, "", []):
            raw.append((key, str(value), tr))

    add("state", p.get("state"))
    add("age", p.get("age"), False)
    add("occupation", p.get("occupation") or p.get("occupation_group"))
    add("gender", p.get("gender"))
    if p.get("income_annual_inr"):
        add("income", f"Rs {int(p['income_annual_inr']):,}", False)
    if p.get("categories"):
        add("category", ", ".join(p["categories"]), False)
    if p.get("is_widow") is True:
        add("widow", "yes")
    if p.get("is_bpl") is True:
        add("bpl", "yes")
    if p.get("disability_percentage"):
        add("disability", f"{p['disability_percentage']}%", False)
    it = iter(translate_texts([v for _, v, tr in raw if tr], lang))
    chips = [{"key": k, "value": next(it) if tr else v} for k, v, tr in raw]
    spec = _spec(s)
    rules = {
        "min_age": spec.get("age_min"), "max_age": spec.get("age_max"),
        "states": spec.get("states") or [], "income_max": spec.get("income_max"),
        "categories": spec.get("categories_any") or [], "occupations": spec.get("occupations_any") or [],
        "gender": spec.get("gender"),
        "disability": True if "disabled" in (spec.get("flags_all") or []) else None,
    }
    return {
        "id": str(s.id), "scheme_code": s.scheme_code, "language": lang, "is_published": True,
        "name": _pick(s, lang, "name"), "ministry": s.ministry, "category": s.category,
        "description": _pick(s, lang, "description"), "benefits": _pick(s, lang, "benefits"),
        "eligibility_text": _pick(s, lang, "eligibility_text"), "warning": _pick(s, lang, "warning"),
        "eligibility_rules": rules, "last_verified_at": None,
        "documents_required": list(s.documents_required or []),   # raw, as before (the readiness check maps these)
        "documents_localized": docs, "steps": steps,
        "faqs": [{"question": q, "answer": a} for q, a in zip(qs, ans)],
        "rejection_risks": s.rejection_risks or [], "application_modes": s.application_modes or [],
        "application_url": s.application_url, "source_url": s.source_url,
        "available_languages": sorted((s.translations or {}).keys()),
    }