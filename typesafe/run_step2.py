#!/usr/bin/env python3
"""STEP 2 on dsp_details for already-selected parts, in parallel tabs.

  python3 typesafe/run_step2.py rdata4 PLATE[,PLATE...]

Per case: Paintwork Materials -> Edit -> Manufacturer "Other" + "anything" -> Submit
-> OK (this makes the Paintwork price box MMI1 editable) -> MMI1 = 500.00; Damage
Condition on every part row (TypeSafe judgment); other misc rows priced by the
misc judgment; Save; reload and verify.
"""
import importlib, json, os, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import driver as d
from merimen_step2 import READ_ROWS, decide_conditions, decide_misc

LOCK = threading.Lock()
URL = ("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details"
       "&caseid=%s&extid=%s&tpins=0&")


def J(tab, c):
    with LOCK:
        return d.js(tab, c)


def GO(tab, url, wait=0):
    with LOCK:
        w, t = d.loc(tab)
        d.osa('tell application "Google Chrome" to set URL of tab %d of window %d to "%s"' % (t, w, url))
    if wait:
        time.sleep(wait)


def ready(tab):
    """dsp_details renders progressively: wait until PDC count >= PROWCNT and is stable."""
    n_prev = -1
    for _ in range(30):
        time.sleep(3)
        r = json.loads(J(tab, '(function(){var p=document.querySelector("[name=PROWCNT]");'
                              'return JSON.stringify([p?parseInt(p.value||"0",10):-1,'
                              'document.querySelectorAll("[name^=PDC]").length]);})()'))
        if r[0] >= 0 and r[1] >= r[0] and r[1] == n_prev:
            return r
        n_prev = r[1]
    raise RuntimeError("detail page never finished rendering")


CLICK_BTN = ('(function(rx,val){var b=[].find.call(document.querySelectorAll("input[type=button],button"),'
             'function(e){return (e.value||e.innerText||"").trim()===val&&rx.test(e.getAttribute("onclick")||"");});'
             'if(!b)return "none";b.click();return "ok";})')


def paintwork_retrieval(tab):
    if "Paint Manufacturer: anything" in J(tab, 'document.body.textContent.replace(/\\s+/g," ")'):
        return "already"
    if J(tab, CLICK_BTN + '(/PWEdit/,"Edit")') != "ok":
        return "no-edit-button"
    time.sleep(4)
    J(tab, '(function(){var s=document.querySelector("[name=slePNTMAN]");'
           'var o=[].find.call(s.options,function(x){return /^other$/i.test(x.text.trim());});'
           'if(o){s.value=o.value;s.dispatchEvent(new Event("change",{bubbles:true}));}'
           'var c=document.querySelector("[name=sleMANCUSTOM]");c.value="anything";'
           'c.dispatchEvent(new Event("input",{bubbles:true}));c.dispatchEvent(new Event("change",{bubbles:true}));'
           'return 1;})()')
    time.sleep(1)
    if J(tab, CLICK_BTN + '(/PWSubmitConfirm/,"Submit")') != "ok":
        return "no-submit"
    for _ in range(6):
        time.sleep(2)
        if J(tab, CLICK_BTN + '(/clickButton/,"OK")') == "ok":
            break
    time.sleep(3)
    return "done"


STATE = ('(function(){function q(n){return document.querySelector(\'[name="\'+n+\'"]\');}'
         'var pc=parseInt(q("PROWCNT").value||"0",10),f=0,e=0;'
         'for(var i=0;i<=pc;i++){var p=q("PDC"+i);if(!p||p.readOnly)continue;if((p.value||"").trim())f++;else e++;}'
         'var m=q("MMI1");'
         'return JSON.stringify({filled:f,empty:e,mmi1:m?m.value:null,'
         'pw:/Paint Manufacturer:\\s*anything/.test(document.body.textContent.replace(/\\s+/g," "))});})()')


def one(plate, r, tab, out):
    try:
        url = URL % (r["cid"], r["eid"])
        GO(tab, url + d.sess(), wait=6)
        ready(tab)
        pw = paintwork_retrieval(tab)

        rows = json.loads(J(tab, READ_ROWS))
        veh = J(tab, 'document.body.innerText.replace(/\\s+/g," ").match(/Vehicle Model:\\s*(.{0,90})/)[1]')
        impact = "%s of the vehicle; damage seen: %s" % (r.get("part", ""), r.get("damage", ""))
        parts = [(i, n) for i, n in rows["parts"]]
        miscs = [(i, n) for i, n in rows["misc"] if not n.lower().startswith("paintwork material")]
        cm = decide_conditions(parts, veh, impact)
        mm = decide_misc(miscs) if miscs else {}
        conds = {k: v["value"] for k, v in cm.items() if v.get("value")}
        prices = {k: v["price"] for k, v in mm.items() if v.get("price")}
        prices["1"] = "500.00"
        J(tab, '(function(){var C=%s,M=%s;function q(n){return document.querySelector(\'[name="\'+n+\'"]\');}'
               'function fire(e){e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}'
               'for(var k in C){var p=q("PDC"+k);if(p&&!p.readOnly){p.value=C[k];fire(p);}}'
               'for(var k in M){var m=q("MMI"+k);if(m){if(k==="1")m.readOnly=false;if(!m.readOnly){m.value=M[k];fire(m);}}}'
               '[].forEach.call(document.querySelectorAll("img"),function(im){im.style.pointerEvents="none";});return 1;})()'
          % (json.dumps(conds), json.dumps(prices)))
        time.sleep(1)
        J(tab, '(function(){var b=[].find.call(document.querySelectorAll("input[type=button],button,a"),'
          'function(e){return (e.value||e.innerText||"").trim()==="Save";});if(!b)return "nosave";b.click();return "ok";})()')
        for _ in range(3):
            time.sleep(4)
            J(tab, CLICK_BTN + '(/clickButton/,"OK")')
        time.sleep(4)
        GO(tab, url + d.sess(), wait=6)
        ready(tab)
        st = json.loads(J(tab, STATE))
        review = [{"row": k, "name": dict(parts).get(k), "why": v.get("review") or v.get("confidence")}
                  for k, v in cm.items() if not v.get("ok")]
        out[plate] = {"paintwork": pw, "parts": len(parts), "state": st, "review": review,
                      "pass": st["empty"] == 0 and st["mmi1"] == "500.00" and st["pw"]}
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
        print(p, json.dumps(out.get(p), ensure_ascii=False)[:600])
    for p in plates:
        d.close_tab(mytabs[p]); time.sleep(0.4)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2].split(","))
