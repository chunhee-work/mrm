#!/usr/bin/env python3
"""Read RC (JPJ registration card) screenshots with the Claude API (Opus 5.5), then let Jev check each field.

  python3 tools/batch/rc_api.py <tiles_dir> <cases.json> <out.json> [PAR=6]
  cases.json = [{"plate","chosen"}]; tiles = <tiles_dir>/<PLATE>_1..4.png (pages 1-4).
API key: macOS Keychain service "anthropic-api" (the user adds it: security add-generic-password -s anthropic-api -a <name> -w).
Jev (TypeSafe, typesafe/client.py, TYPESAFE_API_KEY) answers yes/no: does the card really show this model / cc / date?
"""
import base64, json, os, subprocess, sys, time, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
import threading
LOCK = threading.Lock()
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "..", "..", "typesafe"))
MODEL = os.environ.get("RC_MODEL", "claude-opus-5-5")
KEY = subprocess.run(["security", "find-generic-password", "-s", "anthropic-api", "-w"], capture_output=True, text=True).stdout.strip()
if not KEY: sys.exit('No Keychain entry "anthropic-api". Run: security add-generic-password -s anthropic-api -a <name> -w')
D, CASES, OUT = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
PAR = int(sys.argv[4]) if len(sys.argv) > 4 else 6
res = json.load(open(OUT)) if os.path.exists(OUT) else {}
PROMPT = """These are pages from a Malaysian motor-claim document bundle. Find the vehicle registration card (JPJ "Sijil Pemilikan Kenderaan", the old "Perakuan Pendaftaran Kenderaan", or the MyJPJ app screen) and copy exactly what it says, in capitals as printed:
rcModel = "Buatan/Nama Model" (old cards: "MAKE / MODEL"), cc = "Keupayaan Enjin", body_year = "Jenis Badan/Tahun Dibuat", regDate = "Tarikh Pendaftaran" (dd/mm/yyyy), status = "Status Asal", plate = "No. Pendaftaran", page = the page number (1-based, as given) where the card is, unsure = list of fields you could not read clearly.
Read every digit carefully; never guess. Do not copy names, IC numbers or addresses. If there is no registration card, set rcModel "NOT FOUND" and put in note what the pages are and any model named by another document (e.g. "insurance says: ...").
Answer with ONLY one JSON object: {"rcModel","cc","body_year","regDate","status","plate","page","unsure","note"}."""

def img(p):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(open(p, "rb").read()).decode()}}

def claude(pages):
    content = []
    for n, p in pages: content += [{"type": "text", "text": "Page %d:" % n}, img(p)]
    content.append({"type": "text", "text": PROMPT})
    body = json.dumps({"model": MODEL, "max_tokens": 2500, "messages": [{"role": "user", "content": content}]}).encode()
    for a in range(4):
        try:
            rq = urllib.request.Request("https://api.anthropic.com/v1/messages", body, {"x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            r = json.load(urllib.request.urlopen(rq, timeout=120))
            t = "".join(c.get("text", "") for c in r["content"]); u = r.get("usage", {})
            if "{" not in t or "}" not in t: return {"rcModel": "ERROR", "note": "no json: " + t[:300] + " | stop=" + str(r.get("stop_reason"))}
            j = json.loads(t[t.index("{"):t.rindex("}") + 1]); j["_tok"] = u.get("input_tokens", 0) + u.get("output_tokens", 0); return j
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 529): time.sleep(5 * (a + 1)); continue
            return {"rcModel": "ERROR", "note": "HTTP %d %s" % (e.code, e.read()[:200])}
        except Exception as e:
            time.sleep(3); err = str(e)[:150]
    return {"rcModel": "ERROR", "note": err}

def jev(page_png, r):
    try:
        import client
    except Exception as e:
        return {"err": "jev client: %s" % e}
    ref = str(uuid.uuid4()); q = {}
    for f, label in (("rcModel", "Buatan/Nama Model"), ("cc", "Keupayaan Enjin"), ("regDate", "Tarikh Pendaftaran")):
        if r.get(f): q[f] = {"type": "noul", "instructions": 'Does the registration card in `photo` show %s exactly as "%s"? Answer no if any letter or digit differs.' % (label, r[f])}
    try:
        a = client.ask({"photo": ref}, q, model=os.environ.get("JEV", "jev-preview"), images=True,
                       assets={ref: {"type": "image", "format": "png", "data_base64": base64.b64encode(open(page_png, "rb").read()).decode()}})
        out = {}
        for k in q:
            x = client.answer(a, k); v, cf = (x.get("value"), x.get("confidence")) if isinstance(x, dict) else (x[0], x[1]); out[k] = v; out.setdefault("_conf", {})[k] = cf
        return out
    except Exception as e:
        return {"err": str(e)[:150]}

def one(c):
    p = c["plate"]
    if p in res and res[p].get("rcModel") not in ("ERROR", None): return
    t = [(n, os.path.join(D, "%s_%d.png" % (p, n))) for n in (1, 2, 3, 4)]
    t = [x for x in t if os.path.exists(x[1])]
    r = claude(t[:2])
    if str(r.get("rcModel", "")).startswith("NOT FOUND") and len(t) > 2: r = claude(t)
    r["chosen"] = c.get("chosen", "")
    if r.get("rcModel") not in ("ERROR",) and not str(r.get("rcModel", "")).startswith("NOT FOUND") and os.environ.get("JEV_CHECK", "1") == "1":
        pg = int(r.get("page") or 1); pg = pg if 1 <= pg <= len(t) else 1
        r["jev"] = jev(t[pg - 1][1], r)
    with LOCK: res[p] = r

with ThreadPoolExecutor(PAR) as ex:
    for i, _ in enumerate(ex.map(one, CASES)):
        if i % 20 == 0:
            with LOCK: snap = dict(res)
            json.dump(snap, open(OUT + ".tmp", "w"), indent=1, ensure_ascii=False); os.replace(OUT + ".tmp", OUT); print(i, flush=True)
json.dump(res, open(OUT, "w"), indent=1, ensure_ascii=False)
v = list(res.values()); print("done", len(v), "tokens", sum(x.get("_tok", 0) for x in v), "errors", sum(1 for x in v if x.get("rcModel") == "ERROR"))
