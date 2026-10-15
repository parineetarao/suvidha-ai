from app.services.match_spec import (confidence, evaluate, explain_en, normalize_profile,
                                     normalize_spec, status_of)
from app.services.match_spec import has_basis


def spec(**kw):
    base = {"institutional": False, "states": [], "gender": None, "age_min": None, "age_max": None,
            "income_max": None, "categories_any": [], "flags_all": [], "occupations_any": [],
            "other_conditions": []}
    base.update(kw)
    return base


PROF = normalize_profile({"age": 46, "occupation": "professor", "state": "Maharashtra", "is_student": False})


def test_age_violation_excludes():
    assert evaluate(spec(age_min=60), PROF)["excluded"]


def test_engineer_only_excludes_professor():
    assert evaluate(spec(occupations_any=["engineer_scientist"]), PROF)["excluded"]


def test_student_only_excludes_non_student():
    assert evaluate(spec(occupations_any=["student"]), PROF)["excluded"]


def test_other_state_excludes():
    assert evaluate(spec(), PROF, {"Madhya Pradesh"})["excluded"]


def test_institutional_excludes():
    assert evaluate(spec(institutional=True), PROF)["excluded"]


def test_income_over_limit_excludes():
    p = normalize_profile({"income_annual_inr": 500000})
    assert evaluate(spec(income_max=100000), p)["excluded"]


def test_unknown_target_group_scores_below_floor():
    for flag in ("widow", "disabled"):
        ev = evaluate(spec(flags_all=[flag]), PROF)
        assert not ev["excluded"] and ev["core_unknown"]
        assert confidence(ev, 0.4) < 40


def test_matching_faculty_scheme_is_shown_but_needs_checking():
    ev = evaluate(spec(occupations_any=["teacher_faculty"], other_conditions=["NAAC accredited institution"]), PROF)
    assert not ev["excluded"] and ev["core_sat"] == 1
    assert status_of(ev) == "check_eligibility" and confidence(ev, 0.5) >= 40


def test_verified_state_and_age_is_likely_match():
    ev = evaluate(spec(age_min=40), PROF, {"Maharashtra"})
    assert not ev["excluded"] and status_of(ev) == "likely_match"


def test_girl_student_sees_caste_scheme_as_check():
    p = normalize_profile({"gender": "female", "is_student": True, "occupation": "student"})
    ev = evaluate(spec(gender="female", categories_any=["SC"], occupations_any=["student"]), p, {"Madhya Pradesh"})
    assert not ev["excluded"] and "caste category" in ev["core_unknown"]
    assert confidence(ev, 0.6) >= 40


def test_transgender_user_matches_transgender_scheme():
    p = normalize_profile({"gender": "other"})
    ev = evaluate(spec(flags_all=["transgender"]), p)
    assert ev["core_sat"] == 1 and status_of(ev) == "likely_match"


def test_normalize_spec_drops_unknown_vocabulary():
    s = normalize_spec({"flags_all": ["widow", "banana"], "gender": "alien", "age_max": "abc",
                        "states": ["maharashtra", "Narnia"]})
    assert s["flags_all"] == ["widow"] and s["gender"] is None
    assert s["age_max"] is None and s["states"] == ["Maharashtra"]


def test_explanation_lists_missing_details():
    ev = evaluate(spec(age_min=60), normalize_profile({}), {"Bihar"})
    assert "age" in explain_en(ev) and "state of residence" in explain_en(ev) 

def test_empty_spec_has_no_basis():
    assert not has_basis(spec())
    assert not has_basis(spec(other_conditions=["eligibility not stated"]))
    assert not has_basis(None)


def test_real_conditions_count_as_basis():
    assert has_basis(spec(gender="female"))
    assert has_basis(spec(other_conditions=["enrolled in Class 11"]))


def test_unverified_extra_conditions_cap_confidence():
    p = normalize_profile({"gender": "female", "is_widow": True, "state": "Maharashtra", "age": 65})
    ev = evaluate(spec(gender="female", flags_all=["widow"], age_min=60, other_conditions=["x"]), p, {"Maharashtra"})
    assert not ev["excluded"] and confidence(ev, 1.0) == 92