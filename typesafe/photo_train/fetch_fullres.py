#!/usr/bin/env python3
"""READ-ONLY: fetch original-size Merimen photos (scaled to max 1280 px) for labeling-tool tasks.
  python3 fetch_fullres.py tasks.json out_dir     (task: id, cid, seq; also nb files named <id>_<k>.jpg)"""
import base64, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import driver as d
T = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
doc = {}
for l in open(os.path.join(HERE, "index.jsonl")):
    try: r = json.loads(l)
    except ValueError: continue
    doc[(r["cid"], int(r["seq"]))] = r["docid"]
tab = d.T()
JS = ('(function(id,q){window.__f=null;fetch("/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_getfile&docid="+id+"&corole=4&"+q,{credentials:"include"})'
      '.then(function(r){return r.blob();}).then(function(b){return createImageBitmap(b);}).then(function(bm){'
      'var s=Math.min(1,1280/Math.max(bm.width,bm.height)),c=document.createElement("canvas");c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);'
      'c.getContext("2d").drawImage(bm,0,0,c.width,c.height);window.__f=c.toDataURL("image/jpeg",0.88);}).catch(function(e){window.__f="ERR "+e;});return 1;})(%s,%s)')
def get(docid):
    d.js(tab, JS % (json.dumps(docid), json.dumps(d.sess() + "&RID=0")))
    for _ in range(60):
        time.sleep(0.5); u = d.js(tab, "window.__f||''")
        if u: return u
    return ""
for t in T:
    jobs = [(t["id"] + ".jpg", int(t["seq"]))] + [("%s_%d.jpg" % (t["id"], -n["rel"]), int(t["seq"]) + n["rel"]) for n in t.get("nb", [])]
    for fn, seq in jobs:
        p = os.path.join(OUT, fn)
        if os.path.exists(p): continue
        di = doc.get((t["cid"], seq))
        if not di: print(fn, "no docid"); continue
        u = get(di)
        if u.startswith("data:image"):
            open(p, "wb").write(base64.b64decode(u.split(",", 1)[1])); print(fn, "ok", flush=True)
        else: print(fn, "fail", u[:60], flush=True)
