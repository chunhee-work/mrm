#!/usr/bin/env python3
"""Download every case's photos + Merimen captions into photo_train/data (resumable).
Captions are stored exactly as Merimen has them; nothing is renamed."""
import base64, html, json, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import driver as d

DATA = os.path.join(HERE, "data")
INDEX = os.path.join(HERE, "index.jsonl")
DONE = os.path.join(HERE, "done_cases.txt")
LOGIN = "https://www.merimen.com.my/claims/index.cfm?skip_browsertest=1&"

ROW = re.compile(r'SVCDOCObjRow\(ds,(\d+),(\d+),(\d+),"[^"]*",\d+,"([^"]*)",\s*"([^"]*)"')


def xget(tab, u):
    return d.js(tab, '(function(){var x=new XMLHttpRequest();x.open("GET",%s,false);x.send();return x.responseText;})()' % json.dumps(u))


def relogin(tab):
    # 2026-11-06: NEVER log in with a password (CLAUDE.md). Flag it (login_watch.sh -> push notification to the user) and stop.
    f = os.path.expanduser("~/mrm-bot/state/NEED_LOGIN"); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, "w").write(time.strftime("%H:%M:%S") + " harvest")
    os.system('osascript -e \'display notification "Merimen logged out (harvest stopped): cd ~/mrm-bot && node relogin.mjs" with title "MRM: please log in"\'')
    print("LOGGEDOUT: harvest stopped, waiting for the user's relogin", flush=True); sys.exit(3)


def photo_rows(tab, cid):
    for attempt in range(2):
        h = xget(tab, "/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docview&domainid=1&objid=%s&corole=4&%s" % (cid, d.sess()))
        if "cSDdocstate" in h:
            return [(m[0], html.unescape(m[4]).strip(), m[3]) for m in ROW.findall(h) if m[2] == "2"]
        relogin(tab)
    raise RuntimeError("docview unavailable for %s" % cid)


FETCH = ('(function(ids,q){window.__h={};var i=0,act=0;function nx(){while(act<12&&i<ids.length){(function(id){act++;'
         'fetch("/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_getfile&docid="+id+"&corole=4&"+q,{credentials:"include"})'
         '.then(function(r){return r.blob();}).then(function(b){return createImageBitmap(b);}).then(function(bm){'
         'var s=Math.min(1,256/Math.max(bm.width,bm.height)),c=document.createElement("canvas");c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);'
         'c.getContext("2d").drawImage(bm,0,0,c.width,c.height);window.__h[id]=c.toDataURL("image/jpeg",0.85);})'
         '.catch(function(e){window.__h[id]="ERR "+e;}).then(function(){act--;nx();});})(ids[i++]);}}nx();return ids.length;})(%s,%s)')


STRONG = set(l.strip() for l in open(os.path.join(HERE, "strong_labels.txt"))) if os.path.exists(os.path.join(HERE, "strong_labels.txt")) else set()
NAMEMAP = {}
if os.path.exists(os.path.join(HERE, "name_map.tsv")):
    for _l in open(os.path.join(HERE, "name_map.tsv")):
        _p = _l.rstrip("\n").split("\t")
        if len(_p) == 4 and _p[2]: NAMEMAP[_p[0]] = _p[2]


def official(name):
    return NAMEMAP.get(name.strip(), name.strip())


def harvest_case(tab, cid, plate):
    rows = photo_rows(tab, cid)
    if not rows or mostly_generic(rows):
        return 0
    rows = [r for r in rows if not is_generic(r[1])]
    # user 2026-10-12: skip photos of items the model already knows well (strong_labels.txt),
    # but keep a strong photo when it sits right next to a weak one (context for zoom/side).
    weak = [official(r[1]) not in STRONG for r in rows]
    if RARE:   # 2026-11-06 user: only photos of parts with < 100 training photos (+ the photo before/after for context)
        weak = [official(r[1]) in RARE for r in rows]
        if not any(weak):
            return 0
    keep = [weak[i] or (i > 0 and weak[i - 1]) or (i + 1 < len(rows) and weak[i + 1]) for i in range(len(rows))]
    ids = [r[0] for r, k in zip(rows, keep) if k]
    d.js(tab, FETCH % (json.dumps(ids), json.dumps(d.sess() + "&RID=0")))
    for _ in range(120):
        time.sleep(0.7)
        if int(d.js(tab, 'Object.keys(window.__h||{}).length')) >= len(ids):
            break
    os.makedirs(os.path.join(DATA, cid), exist_ok=True)
    n = 0
    got = {}
    for i in range(0, len(ids), 25):
        part = ids[i:i + 25]
        got.update(json.loads(d.js(tab, '(function(a){var o={};a.forEach(function(k){o[k]=window.__h[k]||"";});return JSON.stringify(o);})(%s)' % json.dumps(part))))
    with open(INDEX, "a") as idx:
        for seq, (docid, name, stamp) in enumerate(rows, 1):
            u = got.get(docid, "")
            if not u.startswith("data:image"):
                continue
            fn = os.path.join(cid, "%03d_%s.jpg" % (seq, docid))
            open(os.path.join(DATA, fn), "wb").write(base64.b64decode(u.split(",", 1)[1]))
            idx.write(json.dumps({"cid": cid, "plate": plate, "seq": seq, "docid": docid,
                                  "name": name, "stamp": stamp, "file": fn}) + "\n")
            n += 1
    d.js(tab, 'window.__h=null;1')
    return n


RARE = set()
if os.environ.get("RARE_ONLY") == "1":
    RARE = {x["name"] for x in json.load(open(os.path.join(HERE, "rare_lt100.json")))}
PAUSE = os.path.expanduser("~/mrm-bot/state/PAUSE_HARVEST")   # Claude touches it while doing cases; harvest waits
GENERIC = {"photographs of damaged parts", "4 angles of vehicle photos", "tyres", "photos", "others"}
DEADLINE = float(os.environ.get("DEADLINE", "0"))
MIN_FREE_GB = 15


GEN_RX = re.compile(r"pho\w*\s+of\s+da|damaged parts|damgaed|damgfed|after repair|accident scene|^4 angles", re.I)


def is_generic(name):
    return name.strip().lower() in GENERIC or bool(GEN_RX.search(name))


def mostly_generic(rows):
    g = sum(is_generic(r[1]) for r in rows)
    return g >= 0.8 * len(rows)


if __name__ == "__main__":
    import shutil
    cases = json.load(open(os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else "cases.json")))
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    d.attach(); tab = d.T()
    total = 0
    todo = sorted((c for c in cases if c not in done), key=int, reverse=True)
    print("cases", len(cases), "todo", len(todo), flush=True)
    for k, cid in enumerate(todo, 1):
        while os.path.exists(PAUSE):
            time.sleep(30)
        if DEADLINE and time.time() > DEADLINE:
            print("STOP: time budget reached", flush=True); break
        if shutil.disk_usage(HERE).free < MIN_FREE_GB * 1e9:
            print("STOP: disk space below %d GB" % MIN_FREE_GB, flush=True); break
        try:
            n = harvest_case(tab, cid, cases[cid])
            total += n
            open(DONE, "a").write(cid + "\n")
            print("%d/%d %s %s photos=%d total=%d" % (k, len(todo), cid, cases[cid], n, total), flush=True)
        except Exception as e:
            print("%d/%d %s ERR %s" % (k, len(todo), cid, str(e)[:150]), flush=True)
            if "not found" in str(e) or "missing value" in str(e):
                try:
                    tab = d.attach(); relogin(tab)
                    n = harvest_case(tab, cid, cases[cid]); total += n
                    open(DONE, "a").write(cid + "\n")
                    print("%d/%d %s retry ok photos=%d total=%d" % (k, len(todo), cid, n, total), flush=True)
                except Exception as e2:
                    print("%d/%d %s retry ERR %s" % (k, len(todo), cid, str(e2)[:150]), flush=True)
                    time.sleep(30)
