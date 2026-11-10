#!/usr/bin/env python3
"""Jev page triage (v2) for a whole batch, so step 1 reads only the pages it needs (user 2026-11-10).

  python3 page_index.py <batch_dir>        (intake.py starts it in the background; log: <batch_dir>/page_index.log)

Every case folder <batch_dir>/<PLATE>/*.pdf -> pages rendered at 100 dpi -> <batch_dir>/pages/<PLATE>/<pdf>_p<NN>.png
-> one Jev ask per page (typesafe/judgments.triage_page_image, 6 threads) -> <batch_dir>/page_index.json:
  {"cases": {PLATE: {"pages": [{pdf, page, doc_type, conf, ours, ours_conf, blamed, png_path}],
                     "needs_check": [pages with doc_type conf < 0.7],
                     "maybe_missing": {"draft": true, "items": [...]}}}, "summary": {...}}
maybe_missing is a DRAFT hint only: never send "<PLATE> pending" from it; open the pages first (playbook 00/01).
Runs under /usr/bin/python3 or typesafe/photo_train/.venv/bin/python (both have PyMuPDF; client.py is stdlib).
Offline apart from the Jev API: no Merimen, no messages.
"""
import json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "typesafe"))
PLATE = re.compile(r"^[A-Z]{1,3}\d{1,4}[A-Z]?$")
DPI, THREADS, CHECK = 100, 6, 0.7
# documents step 1 needs; own=True -> the page must also be on OUR side (ours >= 0.5)
NEED = {"RC": (["vehicle_ownership_certificate"], True),
        "our insurance": (["insurance_schedule_or_cover_note"], True),
        "our police report": (["police_report"], True),
        "Keputusan": (["police_investigation_result"], False),
        "I-search": (["isearch_report"], False)}


def render(b):
    import fitz
    jobs = []
    for plate in sorted(os.listdir(b)):
        d = os.path.join(b, plate)
        if not (os.path.isdir(d) and PLATE.match(plate)):
            continue
        out = os.path.join(b, "pages", plate); os.makedirs(out, exist_ok=True)
        for f in sorted(x for x in os.listdir(d) if x.lower().endswith(".pdf")):
            stem = re.sub(r"[^A-Za-z0-9]+", "_", os.path.splitext(f)[0]).strip("_")
            try:
                doc = fitz.open(os.path.join(d, f))
            except Exception as e:
                print(f"{plate}: cannot open {f}: {e}"); continue
            for i, pg in enumerate(doc):
                pix = pg.get_pixmap(dpi=DPI); png = os.path.join(out, f"{stem}_p{i + 1:02d}.png")
                if not os.path.exists(png):
                    pix.save(png)
                jobs.append({"plate": plate, "pdf": f, "page": i + 1, "png_path": png, "jpg": pix.tobytes("jpg", jpg_quality=85)})
    return jobs


def one(j):
    from judgments import triage_page_image
    t = time.time()
    for attempt in range(6):
        try:
            r = triage_page_image(j["jpg"], j["plate"]); break
        except Exception as e:
            if attempt < 5 and any(c in str(e) for c in ("529", "429", "timed out", "connection")):
                time.sleep(2 + 2 * attempt); continue
            r = {"doc_type": None, "conf": 0.0, "ours": None, "ours_conf": 0.0, "blamed": None, "blamed_conf": 0.0,
                 "error": str(e)[:200]}
            break
    rnd = lambda v: round(v, 3) if isinstance(v, float) else v
    return {"pdf": j["pdf"], "page": j["page"], **{k: rnd(v) for k, v in r.items()}, "png_path": j["png_path"],
            "sec": round(time.time() - t, 2), "_plate": j["plate"]}


def main():
    b = os.path.abspath(sys.argv[1]); t0 = time.time()
    jobs = render(b); t1 = time.time()
    with ThreadPoolExecutor(THREADS) as ex:
        res = list(ex.map(one, jobs))
    t2 = time.time(); cases = {}
    for r in res:
        cases.setdefault(r.pop("_plate"), {"pages": []})["pages"].append(r)
    for plate in sorted(p for p in os.listdir(b) if os.path.isdir(os.path.join(b, p)) and PLATE.match(p)):
        cases.setdefault(plate, {"pages": []})   # a case with no PDF at all
    for plate, c in cases.items():
        P = c["pages"]
        c["needs_check"] = [{"pdf": p["pdf"], "page": p["page"], "doc_type": p["doc_type"], "conf": p["conf"],
                             "png_path": p["png_path"]} for p in P if (p["conf"] or 0) < CHECK]
        miss = []
        for name, (types, own) in NEED.items():
            if not any(p["doc_type"] in types and (not own or (p["ours"] or 0) >= 0.5) for p in P):
                miss.append(name)
        c["maybe_missing"] = {"draft": True, "items": miss,
                              "note": "DRAFT hint only. Open the pages (and every needs_check page) before any '<PLATE> pending' line."}
        c["blamed_pages"] = [f'{p["pdf"]} p{p["page"]}' for p in P if (p["blamed"] or 0) >= 0.5]
    errors = sum(1 for r in res if "error" in r)
    summary = {"cases": len(cases), "pages": len(res), "errors": errors, "needs_check": sum(len(c["needs_check"]) for c in cases.values()),
               "render_sec": round(t1 - t0, 1), "jev_sec": round(t2 - t1, 1), "total_sec": round(t2 - t0, 1),
               "dpi": DPI, "threads": THREADS, "conf_check": CHECK, "made": time.strftime("%Y-%m-%d %H:%M:%S")}
    json.dump({"summary": summary, "cases": cases}, open(os.path.join(b, "page_index.json"), "w"), indent=1, ensure_ascii=False)
    for plate, c in sorted(cases.items()):
        print(f'{plate}: {len(c["pages"])} pages · needs_check {len(c["needs_check"])} · maybe_missing (draft) {c["maybe_missing"]["items"] or "-"}')
    print("page_index.json:", json.dumps(summary))


if __name__ == "__main__":
    main()
