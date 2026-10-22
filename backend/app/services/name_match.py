"""
Finds schemes the user is asking for BY NAME (e.g. "ladki bahin yojana"), independent of
eligibility. Needs at least two distinctive words and ALL of them must match the scheme name,
so sentences like "I am a farmer from Gujarat" never match.
"""
import difflib
import re

from app.services.candidate_filter import STATES_UTS
_SELF = re.compile(r"^\s*(?:i\s+am|i'm|i\s+have|i\s+need|i\s+want|we\s+are|my\b|मैं|मै|मी|मेरा|मेरी)", re.I)
_SCHEME_WORD = re.compile(r"yojana|yojna|scheme|abhiyan|योजना|योजने", re.I)

_STOP = {
    "i", "am", "is", "are", "a", "an", "the", "my", "me", "we", "you", "your", "our", "it", "its",
    "to", "of", "in", "on", "at", "by", "for", "from", "with", "and", "or", "if", "do", "not", "no",
    "have", "has", "had", "will", "can", "who", "which", "that", "this", "there", "be",
    "about", "tell", "show", "give", "get", "find", "search", "looking", "want", "need", "please",
    "apply", "how", "what", "details", "detail", "information", "info", "scheme", "schemes",
    "yojana", "yojna", "mukhyamantri", "pradhan", "mantri", "chief", "minister", "cm",
    "government", "govt", "national", "state", "central",
    "योजना", "योजने", "की", "का", "के", "में", "मुख्यमंत्री",
}
_DESCRIPTORS = {
    "retired", "person", "persons", "people", "citizen", "citizens", "senior", "elderly", "old", "aged",
    "man", "men", "woman", "women", "girl", "girls", "boy", "boys", "child", "children",
    "student", "students", "farmer", "farmers", "widow", "housewife", "unemployed", "disabled",
    "worker", "workers", "youth", "adult",
}
_SKIP = _STOP | _DESCRIPTORS | {w.lower() for s in STATES_UTS for w in s.split()}


def _tokens(text):
    t = (text or "").lower().replace("yojna", "yojana")
    return re.findall(r"[a-z0-9\u0900-\u097f]+", t)


def _distinct(tokens):
    return [w for w in tokens if w not in _SKIP and len(w) >= 2]


def _same(q, n):
    return q == n or (len(q) >= 4 and difflib.SequenceMatcher(None, q, n).ratio() >= 0.82)


def _coverage(q, n):
    """Share of the scheme's distinctive name words that the query covers, or None if a query word is missing."""
    if not n or not all(any(_same(w, x) for x in n) for w in q):
        return None
    return sum(1 for x in n if any(_same(w, x) for w in q)) / len(n)


def find_name_matches(rows, query, lang="en", max_results=3):
    """rows need .scheme_code, .name, .translations. Returns scheme codes, best match first."""
    if _SELF.search(query or "") and not _SCHEME_WORD.search(query or ""):
        return []          # a self-description ("I am a retired person") is not a scheme name
    q = _distinct(_tokens(query))
    if len(q) < 2:
        return []
    found = []
    for r in rows:
        lists = [_distinct(_tokens(r.name))]
        tr = ((r.translations or {}).get(lang) or {}).get("name") if lang != "en" else None
        if tr:
            lists.append(_distinct(_tokens(tr)))
        best = max((c for c in (_coverage(q, n) for n in lists) if c is not None), default=None)
        if best is not None and best >= 0.5:
            found.append((best, len(lists[0]), r.scheme_code))
    found.sort(key=lambda x: (-x[0], x[1]))
    return [code for _, _, code in found[:max_results]]