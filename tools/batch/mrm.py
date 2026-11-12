#!/usr/bin/env python3
"""Shared helpers for batch scripts: run Merimen .mjs scripts from ~/mrm-bot, in parallel, and survive logouts.

- run(*args)            node <script> ... in ~/mrm-bot, returns stdout+stderr
- wait_login()          if Merimen is logged out: print ONE line asking the user to run relogin, then wait
                        (poll session_base.txt) until it changes and the login check says OK; returns when usable
- par(fn, items, n)     run fn(item) for many cases at once (PAR env, default 5)
- ids(path)             {PLATE: (cid, ext)} from an ids.txt (lines: PLATE cid ext)
"""
import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

H = os.path.expanduser("~/mrm-bot")
LOGOUT = ("Not Logged", "Please login", "Session Timeout", "LOGGEDOUT")


# 2026-11-06 user: one Chrome window per account. MRM_ACCOUNT=<TC0607|NVISSAC|YUSTRI|CHONGAIAI> makes every script of a batch
# run in THAT account's window (CDP from ~/mrm-bot/state/cdp_<ACCOUNT>) with THAT account's session file — never another account's.
ACCOUNTS = {"TC0607": ("session_base.txt", "http://127.0.0.1:9222"), "NVISSAC": ("session_nv.txt", "http://127.0.0.1:9223"),
            "YUSTRI": ("session_rw.txt", "http://127.0.0.1:9224"), "CHONGAIAI": ("session_aman.txt", "http://127.0.0.1:9225")}
ACC = os.environ.get("MRM_ACCOUNT", "TC0607")
SESSF, CDP = ACCOUNTS.get(ACC, ACCOUNTS["TC0607"])


def acc_env():
    return {**os.environ, "SESSF": SESSF, "CDP": CDP}


def run(*a, timeout=900):
    sync_session()   # a newer login in the window always wins over the saved file, before ANY script touches Merimen
    a = [SESSF if x == "session_base.txt" else x for x in a]
    r = subprocess.run(["node", *a], capture_output=True, text=True, cwd=H, timeout=timeout, env=acc_env())
    return r.stdout + r.stderr


def sync_session():
    """2026-11-06 (user: "you opened a new Merimen page and kicked my login out"): if the account's window shows a NEWER session than
    the saved file (the user logged in by hand), save the window's session FIRST, so a check never runs with an old session
    (testing an old session in the same browser logs the new one out)."""
    import json as _j, urllib.request as _u
    try:
        tabs = _j.load(_u.urlopen(CDP + "/json/list", timeout=5))
    except Exception:
        return
    f = os.path.join(H, SESSF); cur = open(f).read().strip() if os.path.exists(f) else ""
    old = dict(kv.split("=", 1) for kv in cur.split("&") if "=" in kv)
    for t in tabs:
        u = t.get("url", "")
        if t.get("type") == "page" and "merimen" in u and "CFID=" in u and "?" in u:
            q = dict(kv.split("=", 1) for kv in u.split("?", 1)[1].split("&") if "=" in kv)
            if q.get("CFID") and q.get("CFTOKEN") and (q["CFID"], q["CFTOKEN"]) != (old.get("CFID"), old.get("CFTOKEN")):
                open(f, "w").write("&".join(f"{k}={q[k]}" for k in ("CFID", "CFTOKEN", "USID", "RID") if k in q))
            return


def logged_in():
    # PASSIVE check first: the window's own tab + its own session, no new page, no saved file (never kicks a fresh login out)
    sync_session()
    r = subprocess.run(["node", "chklogin_passive.mjs"], cwd=H, capture_output=True, text=True, timeout=60, env=acc_env()).stdout.strip()
    if r.endswith("OK") or r.endswith("LOGGEDOUT"):
        return r.endswith("OK")
    # 2026-11-06: one Chrome window per account -> always test TC0607 (session_base) in its own window, never the newest other session
    return subprocess.run(["node", "chklogin.mjs"], cwd=H, capture_output=True, text=True, timeout=120,
                          env=acc_env()).stdout.strip().endswith("OK")


def wait_login():
    if logged_in():
        return
    f = os.path.join(H, SESSF)
    t0 = os.path.getmtime(f)
    subprocess.run(["node", "ensuretab.mjs"], cwd=H, capture_output=True, timeout=120)   # user 2026-10-30: a merimen.com.my page must be open BEFORE login
    print("LOGGEDOUT: please run  cd ~/mrm-bot && node relogin.mjs   (waiting, will continue by itself)", flush=True)
    # user 2026-11-04: "when you get stuck on the login, just send me a notification" -> flag file; tools/mrm-bot/login_watch.sh
    # (running in the background) exits on it and Claude sends a push notification. Also a Mac banner.
    nf = os.path.join(H, "state", "NEED_LOGIN"); os.makedirs(os.path.dirname(nf), exist_ok=True)
    open(nf, "w").write(time.strftime("%H:%M:%S"))
    subprocess.run(["osascript", "-e", 'display notification "Merimen logged out: cd ~/mrm-bot && node relogin.mjs" with title "MRM: please log in" sound name "Glass"'], capture_output=True)
    while True:
        time.sleep(10)
        if os.path.getmtime(f) != t0 and logged_in():
            try: os.remove(nf)
            except OSError: pass
            print("login OK, continuing", flush=True)
            return


def safe(*a, retries=2, timeout=900):
    """run a script; if the output shows a logout, wait for the user's relogin and run it again"""
    for _ in range(retries + 1):
        o = run(*a, timeout=timeout)
        if not any(x in o for x in LOGOUT) and "reading 'value'" not in o:
            return o
        wait_login()
    return o


def par(fn, items, n=None):
    n = int(n or os.environ.get("PAR", "5"))
    with ThreadPoolExecutor(n) as ex:
        return list(ex.map(fn, items))


def ids(path):
    out = {}
    for l in open(path):
        p = l.split()
        if len(p) == 3:
            out[p[0]] = (p[1], p[2])
    return out


if __name__ == "__main__":
    print("login:", "OK" if logged_in() else "LOGGEDOUT")


# 2026-11-12 batch 11: closetabs.mjs at the end of one run closed the tabs of another run working at the same time
# (estfill "Target page closed" -> 'est []', 'manual []'). Every script that imports mrm registers itself; tabs are
# closed only when no other registered run is still alive.
_RUN = os.path.join(H, "state", "run")
os.makedirs(_RUN, exist_ok=True)
open(os.path.join(_RUN, str(os.getpid())), "w").close()


def close_tabs_if_alone():
    others = []
    for f in os.listdir(_RUN):
        if f == str(os.getpid()):
            continue
        try:
            os.kill(int(f), 0); others.append(f)
        except (ValueError, ProcessLookupError, PermissionError):
            try: os.remove(os.path.join(_RUN, f))
            except OSError: pass
    try: os.remove(os.path.join(_RUN, str(os.getpid())))
    except OSError: pass
    if others:
        print("closetabs skipped: other runs still working:", ",".join(others)); return
    safe("closetabs.mjs")
