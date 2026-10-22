import os
import time

from app.services import llm_client


def main():
    for name in llm_client.PROVIDERS:
        os.environ["LLM_PROVIDERS"] = name
        if not llm_client._chain():
            print(f"{name}: not configured (missing key or model), skipped")
            continue
        t = time.time()
        try:
            out = llm_client.parse_json(llm_client.chat_json('Reply with exactly this JSON and nothing else: {"ok": true}'))
            print(f"{name}: OK in {time.time() - t:.1f}s -> {out}")
        except Exception as exc:
            print(f"{name}: FAILED -> {exc}")


if __name__ == "__main__":
    main()