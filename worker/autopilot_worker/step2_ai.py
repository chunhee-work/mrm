"""The AI that reviews the Step 2 plan (step2_run.review). Off unless STEP2_AI=on and ANTHROPIC_API_KEY is set.

It reads the playbook's "step2" files as the cached system prompt (playbook.block("step2") + the answer format) and gets the case's photo names,
the rule plan and the catalogue lines as the user message. It sends no plate, owner or policy data. Any failure returns None: the rule plan stands."""

from __future__ import annotations

import json
import re
import urllib.request

URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-sonnet-5-5"


def _post(url: str, headers: dict, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https URL)
        return json.loads(r.read())


class AnthropicStep2Reviewer:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, *, post=_post, timeout: float = 120.0):
        self.api_key, self.model, self.post, self.timeout = api_key, model or DEFAULT_MODEL, post, timeout

    def review(self, system: str, user: str) -> dict | None:
        body = {
            "model": self.model, "max_tokens": 4000,
            # the playbook never changes between cases: it is the cached part
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user}],
        }
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        out = self.post(URL, headers, body, self.timeout)
        text = "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text")
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            return None
        try:
            got = json.loads(m.group(0))
        except ValueError:
            return None
        return got if isinstance(got, dict) else None


def from_env(env: dict[str, str]) -> AnthropicStep2Reviewer | None:
    if env.get("STEP2_AI") != "on" or not env.get("ANTHROPIC_API_KEY"):
        return None
    return AnthropicStep2Reviewer(env["ANTHROPIC_API_KEY"], env.get("STEP2_MODEL") or DEFAULT_MODEL)
