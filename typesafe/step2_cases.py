import sys, json
import driver as d, click_nav as cn, report_click as rc, step2_click as s2, rdata10
t = int(sys.argv[1]); P = json.load(open(s2.S + "/parts3.json"))
IMP = {"WWH2330": "rear; rear bumper, tailgate, rear lamps, rear panel", "JNC9717": "rear; rear bumper, boot lid, rear lamps, quarter panels",
       "FB438": "front; front bumper, bonnet, A/C condenser, grille, headlamps, front panel"}
for p in sys.argv[2].split(","):
    try:
        rc.go_report(t, p, rdata10.R[p]["cid"])
        for _ in range(2):
            rc.save(t, '^(Next \\()?Save & Adjust Estimates')
            if cn.where(t) == "dsp_details": cn.text(t, "^Select Parts$", 15)
            if cn.where(t) == "dsp_selection": break
            import time; time.sleep(10)
        if cn.where(t) != "dsp_selection": raise RuntimeError("selection not reached: " + cn.where(t))
        print(p, json.dumps(s2.run(t, p, P[p], IMP[p]), ensure_ascii=False), flush=True)
    except Exception as e:
        print(p, "ERROR", str(e)[:200], flush=True); break
