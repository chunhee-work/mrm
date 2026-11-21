"""Environment. Values stay in the process environment; this module only reads names."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _on(env: dict[str, str], name: str) -> bool:
    return env.get(name, "") == "on"


def _transport(raw: str | None) -> str:
    v = (raw or "http").strip().lower()
    if v not in ("http", "tcp"):
        raise ValueError("DB_TRANSPORT must be http or tcp")
    return v


def parse_accounts(spec: str) -> dict[str, int]:
    """`default:9222,sinar:9223` -> {account: port}. Empty is one profile on 9222."""
    out: dict[str, int] = {}
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        key, _, port = part.partition(":")
        if not _account_key(key) or not port.isdigit():
            raise ValueError("bad WORKER_ACCOUNTS")
        n = int(port)
        if not 1024 <= n <= 65535:
            raise ValueError("bad port")
        out[key] = n
    return out or {"default": 9222}


def parse_org_accounts(spec: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        org, _, key = part.partition(":")
        if not org or not _account_key(key):
            raise ValueError("bad WORKER_ORG_ACCOUNTS")
        out[org] = key
    return out


def _account_key(key: str) -> bool:
    return bool(key) and len(key) <= 40 and all(c.isalnum() or c in "-_" for c in key)


def account_for(org_id: str, accounts: dict[str, int], org_map: dict[str, str]) -> str | None:
    """One Chrome profile per Merimen login. Several profiles and no mapping: do not guess."""
    if org_id in org_map:
        return org_map[org_id] if org_map[org_id] in accounts else None
    if len(accounts) == 1:
        return next(iter(accounts))
    return None


@dataclass(frozen=True)
class Config:
    database_url: str
    blob_token: str
    hf_token: str
    hf_repo: str
    ext_connect: bool
    photo_worker: bool
    merimen_writes: bool
    merimen_login: bool
    org_limit: int
    worker_id: str
    state_dir: str
    accounts: dict[str, int]
    org_accounts: dict[str, str]
    chrome_bin: str
    pred_bs: int
    poll_seconds: float
    model_dir: str
    db_transport: str = "http"
    lease_seconds: int = 900
    worker_ui: bool = False
    retention_days: int = 90
    mailer: object | None = None
    worker_submit: bool = False

    @property
    def live_writes(self) -> bool:
        """Merimen may be changed only when BOTH switches are on (README): a photo, Step 2 or save step never writes with one alone."""
        return self.merimen_writes and self.worker_submit

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Config":
        e = dict(os.environ if env is None else env)
        state = e.get("WORKER_STATE") or "/var/lib/autopilot-worker"
        if state.startswith("/Users/"):
            raise ValueError("WORKER_STATE must be a Linux path")
        return cls(
            database_url=e.get("DATABASE_URL", ""),
            blob_token=e.get("BLOB_READ_WRITE_TOKEN", ""),
            hf_token=e.get("HF_TOKEN", ""),
            hf_repo=e.get("HF_MODEL_REPO") or "chunhee00/mrm-photo-model",
            ext_connect=_on(e, "EXT_CONNECT"),
            photo_worker=_on(e, "PHOTO_WORKER"),
            merimen_writes=_on(e, "MERIMEN_WRITES"),
            merimen_login=_on(e, "MERIMEN_LOGIN"),
            org_limit=max(1, int(e.get("ORG_CONCURRENCY") or "1")),
            worker_id=(e.get("WORKER_ID") or "worker")[:40],
            state_dir=state,
            accounts=parse_accounts(e.get("WORKER_ACCOUNTS", "")),
            org_accounts=parse_org_accounts(e.get("WORKER_ORG_ACCOUNTS", "")),
            chrome_bin=e.get("CHROME_BIN") or "google-chrome",
            pred_bs=max(1, int(e.get("PRED_BS") or "4")),
            poll_seconds=float(e.get("POLL_SECONDS") or "2"),
            model_dir=e.get("PHOTO_MODEL_DIR") or os.path.join(state, "photo-model"),
            db_transport=_transport(e.get("DB_TRANSPORT")),
            lease_seconds=max(60, int(e.get("JOB_LEASE_SECONDS") or "900")),
            worker_ui=_on(e, "WORKER_UI"),
            retention_days=max(1, int(e.get("SCREENSHOT_RETENTION_DAYS") or "90")),
            worker_submit=_on(e, "WORKER_SUBMIT"),
        )
