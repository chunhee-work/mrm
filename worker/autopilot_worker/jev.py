"""Jev = TypeSafe System One, a judgement API (https://api.typesafe.ai/v1/systemone). Text only: this client has no way to send an image.

Rule (owner 2026-11-10): Jev only WARNS or CLEARS. It never decides alone and never adds an alarm. Any error returns "no answer" and the
rule-based result stands. Off with JEV=0 or when TYPESAFE_API_KEY is not set. The key is read from the environment and never printed."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Callable

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
CHUNK = 150  # pairs per request: more than ~750 answers fail with HTTP 400 max_tokens_exceeded
THRESHOLD = 0.7  # 0.6 hid real misses (Cowl Panel 0.66, Quarter Panel RH 0.64)
MAX_PAIRS = 600  # per check: more than this and Jev is skipped (the code rules stand); keeps one Step 2 check short and cheap
PARALLEL = 2
BUDGET_S = 30.0  # wall-clock budget for the whole check; when it runs out the code rules stand

RULES = (
    "Decide if an estimate row and a photo item are the SAME physical part (same part number), not a neighbouring, "
    "attached or companion part. Different parts: Front vs Rear; LH vs RH; a panel vs its liner, trim, inner, "
    "reinforcement, bracket, moulding, lamp, lock, hinge, striker, badge or handle; a bumper vs its sensor, "
    "bracket, clips or holder; a number plate vs a number plate holder or lamp. Same part: catalogue wording or "
    "word order differs but it is the same piece (e.g. Bonnet Lock = Bonnet Latch; Bumper Front Moulding = Bumper "
    "Front Finisher; Fender Inner Wheelhouse = Fender Front Inner Support Panel; Rear Wheelhouse = Wheel Arch Inner "
    "Rear; Headlamp Panel = Front Panel Radiator Support; Rear Bumper = Bumper Rear Cover; Firewall Panel = Engine "
    "Partition Panel; Rear Bumper Bracket Side = Bumper Rear Retainer). A row whose side is LH but qty is 2, or "
    "whose text says [LH & RH] / [Both LH/RH] / [RH/LH], covers BOTH sides."
)

Post = Callable[[dict, float], dict]
Record = Callable[[dict], None]


class JevError(RuntimeError):
    pass


def _post_json(key: str) -> Post:
    def post(body: dict, timeout: float) -> dict:
        req = urllib.request.Request(
            ENDPOINT, data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        )
        last = ""
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https URL)
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}"
                if e.code not in (429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last = type(e).__name__
            time.sleep(2 ** attempt)
        raise JevError(last or "request failed")

    return post


class Jev:
    def __init__(self, post: Post, *, record: Record | None = None, model: str = MODEL, timeout: float = 45.0):
        self.post, self.record, self.model, self.timeout = post, record, model, timeout
        self.record_off = False  # set after the first refused ledger write (before migration 0016): stop trying, print once

    def ask(self, state: dict, questions: dict, *, purpose: str, case_id: str | None = None) -> dict:
        """One request. `questions` is an object keyed by question id (an array gets HTTP 422). Logs one row per call, success or not."""
        t0 = time.time()
        row = {"request_id": "jev:" + uuid.uuid4().hex, "purpose": "jev_" + purpose, "model": self.model, "case_id": case_id, "ok": True, "error_class": None,
               "input_tokens": 0, "output_tokens": 0}
        try:
            out = self.post({"state": state, "model": self.model, "questions": questions}, self.timeout)
            use = out.get("usage") or {}
            row["input_tokens"], row["output_tokens"] = int(use.get("input_tokens") or 0), int(use.get("output_tokens") or 0)
            return out
        except Exception as e:
            row["ok"], row["error_class"] = False, type(e).__name__
            raise JevError(str(e)[:120]) from e
        finally:
            row["latency_ms"] = int((time.time() - t0) * 1000)
            if self.record and not self.record_off:
                try:
                    self.record(row)
                except Exception:  # a ledger problem must never stop a case; one refusal switches the ledger off for this run
                    self.record_off = True

    def same_parts(self, pairs: list[tuple[str, str, str]], *, case_id: str | None = None) -> dict[tuple[str, str, str], float]:
        """{(photo item, estimate row, qty): probability they are the same part} for the undecided pairs. Raises JevError on any failure."""
        if not pairs:
            return {}
        if len(pairs) > MAX_PAIRS:
            raise JevError(f"too many pairs ({len(pairs)} > {MAX_PAIRS})")
        clean = lambda t: " ".join(str(t).split())[:100]  # a name or row is data, never long or multi-line
        pairs = [(clean(n), clean(r), str(q)[:4]) for n, r, q in pairs]

        def one(ch):
            st = {"rules": RULES, "pairs": {f"q{i}": {"photo_item": n, "estimate_row": r, "row_qty": q} for i, (n, r, q) in enumerate(ch)}}
            qs = {f"q{i}": {"type": "noul", "instructions": f"pairs.q{i}: is estimate row '{r}' (qty {q}) the SAME part as photo item '{n}'?"}
                  for i, (n, r, q) in enumerate(ch)}
            ans = self.ask(st, qs, purpose="name_check", case_id=case_id).get("answers") or {}
            out = {}
            for i, k in enumerate(ch):
                v = (ans.get(f"q{i}") or {}).get("noul")
                if v is None:
                    raise JevError(f"no answer for q{i}")
                out[k] = float(v)
            return out

        chunks = [pairs[i:i + CHUNK] for i in range(0, len(pairs), CHUNK)]
        res: dict = {}
        ex = ThreadPoolExecutor(min(len(chunks), PARALLEL))
        try:
            futs = [ex.submit(one, ch) for ch in chunks]
            deadline = time.time() + BUDGET_S
            for f in futs:
                try:
                    res.update(f.result(timeout=max(0.1, deadline - time.time())))
                except FutureTimeout as e:
                    raise JevError("budget used up") from e
        finally:
            ex.shutdown(wait=False, cancel_futures=True)  # the code rules go on at once; a request already sent finishes on its own
        return res


def from_env(env, record: Record | None = None) -> Jev | None:
    key = (env.get("TYPESAFE_API_KEY") or "").strip()
    if env.get("JEV") == "0" or not key:
        return None
    return Jev(_post_json(key), record=record)


__all__ = ["Jev", "JevError", "from_env", "THRESHOLD", "RULES"]
