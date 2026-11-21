"""Same three checks as PR #39. The website's Browserbase window stays on EXT_CONNECT alone (#45).

The worker may touch a Merimen account only when all three are true:
  EXT_CONNECT=on, ext_org_settings.enabled with a consent reference, and an ext_consents row.
"""

from __future__ import annotations


def worker_gate(*, env_on: bool, enabled: bool, consent_reference: str | None, consented: bool) -> str:
    if not env_on:
        return "off"
    ref = (consent_reference or "").strip()
    if not enabled or not ref:
        return "off"
    if not consented:
        return "needs_consent"
    return "ready"


def may_drive_merimen(state: str) -> bool:
    return state == "ready"
