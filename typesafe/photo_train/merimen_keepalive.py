#!/usr/bin/env python3
"""User 2026-10-15: when Merimen shows "Session Expiration Warning", click "Continue Session" (otherwise it logs out).
Checks every logged-in Merimen tab every 20 s. Only clicks that one button; never logs in."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import driver as d
JS = ('(function(){var b=[].slice.call(document.querySelectorAll("button,input[type=button],input[type=submit],a")).filter(function(e){'
      'var t=(e.innerText||e.value||"").replace(/\\s+/g," ").trim();return /^continue session$/i.test(t)&&e.offsetParent!==null});'
      'if(!b.length)return "";b[0].click();return "CLICKED"})()')
while True:
    try:
        for x in d.tabs():
            if "merimen" in x.get("url", ""):
                if d.js(x["id"], JS) == "CLICKED": print(time.strftime("%m-%d %H:%M:%S"), "clicked Continue Session in tab", x["id"], flush=True)
    except Exception as e:
        print(time.strftime("%m-%d %H:%M:%S"), "err", str(e)[:100], flush=True)
    time.sleep(20)
