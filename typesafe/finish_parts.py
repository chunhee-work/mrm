#!/usr/bin/env python3
"""Second pass for one case: tick catalogue items the first matcher missed, then add the rest manually on
dsp_details with reference prices (same model family first, else median), conditions and comments.
  python3 finish_parts.py TAB PLATE '<json {"tick":[[name,regex]...], "manual":[[group,desc,qty,cmt]...], "family":"civic"}>'"""
import sys, json, re, time, statistics
sys.path.insert(0, "/Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/tools")
import price_lookup as pl
import driver as d, click_nav as cn, report_click as rc, step2_click as s2, manual_parts as mp, run_step2 as rs, rdata10
from merimen_step2 import _legacy_cond
B = pl.load()

def price(desc, fam):
    rows = []
    for b in B:
        for c in b["parts"]:
            if c and (c[0].strip().lower() == desc.lower() or sorted(c[0].lower().split()) == sorted(desc.lower().split())):
                try: rows.append((fam.lower() in b["model"].lower(), float(c[-1].replace(",", ""))))
                except ValueError: pass
    same = [p for f, p in rows if f]
    if same: return "%.2f" % statistics.median(same), "same model"
    if rows: return "%.2f" % statistics.median([p for _, p in rows]), "median of %d" % len(rows)
    return None, "no reference"

def to_selection(t, plate):
    here = "caseid=%s&" % rdata10.R[plate]["cid"] in d.js(t, "location.href")
    if here and cn.where(t) == "dsp_selection": return
    if here and cn.where(t) == "dsp_details": cn.text(t, "^Select Parts$", 15); return
    rc.go_report(t, plate, rdata10.R[plate]["cid"])
    rc.save(t, '^(Next \\()?Save & Adjust Estimates')
    if cn.where(t) == "dsp_details": cn.text(t, "^Select Parts$", 15)

ROWS = '''(function(){var n=+document.querySelector("[name=PROWCNT]").value,o=[];for(var i=1;i<=n;i++){var p=document.querySelector("[name=PDC"+i+"]");if(!p)continue;var e=document.getElementById("PDS"+i)||document.getElementById("PTDS"+i);var dd=e?(e.tagName==="INPUT"?e.value:e.textContent):"";o.push([i,dd.replace(/\\s+/g," ").trim(),p.value,p.readOnly]);}return JSON.stringify(o)})()'''

def run(t, plate, spec):
    to_selection(t, plate)
    assert cn.where(t) == "dsp_selection", cn.where(t)
    cat = json.loads(d.js(t, "(function(){" + s2.LAB + "return JSON.stringify([...document.querySelectorAll('input[type=checkbox][name=CP]')].map(c=>[c.value,lab(c),c.checked]))})()"))
    vals, ticked = [], []
    for name, rx in spec.get("tick", []):
        hit = next((v for v, l, c in cat if re.search(rx, s2.key(l), re.I) and "as above" not in l), None)
        if hit: vals.append(hit); ticked.append(name)
    if vals:
        d.js(t, "(function(V){document.querySelectorAll('input[type=checkbox][name=CP]').forEach(c=>{if(V.includes(c.value)&&!c.checked)c.click();});return 1})(%s)" % json.dumps(vals))
        cn.text(t, "^Save$", 15); cn.ok_dialogs(t)
    cn.text(t, "^Next \\(Save & Edit Estimates\\)", 18); cn.ok_dialogs(t); rs.ready(t)
    man, prices = [], {}
    for g, desc, qty, cmt in spec.get("manual", []):
        p, src = price(desc, spec.get("family", ""))
        prices[desc] = (p, src)
        if p: man.append([str(g), desc, p, str(qty), cmt])
    added = mp.add(t, man) if man else []
    if spec.get("comments"): mp.comments(t, spec["comments"])
    time.sleep(2)
    rows = json.loads(d.js(t, ROWS))
    fix = {str(i): _legacy_cond(n) or "Damage" for i, n, v, ro in rows if not v and not ro}
    d.js(t, '(function(C){for(var k in C){var p=document.querySelector("[name=PDC"+k+"]");if(p){p.value=C[k];p.dispatchEvent(new Event("change",{bubbles:true}));}}return 1})(%s)' % json.dumps(fix))
    cn.text(t, "^Save$", 15); cn.ok_dialogs(t); time.sleep(3); rs.ready(t)
    rows = json.loads(d.js(t, ROWS))
    empty = [n for i, n, v, ro in rows if not v and not ro]
    if empty:   # rows move after a save: fill again by name
        fix = {str(i): _legacy_cond(n) or "Damage" for i, n, v, ro in rows if not v and not ro}
        d.js(t, '(function(C){for(var k in C){var p=document.querySelector("[name=PDC"+k+"]");if(p){p.value=C[k];p.dispatchEvent(new Event("change",{bubbles:true}));}}return 1})(%s)' % json.dumps(fix))
        cn.text(t, "^Save$", 15); cn.ok_dialogs(t); time.sleep(3); rs.ready(t)
    return {"ticked": ticked, "added": added, "prices": prices, "state": json.loads(d.js(t, rs.STATE)), "rows": len(rows)}

if __name__ == "__main__":
    print(sys.argv[2], json.dumps(run(int(sys.argv[1]), sys.argv[2], json.loads(sys.argv[3])), ensure_ascii=False))
