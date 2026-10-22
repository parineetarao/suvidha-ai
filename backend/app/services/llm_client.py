"""
One place that talks to LLM providers. Groq, Gemini and Cerebras all expose an
OpenAI-compatible /chat/completions endpoint, so plain httpx is enough.
Providers are tried in the order given by LLM_PROVIDERS (e.g. "gemini,groq");
one is used only if its key (and model) are set.
"""
import json
import logging
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

PROVIDERS = {
    "groq": {"url": "https://api.groq.com/openai/v1/chat/completions",
             "key": "GROQ_API_KEY", "model": "GROQ_MODEL", "default_model": "openai/gpt-oss-120b"},
    "gemini": {"url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
               "key": "GEMINI_API_KEY", "model": "GEMINI_MODEL", "default_model": ""},
    "cerebras": {"url": "https://api.cerebras.ai/v1/chat/completions",
                 "key": "CEREBRAS_API_KEY", "model": "CEREBRAS_MODEL", "default_model": "gpt-oss-120b"},
}


class LLMError(Exception):
    def __init__(self, message, statuses=None):
        super().__init__(message)
        self.statuses = statuses or []


def _chain():
    chain = []
    for name in [n.strip().lower() for n in os.environ.get("LLM_PROVIDERS", "groq").split(",") if n.strip()]:
        cfg = PROVIDERS.get(name)
        if not cfg:
            logger.warning("Unknown LLM provider '%s' in LLM_PROVIDERS", name)
            continue
        key = os.environ.get(cfg["key"])
        model = os.environ.get(cfg["model"]) or cfg["default_model"]
        if key and model:
            chain.append((name, cfg["url"], key, model))
    return chain


def chat_json(prompt: str, timeout: float = 60.0) -> str:
    """Returns the model's raw text reply. Raises LLMError if every provider fails."""
    chain = _chain()
    if not chain:
        raise LLMError("No LLM provider configured (check LLM_PROVIDERS and the API keys)")
    statuses = []
    for round_no in range(2):
        saw_429 = False
        for name, url, key, model in chain:
            try:
                r = httpx.post(
                    url,
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0},
                    timeout=timeout,
                )
            except httpx.HTTPError as exc:
                logger.warning("%s request failed: %s", name, exc)
                statuses.append(0)
                continue
            if r.status_code == 200:
                try:
                    return r.json()["choices"][0]["message"]["content"] or ""
                except (KeyError, IndexError, ValueError):
                    logger.warning("%s returned an unreadable body", name)
                    statuses.append(-1)
                    continue
            statuses.append(r.status_code)
            saw_429 = saw_429 or r.status_code == 429
            logger.warning("%s returned %s: %s", name, r.status_code, r.text[:200])
        if saw_429 and round_no == 0:
            time.sleep(8)
            continue
        break
    raise LLMError(f"All providers failed (statuses={statuses})", statuses)


def parse_json(text: str):
    """Extracts the first JSON object from a reply, tolerating code fences or stray text."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in LLM reply")
    return json.loads(text[start:end + 1])