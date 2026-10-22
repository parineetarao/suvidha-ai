import sys
import httpx

BASE = "http://localhost:8010/api/v1"
CASES = [
    ("ladki bahin yojana", "en", "mmlby"),
    ("I am a widow from Maharashtra", "en", "ignwpsm"),
    ("I am a farmer", "en", "pmkisan"),
    ("I am an SC student", "en", None),
    ("I am a transgender person", "en", None),
    ("मैं एक किसान हूँ", "hi", "pmkisan"),
    ("मी महाराष्ट्रातील गृहिणी आहे", "mr", "mmlby"),
]


def show_detail_source():
    import inspect

    import app.db.base  # noqa: F401
    from app.api.v1 import schemes as m
    for r in m.router.routes:
        if getattr(r, "path", "").endswith("/{scheme_id}") and "GET" in getattr(r, "methods", set()):
            print("---- detail endpoint source (paste this to me) ----")
            print(inspect.getsource(r.endpoint))
            return


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ok = True
    c = httpx.Client(timeout=180)
    try:
        r = c.get(f"{BASE}/health")
        print("PASS" if r.status_code == 200 else "FAIL", "health", r.status_code)
    except Exception as exc:
        print("FAIL health: backend not reachable on port 8000:", exc)
        return
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        r = c.options(f"{BASE}/schemes/smart-search", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"})
        allowed = r.headers.get("access-control-allow-origin")
        good = allowed in (origin, "*")
        ok &= good
        print("PASS" if good else "FAIL", "CORS", origin, "->", allowed)
    detail_failed = False
    for q, lang, expect in CASES:
        r = c.post(f"{BASE}/schemes/smart-search", json={"query": q, "language": lang, "limit": 10})
        if r.status_code != 200:
            ok = False
            print("FAIL", q, "-> HTTP", r.status_code, r.text[:200])
            continue
        res = r.json()
        ids = [x["scheme_id"] for x in res]
        good = bool(res) and (expect is None or expect in ids)
        ok &= good
        print("PASS" if good else "FAIL", f"{q[:34]:34} [{lang}] {len(res):2d} results | "
              + " | ".join(x["name"][:24] for x in res[:3]))
        if res:
            d = c.get(f"{BASE}/schemes/{ids[0]}", params={"lang": lang})
            if d.status_code != 200:
                detail_failed = ok = False
                print("   FAIL detail for", ids[0], "-> HTTP", d.status_code)
    print("\nALL CHECKS PASSED" if ok else "\nSOME CHECKS FAILED")
    if detail_failed:
        show_detail_source()


if __name__ == "__main__":
    main()
