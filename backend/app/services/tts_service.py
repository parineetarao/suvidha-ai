"""
app/services/tts_service.py

Server-side text-to-speech via gTTS, added specifically because the
browser's built-in Web Speech API (`window.speechSynthesis`) only works for
languages that have a voice installed on the CLIENT's OS/browser. On a
typical Windows machine that's Hindi/English at best — Tamil, Telugu,
Kannada, Malayalam, Bengali, Gujarati, and Punjabi silently produce no audio
at all (no matching voice, no error). Generating the audio here instead
means every listener hears the same real audio regardless of what's
installed on their machine — the same fix already proven to transcribe all
10 languages correctly is now used to speak them too.

Trade-off, stated plainly: gTTS calls an unofficial Google Translate TTS
endpoint — it requires outbound internet access and is not an official,
rate-limited-for-you API. Acceptable for this app's low request volume;
revisit with a paid TTS provider if this ever needs production SLAs.
"""

import logging
from functools import lru_cache
from io import BytesIO

from gtts import gTTS

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {"en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"}

# Small bound on cache size: greeting/status text repeats constantly within
# and across sessions (same handful of bot lines), so caching avoids hammering
# Google's endpoint and makes repeat playback instant. Keyed on (text, lang)
# so different languages/text never collide.
_MAX_CACHE_ENTRIES = 256


@lru_cache(maxsize=_MAX_CACHE_ENTRIES)
def _synthesize_cached(text: str, lang: str) -> bytes:
    buf = BytesIO()
    gTTS(text=text, lang=lang).write_to_fp(buf)
    return buf.getvalue()


def synthesize(text: str, lang: str) -> bytes:
    """Returns MP3 audio bytes for `text` spoken in `lang`. Raises ValueError
    for an unsupported language, propagates gTTS's own exception (usually a
    network/HTTP error) untouched — the route layer maps that to a 502."""
    if lang not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language '{lang}'. Must be one of {sorted(SUPPORTED_LANGUAGES)}.")
    if not text.strip():
        raise ValueError("text must not be empty.")
    return _synthesize_cached(text, lang)
