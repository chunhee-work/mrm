#!/usr/bin/env python3
"""Step 2 (user 2026-10-16): Select Parts + Labour from the photo-artifact names, then the estimate details.
Runs on the case that is open on dsp_selection in TAB.  python3 step2_click.py TAB PLATE"""
import sys, json, re, time, collections
import driver as d, click_nav as cn, partmatch as pm, run_step2 as rs
from merimen_step2 import READ_ROWS, decide_conditions
S = "/private/tmp/claude-501/-Users-chunhee-Documents-VS-Code-gacha-smm-playbook-mrm/4a6e2dd1-d539-4708-b03e-3a9258afbbea/scratchpad/sinar"
RULES = json.load(open("/Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/tools/labour_rules.json"))
LAB = '''const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\\s+/g,' ').trim();};'''

def key(label):   # "CT0421 [All] Bumper Rear Cover (850221YS1H)" -> "Bumper Rear Cover"
    k = re.sub(r"^\S+\s+\[.*?\]\s*", "", label); return re.sub(r"\s*\([A-Z0-9-]+\)$", "", k).strip()

def run(t, plate, parts, impact):
    assert cn.where(t) == "dsp_selection", cn.where(t)
    cat = json.loads(d.js(t, "(function(){" + LAB + "return JSON.stringify([...document.querySelectorAll('input[type=checkbox][name=CP]')].map(c=>[c.value,lab(c)]))})()"))
    labs = json.loads(d.js(t, "(function(){" + LAB + "return JSON.stringify([...document.querySelectorAll('input[type=checkbox][name=CL]')].map(lab))})()"))
    pick, qty, missing = {}, collections.Counter(), []
    for p in parts:
        m = pm.best(p, cat)
        if not m: missing.append(p); continue
        if m[0] in pick and pm.side(pm.toks(m[1].lower())): continue   # same sided part named twice (e.g. "Rear RH Taillamp")
        if m[0] not in pick or not pm.side(pm.toks(m[1].lower())): qty[key(m[1])] += 1
        pick[m[0]] = m[1]
    names = {key(l) for l in pick.values()}
    if any(re.match(r"Bumper (Rear|Front) Cover", n) for n in names):        # companion: Bumper -> Bumper Clips x15
        c = pm.best("Bumper Clips", cat)
        if c: pick[c[0]] = c[1]
    if any(n.startswith("Spoiler Bumper") for n in names) and not any("Bumper Rear Cover" in n or "Bumper Front Cover" in n for n in names):
        missing.append("(Bumper for Spoiler)")
    if any(re.match(r"Grille", n) for n in names):
        c = pm.best("Grille Clips", cat)
        if c: pick[c[0]] = c[1]
    sides = {s for p in parts for s in re.findall(r"\b(LH|RH)\b", p)}
    N, R = {}, {}
    for n in {key(l) for l in pick.values()}:
        r = RULES.get(n) or RULES.get(n.replace(" (tts)", ""))
        if not r: continue
        for a, pr in r["N"]:
            if pr >= .5: N[a] = 1
        for a, pr in r["R"]:
            if pr >= .5: R[a] = 1
    def ok(a): s = re.findall(r"\b(LH|RH)\b", a); return not s or s[-1] in sides
    N = sorted(a for a in N if a in labs and ok(a)); R = sorted(a for a in R if a in labs and ok(a) and a not in N)
    res = d.js(t, "(function(V,N,R){" + LAB + "let p=0,n=0,r=0,seen={};"
               "document.querySelectorAll('input[type=checkbox][name=CP]').forEach(c=>{if(V.includes(c.value)&&!seen[c.value]){seen[c.value]=1;if(!c.checked)c.click();p++;}});"
               "document.querySelectorAll('input[type=checkbox][name=CL]').forEach(c=>{if(N.includes(lab(c))&&!c.checked){c.click();n++;}});"
               "document.querySelectorAll('input[type=checkbox][name=CLR]').forEach(c=>{if(R.includes(lab(c))&&!c.checked){c.click();r++;}});"
               "return p+'|'+n+'|'+r;})(%s,%s,%s)" % (json.dumps(list(pick)), json.dumps(N), json.dumps(R)))
    cn.text(t, "^Save$", 15); cn.ok_dialogs(t)
    cn.text(t, "^Next \\(Save & Edit Estimates\\)", 18); cn.ok_dialogs(t)
    if cn.where(t) != "dsp_details": raise RuntimeError("details not reached: " + cn.where(t))
    rs.ready(t)
    rows = json.loads(d.js(t, READ_ROWS))
    q = {}
    for i, n in rows["parts"]:
        if n.startswith("Bumper Clips"): q[i] = "15"
        elif n.startswith("Grille Clips"): q[i] = "9"
        elif qty.get(re.sub(r"\s*\[.*?\]", "", n).strip(), 0) > 1: q[i] = str(qty[re.sub(r"\s*\[.*?\]", "", n).strip()])
    cn.text(t, "^Miscellaneous$", 4)   # the paint section only renders on this tab
    pw = rs.paintwork_retrieval(t)
    veh = d.js(t, 'document.body.innerText.replace(/\\s+/g," ").match(/Vehicle Model:\\s*(.{0,90})/)[1]')
    cm = decide_conditions([(i, n) for i, n in rows["parts"]], veh, impact)
    conds = {k: v["value"] for k, v in cm.items() if v.get("value")}
    d.js(t, '(function(C,Q){function q(n){return document.querySelector(\'[name="\'+n+\'"]\');}function fire(e){e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}'
            'function f(n,v){var e=q(n);if(e){e.readOnly=false;e.value=v;fire(e);}}'
            'for(var k in C){var p=q("PDC"+k);if(p&&!p.readOnly){p.value=C[k];fire(p);}}for(var k in Q)f("PBT"+k,Q[k]);'
            'f("MMI1","500.00");f("PARTDISCPC","10");f("SPCDISCPC","0");f("LRPRATE","30");f("LMTRATE","30");f("LPNRATE","30");f("LPARATE","30");'
            '[].forEach.call(document.querySelectorAll("img"),function(im){im.style.pointerEvents="none";});return 1})(%s,%s)' % (json.dumps(conds), json.dumps(q)))
    cn.text(t, "^Save$", 15); cn.ok_dialogs(t); time.sleep(4); rs.ready(t)
    st = json.loads(d.js(t, rs.STATE))
    bt = d.js(t, '(document.body.innerText.match(/\\[\\s*([\\d.]+)\\s*yr\\(s\\)\\s*-\\s*([\\d.]+)%\\s*\\]/)||["","?","?"]).slice(1).join("|")')
    return {"ticked": res, "parts": len(rows["parts"]), "qty": q, "N": N, "R": R, "missing": missing, "state": st, "paint": pw, "betterment": bt}

if __name__ == "__main__":
    t, plate = int(sys.argv[1]), sys.argv[2]
    parts = json.load(open(S + "/parts3.json"))[plate]
    imp = {"WWH2330": "rear; rear bumper, tailgate, rear lamps, rear panel", "JNC9717": "rear; rear bumper, boot lid, rear lamps, quarter panels",
           "FB438": "front; front bumper, bonnet, A/C condenser, grille, headlamps, front panel"}[plate]
    print(plate, json.dumps(run(t, plate, parts, imp), ensure_ascii=False))
