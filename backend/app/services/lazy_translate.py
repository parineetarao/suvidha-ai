import logging
import time

from app.services.llm_client import LLMError, chat_json, parse_json

logger = logging.getLogger(__name__)
LANG_NAMES = {
    "hi": "Hindi", "mr": "Marathi", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
    "ml": "Malayalam", "bn": "Bengali", "gu": "Gujarati", "pa": "Punjabi",
}
_TEXT_CACHE: dict = {}


def translate_texts(texts, lang):
    """Translates short sentences (cached). Falls back to the original text on any failure."""
    if lang == "en" or lang not in LANG_NAMES or not texts:
        return list(texts)
    todo = [t for t in dict.fromkeys(texts) if (lang, t) not in _TEXT_CACHE]
    if todo:
        payload = {str(i): t for i, t in enumerate(todo)}
        prompt = (
            f"Translate every value of this JSON into {LANG_NAMES[lang]}. Keep the keys exactly as they are. "
            "Use natural wording for native speakers. Output JSON only.\n" + __import__("json").dumps(payload, ensure_ascii=False)
        )
        try:
            out = parse_json(chat_json(prompt, timeout=90))
            for i, t in enumerate(todo):
                v = out.get(str(i))
                if isinstance(v, str) and v.strip():
                    _TEXT_CACHE[(lang, t)] = v.strip()
        except (LLMError, ValueError):
            logger.exception("sentence translation failed; falling back to English")
    return [_TEXT_CACHE.get((lang, t), t) for t in texts]


def ensure_translated(db, schemes, lang, fields=("name",), pause=0.0):
    """Fills scheme.translations[lang] for the given fields (cached in the DB). Never raises."""
    if lang == "en" or lang not in LANG_NAMES or not schemes:
        return
    for i in range(0, len(schemes), 25):
        todo = []
        for s in schemes[i:i + 25]:
            cached = (s.translations or {}).get(lang, {})
            missing = {f: getattr(s, f) for f in fields
                       if isinstance(getattr(s, f, None), str) and getattr(s, f).strip() and not cached.get(f)}
            if missing:
                todo.append((s, missing))
        if not todo:
            continue
        payload = {s.scheme_code: m for s, m in todo}
        prompt = (
            f"Translate every string value of this JSON into {LANG_NAMES[lang]}. Keep all keys exactly as they are. "
            "Use natural wording for native speakers; keep numbers, Rs/₹ amounts and official scheme names unchanged. "
            "Output JSON only.\n" + __import__("json").dumps(payload, ensure_ascii=False)
        )
        try:
            out = parse_json(chat_json(prompt, timeout=90))
        except (LLMError, ValueError):
            logger.exception("scheme translation failed for %s", lang)
            continue
        for s, missing in todo:
            got = out.get(s.scheme_code)
            if not isinstance(got, dict):
                continue
            clean = {f: v.strip() for f, v in got.items() if f in missing and isinstance(v, str) and v.strip()}
            if clean:
                tr = dict(s.translations or {})
                tr[lang] = {**tr.get(lang, {}), **clean}
                s.translations = tr
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("could not save translations")
        if pause:
            time.sleep(pause)