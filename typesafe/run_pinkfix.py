#!/usr/bin/env python3
"""Re-fill the pink (required) boxes that a report save clears.

Saving EstMain wipes the occupation free-text and sometimes the phone prefixes,
so they have to be re-sent together with their dropdowns in one submit.

  python3 typesafe/run_pinkfix.py rdata4 PLATE[,PLATE...]
"""
import importlib, json, os, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import driver as d

LOCK = threading.Lock()
TODAY = time.strftime("%d/%m/%Y")


def J(tab, c):
    with LOCK:
        return d.js(tab, c)


def GO(tab, url, wait=0):
    with LOCK:
        w, t = d.loc(tab)
        d.osa('tell application "Google Chrome" to set URL of tab %d of window %d to "%s"' % (t, w, url))
    if wait:
        time.sleep(wait)


def prefrx(code):
    """Match the prefix option by TEXT: some insurers list '019', others '6019-'."""
    c = str(code).strip().lstrip("0")
    return r"^6?0?%s-?$" % c


def pref(code):
    """Merimen's phone-prefix option VALUES are '6011-', not '011' — keep the
    leading zero and prepend the country code."""
    c = str(code).strip()
    if c.startswith("6"):
        return c if c.endswith("-") else c + "-"
    return "6%s-" % c


def one(plate, r, tab, out):
    try:
        URL = ("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain"
               "&caseid=%d&extid=%d&" % (r["cid"], r["eid"]))
        GO(tab, URL + d.sess(), wait=18)
        before = json.loads(J(tab, d.PINK_EMPTY))
        with LOCK:
            for n in ("ddlbIOCC", "ddlbDOCC", "ddlbCLMOCC"):
                d.pick(tab, n, "^Others$|^Unemployed$")
            for n in ("sleIOCC", "sleDOCC", "sleCLMOCC"):
                d.settxt(tab, n, "OTHERS")
            d.pick(tab, "sleIPhone1pref", prefrx(r["ipref"])); d.settxt(tab, "sleIPhone1", r["iphone"])
            d.pick(tab, "sleDPhone1pref", prefrx(r["ipref"])); d.settxt(tab, "sleDPhone1", r["iphone"])
            d.pick(tab, "sleCLMPhone1pref", prefrx(r["cpref"])); d.settxt(tab, "sleCLMPhone1", r["cphone"])
            if r.get("cmdnm"):
                d.pick(tab, "ddlbCMDOCC", "^Others$|^Unemployed$"); d.settxt(tab, "sleCMDOCC", "OTHERS")
                d.pick(tab, "sleCMDPhone1pref", prefrx(r["cpref"])); d.settxt(tab, "sleCMDPhone1", r["cphone"])
            d.settxt(tab, "sleINSPECT", TODAY); d.settxt(tab, "sleNUM_REPDAYS", "25")
            d.setsel(tab, "ddlbLocClaim", "23")
        J(tab, '(function(){try{document.forms.EstMain.submit();}catch(e){}return 1;})()')
        time.sleep(20)
        GO(tab, URL + d.sess(), wait=18)
        after = json.loads(J(tab, d.PINK_EMPTY))
        vals = J(tab, 'JSON.stringify({insp:(document.querySelector("[name=sleINSPECT]")||{}).value,'
                      'days:(document.querySelector("[name=sleNUM_REPDAYS]")||{}).value,'
                      'loc:(document.querySelector("[name=ddlbLocClaim]")||{}).value})')
        out[plate] = {"before": before, "after": after, "vals": json.loads(vals)}
    except Exception as e:
        out[plate] = {"error": str(e)[:200]}


def run(mod, plates):
    R = importlib.import_module(mod).R
    d.attach(); d.login()
    base = d.T()
    mytabs = {}
    for p in plates:
        before = {x["id"] for x in d.tabs()}
        d.newtab(base, "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&" + d.sess())
        time.sleep(4)
        mytabs[p] = [x for x in d.tabs() if x["id"] not in before][0]["id"]
    time.sleep(6)
    out, th = {}, []
    for p in plates:
        t = threading.Thread(target=one, args=(p, R[p], mytabs[p], out))
        t.start(); th.append(t)
    for t in th:
        t.join()
    for p in plates:
        print(p, json.dumps(out.get(p), ensure_ascii=False)[:280])
    for p in plates:
        d.close_tab(mytabs[p]); time.sleep(0.4)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2].split(","))
