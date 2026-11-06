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
    a = [SESSF if x == "session_base.txt" else x for x in a]
    r = subprocess.run(["node", *a], capture_output=True, text=True, cwd=H, timeout=timeout, env=acc_env())
    return r.stdout + r.stderr


def logged_in():
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
