#!/usr/bin/env python3
"""Adjuster report -> discounts -> betterment -> narratives, in parallel tabs.
The loss description and collision type come from the TypeSafe judgment, read off
the live option list (per-insurer codes differ, so no fixed ids here).

  python3 typesafe/run_report.py rdata4 PLATE[,PLATE...]
"""
import importlib, json, os, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import driver as d
from merimen_create import choose_loss

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


def S(tab, n, v):
    with LOCK:
        return d.setsel(tab, n, v)


def X(tab, n, v):
    with LOCK:
        return d.settxt(tab, n, v)


def P(tab, n, rx):
    with LOCK:
        return d.pick(tab, n, rx)


def report(tab, r):
    bad = []

    def chk(k, v):
        if v in ("absent", "NF"):
            bad.append("%s:%s" % (k, v))
        return v

    chk("rptno", X(tab, "slePoliceRef", r["rptno"])); chk("rptdt", X(tab, "slePOLICERPTDT", r["rptdt"]))
    chk("rpttm", S(tab, "slePOLICERPTTM", r["rpttm"])); chk("stn", X(tab, "vaCDPOLICESTATION", r["station"]))
    S(tab, "ddlbFault", "2"); S(tab, "ddlbDAMTYPE", "0"); time.sleep(3)
    chk("colltype", S(tab, "ddlbCollType", r["colltype"]))
    chk("place", X(tab, "sleAccPlace", r["place"])); chk("state", S(tab, "ddlbLossState", r["stateid"]))
    time.sleep(4)
    chk("city", P(tab, "ddlbLOSSCITY", r["cityrx"])); chk("apcode", X(tab, "sleAPcode", r["apcode"]))

    # loss description + collision type: the judgment, over the live options
    with LOCK:
        ld = choose_loss(d.js, tab, r["narrative"], r["damage"], r["atfault_kind"])

    # insured (= at-fault)
    X(tab, "sleInm", r["inm"]); X(tab, "sleIID1", r["iid"]); X(tab, "sleIDOB", r["idob"])
    P(tab, "sleIGender", r["igender"]); S(tab, "ddlbIMARITAL", "5"); X(tab, "sleIEMAIL", "NOEMAIL")
    X(tab, "sleIAddr1", r["iaddr"]); S(tab, "ddlbIState", r["istateid"]); time.sleep(4)
    chk("icity", P(tab, "ddlbICity", r["icityrx"])); time.sleep(1); X(tab, "sleIPostCode", r["ipost"])
    X(tab, "sleIOCC", "OTHERS"); P(tab, "ddlbIOCC", "^Others$|^Unemployed$")
    S(tab, "sleIPhone1pref", r["ipref"]); X(tab, "sleIPhone1", r["iphone"]); X(tab, "sleITIN", "NA")
    # insured driver = same person
    X(tab, "sleDnm", r["inm"]); X(tab, "sleDID1", r["iid"]); X(tab, "sleDDOB", r["idob"])
    P(tab, "sleDGender", r["igender"]); S(tab, "ddlbDMARITAL", "5"); X(tab, "sleDEMAIL", "NOEMAIL")
    X(tab, "sleDAddr1", r["iaddr"]); S(tab, "ddlbDState", r["istateid"]); time.sleep(4)
    P(tab, "ddlbDCity", r["icityrx"]); time.sleep(1); X(tab, "sleDPostCode", r["ipost"])
    X(tab, "sleDOCC", "OTHERS"); P(tab, "ddlbDOCC", "^Others$|^Unemployed$")
    S(tab, "sleDPhone1pref", r["ipref"]); X(tab, "sleDPhone1", r["iphone"])
    X(tab, "sleCDDRVEXP", r["dexp"]); S(tab, "ddlbDProvisional", "0"); P(tab, "sleDRelation", "Others")
    # claimant (= our client)
    X(tab, "sleCLMnm", r["cnm"]); X(tab, "sleCLMID1", r["cid_"]); X(tab, "sleCLMDOB", r["cdob"])
    P(tab, "sleCLMGender", r["cgender"]); S(tab, "ddlbCLMMARITAL", "5"); X(tab, "sleCLMEMAIL", "NOEMAIL")
    X(tab, "sleCLMAddr1", r["caddr"]); S(tab, "ddlbCLMState", r["cstateid"]); time.sleep(4)
    chk("ccity", P(tab, "ddlbCLMCity", r["ccityrx"])); time.sleep(1); X(tab, "sleCLMPostCode", r["cpost"])
    X(tab, "sleCLMOCC", "OTHERS"); P(tab, "ddlbCLMOCC", "^Others$|^Unemployed$")
    S(tab, "sleCLMPhone1pref", r["cpref"]); X(tab, "sleCLMPhone1", r["cphone"]); X(tab, "sleCLMTIN", "NA")
    X(tab, "sleCMDnm", r.get("cmdnm", r["cnm"])); X(tab, "sleCMDID1", r.get("cmdid", r["cid_"]))
    X(tab, "sleCMDEMAIL", "NOEMAIL")
    if r.get("cmdnm"):   # separate driver makes the whole CMD block required
        S(tab, "ddlbCMDMARITAL", "5"); X(tab, "sleCMDAddr1", r["caddr"])
        S(tab, "ddlbCMDState", r["cstateid"]); time.sleep(4)
        P(tab, "ddlbCMDCity", r["ccityrx"]); time.sleep(1); X(tab, "sleCMDPostCode", r["cpost"])
        X(tab, "sleCMDOCC", "OTHERS"); P(tab, "ddlbCMDOCC", "^Others$|^Unemployed$")
        S(tab, "sleCMDPhone1pref", r["cpref"]); X(tab, "sleCMDPhone1", r["cphone"])
        X(tab, "sleCMDDRVEXP", "15"); S(tab, "ddlbCMDProvisional", "0"); P(tab, "sleCMDRelation", "Others")
    # vehicle / condition / tyres
    X(tab, "sleENGNO", r["eng"]); X(tab, "sleCHANO", r["cha"]); X(tab, "sleJPJNO", "-")
    X(tab, "sleJPJREG", r["jpjreg"]); X(tab, "sleVHMANYEAR", r["year"]); X(tab, "sleVehCC", r["cc"])
    S(tab, "ddlbAssemType", r.get("assem", "3")); S(tab, "ddlbVehClass", "2")
    chk("colour", P(tab, "ddlbCOLORID", r["colourrx"])); X(tab, "sleFUELTYPE", "PETROL")
    S(tab, "ddlbGENCON", "G"); S(tab, "ddlbDRIVEABLE", "1")
    S(tab, "ddlbConDamage", "2"); S(tab, "ddlbPREDAMAGE", "0")
    X(tab, "sleODO", r["odo"]); S(tab, "ddlbODOUNITS", "0")
    for t in ("FLT", "FRT", "RLT", "RRT"):
        S(tab, "ddlb%sTYPEID" % t, "40")
    X(tab, "sleFTYRESIZE", "175/65 R17"); X(tab, "sleRTYRESIZE", "175/65 R17")
    for t in ("FLTREAD", "FRTREAD", "RLTREAD", "RRTREAD"):
        X(tab, "sle" + t, "6.00")
    X(tab, "sleSPTREAD", "8.00")
    S(tab, "cbxTL", "1" if r.get("tl") else "0"); S(tab, "ddlbPATYPEID", "4")
    S(tab, "ddlbLABTYPE", "TC020"); X(tab, "LIABLEPC", "100")
    # the pink required boxes
    X(tab, "sleINSPECT", TODAY); X(tab, "sleNUM_REPDAYS", "25"); S(tab, "ddlbLocClaim", "23")
    return bad, ld


def narratives(tab, r, age, pct):
    N = {"500": (None, "The accident occurred due to the subject vehicle was said to have knocked by a third party %s on the %s portion." % (r["tp"], r["part"])),
         "510": (None, "Our visual inspection of the subject vehicle upon sighting the police report No: %s revealed that the damage noted is consistent with the reported accident." % r["rptno"]),
         "520": (None, "We have recommended the parts pricing based on franchise parts prices where in a discount of 10% have been applied."),
         "530": ("WITHOUT PREJUDICE", "This report is strictly on a Without Prejudice basis."),
         "540": (None, "In view that the age of the subject vehicle is %s years, we have applied %s betterment on all franchise parts recommended." % (age, pct))}
    code = "(function(){var out=[];"
    for slot, (title, body) in N.items():
        code += ('var cb%s=document.querySelector(\'input[name=cbxNarr][value="%s"]\');'
                 'if(cb%s){if(!cb%s.checked)cb%s.click();}else out.push("cb%s");' % (slot, slot, slot, slot, slot, slot))
        if title:
            code += ('var ti%s=document.querySelector("[name=AWTitle%s]");'
                     'if(ti%s){ti%s.value=%s;ti%s.dispatchEvent(new Event("change",{bubbles:true}));}'
                     % (slot, slot, slot, slot, json.dumps(title), slot))
        code += ('var pa%s=document.querySelector("[name=mlePara%s]");'
                 'if(pa%s){pa%s.value=%s;pa%s.dispatchEvent(new Event("input",{bubbles:true}));'
                 'pa%s.dispatchEvent(new Event("change",{bubbles:true}));}else out.push("pa%s");'
                 % (slot, slot, slot, slot, json.dumps(body), slot, slot, slot))
    code += 'return out.join(",")||"ok";})()'
    return J(tab, code)


def one(plate, r, tab, out):
    try:
        URL = ("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain"
               "&caseid=%d&extid=%d&" % (r["cid"], r["eid"]))
        DET = ("https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details"
               "&caseid=%d&extid=%d&tpins=0&" % (r["cid"], r["eid"]))
        GO(tab, URL + d.sess(), wait=18)
        bad, ld = report(tab, r)
        J(tab, '(function(){try{document.forms.EstMain.submit();}catch(e){}return 1;})()')
        time.sleep(20)
        # discounts
        GO(tab, DET + d.sess(), wait=18)
        J(tab, '(function(){function f(n,v){var e=document.querySelector("[name="+n+"]");'
               'if(e){e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));'
               'e.dispatchEvent(new Event("change",{bubbles:true}));}}'
               'f("PARTDISCPC","10");f("SPCDISCPC","0");f("LRPRATE","30");f("LMTRATE","30");'
               'f("LPNRATE","30");f("LPARATE","30");return 1;})()')
        J(tab, '(function(){var b=[...document.querySelectorAll("input[type=button],input[type=submit],button,a")]'
               '.find(function(e){return ((e.value||e.textContent)||"").trim()==="Save";});if(b)b.click();return 1;})()')
        time.sleep(15)
        for _ in range(3):
            n = J(tab, '(function(){var c=0;[...document.querySelectorAll("input[type=button],button,a")]'
                       '.forEach(function(b){var t=(b.value||b.textContent||"").trim();'
                       'if(/^OK$/i.test(t)&&b.offsetParent){b.click();c++;}});return c;})()')
            if n and n != "0":
                time.sleep(5)
            else:
                break
        GO(tab, DET + d.sess(), wait=17)
        bt = J(tab, '(function(){var t=document.body.innerText;'
                    'var m=t.match(/\\[\\s*([\\d.]+)\\s*yr\\(s\\)\\s*-\\s*([\\d.]+)%\\s*\\]/);'
                    'return m?(m[1]+"|"+m[2]):"NA";})()')
        disc = J(tab, 'JSON.stringify({PD:(document.querySelector("[name=PARTDISCPC]")||{}).value,'
                      'SP:(document.querySelector("[name=SPCDISCPC]")||{}).value,'
                      'L:(document.querySelector("[name=LRPRATE]")||{}).value})')
        age, pct = (bt.split("|")[0], bt.split("|")[1] + "%") if "|" in bt else ("?", "?")
        # narratives
        GO(tab, URL + d.sess(), wait=17)
        nr = narratives(tab, r, age, pct)
        J(tab, '(function(){try{document.forms.EstMain.submit();}catch(e){}return 1;})()')
        time.sleep(20)
        GO(tab, URL + d.sess(), wait=17)
        chk = J(tab, '(function(){var c=[...document.querySelectorAll("input[name=cbxNarr]")]'
                     '.filter(function(x){return x.checked;}).length;'
                     'return c+"|"+((document.querySelector("[name=slePoliceRef]")||{}).value||"")'
                     '+"|"+((document.querySelector("[name=sleODO]")||{}).value||"");})()')
        pink = J(tab, d.PINK_EMPTY)
        out[plate] = {"bad": bad, "disc": disc, "betterment": bt, "narr": nr,
                      "verify": chk, "pink_left": json.loads(pink),
                      "loss": {k: (v.get("value"), round(v.get("confidence", 0), 2))
                               for k, v in ld.items() if isinstance(v, dict) and "value" in v}}
    except Exception as e:
        out[plate] = {"error": str(e)[:200]}


def run(mod, plates):
    R = importlib.import_module(mod).R
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
        t = threading.Thread(target=one, args=(p, R[p], mytabs[p], out))
        t.start(); th.append(t)
    for t in th:
        t.join()
    for p in plates:
        print(p, json.dumps(out.get(p), ensure_ascii=False)[:400])
    for p in plates:
        d.close_tab(mytabs[p]); time.sleep(0.4)
    return out


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2].split(","))
