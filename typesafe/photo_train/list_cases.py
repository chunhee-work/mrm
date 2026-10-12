#!/usr/bin/env python3
"""Enumerate every case in the adjuster in-tray lists (follows the setPage 'Next' chain)."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import driver as d

OUT = os.path.join(HERE, "cases.json")


def get(tab, u):
    return d.js(tab, '(function(){var x=new XMLHttpRequest();x.open("GET",%s,false);x.send();return x.responseText;})()' % json.dumps(u))


def crawl(tab, stat, total):
    s = d.sess()
    base = "/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&stat=%d&totalcase=%d&personal=1&" % (stat, total)
    url, out = base + s, {}
    for _ in range(50):
        h = get(tab, url)
        for cid, body in re.findall(r'c\.G\((\d+),(.*?)\);', h, re.S):
            m = re.findall(r'"\*?([A-Z]{1,4}\s?\d{1,4}\s?[A-Z]{0,2})"', body)
            out[cid] = m[0].replace(" ", "") if m else ""
        nx = re.search(r"setPage\((\d+),(\d+),1,'([^']*)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'\);\"[^>]*title=\"Next", h)
        if not nx:
            break
        p, ps, a, b, c_, e, f, g = nx.groups()
        q = "PS=%s&m=1&P=%d&PREVCASEID=%s&NEXTCASEID=%s&PREVRCASEID=%s&NEXTRCASEID=%s&PREVDT=%s&NEXTDT=%s&S=1&" % (
            ps, int(p) + 1, a, b, c_, e, f, g)
        url = base + q + s
    return out


if __name__ == "__main__":
    d.attach(); tab = d.T()
    d.goto("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&" + d.sess(), tab, wait=8)
    home = d.js(tab, '[].map.call(document.querySelectorAll("a[href*=dsp_maindtl]"),function(a){return a.getAttribute("href");}).join(" ")')
    stats = {int(a): int(b) for a, b in re.findall(r"stat=(\d+)&totalcase=(\d+)", home)}
    allc = {}
    for st, tot in stats.items():
        r = crawl(tab, st, tot)
        print("stat", st, "listed", tot, "got", len(r))
        allc.update(r)
    json.dump(allc, open(OUT, "w"), indent=0)
    print("TOTAL", len(allc), "->", OUT)
