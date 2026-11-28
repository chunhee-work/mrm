"""Process entry. A missing Chrome or a refused save is a status, not a crash loop that prints secrets."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import replace
import sys
import threading
import time

from .config import Config, account_for
from .pipeline import Driver
from .loop import housekeeping, run_job, tick, tick_error_line
from .photos import ModelError, names_for_photos, parse_predict_stdout, predict_command
from .store import PgRepo


# Making a NEW case in Merimen (duplicate warnings, the workshop popup, the "Next pressed" mark) runs one at a time in this process,
# also with WORKER_SLOTS > 1. Every later step works on its own case by its Merimen case id, in its own tab.
_CREATE_LOCK = __import__("threading").Lock()
CREATE_WAIT = 600.0  # a create that finds another still running after this long goes back to the queue (nothing done in Merimen yet)


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

    def _report(self, live: bool, case_id, ext_id):
        """Phase A step 2, the Adjuster Report (merimen_report.py): filled and read back in a dry run, saved when writes are on.
        Returns (ok, retry, line). Only for a case that exists in Merimen (its case id AND ext id are stored)."""
        from .create_spec import SpecError
        from .merimen_report import MerimenReport
        from .report_spec import build_report

        case = self.case or {}
        cid, ext = case_id or case.get("merimen_caseid"), ext_id or case.get("merimen_extid")
        if not cid:
            return True, False, "Adjuster Report: after the case is made"
        try:
            names = [d.get("final_name") or d.get("model_name") or "" for d in (case.get("desk") or [])]
            veh = (case.get("case_data") or {}).get("client_vehicle") or {}
            if not veh.get("colour") and getattr(self, "fetch_bytes", None):
                from . import jev_colour  # owner 2026-11-27: Jev reads the colour from one overview photo

                veh = {**veh, **jev_colour.read(getattr(self, "jev", None), case, self.fetch_bytes)}
            D = build_report(case.get("case_data"), case_id=str(cid), ext_id=str(ext or ""), workshop=self.workshop(False), photo_names=names,
                             extras={"colour": veh.get("colour") or "", "odometer": veh.get("odometer") or ""})
            prof = self.profile() or {}
            D["manager"], D["adjuster"] = prof.get("manager") or "", prof.get("adjuster") or ""
        except SpecError as e:
            return False, False, f"Adjuster Report not filled: {e.code}" + (f" ({e.detail})" if e.detail else "")
        page = self.page_for(case.get("org_id") or "", strict=True)
        if page is None:
            return False, True, "Adjuster Report: no logged-in Merimen tab"
        run = MerimenReport(page)
        try:
            res = run.save(D) if live else run.fill(D)
        finally:
            run.close()
        retry = res.code in ("not_logged_in", "report_not_open", "report_error")
        if live:
            return res.saved, retry, ("Adjuster Report saved" if res.saved else "Adjuster Report not saved") + (f": {res.line()}" if res.line() else "")
        return (res.ok or res.code == "report_not_ready"), retry, "Adjuster Report filled, not saved" + (f": {res.line()}" if res.line() else "")

    def dry_run(self, phase: str, steps: tuple):
        from .pipeline import DriveResult

        # MERIMEN_DRYRUN=on fills Merimen's create form without saving it. While it is on nothing is ever saved (see save).
        if phase == "A" and os.environ.get("MERIMEN_DRYRUN") == "on":
            res = self._create(False)
            if res.ok:
                if (self.case or {}).get("merimen_caseid"):  # the case exists: its report can be filled and read back (never saved here)
                    ok, retry, line = self._report(False, None, None)
                    res.line = ((res.line + "; ") if res.line else "") + line
                    if not ok:
                        res.ok, res.fatal, res.error = False, not retry, "report"
                        return res
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
            if int(os.environ.get("ORG_CONCURRENCY") or "1") > 1 and int(os.environ.get("WORKER_SLOTS") or "1") <= 1:
                # several worker PROCESSES may each create for one org: refused as before (the lock below only holds inside one process)
                return DriveResult(ok=False, fatal=True, error="concurrency_unsafe", line="Creating cases in Merimen needs ORG_CONCURRENCY=1 without WORKER_SLOTS; set it and restart the worker")
            # one live create at a time (plan #150, Grok G1); the report, documents and photos after it run side by side. The claim
            # takes no second create while one runs; one that still meets it waits at most CREATE_WAIT, then tries again later
            # a Phase A that already has its Merimen case (a re-run from the report on) never waits for the lock
            new = not (self.case or {}).get("merimen_caseid")
            if new and not _CREATE_LOCK.acquire(timeout=CREATE_WAIT):
                return DriveResult(ok=False, error="create_busy", line="Another case is still being created in Merimen; this one tries again shortly")
            try:
                res = self._create(True)  # step 1 of Phase A
            finally:
                if new:
                    _CREATE_LOCK.release()
                from .pool import create_done

                create_done()  # the claim may take the next create now; this job's report, documents and photos run beside it
            if res.ok and (res.case_id or (self.case or {}).get("merimen_caseid")):
                ok, retry, line = self._report(True, res.case_id, res.ext_id)  # step 2: the Adjuster Report (playbook order: before documents)
                res.line = ((res.line + "; ") if res.line else "") + line
                if not ok:  # the case number is already stored: the next run skips the create and starts at the report
                    return DriveResult(ok=False, fatal=not retry, error="report", line=res.line, case_id=res.case_id, ext_id=res.ext_id)
                d = self._docs(True, res.case_id, res.ext_id)  # step 2: the documents (skips what Merimen already has)
                res.line = ((res.line + "; ") if res.line else "") + d.line()
                if not d.ok and d.uploaded > 0:
                    # stopped after some documents went up (a logout too, whatever code it shows): never guess which are missing and
                    # never go on to the photos as if the set were complete, a person looks (playbook 06). Checked first: a re-login
                    # would only lead to the same stop
                    return DriveResult(ok=False, fatal=True, error="docs", case_id=res.case_id, ext_id=res.ext_id,
                                       line=(res.line + ". Only some of the documents are in Merimen (the upload stopped half way): check them in Merimen by hand")[:380])
                if d.code == "not_logged_in" and self.relogin_ready:  # logged out during the documents: again after a re-login (owner 2026-11-28)
                    return DriveResult(ok=False, error="docs", line=res.line, case_id=res.case_id, ext_id=res.ext_id)
                if d.code == "docs_partial":  # any run, any re-login state: a set found half there is never passed on
                    # an upload cut off by the logout left some of the documents: never guess which, a person looks (playbook 06)
                    return DriveResult(ok=False, fatal=True, error="docs", case_id=res.case_id, ext_id=res.ext_id,
                                       line=(res.line + ". Only some of the documents are in Merimen (an upload cut off, e.g. by a logout): check them in Merimen by hand")[:380])
            return res
        if phase == "B":
            est = self._estimate()
            if est is None:
                c = self.case or {}
                only = os.environ.get("MERIMEN_CREATE_ONLY_CASE") or ""
                if c.get("org_id") and c.get("merimen_caseid") and c.get("merimen_extid") and not (only and str(c.get("id")) != only):
                    # the case is in Merimen but no logged-in tab (e.g. every tab shows the login form): try again, never "done"
                    return DriveResult(ok=False, error="no_tab", line="no logged-in Merimen tab for the estimate details")
                return DriveResult(ok=False, error="step_not_ported")
            from .photo_rules import plan_rows

            names = [x["name"] for x in plan_rows((self.case or {}).get("desk") or [])] + [str(x) for x in (self.case or {}).get("extras") or []]
            r = est.fill(self.case or {}, names)
            if not r.ok:  # unreadable = try again later (setting the same values again is safe); anything else waits for a person
                return DriveResult(ok=False, fatal=r.code != "unreadable", error="estimate", line=r.line())
            from .merimen_estimate import gate, read_total

            case = self.case or {}
            total = read_total(lambda: self.page_for(case.get("org_id") or "", strict=True), case)
            from . import login_seen

            if total is None and login_seen.seen() and self.relogin_ready:
                # the total page showed the login form: try again after a re-login (setting the same values again is safe)
                return DriveResult(ok=False, error="estimate", line="the case total could not be read: Merimen logged out")
            left = gate(r, total)
            if left:  # the owner's rule: submit only when EVERY check passed; otherwise the case waits for a person with the list
                return DriveResult(ok=False, fatal=True, error="checks", total_rm=f"{total:.2f}" if total else None,
                                   line=(f"Estimate details saved. Not submitted, {len(left)} to fix: " + "; ".join(left[:5]))[:380])
            # all checks passed. Submitting to the insurer is deferred (owner 2026-11-28): a person submits in Merimen
            return DriveResult(ok=False, error="step_not_ported", total_rm=f"{total:.2f}",
                               line=f"{r.line()} All checks passed (total RM{total:,.2f}). Ready to submit in Merimen by hand.")
        return DriveResult(ok=False, error="step_not_ported")


_SLOTS_LOCK: list = []  # the open lock file, held for the life of the process


def _one_slots_process(cfg: Config, *, hold: bool = True) -> bool:
    """ONE worker process per state folder (its Chrome, its create lock, its step tabs), in every mode since GPR-150-4 G7: a
    second one would close the first one's step tabs at its start. hold: the lock is kept for the life of the process and a second
    worker refuses to start (plan #150 DPR-150-3 D1 / GPR-150-3 G6); it ends with the process, also on a kill.
    Not hold: only asks (False while another worker holds it); the lock is not kept."""
    import fcntl

    os.makedirs(cfg.state_dir or ".", exist_ok=True)
    f = open(os.path.join(cfg.state_dir or ".", "worker_slots.lock"), "a+")
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        if not hold:
            return False
        raise SystemExit("another worker is running on this machine with the same WORKER_STATE: only one is supported; stop it first")
    if hold:
        _SLOTS_LOCK.append(f)
    else:
        f.close()  # closing the file lets the lock go
    return True


def _close_left_step_tabs(cfg: Config) -> None:
    """At start (every mode): the step tabs a killed job of the last run left open are closed by their recorded ids. Only those
    ids; a tab the worker did not open itself is never closed here."""
    from .login_flow import close_target

    ids = load_step_tabs(cfg.state_dir)
    for port in sorted(set(cfg.accounts.values())):
        for tid in ids:
            close_target(port, tid)  # a tab that is gone (or on another Chrome) is a no-op; never the last tab of a window
    # ids Chrome no longer has are forgotten; one close_target would not close (the window's last tab) stays, so it never counts as
    # the home tab
    _forget_gone_step_tabs(cfg)


def _forget_gone_step_tabs(cfg: Config, opener=None) -> None:
    from urllib.request import urlopen

    alive: set[str] = set()
    for port in sorted(set(cfg.accounts.values())):
        try:
            with (opener or urlopen)(f"http://127.0.0.1:{int(port)}/json/list", timeout=5) as r:
                alive |= {str(t.get("id")) for t in json.loads(r.read() or b"[]") if isinstance(t, dict)}
        except Exception:  # noqa: BLE001  (Chrome did not answer: keep every id, nothing is lost)
            return
    with _STEP_TABS_LOCK:
        STEP_TABS.intersection_update(alive)
    _save_step_tabs()


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
    with _STEP_TABS_LOCK:  # a job's step tab that loaded before a logout must not make the session look alive (plan #150)
        mine = set(STEP_TABS)
    urls = [t.get("url") or "" for t in tabs if t.get("type") == "page" and str(t.get("id") or "") not in mine]
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


def pick_merimen_page(pages):
    """The page used for screenshots (non-strict): a logged-in Merimen tab first, because after a re-login (plan #133) an old
    login-page tab may still be open beside it; else the first Merimen tab; else None."""
    from .chrome import is_logged_in_url

    merimen = [pg for pg in pages if "merimen.com.my" in (pg.url or "")]
    return next((pg for pg in merimen if is_logged_in_url(pg.url or "")), merimen[0] if merimen else None)


# Chrome target ids of the tabs the worker's own steps opened (base.context.new_page()). With WORKER_SLOTS > 1 several jobs have a
# step tab open at once, all with the session marks in their address: the strict pick leaves them (and popups) out, so the home tab
# is still "exactly one" (plan #150). Shared by all job threads.
STEP_TABS: set[str] = set()
_STEP_TABS_LOCK = __import__("threading").Lock()


def _target_info(pg) -> dict:
    """Chrome's own info for a page (targetId, openerId). {} when it cannot be asked."""
    try:
        s = pg.context.new_cdp_session(pg)
        try:
            return dict(s.send("Target.getTargetInfo").get("targetInfo") or {})
        finally:
            s.detach()
    except Exception:  # noqa: BLE001
        return {}


STEP_TABS_FILE = "step_tabs.json"
_step_tabs_dir: list[str] = [""]  # the state folder: the ids survive a restart of the worker (Chrome keeps its tabs and their ids)
_job_tabs = __import__("threading").local()  # per job thread: the step tabs this job opened, closed when the job ends


def _save_step_tabs() -> None:
    d = _step_tabs_dir[0]
    if not d:
        return
    try:
        path = os.path.join(d, STEP_TABS_FILE)
        with _STEP_TABS_LOCK:  # one writer at a time: the copy, the temporary file and the rename
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(sorted(STEP_TABS), f)
            os.replace(tmp, path)
    except OSError:
        pass


def load_step_tabs(state_dir: str) -> list[str]:
    """At start: the step tab ids the last run recorded. Kept in STEP_TABS (the strict pick still leaves them out) and returned, so
    the ones Chrome still has open can be closed (a job killed by a restart leaves its tab behind)."""
    _step_tabs_dir[0] = state_dir or ""
    try:
        with open(os.path.join(state_dir, STEP_TABS_FILE)) as f:
            got = [str(x) for x in json.load(f) if isinstance(x, (str, int))]
    except FileNotFoundError:
        return []
    except (OSError, ValueError, TypeError):
        print("step tabs file unreadable: started without it", file=sys.stderr, flush=True)
        return []
    with _STEP_TABS_LOCK:
        STEP_TABS.update(got)
    return got


def _register_step_tab(pg) -> None:
    tid = str(_target_info(pg).get("targetId") or "")
    if tid:
        with _STEP_TABS_LOCK:  # dropped again when the job ends (end_job_tabs) or at the next start (_close_left_step_tabs)
            STEP_TABS.add(tid)
        _save_step_tabs()
    if not hasattr(_job_tabs, "pages"):
        _job_tabs.pages = []
    mine = _job_tabs.pages
    mine.append((tid, pg))
    _follow_popups(pg, mine)


def _follow_popups(pg, mine: list) -> None:
    """Every popup the step tab opens (and their popups) joins this job's own tabs, so the job end closes it even when the step
    already closed the tab that opened it. Only a list append in the event handler: no Chrome call there."""
    on = getattr(pg, "on", None)
    if on is None:
        return

    def popup(p):
        mine.append(("", p))
        _follow_popups(p, mine)

    try:
        on("popup", popup)
    except Exception:  # noqa: BLE001
        pass


def own_open_step_tab():
    """The newest step tab this job thread opened that is still open, or None."""
    for _tid, pg in reversed(getattr(_job_tabs, "pages", [])):
        try:
            if not pg.is_closed():
                return pg
        except Exception:  # noqa: BLE001
            continue
    return None


def end_job_tabs() -> int:
    """After a job (its thread): close the step tabs it opened that are still open (a step that raised half way), and forget them.
    Only this job's own tabs; never the home tab, another job's tab or a tab opened by hand. Returns how many were closed."""
    pages = getattr(_job_tabs, "pages", [])
    _job_tabs.pages = []
    closed = 0
    for tid, pg in pages:
        try:
            if not pg.is_closed():
                pg.close()
                closed += 1
        except Exception:  # noqa: BLE001
            pass
        if tid:
            with _STEP_TABS_LOCK:
                STEP_TABS.discard(tid)
    if pages:
        _save_step_tabs()
    return closed


def _descendants(pairs, roots: set) -> set:
    """Target ids whose opener chain leads to one of roots (a popup a step tab opened, a popup of that popup...)."""
    out = set(roots)
    grew = True
    while grew:
        grew = False
        for tid, opener in pairs:
            if tid and tid not in out and opener and opener in out:
                out.add(tid)
                grew = True
    return out


def not_step_tabs(pages, info=_target_info, *, chain: bool = True) -> list:
    """The session tabs that are not a step tab of this worker (a recorded id). chain (WORKER_SLOTS > 1): nor a tab whose opener
    chain leads to a step tab (its popups). Any other tab counts, also one a person opened from the home tab or from a link
    (GPR-150-4 G5): two of them stop the strict pick with several_tabs, as #147 does. Off (WORKER_SLOTS=1): popups count, as before."""
    infos = [(pg, str((t := info(pg)).get("targetId") or ""), str(t.get("openerId") or "")) for pg in pages]
    with _STEP_TABS_LOCK:
        mine = set(STEP_TABS)
    if chain:
        mine = _descendants([(tid, op) for _pg, tid, op in infos], mine)
    return [pg for pg, tid, _op in infos if not (tid and tid in mine)]


class _StepContext:
    """The home tab's browser context as a step sees it: every tab it opens is recorded as a step tab."""

    def __init__(self, ctx):
        self._ctx = ctx

    def new_page(self, *a, **k):
        from .case_guard import guard_page

        pg = self._ctx.new_page(*a, **k)
        _register_step_tab(pg)
        return guard_page(pg)  # it may only open this job's own Merimen case

    def __getattr__(self, name):
        # only new_page: another tab of the context (context.pages[i]) or context.close() would reach the home tab or every tab
        raise HomeTabWrite(f"the home tab's context only opens new tabs ({name})")


from .case_guard import HomeTabWrite  # noqa: E402  (a BaseException: a step's `except Exception` never swallows it)


class HomeTab:
    """The logged-in home tab handed to a step (WORKER_SLOTS > 1): the same page, but tabs opened from its context are recorded,
    and it is read only. Every step reads only its address (`url`, the session marks) and opens its own tab from `context`; a
    call that would move or change the home tab (another job's steps depend on it) raises instead."""

    _READS = frozenset({"url", "is_closed"})  # an allowlist: everything else (goto, click, locator, keyboard, frames...) raises

    def __init__(self, page):
        self._page = page
        self.context = _StepContext(page.context)

    def __getattr__(self, name):
        if name not in HomeTab._READS:
            raise HomeTabWrite(f"the home tab is read only ({name})")
        return getattr(self._page, name)


def _page_provider(cfg: Config):
    """The Merimen tab of the worker Chrome for an org, through Playwright over the local debugging port.
    Playwright is only imported when screenshots are on. A connection that breaks is dropped and made again next time.
    Playwright's sync objects belong to the thread that made them: each thread (the main loop, each job slot) keeps its own connection."""
    import threading

    local = threading.local()
    slots = max(1, int(getattr(cfg, "slots", 1) or 1))

    class _State:
        def _d(self) -> dict:
            if not hasattr(local, "d"):
                local.d = {}
            return local.d

        def __contains__(self, k):
            return k in self._d()

        def __getitem__(self, k):
            return self._d()[k]

        def __setitem__(self, k, v):
            self._d()[k] = v

        def pop(self, k, default=None):
            return self._d().pop(k, default)

    state = _State()

    def _browser(org_id: str):
        account = account_for(org_id, cfg.accounts, cfg.org_accounts)
        if not account:
            return None, None
        port = cfg.accounts[account]
        if port not in state:
            from playwright.sync_api import sync_playwright

            pw = sync_playwright().start()
            try:
                state[port] = (pw, pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}"))
            except Exception:
                pw.stop()  # a connect that fails leaves no driver process behind
                raise
        return port, state[port][1]

    def _drop(org_id: str) -> None:
        account = account_for(org_id, cfg.accounts, cfg.org_accounts)
        old = state.pop(cfg.accounts[account], None) if account else None
        if old:
            try:
                old[0].stop()
            except Exception:
                pass

    def _login_box(pg) -> bool:
        """The page shows a password box (Merimen's login form): a tab whose address still has the session marks of a session that
        is gone. A page that cannot be asked counts as no box (the address decides)."""
        try:  # answers at once (no waiting for the box to appear); a visible box only, as the login form shows it
            return pg.locator("input[type=password]").first.is_visible()
        except Exception:
            return False

    def _relogin_tab(org_id: str, pages: list) -> list:
        """Of several logged-in tabs, the one the worker's last successful re-login opened (relogin._own_tab, by Chrome target id);
        all of them when it is not among them (the case then waits, as before)."""
        from . import relogin

        own = relogin._own_tab.get(org_id)
        if not own:
            return pages
        mine = []
        for pg in pages:
            try:
                s = pg.context.new_cdp_session(pg)
                try:
                    info = s.send("Target.getTargetInfo")
                finally:
                    s.detach()
                if str((info.get("targetInfo") or {}).get("targetId")) == str(own):
                    mine.append(pg)
            except Exception:
                pass
        return mine if len(mine) == 1 else pages

    def _session_pages(browser) -> list:
        from .merimen_create import session_query

        return [pg for ctx in browser.contexts for pg in ctx.pages if session_query(pg.url or "")]

    def page_for(org_id: str, strict: bool = False, own_only: bool = False):
        """strict (the create step): exactly ONE tab that is a logged-in claims page (https, www.merimen.com.my, /claims/, session marks in the address,
        no password box on the page); none or several = None, so the case waits instead of opening the form with a guessed session."""
        if own_only:  # a milestone screenshot with slots: only this job's own open step tab shows its case (GPR-150-4 G4)
            own = own_open_step_tab()
            if own is None:
                print(f"{threading.current_thread().name} screenshot skipped: no step tab of this job is open", file=sys.stderr, flush=True)
            return own
        try:
            _port, browser = _browser(org_id)
            if browser is None:
                return None
            if strict:
                found = _session_pages(browser)
                if not found and any("merimen.com.my" in (pg.url or "") for ctx in browser.contexts for pg in ctx.pages):
                    from . import login_seen

                    login_seen.mark()  # Merimen is open but no tab has the session marks: logged out (as merimen_docs does)
                if slots > 1 and found:
                    # another job's step tab (or a popup it opened) is never the home tab, even when it is the only one left; any
                    # other tab still counts, also a popup a person opened (GPR-150-4 G5)
                    found = not_step_tabs(found)
                elif len(found) > 1:
                    # WORKER_SLOTS=1: only a step tab id the last slots run left is left out; popups count as before #150
                    found = not_step_tabs(found, chain=False)
                if len(found) > 1:  # only then is a page asked (a stale login-form tab beside the new one); one tab is used as before
                    found = [pg for pg in found if not _login_box(pg)]
                    if not found:  # every tab with the session marks shows the login form: logged out
                        from . import login_seen

                        login_seen.mark()
                if len(found) > 1:  # a forced re-login logs in from its own tab while the old one still has its address: that one
                    found = _relogin_tab(org_id, found)
                if len(found) > 1:  # several logged-in tabs, none the worker's own: nothing is guessed; close the extra tabs (playbook 06)
                    from .loop import note

                    note(org_id, "several_tabs")
                if len(found) != 1:
                    return None
                return HomeTab(found[0]) if slots > 1 else found[0]
            pages = [pg for ctx in browser.contexts for pg in ctx.pages]
            if slots > 1:  # another job's step tab may show ANOTHER case: a screenshot comes from this job's own open step tab
                own = own_open_step_tab()  # (it shows this case), else from the home tab, never from another job's tab (plan #150)
                if own is not None:
                    return own
                pages = not_step_tabs([pg for pg in pages if "merimen.com.my" in (pg.url or "")])
            return pick_merimen_page(pages)
        except Exception:
            _drop(org_id)
        return None

    def session_tabs(org_id: str):
        """One bool per tab with session marks in its address: True = that page shows a password box. None when Chrome cannot be asked.
        WORKER_SLOTS > 1: the home tab decides (a step tab that loaded before a logout can still show a form); step tabs only
        when no other session tab is left."""
        try:
            _port, browser = _browser(org_id)
            if browser is None:
                return None
            pages = _session_pages(browser)
            if slots > 1 and pages:
                home = not_step_tabs(pages)
                if not home:  # only step tabs still have the session marks: the home tab lost them, so the session is gone
                    return [True]
                pages = home
            return [_login_box(pg) for pg in pages]
        except Exception:
            _drop(org_id)
            return None

    page_for.session_tabs = session_tabs
    return page_for


def main() -> None:
    cfg = replace(Config.from_env(), mailer=_mail)
    if cfg.live_writes and cfg.slots <= 1 and cfg.org_limit > 1:  # several processes creating for one org: refuse, as before
        raise SystemExit("MERIMEN_WRITES and WORKER_SUBMIT are on but ORG_CONCURRENCY is above 1 without WORKER_SLOTS: set ORG_CONCURRENCY=1 (or use WORKER_SLOTS) and start again")
    repo = PgRepo(cfg.database_url, cfg.db_transport)
    from . import relogin as relogin_mod

    relogin_mod.load_own_tabs(cfg.state_dir)  # which logged-in tab the last re-login opened survives a restart
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
    if cfg.slots > 1:
        _photo_lock = threading.Lock()
        _one_namer = namer

        def namer(photos, vehicle):  # noqa: F811  one photo model at a time: each run loads DINOv2 on the CPU (the box's RAM)
            with _photo_lock:
                return _one_namer(photos, vehicle)

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

    driver.fetch_bytes = fetch_bytes  # the report's colour read fetches one photo the same way (in memory only)
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

    from .login_flow import relogin_fetch as _relogin_fetch, script_fetch

    fetch_page = script_fetch(script)  # fetch_page(user, password, port): one run of `cdp.mjs login` per check, on the org's own Chrome
    relogin_fetch = _relogin_fetch(script) if cfg.merimen_relogin else None  # MERIMEN_RELOGIN: `cdp.mjs login --relogin`, own fresh tab

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

    # one worker per state folder, in every mode (GPR-150-4 G7): the lock is taken first (a second worker stops here), then the
    # step tabs a killed run left open are closed by their ids (also after a roll back to WORKER_SLOTS=1)
    _one_slots_process(cfg)
    _close_left_step_tabs(cfg)
    if cfg.slots > 1:
        from .pool import JobPool, slot_driver

        import signal

        from .loop import paused_orgs

        def _run(job, slot_drv, extra):
            try:
                run_job(cfg, repo, job, inspect=_inspect, namer=namer, driver=slot_drv, download=download, page_for=page_for if shots else None,
                        put_blob=put_blob if shots else None, side_check=side_check, forget_files=forget_files, relogin_ready=extra.get("relogin_ready", False))
            finally:
                end_job_tabs()  # a step that raised half way leaves no tab behind

        pool = JobPool(cfg.slots, _run, make_driver=lambda: slot_driver(driver), warn_seconds=cfg.job_max_seconds)
        stopping = threading.Event()

        stop_at: list[float] = []

        def _stop(_sig, _frm):
            if not stop_at:
                stop_at.append(time.monotonic())  # the stop time counts from the signal, not from the end of the current pass
            stopping.set()

        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
        print(f"worker slots: {cfg.slots}, jobs per org: {cfg.org_limit}", flush=True)
        while not stopping.is_set():
            sweep_files()
            try:
                relogin = housekeeping(cfg, repo, launch=_launch, inspect=_inspect, keep=_keep, fetch_page=fetch_page, master=master,
                                       delete_blob=delete_blob if shots else None, relogin_fetch=relogin_fetch, busy_orgs=pool.busy_orgs,
                                       running_ids=pool.running_ids)
                while pool.free() > 0 and not stopping.is_set():  # fill every free slot; the claim order puts the case uploaded first in front
                    # a create already claimed (not only one holding the lock: two creates of one batch would otherwise both be
                    # claimed in this one pass) means no second create now
                    job = repo.claim(ext_connect=cfg.ext_connect, worker_id=cfg.worker_id, org_limit=cfg.org_limit, skip_orgs=paused_orgs(),
                                     one_chrome=True, no_create=pool.create_running() or _CREATE_LOCK.locked())
                    if not job:
                        break
                    if pool.has(job["id"]):
                        # its lease ran out while it still runs here (Neon could not be reached for longer than the lease): the slot
                        # thread keeps it and renews the lease again; it is never started a second time
                        continue
                    pool.submit(job, relogin_ready=relogin is not None)
            except Exception as e:
                print(tick_error_line(e), file=sys.stderr)
            stopping.wait(cfg.poll_seconds)
        # stop: nothing new is claimed; the running jobs get WORKER_STOP_SECONDS to end (each closes its own tab and writes its outcome).
        # One still running after that is cut off with the process: its lease gives it back to the queue, as after any restart
        left = pool.wait_idle(max(0.0, cfg.stop_seconds - (time.monotonic() - (stop_at[0] if stop_at else time.monotonic()))))
        print(f"worker stopped: {'all jobs ended' if left else 'jobs still running were cut off'}", flush=True)
        return

    while True:
        sweep_files()
        try:
            tick(cfg, repo, launch=_launch, inspect=_inspect, namer=namer, driver=driver, download=download, keep=_keep, fetch_page=fetch_page, master=master,
                 page_for=page_for if shots else None, put_blob=put_blob if shots else None, delete_blob=delete_blob if shots else None, side_check=side_check,
                 forget_files=forget_files, relogin_fetch=relogin_fetch)
        except Exception as e:
            print(tick_error_line(e), file=sys.stderr)
        time.sleep(cfg.poll_seconds)


if __name__ == "__main__":
    main()
