import sys

import app.db.base  # noqa: F401
from fastapi.testclient import TestClient
from app.main import app

CODES = ["mmlby", "pmkisan", "apy", "pmmvy", "igoapsm"]

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    with TestClient(app) as c:
        for code in CODES:
            for lang in ("en", "hi"):
                r = c.get(f"/api/v1/schemes/{code}/full", params={"lang": lang})
                if r.status_code != 200:
                    print(f"{code:8} {lang} FULL FAIL {r.status_code} {r.text[:100]}")
                    continue
                d = r.json()
                print(f"{code:8} {lang} full  {d['name'][:32]:32} elig_text={len(d['eligibility_text'] or ''):4d} "
                      f"docs={len(d['documents_required'])} steps={len(d['steps'])} faqs={len(d['faqs'])}")
            r = c.get(f"/api/v1/schemes/{code}/apply-kit", params={"lang": "en"})
            if r.status_code != 200:
                print(f"{code:8} KIT FAIL {r.status_code} {r.text[:100]}")
                continue
            k = r.json()
            print(f"{code:8} kit   types={[d['doc_type'] for d in k['documents']][:6]} "
                  f"fields={[f['key'] for f in k['fields']]} decl={len(k['declarations'])} needs={k['needs']}")
        kit = c.get("/api/v1/schemes/mmlby/apply-kit").json()
        woman = {"age": 35, "gender": "female", "state": "Maharashtra", "annual_income": 150000}
        r0 = c.post("/api/v1/schemes/mmlby/readiness", json={"profile": woman}).json()
        r1 = c.post("/api/v1/schemes/mmlby/readiness", json={
            "profile": woman, "documents": {d["key"]: 90 for d in kit["documents"]},
            "answers": {f["key"]: "x" for f in kit["fields"]},
            "confirmations": {x["key"]: True for x in kit["declarations"]}}).json()
        r2 = c.post("/api/v1/schemes/mmlby/readiness", json={"profile": {**woman, "gender": "male"}}).json()
        print("readiness  nothing done:", r0["score"], r0["status"], "| blockers:", len(r0["blockers"]))
        print("readiness  all done    :", r1["score"], r1["status"], "|", r1["level"])
        print("readiness  male user   :", r2["score"], r2["status"], "|", r2["blockers"][:1])
        u = c.post("/api/v1/schemes/understand", json={"query": "i am a 40 year old teacher", "language": "en"}).json()
        print("understand:", u["chips"])