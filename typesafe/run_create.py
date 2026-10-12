#!/usr/bin/env python3
"""Create Merimen TP cases in parallel tabs, using the TypeSafe judgment for the
model variant instead of the old regex.

  python3 typesafe/run_create.py cases4 PLATE[,PLATE...]
"""
import importlib, json, re, sys, os, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import driver as d
from merimen_create import choose_model, apply_exact

WSNAME = {29709: "Bengkel Kereta Sinar Gemilang", 72619: "Extreme Auto Car Care"}
LOCK = threading.Lock()


def J(tab, code):
    with LOCK:
        return d.js(tab, code)


def GO(tab, url, wait=0):
    with LOCK:
        w, t = d.loc(tab)
        d.osa('tell application "Google Chrome" to set URL of tab %d of window %d to "%s"' % (t, w, url))
    if wait:
        time.sleep(wait)


def S(tab, n, v):
    with LOCK:
        return d.setsel(tab, n, v)


def X(tab, n, v):
    with LOCK:
        return d.settxt(tab, n, v)


def one(plate, c, tab, out):
    try:
        GO(tab, "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&" + d.sess(), wait=14)
        S(tab, "ddlbInsurer", c["ins"]); time.sleep(7)
        if c.get("branch"):
            S(tab, "ddlbINSCOID", c["branch"])
        else:
            J(tab, '(function(){var s=document.querySelector("[name=ddlbINSCOID]");'
                   'var o=[...s.options].find(function(x){return /^(HQ|ET HQ|EI HQ)$/i.test(x.text.trim());})'
                   '||[...s.options].find(function(x){return /HQ/i.test(x.text);});'
                   'if(o){s.value=o.value;s.dispatchEvent(new Event("change",{bubbles:true}));}return 1;})()')
        time.sleep(3)
        S(tab, "ddlbCLAIMTYPE", "TP"); time.sleep(7)
        if c["ins"] == "64":
            S(tab, "ddlbVehClass_TMI", "2")
        X(tab, "sleACCDATE", c["accdate"]); S(tab, "sleACCTIME", c["acchour"])
        X(tab, "sleCLMnm", c["clmnm"]); X(tab, "sleCLMID1", c["clmid"])
        X(tab, "sleREGNO", c["regno"]); X(tab, "sleCHANO", c["chano"])
        J(tab, '(function(){var h=document.querySelector("[name=ddlbREPCOID]");'
               'if(h){h.value="%d";h.dispatchEvent(new Event("change",{bubbles:true}));}return 1;})()' % c["ws"])
        S(tab, "sleINITIALEST_DD", "12500~10,000 - 12,500")
        S(tab, "ddlbDAMTYPE", "0"); time.sleep(3)
        X(tab, "mleLossDesc", c["lossdesc"])
        X(tab, "slePOLNO", c["polno"]); S(tab, "ddlbPOLCOVER", c["polcover"]); S(tab, "ddlbNEWPOL", "1")
        X(tab, "slePOLFROM", c["polfrom"]); X(tab, "slePOLTO", c["polto"])
        X(tab, "sleInm", c["inm"])
        if c.get("iid"):
            X(tab, "sleIID1", c["iid"])
        X(tab, "sleTPnm", c["clmnm"]); X(tab, "sleTPID1", c["clmid"]); X(tab, "sleTPREGNO", c["tpregno"])
        J(tab, '(function(){var t=document.getElementById("TPOWN");if(t&&!t.checked)t.click();return 1;})()')
        time.sleep(2)
        J(tab, '(function(){var s=document.querySelector("[name=ddlb3INSCOID]");'
               'if(s){if(s.disabled)s.disabled=false;s.value=%s;s.dispatchEvent(new Event("change",{bubbles:true}));}'
               'var e=document.querySelector("[name=sleTPPOLNO]");'
               'if(e){if(e.disabled)e.disabled=false;e.value=%s;e.dispatchEvent(new Event("change",{bubbles:true}));}'
               'var h=document.querySelector("[name=sleCURINSCOID]");if(h)h.value="%s";return 1;})()'
          % (json.dumps(c["clmins"]), json.dumps(c["clmpol"]), c["ins"]))
        S(tab, "ddlbMan", c["man"])
        # big manufacturer lists (Mazda has 362 entries) need longer than a flat sleep
        for _ in range(12):
            time.sleep(2)
            if int(J(tab, '(function(){var s=document.querySelector("[name=ddlbModel]");return s?s.options.length:0;})()') or 0) > 5:
                break
        time.sleep(2)

        # --- the judgment, not a regex (unless the operator already confirmed one) ---
        with LOCK:
            if c.get("model_exact"):
                m = apply_exact(d.js, tab, c["model_exact"])
            else:
                m = choose_model(d.js, tab, c["model_filter"], c["rc_line"], c["ins_line"],
                                 c["regdate"], c["chano"], c["cc"])
        if not m.get("applied"):
            out[plate] = {"status": "MODEL-NEEDS-REVIEW", "model": m}
            return

        J(tab, '(function(){try{document.forms.ClaimHeader.submit();}catch(e){}return 1;})()')
        time.sleep(18)
        body = J(tab, 'document.body.innerText.replace(/\\s+/g," ").slice(150,400)')
        if "already an active claim" in body:
            out[plate] = {"status": "DUPLICATE-PROMPT", "model": m}
            return
        href = J(tab, "location.href")
        cid = re.search(r"caseid=(\d+)", href)
        eid = re.search(r"extid=(\d+)", href)
        if not cid or cid.group(1) == "0":
            out[plate] = {"status": "NO-CASEID", "url": href.split("index.cfm")[-1][:80],
                          "body": body[:160], "model": m}
            return
        J(tab, '(function(){var s=document.querySelector("[name=ddlbMGRNAME]");'
               'if(s){var o=[...s.options].find(function(x){return /VINCENT KANG/i.test(x.text);});'
               'if(o){s.value=o.value;s.dispatchEvent(new Event("change",{bubbles:true}));}}'
               'var a=document.querySelector("[name=ddlbADJNAME]");'
               'if(a){var p=[...a.options].find(function(x){return /Terrence Chia/i.test(x.text);});'
               'if(p){a.value=p.value;a.dispatchEvent(new Event("change",{bubbles:true}));}}return 1;})()')
        J(tab, '(function(){try{document.forms.CASEFORM.submit();}catch(e){}return 1;})()')
        time.sleep(13)
        asg = J(tab, 'JSON.stringify({mgr:(document.querySelector("[name=ddlbMGRNAME]")||{}).value,'
                     'adj:(document.querySelector("[name=ddlbADJNAME]")||{}).value})')
        out[plate] = {"status": "OK", "caseid": cid.group(1), "extid": eid.group(1) if eid else None,
                      "model": m.get("applied"), "model_conf": round(m.get("confidence", 0), 2),
                      "assign": asg}
    except Exception as e:
        out[plate] = {"status": "ERR", "error": str(e)[:200]}


def run(mod, plates):
    CASES = importlib.import_module(mod).CASES
    d.attach(); d.login()
    base = d.T()
    mytabs = {}
    for p in plates:
        before = {r["id"] for r in d.tabs()}
        d.newtab(base, "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&" + d.sess())
        time.sleep(4)
        mytabs[p] = [r for r in d.tabs() if r["id"] not in before][0]["id"]
    time.sleep(6)
    out, th = {}, []
    for p in plates:
        t = threading.Thread(target=one, args=(p, CASES[p], mytabs[p], out))
        t.start(); th.append(t)
    for t in th:
        t.join()
    for p in plates:
        print(p, json.dumps(out.get(p), ensure_ascii=False)[:300])
    for p in plates:
        d.close_tab(mytabs[p]); time.sleep(0.4)
    return out


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2].split(","))
