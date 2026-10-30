#!/usr/bin/env python3
"""Speed-up 4: run Phase A for a whole batch with ONE command, after the step-1 agents wrote data/<PLATE>.json.

  python3 phase_a.py <batch_dir> [PLATE ...]          # real run
  TEST=1 python3 phase_a.py <batch_dir> [PLATE ...]   # test on cases that ALREADY exist (ids.txt): no create, report dry-run,
                                                      # skips uploads that are already there; nothing new is written

Steps (playbook 00 Phase A), every case in parallel inside each step; a case that fails stops only itself:
  1 model variant (pick_model.py; UNSURE -> printed for Claude to check)   2 photo model in the background (photos.py model)
  3 create (dry run, then submit; workshop COID checked)                     4 ids from the worklist
  5 Adjuster Report (+ pink-box check)    6 discount/labour rates + betterment    7 narratives (VERIFY)
  8 DOC upload (compress > 5 MB)          9 naming page build (publish = Claude, Artifact tool)    10 photo upload + chkorder
  11 car-model report table (playbook 09 format) -> <batch_dir>/car_model_report.md
Timing of every step is printed and written to <batch_dir>/phase_a_timing.json.
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe, wait_login, ids, H
from pick_model import pick

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEST = os.environ.get("TEST") == "1"
T = {}


def step(name):
    def deco(fn):
        def w(*a, **k):
            t0 = time.time(); print(f"\n== {name}", flush=True)
            r = fn(*a, **k); T[name] = round(time.time() - t0, 1); print(f"   ({T[name]} s)", flush=True); return r
        return w
    return deco


def main():
    b = sys.argv[1]; data = {os.path.basename(f)[:-5]: json.load(open(os.path.join(b, "data", f)))
                             for f in os.listdir(os.path.join(b, "data")) if f.endswith(".json")}
    plates = sys.argv[2:] or [p for p, d in data.items() if "case" in d and not d.get("missing")]
    opts = json.load(open(os.path.join(H, "model_opts_sinar.json")))
    tag = os.path.basename(os.path.normpath(b))
    cf, rf, uf = (os.path.join(H, f"{x}_{tag}.json") for x in ("cases", "report", "uploads"))
    t_all = time.time()
    wait_login()

    @step("1 model variant")
    def s1():
        meta = {}
        for p in plates:
            v = data[p]["case"]["veh"]; r = data[p]["report"]["veh"]
            res = pick(opts, {"make": v["make"], "rcModel": v.get("rcModel", ""), "cc": v.get("cc", ""), "transmission": v.get("transmission", ""),
                              "body": v.get("body", ""), "jpjReg": r.get("jpjReg", ""), "year": v.get("year") or r.get("manYear", "")})
            if TEST and v.get("modelValue"):
                ok = "same as before" if res["pick"] == v["modelValue"] else f"DIFFERENT (before {v['modelValue']})"
                print(f"   {p}: {res['status']} {res.get('text')}  -> {ok}")
            else:
                print(f"   {p}: {res['status']} {res.get('text')}" + ("" if res["status"] == "OK" else f"   top3 {res['top']}"))
                if res["pick"]:
                    v["modelValue"] = res["pick"]
            mk = v["make"].upper(); txt = next((o["t"] for o in opts.get(mk, []) if o["v"] == v["modelValue"]), res.get("text") or "")
            v["modelText"] = f"{mk} {txt}"; meta[p] = v["modelText"]
        json.dump(meta, open(os.path.join(b, "meta.json"), "w"), indent=1)
        json.dump({p: data[p]["case"] for p in plates}, open(cf, "w"), indent=1)
        return meta
    meta = s1()

    @step("2 photo model (background)")
    def s2():
        if TEST and all(os.path.exists(os.path.join(b, "report", f"rows_{p}.json")) for p in plates):
            print("   rows already there, skipped"); return None
        return subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "model", b])
    photo_proc = s2()

    @step("3 create")
    def s3():
        if TEST:
            print("   TEST: no create"); return
        dry = safe("createpar2_sinar.mjs", ",".join(plates), "session_base.txt", cf, timeout=1800)
        WS = {"Sinar": "29709", "Extreme": "72619", "Lee Kean Hin": "70382"}
        bad = []
        for l in dry.splitlines():
            if "FILL" not in l:
                continue
            p_ = l.split()[0]; m = re.search(r"rep=(\d+)", l); want = next((v for k, v in WS.items() if k in data.get(p_, {}).get("case", {}).get("workshopMatch", "")), None)
            if not m or (want and m.group(1) != want):
                bad.append(l)
        if bad:
            print("   STOP: workshop not matched ->", bad); sys.exit(1)
        out = safe("createpar2_sinar.mjs", ",".join(plates), "session_base.txt", cf, "submit", timeout=2400)
        print("\n".join("   " + l for l in out.splitlines() if "=>" in l))
    s3()

    @step("4 ids")
    def s4():
        wl = safe("wl.mjs"); I = ids(os.path.join(b, "ids.txt")) if os.path.exists(os.path.join(b, "ids.txt")) else {}
        for l in wl.splitlines():
            x = l.split()
            if len(x) == 3 and x[0] in plates:
                I[x[0]] = (x[1], x[2])
        open(os.path.join(b, "ids.txt"), "w").write("".join(f"{p} {c} {e}\n" for p, (c, e) in I.items()))
        miss = [p for p in plates if p not in I]
        if miss:
            print("   not in the worklist (create failed?):", miss)
        return I
    I = s4(); ok = [p for p in plates if p in I]

    @step("5 Adjuster Report")
    def s5():
        rep = json.load(open(rf)) if os.path.exists(rf) else {}
        for p in ok:
            c, e = I[p]; r = dict(data[p]["report"]); r.update(cid=c, extid=e, adjFile=f"EXT/{c}/TP")
            r.update({k: v for k, v in rep.get(p, {}).items() if k == "betterment"}); rep[p] = r
        json.dump(rep, open(rf, "w"), indent=1)
        out = safe("reportpar.mjs", ",".join(ok), "session_base.txt", rf, *([] if TEST else ["save"]), timeout=2400)
        print("\n".join("   " + l for l in out.splitlines() if re.match(r"^\S+: ", l)))
        f = os.path.join(b, "_ids_ok.txt"); open(f, "w").write("".join(f"{p} {I[p][0]} {I[p][1]}\n" for p in ok))
        print("\n".join("   " + l for l in safe("pinkchk.mjs", f).splitlines()))
    s5()

    @step("6 rates + betterment")
    def s6():
        out = safe("disclabourpar.mjs", ",".join(ok), "session_base.txt", rf, timeout=1800)
        rep = json.load(open(rf))
        for l in out.splitlines():
            m = re.match(r"(\S+): .*Betterment=(.+)$", l.strip())
            if m and m.group(1) in rep:
                rep[m.group(1)]["betterment"] = m.group(2).strip(); print("   " + l.strip())
        json.dump(rep, open(rf, "w"), indent=1)
    s6()

    @step("7 narratives")
    def s7():
        out = safe("narrpar.mjs", ",".join(ok), "session_base.txt", rf, timeout=1800)
        print("\n".join("   " + l for l in out.splitlines() if "VERIFY" in l))
    s7()

    @step("8 DOC upload")
    def s8():
        import fitz, shutil
        os.makedirs(os.path.join(b, "up"), exist_ok=True); U = {}
        for p in ok:
            files = []
            for f in sorted(os.listdir(os.path.join(b, p))):
                if not f.lower().endswith(".pdf"):
                    continue
                desc = "P.REPORT" if re.search(r"POLICE", f, re.I) else ("JPJ SEARCH" if re.search(r"JPJ|SEARCH", f, re.I) else "DOC")
                src = os.path.join(b, p, f); dst = os.path.join(b, "up", f"{p}_{desc.replace('.', '').replace(' ', '_')}.pdf")
                if os.path.getsize(src) > 5_000_000:
                    d = fitz.open(src); o = fitz.open()
                    for pg in d:
                        q = o.new_page(width=pg.rect.width, height=pg.rect.height); q.insert_image(q.rect, stream=pg.get_pixmap(dpi=150).tobytes("jpeg", jpg_quality=70))
                    o.save(dst, deflate=True)
                else:
                    shutil.copy(src, dst)
                files.append({"path": dst, "fdesc": desc})
            U[p] = {"cid": I[p][0], "ext": I[p][1], "files": files}
        json.dump(U, open(uf, "w"), indent=1)
        if TEST:
            print("   TEST: upload list built, nothing uploaded:", {p: [x["fdesc"] for x in U[p]["files"]] for p in ok}); return
        out = safe("uploadpar.mjs", ",".join(ok), "session_base.txt", uf, timeout=2400)
        print("\n".join("   " + l for l in out.splitlines() if "uploaded" in l or "skip" in l.lower()))
    s8()

    @step("9 naming page (wait for photo model)")
    def s9():
        if photo_proc:
            photo_proc.wait()
        nd = os.path.join(REPO, "tools", "naming-desk", "naming.py")
        print("   " + subprocess.run([sys.executable, nd, "build", os.path.join(b, "report"), os.path.join(b, "meta.json")], capture_output=True, text=True).stdout.strip().splitlines()[-1][:120])
        db0 = os.path.join(b, "db0"); os.makedirs(os.path.join(db0, "names"), exist_ok=True); os.makedirs(os.path.join(db0, "orders"), exist_ok=True)
        if not TEST:
            subprocess.run([sys.executable, nd, "final", os.path.join(b, "report"), db0, *ok], capture_output=True)
            subprocess.run([sys.executable, nd, "plan", os.path.join(b, "report"), b, *ok], capture_output=True)
        print("   -> Claude publishes report/naming.html to the 照片命名台 URL (Artifact tool)")
    s9()

    @step("10 photo upload")
    def s10():
        f = os.path.join(b, "_ids_ok.txt")
        for p in ok:
            have = safe("chkorder.mjs", p, *I[p]).strip().splitlines()[-1]
            m = re.search(r"photos (\d+) plan (\d+)", have)
            if TEST or (m and m.group(1) == m.group(2) and m.group(1) != "0"):
                print(f"   {p}: {have.strip()[:70]} — skipped")
        if not TEST:
            subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "upload", b, *ok])
    s10()

    @step("11 car-model report")
    def s11():
        vm = json.loads(re.search(r"\{.*\}", safe("vmodel.mjs", os.path.join(b, "_ids_ok.txt")), re.S).group(0))
        rows = ["| 车牌 | Registration Date | RC 资料 | Merimen 选的车型 | 车型年份范围 | 选择理由 |", "|---|---|---|---|---|---|"]
        for p in ok:
            v = data[p]["case"]["veh"]; reg = data[p]["report"]["veh"].get("jpjReg", "")
            m = vm.get(p, ""); rng = re.search(r"\[([^\]]+)\]\s*$", m); name = re.sub(r"\s*\[[^\]]+\]\s*$", "", m)
            green = any(o["v"] == v.get("modelValue") and o.get("c", "").endswith("1") for o in opts.get(v["make"].upper(), []))
            rc = f"{v.get('rcModel','')} · {v.get('cc','')}cc · {v.get('fuel','')} {v.get('transmission','')}".strip()
            rows.append(f"| {p} | 📅 `{reg}` | {rc} | {name} | 📅 `{rng.group(1) if rng else ''}` | {'' if green else '⚠️ no price data '}(reason: Claude fills) |")
        open(os.path.join(b, "car_model_report.md"), "w").write("\n".join(rows) + "\n"); print("\n".join(rows))
    s11()

    T["TOTAL"] = round(time.time() - t_all, 1)
    json.dump(T, open(os.path.join(b, "phase_a_timing.json"), "w"), indent=1)
    print("\nTIMING (s):", json.dumps(T))


if __name__ == "__main__":
    main()
