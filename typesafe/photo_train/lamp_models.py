#!/usr/bin/env python3
"""Vehicle model for every case that has rear-lamp or front-panel photos -> lamp_models.json (resumable)."""
import json, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import driver as d
OUT = os.path.join(HERE, "lamp_models.json")
cids = set()
for l in open(os.path.join(HERE, "index.jsonl")):
    try: r = json.loads(l)
    except ValueError: continue
    if re.search(r"rear lamp|lamp assembly rear|tail lamp|lamp (inner|outer) rear|front panel|fender inner|front crossmember|frt panel|chassis member", r["name"], re.I): cids.add(r["cid"])
res = json.load(open(OUT)) if os.path.exists(OUT) else {}
base = d.T(); before = {x["id"] for x in d.tabs()}
d.newtab(base, "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&" + d.sess()); time.sleep(6)
tab = [x for x in d.tabs() if x["id"] not in before][0]["id"]
todo = sorted(c for c in cids if c not in res); print("cases", len(cids), "todo", len(todo), flush=True)
for k, cid in enumerate(todo, 1):
    try:
        h = d.js(tab, '(function(){var x=new XMLHttpRequest();x.open("GET","/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=%s&tpins=0&%s",false);x.send();var t=x.responseText;if(t.indexOf("Invalid Case Status")>=0)return "INVALIDCASE";if(t.indexOf("Session not matched")>=0||t.indexOf("sleUserName")>=0)return "NOSESSION";var i=t.indexOf("Vehicle Model");return i<0?("NOMODEL"+t.length):t.slice(i,i+400);})()' % (cid, d.sess()))
        if h == "INVALIDCASE":   # case closed/locked for this account: no vehicle to read, don't retry (not a session problem)
            res[cid] = "-"; continue
        if h == "NOSESSION":
            print("STOP: Merimen session ended (logged out)", flush=True); break
        if h.startswith("NOMODEL") and int(h[7:] or 0) < 3000:
            time.sleep(20); continue
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).replace("&nbsp;", " ")
        m = re.search(r"Vehicle Model:?\s*(.+?)(?:\s{2,}|\[|$)", t)
        if not m or not m.group(1).strip():   # no model on page = session problem, not "no vehicle": don't record, retry later
            bad = globals().get("bad", 0) + 1; globals()["bad"] = bad; print(cid, "no model text", flush=True)
            if bad >= 3: print("STOP: 3 pages without Vehicle Model (session?)", flush=True); break
            continue
        globals()["bad"] = 0; res[cid] = m.group(1).strip()[:120]
        time.sleep(2)   # gentle pace: Merimen logged out after ~550 fast requests (2026-10-15)
    except Exception as e:
        print(cid, "ERR", str(e)[:100], flush=True); time.sleep(5)
    if k % 50 == 0:
        json.dump(res, open(OUT, "w")); print(k, "/", len(todo), flush=True)
json.dump(res, open(OUT, "w")); d.close_tab(tab); print("DONE", len(res), flush=True)
