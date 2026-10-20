#!/usr/bin/env python3
"""Adjuster report by CLICKING only (Merimen 2026-10-16), one case after another in the logged-in tab.
  python3 report_click.py TAB PLATE[,PLATE...]   -> ends on dsp_selection (Select Parts) of each case."""
import sys, time, json
import driver as d, click_nav as cn, run_report as rr, rdata10

def go_report(t, plate, cid):
    if cn.where(t) != 'dsp_home': cn.text(t, '^Claims Home$', 10)
    cn.open_case(t, plate, cid)
    if cn.where(t) != 'dsp_clmheader': raise RuntimeError('case page not reached: ' + cn.where(t))
    cn.href(t, 'fuseaction=dsp_estmain', 16)
    if cn.where(t) != 'dsp_estmain': raise RuntimeError('report page not reached: ' + cn.where(t))

def save(t, rx):
    for n in ("sleIOCC", "sleDOCC", "sleCLMOCC", "sleCMDOCC"): d.settxt(t, n, "OTHERS")
    cn.text(t, rx, 18); cn.ok_dialogs(t)

def one(t, plate):
    r = rdata10.R[plate]
    go_report(t, plate, r['cid'])
    bad, ld = rr.report(t, r)
    if not d.js(t, '(document.querySelector("[name=ddlbLossDesc]")||{}).value||""'):   # per-insurer wording (Etiqa: "Head to Rear Collision")
        kind = {"rear": "Head to Rear", "front": "Head to Rear", "side": "Head to Side"}.get(r.get("part", "rear"), "Head to Rear")
        d.pick(t, "ddlbLossDesc", kind)
    if r.get('dnm'):
        rr.X(t, "sleDnm", r["dnm"]); rr.X(t, "sleDID1", r["did"]); rr.X(t, "sleDDOB", r["ddob"]); rr.P(t, "sleDGender", r["dgender"])
    d.js(t, '(function(){var s=document.querySelector("[name=slePOLICEDCODE]");if(!s||s.value)return 0;var o=[].slice.call(s.options).find(function(o){return /^TRG/.test(o.value)});if(o){s.value=o.value;s.dispatchEvent(new Event("change",{bubbles:true}))}return 1})()')
    save(t, '^Save$')
    if cn.where(t) != 'dsp_estmain': raise RuntimeError('after save: ' + cn.where(t))
    pink = json.loads(d.js(t, d.PINK_EMPTY))
    save(t, '^Next \\(Save & Adjust Estimates\\)')
    return {"bad": bad, "pink": pink, "loss": {k: v.get('value') for k, v in ld.items() if isinstance(v, dict)}, "at": cn.where(t)}

if __name__ == "__main__":
    t = int(sys.argv[1])
    for p in sys.argv[2].split(","):
        try:
            print(p, json.dumps(one(t, p), ensure_ascii=False), flush=True)
        except Exception as e:
            print(p, "ERROR", str(e)[:200], flush=True); break
