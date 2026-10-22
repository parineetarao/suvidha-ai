from types import SimpleNamespace as NS

from app.services.candidate_filter import rank_candidates
from app.services.llm_reranker import normalize_result, select_final


def S(code, ministry="Ministry Of Education", text="", rules=None, name=None):
    return {"scheme": NS(scheme_code=code, ministry=ministry, eligibility_text=text,
                         eligibility_rules=rules or {}, name=name or code)}


def codes(results):
    return [r["scheme"].scheme_code for r in results]


def test_unverified_requirement_cannot_be_likely_match():
    r = normalize_result({"scheme_code": "x", "status": "likely_match",
                          "missing_information": ["caste_category"], "match_score": 90})
    assert r["status"] == "check_eligibility" and 40 <= r["match_score"] <= 65


def test_legacy_decisions_are_mapped():
    assert normalize_result({"decision": "match"})["status"] == "likely_match"
    assert normalize_result({"decision": "insufficient_information"})["status"] == "check_eligibility"
    assert normalize_result({"decision": "reject"})["status"] == "not_eligible"


def test_unknown_status_is_discarded():
    assert normalize_result({"status": "banana"}) is None


def test_excluded_statuses_score_zero():
    assert normalize_result({"status": "not_eligible", "match_score": 50})["match_score"] == 0


def test_select_final_orders_and_never_pads():
    likely = [{"scheme_code": "a", "match_score": 75}]
    check = [{"scheme_code": "b", "match_score": 60}, {"scheme_code": "c", "match_score": 45}]
    assert [r["scheme_code"] for r in select_final(likely, check, 2)] == ["a", "b"]
    assert len(select_final(likely, check, 10)) == 3


def test_other_state_schemes_are_dropped_when_state_known():
    out = codes(rank_candidates({"state": "Maharashtra"},
                                [S("raj", "Rajasthan"), S("nat"), S("mh", "Maharashtra")]))
    assert "raj" not in out and {"nat", "mh"} <= set(out)


def test_nationwide_first_when_state_unknown():
    out = codes(rank_candidates({}, [S("raj", "Rajasthan"), S("mp", "Madhya Pradesh"), S("nat")]))
    assert out[0] == "nat"


def test_state_found_in_eligibility_text_counts_as_restriction():
    out = codes(rank_candidates({"state": "Maharashtra"},
                                [S("x", text="The applicant should be a native of Madhya Pradesh."), S("nat")]))
    assert out == ["nat"]


def test_duplicates_are_removed():
    assert len(rank_candidates({}, [S("a"), S("a")])) == 1


def test_reviewed_age_limit_drops_scheme():
    out = codes(rank_candidates({"age": 46}, [S("old", rules={"min_age": 60, "needs_review": False}), S("nat")]))
    assert out == ["nat"]