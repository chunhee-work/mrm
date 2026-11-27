"""Process entry. A missing Chrome or a refused save is a status, not a crash loop that prints secrets."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import replace
import sys
import time

from .config import Config, account_for
from .pipeline import Driver
from .loop import tick, tick_error_line
from .photos import ModelError, names_for_photos, parse_predict_stdout, predict_command
from .store import PgRepo


class _CdpDriver(Driver):
    """Phase A step 1 (create the case) is real: a dry run fills the create form without saving it (MERIMEN_DRYRUN=on), a live save needs
    MERIMEN_WRITES=on and WORKER_SUBMIT=on. Every other save step is still "not ported" and changes nothing in Merimen."""

    def __init__(self, script: str, page_for=None):
        self.script = script
        self.page_for = page_for or (lambda _org: None)
        self.profile = lambda: None  # set per job (loop.tick): the user's manager and adjuster
        self.workshop = lambda _lock: None  # set per job: the case's workshop; True locks it (claim), False only looks (peek)
        self.record = None  # set per job: writes the Merimen case number the moment the case exists
        self.marks = None  # set per job: returns the "Next was pressed" marks (PgRepo.create_marks); only asked for a live save

    def _create(self, live: bool):
        from .create_step import run_create_step

        return run_create_step(self.case or {}, profile=self.profile, workshop=self.workshop, page_for=(lambda org: self.page_for(org, strict=True)) if getattr(self, 'strict_tabs', True) and live is not None else self.page_for, live=live, progress=self.progress, record=self.record, marks=self.marks() if live and self.marks else None)

    def merimen_photos(self, case: dict):
        """The real photo step (merimen_photos.py) when a logged-in tab exists; the "not ported" default otherwise. Reads are always safe;
        photo_sync only writes with writes on."""
        page = self.page_for(case.get("org_id") or "", strict=True) if case.get("org_id") else None
        if page is None:
            return super().merimen_photos(case)
        from .merimen_photos import RealPhotos

        local = {d["id"]: d.get("local") for d in (case.get("desk") or [])}
        return RealPhotos(page, lambda pid: local.get(pid))

    def merimen_step2(self, case: dict):
        """The real Select Parts adapter (merimen_step2.py) for a case that exists in Merimen; the default (reads nothing) otherwise."""
        if not (case.get("org_id") and case.get("merimen_caseid") and case.get("merimen_extid")):
            return super().merimen_step2(case)
        only = os.environ.get("MERIMEN_CREATE_ONLY_CASE") or ""
        if only and str(case.get("id")) != only:  # the supervised first live case: every other case is left alone in Phase B too
            return super().merimen_step2(case)
        if self.page_for(case["org_id"], strict=True) is None:
            return super().merimen_step2(case)
        from .merimen_step2 import RealStep2

        return RealStep2(lambda: self.page_for(case["org_id"], strict=True))

    def _docs(self, writes: bool, case_id, ext_id):
        """Documents of Phase A (merimen_docs.py): the plan in a dry run (read-only when the case already exists), the upload when writes are on."""
        from .merimen_docs import run_docs

        case = self.case or {}
        cid, ext = case_id or case.get("merimen_caseid"), ext_id or case.get("merimen_extid")
        page = self.page_for(case.get("org_id") or "", strict=True) if (cid and ext) else None
        if cid and not ext and writes:
            from .merimen_docs import DocReport

            return DocReport(ok=False, code="no_ext", note="the Merimen ext id is not stored")
        if cid and ext and page is None:
            from .merimen_docs import DocReport

            return DocReport(ok=False, code="no_tab", planned=0)
        return run_docs(page, case, str(cid or ""), str(ext or ""), writes=writes)

    def dry_run(self, phase: str, steps: tuple):
        from .pipeline import DriveResult

        # MERIMEN_DRYRUN=on fills Merimen's create form without saving it. While it is on nothing is ever saved (see save).
        if phase == "A" and os.environ.get("MERIMEN_DRYRUN") == "on":
            res = self._create(False)
            if res.ok:
                d = self._docs(False, None, None)
                res.line = ((res.line + "; ") if res.line else "") + d.line()
            return res
        if phase == "B" and os.environ.get("MERIMEN_DRYRUN") == "on":
            est = self._estimate()
            if est is not None:  # read-only: what the estimate details step would set (the parts are not ticked in a dry run)
                return DriveResult(ok=True, line=est.read(self.case or {}).line())
        return DriveResult(ok=True)

    def _estimate(self):
        """The estimate details adapter (merimen_estimate.py) for a case that exists in Merimen and has a strict logged-in tab; None otherwise."""
        case = self.case or {}
        if not (case.get("org_id") and case.get("merimen_caseid") and case.get("merimen_extid")):
            return None
        only = os.environ.get("MERIMEN_CREATE_ONLY_CASE") or ""
        if only and str(case.get("id")) != only:
            return None
        if self.page_for(case["org_id"], strict=True) is None:
            return None
        from .merimen_estimate import MerimenEstimate

        return MerimenEstimate(lambda: self.page_for(case["org_id"], strict=True))

    def save(self, phase: str, steps: tuple):
        from .pipeline import DriveResult

        if os.environ.get("MERIMEN_WRITES") != "on" or os.environ.get("WORKER_SUBMIT") != "on" or os.environ.get("MERIMEN_DRYRUN") == "on":
            return DriveResult(ok=False, error="step_not_ported")
        if phase == "A":
            only = os.environ.get("MERIMEN_CREATE_ONLY_CASE") or ""
            if only and str((self.case or {}).get("id")) != only:  # the supervised first live create: every other case is left alone
                return DriveResult(ok=False, error="step_not_ported")
            if int(os.environ.get("ORG_CONCURRENCY") or "1") > 1:  # the supported setup is ONE create at a time: refuse before anything opens
                return DriveResult(ok=False, fatal=True, error="concurrency_unsafe", line="Creating cases in Merimen needs ORG_CONCURRENCY=1; set it and restart the worker")
            res = self._create(True)  # step 1 of Phase A
            if res.ok and (res.case_id or (self.case or {}).get("merimen_caseid")):
                d = self._docs(True, res.case_id, res.ext_id)  # step 2: the documents (skips what Merimen already has)
                res.line = ((res.line + "; ") if res.line else "") + d.line()
            return res
        if phase == "B":
            est = self._estimate()
            if est is None:
                return DriveResult(ok=False, error="step_not_ported")
            r = est.fill(self.case or {})
            if not r.ok:  # unreadable = try again later (setting the same values again is safe); anything else waits for a person
                return DriveResult(ok=False, fatal=r.code != "unreadable", error="estimate", line=r.line())
            from .merimen_estimate import gate, read_total

            case = self.case or {}
            total = read_total(lambda: self.page_for(case.get("org_id") or "", strict=True), case)
            left = gate(r, total)
            if left:  # the owner's rule: submit only when EVERY check passed; otherwise the case waits for a person with the list
                return DriveResult(ok=False, fatal=True, error="checks", total_rm=f"{total:.2f}" if total else None,
                                   line=(f"Estimate details saved. Not submitted, {len(left)} to fix: " + "; ".join(left[:5]))[:380])
            # all checks passed. Submitting to the insurer is deferred (owner 2026-11-28): a person submits in Merimen
            return DriveResult(ok=False, error="step_not_ported", total_rm=f"{total:.2f}",
                               line=f"{r.line()} All checks passed (total RM{total:,.2f}). Ready to submit in Merimen by hand.")
        return DriveResult(ok=False, error="step_not_ported")


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
    # Chrome gets a short list of environment variables (chrome.chrome_env), never the worker's keys.
    from .chrome import chrome_env

    subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=chrome_env(os.environ))


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


def _page_provider(cfg: Config):
    """The Merimen tab of the worker Chrome for an org, through Playwright over the local debugging port.
    Playwright is only imported when screenshots are on. A connection that breaks is dropped and made again next time."""
    state: dict = {}

    def page_for(org_id: str, strict: bool = False):
        """strict (the create step): exactly ONE tab that is a logged-in claims page (https, www.merimen.com.my, /claims/, session marks in the address);
        none or several = None, so the case waits instead of opening the form with a guessed session."""
        account = account_for(org_id, cfg.accounts, cfg.org_accounts)
        if not account:
            return None
        port = cfg.accounts[account]
        try:
            if port not in state:
                from playwright.sync_api import sync_playwright

                pw = sync_playwright().start()
                state[port] = (pw, pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}"))
            browser = state[port][1]
            if strict:
                from .merimen_create import session_query

                found = [pg for ctx in browser.contexts for pg in ctx.pages if session_query(pg.url or "")]
                return found[0] if len(found) == 1 else None
            for ctx in browser.contexts:
                for page in ctx.pages:
                    if "merimen.com.my" in (page.url or ""):
                        return page
        except Exception:
            old = state.pop(port, None)
            if old:
                try:
                    old[0].stop()
                except Exception:
                    pass
        return None

    return page_for


def main() -> None:
    cfg = replace(Config.from_env(), mailer=_mail)
    if cfg.live_writes and cfg.org_limit > 1:  # one create at a time is the supported setup: refuse to start, change no case
        raise SystemExit("MERIMEN_WRITES and WORKER_SUBMIT are on but ORG_CONCURRENCY is above 1: set ORG_CONCURRENCY=1 and start again")
    repo = PgRepo(cfg.database_url, cfg.db_transport)
    script = os.path.join(os.path.dirname(__file__), "..", "cdp.mjs")
    page_for = _page_provider(cfg)
    driver = _CdpDriver(script, page_for=page_for)
    from . import step2_ai

    driver.step2_reviewer = step2_ai.from_env(dict(os.environ))  # None unless STEP2_AI=on and ANTHROPIC_API_KEY is set
    from . import jev as jev_mod
    from . import jev_pages

    import threading

    _rec_lock = threading.Lock()  # page calls run in a small pool; one ledger write at a time on the shared connection

    def _record_jev(row: dict) -> None:
        try:
            with _rec_lock:
                repo.record_llm_call(row)
        except Exception as e:  # noqa: BLE001  (before migration 0016 the insert is refused: skip it, never stop a case)
            print("jev ledger skipped:", type(e).__name__, flush=True)

    driver.jev = jev_mod.from_env(dict(os.environ), _record_jev)  # None with JEV=0 or without TYPESAFE_API_KEY: the code rules alone
    namer = _namer_factory(cfg)

    files_root = os.path.join(cfg.state_dir, "files")  # downloads live here only while their job runs

    def download(url: str, name: str, case_id, job_id, item_id):
        """One photo to <state>/files/<case id>/<job id>/<photo id>-<name> (private). `name` is the uploaded file name: untrusted."""
        if not cfg.blob_token or not url:
            return None
        from .blobstore import blob_request, local_file, write_private
        import urllib.request

        target = local_file(files_root, case_id, job_id, item_id, name)
        req_url, headers = blob_request(url, cfg.blob_token)
        req = urllib.request.Request(req_url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            write_private(target, r.read())
        return target

    def forget_files(case_id, job_id) -> None:
        from .blobstore import remove_job_files

        remove_job_files(files_root, case_id, job_id)

    last_sweep = [None]

    def sweep_files() -> None:
        """At start and then hourly: what a killed job left behind, and the flat files from before there was a folder per case."""
        if last_sweep[0] is not None and time.monotonic() - last_sweep[0] < 3600:
            return
        last_sweep[0] = time.monotonic()
        try:
            from .blobstore import sweep_old_files

            if os.path.isdir(files_root):
                os.chmod(files_root, 0o700)
            gone = sweep_old_files(files_root)
            if gone:
                print(f"old downloaded files removed: {gone}", flush=True)
        except Exception as e:  # noqa: BLE001
            print("file sweep skipped:", type(e).__name__, flush=True)

    def fetch_bytes(url: str):
        """A case PDF as bytes, in memory only (the Jev page check never writes a page or a PDF to disk)."""
        if not cfg.blob_token or not url:
            return None
        from .blobstore import blob_request
        import urllib.request

        req_url, headers = blob_request(url, cfg.blob_token)
        with urllib.request.urlopen(urllib.request.Request(req_url, headers=headers), timeout=60) as r:  # noqa: S310
            return r.read(jev_pages.MAX_PDF_BYTES + 1)

    side_check = None
    if driver.jev is not None and jev_pages.enabled(dict(os.environ)):
        if jev_pages.pymupdf_ok():
            side_check = lambda case: jev_pages.run(driver.jev, case, fetch_bytes, env=dict(os.environ))  # noqa: E731
        else:
            print("jev page check off: PyMuPDF is not installed", flush=True)

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

    from .login_flow import script_fetch

    fetch_page = script_fetch(script)  # fetch_page(user, password, port): one run of `cdp.mjs login` per check, on the org's own Chrome

    def put_blob(path: str, data: bytes) -> None:
        from .blobstore import blob_put

        blob_put(cfg.blob_token, path, data)

    def delete_blob(path: str) -> None:
        from .blobstore import blob_delete

        blob_delete(cfg.blob_token, path)

    shots = bool(cfg.worker_ui and cfg.blob_token)
    port = int(os.environ.get("WORKER_HEALTH_PORT") or "8080")
    if port > 0:
        try:
            from .health import serve
            serve(port, {"id": cfg.worker_id, "model": cfg.hf_repo, "chrome": True})
        except OSError:
            pass

    while True:
        sweep_files()
        try:
            tick(cfg, repo, launch=_launch, inspect=_inspect, namer=namer, driver=driver, download=download, keep=_keep, fetch_page=fetch_page, master=master,
                 page_for=page_for if shots else None, put_blob=put_blob if shots else None, delete_blob=delete_blob if shots else None, side_check=side_check,
                 forget_files=forget_files)
        except Exception as e:
            print(tick_error_line(e), file=sys.stderr)
        time.sleep(cfg.poll_seconds)


if __name__ == "__main__":
    main()
