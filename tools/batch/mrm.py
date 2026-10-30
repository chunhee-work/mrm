#!/usr/bin/env python3
"""Shared helpers for batch scripts: run Merimen .mjs scripts from ~/mrm-bot, in parallel, and survive logouts.

- run(*args)            node <script> ... in ~/mrm-bot, returns stdout+stderr
- wait_login()          if Merimen is logged out: print ONE line asking the user to run relogin, then wait
                        (poll session_base.txt) until it changes and the login check says OK; returns when usable
- par(fn, items, n)     run fn(item) for many cases at once (PAR env, default 5)
- ids(path)             {PLATE: (cid, ext)} from an ids.txt (lines: PLATE cid ext)
"""
import subprocess, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

H = os.path.expanduser("~/mrm-bot")
LOGOUT = ("Not Logged", "Please login", "Session Timeout", "LOGGEDOUT")


def run(*a, timeout=900):
    r = subprocess.run(["node", *a], capture_output=True, text=True, cwd=H, timeout=timeout)
    return r.stdout + r.stderr


def logged_in():
    return run("chklogin.mjs", timeout=120).strip().endswith("OK")


def wait_login():
    if logged_in():
        return
    f = os.path.join(H, "session_base.txt")
    t0 = os.path.getmtime(f)
    subprocess.run(["node", "ensuretab.mjs"], cwd=H, capture_output=True, timeout=120)   # user 2026-10-30: a merimen.com.my page must be open BEFORE login
    print("LOGGEDOUT: please run  cd ~/mrm-bot && node relogin.mjs   (waiting, will continue by itself)", flush=True)
    while True:
        time.sleep(10)
        if os.path.getmtime(f) != t0 and logged_in():
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
