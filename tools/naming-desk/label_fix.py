#!/usr/bin/env python3
"""Make the 部位标注台 follow ALL naming rules (user 2026-10-31: never show names the user banned; merged names add up their %).
  python3 label_fix.py <label.html> <task json dir> [...more dirs]
Collects every name the page can show (NAMES list, task guess/merimen/nb/segs names), runs name_map.final() on each and writes
`const FIX={old:new|null}` into the page; canon() looks names up there first (null = banned -> hidden)."""
import ast, glob, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "typesafe", "photo_train"))
from name_map import final
page = sys.argv[1]; s = open(page, encoding="utf-8").read()
names = set(json.loads(re.search(r"const NAMES=(\[.*?\]);", s, re.S).group(1)))
def lst(v):
    if isinstance(v, str):
        try: return ast.literal_eval(v)
        except Exception: return []
    return v or []
for d in sys.argv[2:]:
    for f in glob.glob(os.path.join(d, "*.json")):
        t = json.load(open(f))
        names.update(x for x in lst(t.get("guess")) if isinstance(x, str))
        if isinstance(t.get("merimen"), str): names.add(t["merimen"])
        for n in lst(t.get("nb")):
            if isinstance(n, dict) and isinstance(n.get("name"), str): names.add(n["name"])
        for g in lst(t.get("segs")):
            if isinstance(g, dict) and isinstance(g.get("name"), str): names.add(g["name"])
fix = {}
for n in sorted(x for x in names if x):
    f = final(n)
    if f != n: fix[n] = f
fixjs = "const FIX=" + json.dumps(fix, ensure_ascii=False) + ";"
s = re.sub(r"const FIX=\{.*?\};\n?", "", s, flags=re.S)
s = s.replace("const RENAME=[", fixjs + "\nconst RENAME=[", 1)
if "FIX_HOOK" not in s:
    s = s.replace("const canon=n=>{if(!n)return n;", "const canon=n=>{if(!n)return n;/*FIX_HOOK*/if(Object.prototype.hasOwnProperty.call(FIX,n)){if(FIX[n]===null)return '__BAN__';n=FIX[n]}", 1)
    s = s.replace("const MULTI=n=>", "const MULTI=n=>n==='__BAN__'||", 1)
# the typing list: only allowed, final names
newnames = sorted({(fix.get(n, n)) for n in json.loads(re.search(r"const NAMES=(\[.*?\]);", s, re.S).group(1)) if fix.get(n, n)})
s = re.sub(r"const NAMES=\[.*?\];", "const NAMES=" + json.dumps(newnames, ensure_ascii=False) + ";", s, count=1, flags=re.S)
open(page, "w", encoding="utf-8").write(s)
print(len(names), "names checked,", len(fix), "renamed,", sum(1 for v in fix.values() if v is None), "banned; NAMES", len(newnames))
