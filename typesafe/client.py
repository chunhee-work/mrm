"""Minimal TypeSafe System One client — stdlib only (this Mac runs Python 3.9;
the official SDK needs >=3.10, so we talk to the HTTP API directly)."""
import json, os, time, urllib.request, urllib.error

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = os.environ.get("TYPESAFE_MODEL", "jev-latest")


class TypeSafeError(RuntimeError):
    pass


_CACHED = None


def _keychain():
    """macOS Keychain — the key never lands in a file or a shell profile."""
    import subprocess
    try:
        r = subprocess.run(
            ["security", "find-generic-password", "-a", os.environ.get("USER", ""),
             "-s", "TYPESAFE_API_KEY", "-w"],
            capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return r.stdout.strip() or None
    except Exception:
        pass
    return None


def _key():
    """Env var wins (handy for CI/one-offs), else the Keychain."""
    global _CACHED
    if _CACHED:
        return _CACHED
    k = os.environ.get("TYPESAFE_API_KEY") or _keychain()
    if not k:
        raise TypeSafeError(
            "No TypeSafe API key found.\n"
            "  Keychain (recommended, nothing stored in a file):\n"
            "    security add-generic-password -a \"$USER\" -s TYPESAFE_API_KEY -w 'ts-...'\n"
            "  or environment variable:\n"
            "    export TYPESAFE_API_KEY='ts-...'\n"
            "GitHub Secrets will NOT work here: this pipeline needs the local Chrome "
            "session, Desktop files and macOS Accessibility, so it cannot run in Actions."
        )
    _CACHED = k
    return k


def ask(state, questions, model=None, timeout=60, retries=3, assets=None, images=False):
    """One request, many questions. Independent questions MUST be batched here —
    they run in parallel and are far cheaper than separate calls."""
    body = json.dumps({
        "state": state,
        "model": model or MODEL,
        "questions": questions,
        **({"assets": assets} if assets else {}),
    }).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Authorization": "Bearer " + _key(),
                 "Content-Type": "application/json",
                 **({"TypeSafe-Danger-Zone-Images": "true"} if images else {})},
        method="POST")
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt); last = detail; continue
            raise TypeSafeError("HTTP %s: %s" % (e.code, detail))
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt); last = str(e); continue
            raise TypeSafeError("connection failed: %s (last: %s)" % (e, last))


def answer(resp, qid):
    """(value, confidence) for one question id, tolerating shape differences."""
    a = (resp.get("answers") or resp.get("questions") or {}).get(qid)
    if a is None:
        return None, 0.0
    if isinstance(a, dict):
        for k in ("answer", "choice", "value", "score", "probability"):
            if k in a:
                return a[k], a.get("confidence", 0.0)
        return a, a.get("confidence", 0.0)
    return a, 0.0


def gate(value, confidence, threshold, label):
    """Confidence-gated routing: act, or hand back for a human to look at.
    Thresholds are policy — tune them on YOUR data, not on doc examples."""
    if confidence >= threshold:
        return {"ok": True, "value": value, "confidence": confidence}
    return {"ok": False, "value": value, "confidence": confidence,
            "review": "%s: confidence %.2f < %.2f" % (label, confidence, threshold)}
