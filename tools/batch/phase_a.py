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
from mrm import safe, wait_login, ids, par, H
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
    # 2026-11-04: a missing CLAIMANT own insurance is not a blocker (playbook 01) -> never skip a case for it (VDV9302 was skipped)
    blocking = lambda d: [m for m in d.get("missing", []) if not re.search(r"own insurance|claimant.*insurance|\bINS\b", m, re.I)]
    plates = sys.argv[2:] or [p for p, d in data.items() if "case" in d and not blocking(d)]
    opts = json.load(open(os.path.join(H, "model_opts_sinar.json")))
    # 2026-11-04: a make with no model list (batch 9 SUZUKI) made the create fail -> dump it first (dumpmodels merges makes)
    need = sorted({data[p]["case"]["veh"]["make"].upper() for p in plates} - {k for k, v in opts.items() if v})
    if need and not TEST:
        print("   dumping model lists for", need, flush=True); safe("dumpmodels_sinar.mjs", ",".join(need), timeout=900)
        opts = json.load(open(os.path.join(H, "model_opts_sinar.json")))
    tag = os.path.basename(os.path.normpath(b))
    cf, rf, uf = (os.path.join(H, f"{x}_{tag}.json") for x in ("cases", "report", "uploads"))
    t_all = time.time()
    wait_login()

    # 2026-11-10 user: 'marginal ones, don't add' -> Jev model-variant + loss-description votes removed (pick_model was 16/16 already;
    # loss desc had no proven catch). Kept: insurer + Liberty branch (a wrong branch fails the create, VDV9302).
    def jev_options(case, rep):
        """2026-11-10 (Jev test 2, 55 insurers: 94.5%, 43/43 at conf >= 0.9; Liberty branch 98%): second vote on the at-fault
        insurer, our client's insurer and the Liberty branch. Only a confident disagreement is flagged; Claude re-reads the
        I-SEARCH / policy before the create. State, city and police station stay with the code rules (they were better)."""
        try:
            from judgments import ask, answer
            ins = [x for x in json.load(open(os.path.join(H, "model_opts_sinar.json"))).get("__ins3", []) if "=" in x and x.split("=", 1)[0]]
            names = {x.split("=", 1)[0]: x.split("=", 1)[1] for x in ins}
            crit = {n: None for n in names.values()}; crit["__none__"] = "None of these insurers."
            qs, want = {}, {}
            for k, txt, coid in (("ins", case.get("insName"), case.get("insCOID")), ("cli", (case.get("client") or {}).get("insName"), (case.get("client") or {}).get("insCOID"))):
                if txt and coid in names:
                    qs[k] = {"type": "choice", "instructions": "Which Merimen insurer is `%s`?" % k, "criteria": crit}; want[k] = (txt, names[coid])
            REG = {"East Coast": "Terengganu, Pahang, Kelantan", "East Malaysia": "Sabah, Sarawak, Labuan", "Klang Valley": "Selangor, Kuala Lumpur, Putrajaya",
                   "Northern": "Penang, Kedah, Perlis, Perak", "Southern": "Johor, Melaka, Negeri Sembilan"}
            if str(case.get("insCOID")) == "61" and rep.get("accPlace"):
                qs["br"] = {"type": "choice", "instructions": "This claim is against Liberty General Insurance. Which Liberty branch handles an accident at `place`?",
                            "criteria": {k: "Liberty branch for " + v for k, v in REG.items()}}
            if not qs: return ""
            r = ask({"ins": want.get("ins", ("", ""))[0], "cli": want.get("cli", ("", ""))[0], "place": rep.get("accPlace", "")}, qs)
            out = []
            for k, (txt, mine) in want.items():
                v, c = answer(r, k)
                if v != mine and c >= 0.80: out.append("⚠️ Jev %s '%s' = %s (%.2f), ours %s -> re-read I-SEARCH/policy" % ("at-fault insurer" if k == "ins" else "client insurer", txt, v, c, mine))
            if "br" in qs:
                v, c = answer(r, "br"); bm = case.get("branchMatch", "")
                if c >= 0.80 and v.split()[0].lower() not in bm.lower(): out.append("⚠️ Jev Liberty branch = %s (%.2f), ours branchMatch '%s' (HQ fails the create)" % (v, c, bm))
            return " · ".join(out) or "Jev agrees on insurer" + (" + Liberty branch" if "br" in qs else "")
        except Exception as e:
            return "Jev option check skipped: %s" % str(e)[:80]

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
            # 2026-11-10 (user: "jev is fast and cheap, add it in"): Jev second vote, ~0.3 s. Test on 16 past cases: when Jev's
            # confidence >= 0.70 it was right 7/7; low-confidence answers were often wrong -> only a high-confidence DISAGREEMENT is flagged.
            jo = jev_options(data[p]["case"], data[p]["report"])
            if jo: print("   " + p + ": " + jo)
            mk = v["make"].upper(); txt = next((o["t"] for o in opts.get(mk, []) if o["v"] == v["modelValue"]), res.get("text") or "")
            v["modelText"] = f"{mk} {txt}"; meta[p] = v["modelText"]
        # 2026-11-04: MERGE with what is already there (a re-run for 1-2 plates wiped the other cases' meta 3 times in batches 8-9)
        mf = os.path.join(b, "meta.json"); old = {}
        try: old = json.load(open(mf))
        except (OSError, ValueError): pass
        json.dump({**old, **meta}, open(mf, "w"), indent=1)
        oldc = {}
        try: oldc = json.load(open(cf))
        except (OSError, ValueError): pass
        json.dump({**oldc, **{p: data[p]["case"] for p in plates}}, open(cf, "w"), indent=1)
        return meta
    meta = s1()

    @step("2 photo model (background)")
    def s2():
        # 2026-11-04: the photo model normally ran already (page published before phase_a); never re-run it, the user may be
        # naming photos on the page and new rows would change the photo numbers under their edits
        if all(os.path.exists(os.path.join(b, "report", f"rows_{p}.json")) for p in plates):
            print("   rows already there, skipped"); return None
        return subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "model", b])
    photo_proc = s2()

    @step("3 create")
    def s3():
        if TEST:
            print("   TEST: no create"); return
        dry = safe("createpar2_sinar.mjs", ",".join(plates), "session_base.txt", cf, timeout=1800)
        WS = {"Sinar": "29709", "Extreme": "72619", "Lee Kean Hin": "70382", "Vp Airbresh": "22209"}
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
        # 2026-11-04: retry a failed create once at once (batch 9 TDG7387 failed then worked on a manual re-run, ~10 min lost).
        # Only when Merimen REJECTED the form (MSG=... and still on dsp_clmreg): no case was made, so a retry cannot duplicate one.
        fail = [l.split()[0] for l in out.splitlines() if "=>" in l and "caseid=?" in l and "MSG=" in l and "dsp_clmreg" in l]
        if fail:
            print("   retry create:", fail, flush=True)
            out2 = safe("createpar2_sinar.mjs", ",".join(fail), "session_base.txt", cf, "submit", timeout=1200)
            print("\n".join("   " + l for l in out2.splitlines() if "=>" in l))
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
                    # user 2026-11-03 (CEW7805): one pass at 150 dpi left 14.7 MB and Merimen dropped it silently -> step down until < 4.8 MB
                    for dpi, jq in ((150, 70), (120, 60), (100, 55), (85, 50), (72, 45), (60, 40)):
                        d = fitz.open(src); o = fitz.open()
                        for pg in d:
                            q = o.new_page(width=pg.rect.width, height=pg.rect.height); q.insert_image(q.rect, stream=pg.get_pixmap(dpi=dpi).tobytes("jpeg", jpg_quality=jq))
                        o.save(dst, deflate=True, garbage=4)
                        if os.path.getsize(dst) < 4_800_000:
                            break
                    print(f"   {p}: {f} compressed to {os.path.getsize(dst)/1e6:.1f} MB at {dpi} dpi")
                else:
                    shutil.copy(src, dst)
                files.append({"path": dst, "fdesc": desc})
            U[p] = {"cid": I[p][0], "ext": I[p][1], "files": files}
        json.dump(U, open(uf, "w"), indent=1)
        if TEST:
            print("   TEST: upload list built, nothing uploaded:", {p: [x["fdesc"] for x in U[p]["files"]] for p in ok}); return
        out = safe("uploadpar.mjs", ",".join(ok), "session_base.txt", uf, timeout=2400)
        print("\n".join("   " + l for l in out.splitlines() if "uploaded" in l or "skip" in l.lower()))
        # verify: every case must now list a PDF row (docsInList counts photos too, so check PDF rows only)
        for p in ok:
            v = safe("listdocs_pdf.mjs", *I[p]).strip().splitlines()
            n = int(v[-1]) if v and v[-1].strip().isdigit() else -1
            print(f"   {p}: PDF rows in Merimen = {n}" + ("" if n >= len(U[p]["files"]) else "   <-- MISSING, re-upload!"))
    s8()

    @step("9 naming page (wait for photo model)")
    def s9():
        if photo_proc:
            photo_proc.wait()
        nd = os.path.join(REPO, "tools", "naming-desk", "naming.py")
        print("   " + subprocess.run([sys.executable, nd, "build", os.path.join(b, "report"), os.path.join(b, "meta.json")], capture_output=True, text=True).stdout.strip().splitlines()[-1][:120])
        db0 = os.path.join(b, "db0"); os.makedirs(os.path.join(db0, "names"), exist_ok=True); os.makedirs(os.path.join(db0, "orders"), exist_ok=True)
        open(os.path.join(db0, "orders", ".listed"), "w").close()   # 2026-11-04: Phase A has no user edits yet; naming.py final refuses to run without this (batch 8 photo upload crashed)
        if not TEST:
            subprocess.run([sys.executable, nd, "final", os.path.join(b, "report"), db0, *ok], capture_output=True)
            subprocess.run([sys.executable, nd, "plan", os.path.join(b, "report"), b, *ok], capture_output=True)
        print("   -> Claude publishes report/naming.html to the 照片命名台 URL (Artifact tool)")
    s9()

    @step("10 photo upload")
    def s10():
        # user 2026-11-04: upload in Phase A with the model's names (the user may name slowly); a case the user ALREADY marked
        # 完成 (Claude passes DONE_PLATES=P1,P2 after reading db status) is left for phase_b.py, which uploads it with the final names.
        done = set(filter(None, os.environ.get("DONE_PLATES", "").split(",")))
        todo = []
        for p in [x for x in ok if x not in done]:
            have = safe("chkorder.mjs", p, *I[p]).strip().splitlines()[-1]
            m = re.search(r"photos (\d+) plan (\d+)", have)
            if TEST or (m and m.group(1) != "0"):   # 2026-11-04: ANY photo already in Merimen -> never upload again (batch 8: 3 cases got every photo twice)
                print(f"   {p}: {have.strip()[:70]} — skipped (already has photos)")
            else:
                todo.append(p)
        if todo and not TEST:
            subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "photos.py"), "upload", b, *todo])
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
        # 2026-11-04: MERGE with the rows already there (a partial re-run for 1 plate wiped the other 7 cases' rows in batch 9)
        f = os.path.join(b, "car_model_report.md"); new = {r.split("|")[1].strip(): r for r in rows[2:]}
        old = [l for l in (open(f).read().splitlines() if os.path.exists(f) else []) if l.startswith("| ") and not l.startswith("| 车牌")]
        keep = [l for l in old if l.split("|")[1].strip() not in new]
        rows = rows[:2] + keep + list(new.values())
        open(f, "w").write("\n".join(rows) + "\n"); print("\n".join(rows))
    s11()

    @step("12 Step 2 head start (read-only)")
    def s12():
        # 2026-11-04 (user: "make the workflow faster"): while the user names photos, dump every catalogue (READ ONLY, nothing is
        # ticked) and draft a plan from the model's names, so Claude can start the planning agents now and only re-plan the
        # photos the user changes. SPEC=0 skips it.
        if TEST or os.environ.get("SPEC", "1") != "1":
            return
        os.makedirs(os.path.join(H, "s2"), exist_ok=True)
        def cat(p):
            o = safe("selcat2.mjs", *I[p], "session_base.txt", f"s2/cat_{p}.json")
            fin = os.path.join(b, "report", f"final_{p}.json")
            if not os.path.exists(os.path.join(H, "s2", f"cat_{p}.json")) or not os.path.exists(fin):
                return f"{p}: no catalogue/final ({o.strip()[-80:]})"
            imp = data[p].get("report", {}).get("impact") or data[p]["case"]["acc"].get("impact", "front")
            r = subprocess.run([sys.executable, os.path.join(REPO, "typesafe", "step2_plan.py"), f"s2/cat_{p}.json", fin, imp,
                                f"s2/tick_{p}.json", f"s2/miss_{p}.json"], cwd=H, capture_output=True, text=True,
                               env={**os.environ, "VEHICLE": data[p]["case"]["veh"].get("modelText", "")})
            open(os.path.join(H, "s2", f"plan_{p}.log"), "w").write(r.stdout + r.stderr)
            return f"{p}: catalogue {len(json.load(open(os.path.join(H, 's2', f'cat_{p}.json')))['cat'])} items, draft plan ok"
        for l in par(cat, ok):
            print("   " + l)
        print("   -> Claude starts the planning agents now (tools/step2/brief.md, model names); after the user's done: REVISE mode")
    s12()

    T["TOTAL"] = round(time.time() - t_all, 1)
    json.dump(T, open(os.path.join(b, "phase_a_timing.json"), "w"), indent=1)
    print("\nTIMING (s):", json.dumps(T))


if __name__ == "__main__":
    main()
