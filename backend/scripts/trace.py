import sys

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.scheme import Scheme
from app.services.candidate_filter import scheme_state_scope
from app.services.match_spec import confidence, evaluate, has_basis, has_facts, normalize_profile
from app.services.query_understanding import extract_profile_from_query

sys.stdout.reconfigure(encoding="utf-8")
query, codes = sys.argv[1], sys.argv[2:]
profile = extract_profile_from_query(query)
prof = normalize_profile(profile)
print("PROFILE:", {k: v for k, v in profile.items() if v not in (None, [], "")})
print("facts:", has_facts(prof), "| stage:", prof["stage"], "| flags:", prof["flags"])
db = SessionLocal()
for s in db.query(Scheme).filter(Scheme.scheme_code.in_(codes)).all():
    spec = (s.eligibility_rules or {}).get("match_spec")
    print("---", s.scheme_code, "| ministry:", s.ministry, "| has_basis:", has_basis(spec))
    print("spec:", {k: v for k, v in (spec or {}).items() if v not in (None, [], False, "")})
    if spec:
        ev = evaluate(spec, prof, scheme_state_scope(s))
        print("excluded:", ev["excluded"], ev["violations"], "| core_sat:", ev["core_sat"],
              "sec_sat:", ev["sec_sat"], "| core_unknown:", ev["core_unknown"],
              "sec_unknown:", ev["sec_unknown"], "| conf(rel=.8):", confidence(ev, 0.8))
db.close()