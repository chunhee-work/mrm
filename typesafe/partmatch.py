"""Match photo-artifact part names to the case's Merimen Select Parts catalogue (token overlap, side must agree)."""
import re
SYN = [(r"^rear bumper$", "bumper rear cover"), (r"^front bumper$", "bumper front cover"),
       (r"^rear bumper (.*)", r"bumper rear \1"), (r"^front bumper (.*)", r"bumper front \1"),
       (r"^rear lamp (outer |inner )?(lh|rh)$", r"lamp assembly rear \2 tts"), (r"^rear rh taillamp$", "lamp assembly rear rh tts"),
       (r"^headlamp (lh|rh)$", r"headlamp assy \1"), (r"^quarter panel (lh|rh)$", r"quarter panel outer \1"),
       (r"^quarter liner (lh|rh)$", r"quarter panel liner rear \1"), (r"^rear chassis member (lh|rh)$", r"chassis member rear \1"),
       (r"^front chassis member (lh|rh)$", r"chassis member front \1"), (r"^fender (lh|rh)$", r"fender front \1"),
       (r"^rear wheelhouse (lh|rh)$", r"wheel house inner rear \1"), (r"^grille front$", "grille"),
       (r"^rear number plate$", "number plate rear"), (r"^front number plate$", "number plate front"),
       (r"^rear bumper spoiler$", "spoiler bumper rear"), (r"^front bumper spoiler$", "spoiler bumper front")]
STOP = {"tts", "all", "assy", "assembly", "cover"}
def norm(s):
    s = re.sub(r"\[.*?\]|\(.*?\)", " ", s.lower()); s = re.sub(r"^\S*\d\S*\s+", "", s)   # drop code like CT0421
    return s
def toks(s): return [w for w in re.findall(r"[a-z&]+", s) if w not in STOP]
def side(ts): return "lh" if "lh" in ts else "rh" if "rh" in ts else None
def variants(name):
    n = name.lower(); out = {n}
    for a, b in SYN:
        if re.match(a, n): out.add(re.sub(a, b, n))
    out |= {re.sub(r"bracket", "retainer", v) for v in out}
    return out
def best(name, catalog, allow_sideless=True):
    """catalog: list of (value, label). Every word of the name must be in the label; side must agree
    (a side-less catalogue item is accepted for an LH/RH name when no sided one exists)."""
    res = None
    for v in variants(name):
        tv = toks(v); sv = side(tv); A = set(tv) - {"lh", "rh"}
        for val, lab in catalog:
            if "as above" in lab: continue
            tl = toks(norm(lab)); sl = side(tl); B = set(tl) - {"lh", "rh"}
            if sl != sv and not (allow_sideless and sl is None and sv): continue
            cov = len(A & B) / max(len(A), 1)
            if cov < 1: continue
            sc = len(A & B) / max(len(A | B), 1) + (0.5 if sl == sv else 0)
            if not res or sc > res[2]: res = (val, lab, sc)
    return res
