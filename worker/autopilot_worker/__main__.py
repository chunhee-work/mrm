"""Process entry. A missing Chrome or a refused save is a status, not a crash loop that prints secrets."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import replace
import sys
import time

from .cdp_client import Driver
from .config import Config
from .loop import tick
from .photos import ModelError, names_for_photos, parse_predict_stdout, predict_command
from .store import PgRepo


class _CdpDriver(Driver):
    """Dry-run is local. Save shells to cdp.mjs, which exits before any socket unless MERIMEN_WRITES=on."""

    def __init__(self, script: str):
        self.script = script

    def dry_run(self, phase: str, steps: tuple):
        from .pipeline import DriveResult

        return DriveResult(ok=True)

    def save(self, phase: str, steps: tuple):
        from .pipeline import DriveResult

        if os.environ.get("MERIMEN_WRITES") != "on" or os.environ.get("WORKER_SUBMIT") != "on":
            return DriveResult(ok=False, error="step_not_ported")
        proc = subprocess.run(
            ["node", self.script, "commit", phase],
            capture_output=True, text=True, timeout=120, env=os.environ.copy(),
        )
        if proc.returncode != 0:
            return DriveResult(ok=False, fatal=True, error="not_saved")
        return DriveResult(ok=True)


def _namer_factory(cfg: Config):
    bundled = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "typesafe", "photo_train", "predict_case.py"))

    def namer(photos, vehicle):
        if not photos:
            return []
        prod = os.path.join(cfg.model_dir, "production", "production.json")
        if not os.path.isfile(prod):
            raise ModelError("model missing")
        use = bundled
        images = [p.get("local") or p.get("src_name") or "" for p in photos]
        cmd, extra = predict_command(sys.executable, use, images, vehicle=vehicle, prod_file=prod, batch=cfg.pred_bs)
        env = os.environ.copy()
        env.update(extra)
        if cfg.hf_token:
            env["HF_TOKEN"] = cfg.hf_token
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
        if proc.returncode != 0:
            raise ModelError("predict failed")
        return names_for_photos(photos, parse_predict_stdout(proc.stdout))

    return namer


def _launch(argv: list[str]) -> None:
    # The debugging port is bound to 127.0.0.1 by chrome_argv. The profile keeps the human's login.
    subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def _inspect(port: int):
    import json
    from urllib.request import urlopen

    try:
        with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=3) as r:
            tabs = json.load(r)
    except Exception:
        return None
    urls = [t.get("url") or "" for t in tabs if t.get("type") == "page"]
    return {"urls": urls, "has_password": False}


def _mail(to: str, subject: str, html: str) -> None:
    key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("EMAIL_FROM")
    if not key or not sender:
        return
    import urllib.request
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps({"from": sender, "to": [to], "subject": subject, "html": html}).encode(),
        headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        return


def main() -> None:
    cfg = replace(Config.from_env(), mailer=_mail)
    repo = PgRepo(cfg.database_url)
    script = os.path.join(os.path.dirname(__file__), "..", "cdp.mjs")
    driver = _CdpDriver(script)
    namer = _namer_factory(cfg)

    def download(url: str, name: str) -> None:
        if not cfg.blob_token or not url:
            return
        from .blobstore import blob_request, local_file
        import urllib.request

        dest_dir = os.path.join(cfg.state_dir, "files")
        os.makedirs(dest_dir, exist_ok=True)
        target = local_file(dest_dir, name)
        req_url, headers = blob_request(url, cfg.blob_token)
        req = urllib.request.Request(req_url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r, open(target, "wb") as f:
            f.write(r.read())
        return target

    def _keep(port: int) -> None:
        subprocess.run(
            ["node", script, "continue"],
            env={**os.environ, "CDP_PORT": str(port)},
            timeout=20, capture_output=True, text=True,
        )

    master = b""
    if os.environ.get("MERIMEN_CRED_KEY"):
        try:
            from .crypto import master_key
            master = master_key(os.environ["MERIMEN_CRED_KEY"])
        except ValueError:
            master = b""

    def fetch_page(user: str, password: str):
        proc = subprocess.run(
            ["node", script, "login"],
            input=json.dumps({"username": user, "password": password}),
            text=True, capture_output=True, timeout=60,
            env={**os.environ, "CDP_PORT": str(next(iter(cfg.accounts.values())))},
        )
        try:
            data = json.loads(proc.stdout or "{}")
        except json.JSONDecodeError:
            return {"offline": True}
        if proc.returncode != 0 or data.get("offline") or data.get("error"):
            return {"offline": True}
        return data

    port = int(os.environ.get("WORKER_HEALTH_PORT") or "8080")
    if port > 0:
        try:
            from .health import serve
            serve(port, {"id": cfg.worker_id, "model": cfg.hf_repo, "chrome": True})
        except OSError:
            pass

    while True:
        try:
            tick(cfg, repo, launch=_launch, inspect=_inspect, namer=namer, driver=driver, download=download, keep=_keep, fetch_page=fetch_page, master=master)
        except Exception as e:
            print(f"tick {type(e).__name__}", file=sys.stderr)
        time.sleep(cfg.poll_seconds)


if __name__ == "__main__":
    main()
