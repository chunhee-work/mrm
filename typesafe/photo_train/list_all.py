#!/usr/bin/env python3
"""Enumerate company-wide cases via the plate search (substring match, 100-result cap).
Sweeps 3-digit strings, refines any capped query by one more digit. Resumable."""
import json, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import driver as d
OUT = os.path.join(HERE, "all_cases.json")
QDONE = os.path.join(HERE, "all_queries_done.txt")
LOGIN = "https://www.merimen.com.my/claims/index.cfm?skip_browsertest=1&"


def search(tab, q):
    for _ in range(2):
        h = d.js(tab, '(function(){var x=new XMLHttpRequest();x.open("GET",%s,false);x.send();return x.responseText;})()'
                 % json.dumps("/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmdirsearch&srch=%s&srchtype=1&%s" % (q, d.sess())))
        if "c.G(" in h or "MTRGLink" in h or len(h) > 8000:
            break
        d.goto(LOGIN, tab, wait=8); d.login(tab)
    out = {}
    for cid, body in re.findall(r'c\.G\((\d+),(.*?)\);', h, re.S):
        m = re.findall(r'"\*?([A-Z]{1,4}\s?\d{1,4}\s?[A-Z]{0,2})"', body)
        out[cid] = m[0].replace(" ", "") if m else ""
    return out


if __name__ == "__main__":
    d.attach(); tab = d.T()
    cases = json.load(open(OUT)) if os.path.exists(OUT) else {}
    done = set(open(QDONE).read().split()) if os.path.exists(QDONE) else set()
    queue = [str(i) for i in range(100, 1000)]
    t0 = time.time(); n = 0
    while queue:
        q = queue.pop(0)
        if q in done:
            continue
        r = search(tab, q)
        cases.update(r); n += 1
        if len(r) >= 100 and len(q) < 5:
            queue[:0] = [q + str(i) for i in range(10)] + [str(i) + q for i in range(1, 10)]
        done.add(q); open(QDONE, "a").write(q + "\n")
        if n % 25 == 0:
            json.dump(cases, open(OUT, "w"))
            print("queries %d  queue %d  cases %d  %ds" % (n, len(queue), len(cases), time.time() - t0), flush=True)
    json.dump(cases, open(OUT, "w"))
    print("DONE queries %d cases %d" % (n, len(cases)), flush=True)
