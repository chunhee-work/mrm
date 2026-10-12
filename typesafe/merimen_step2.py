"""STEP 2 with TypeSafe judgments (#1 damage condition, #3 misc pricing).

Architecture change from the old version: the rules used to run as JavaScript
*inside* the page. Now the page is only read and written; the judgment happens in
Python. That is what makes the fallback and the review queue possible at all.

Fallback: if TypeSafe is unreachable, the old regex cascade still runs so a batch
is never blocked — but every regex-derived value is flagged for review, because a
silent `Bent` default is exactly what we were trying to get rid of.
"""
import json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from judgments import damage_conditions, misc_prices, CONDITIONS, MISC_PRICES
from client import TypeSafeError

# ---- legacy cascade, kept only as an offline fallback -----------------------
_COND = [
    (r"bumper.*retainer", "Bracket cracked"), (r"bracket", "Bracket cracked"),
    (r"weather sheeting|wheel hub|wheel bearing", "Necessary"),
    (r"weatherstrip|weather strip", "Cut"), (r"bumper.*sensor|sensor.*bumper", "Cut"),
    (r"mirror", "Broken"), (r"support strut|\bstrut\b", "Broken"),
    (r"windscreen|windshield", "Broken"), (r"centre guide|center guide", "Broken"),
    (r"spare wheel well|wheel well", "Broken"), (r"lock|striker|hinge", "Bent"),
    (r"lamp panel", "Bent"), (r"reinforcement", "Bent"), (r"liner", "Damage"),
    (r"reflector|fog lamp|lamp assembly|head ?lamp|signal lamp|tail ?lamp|\blamp\b", "Cracked"),
    (r"glass|window", "Cracked"), (r"sensor", "Necessary"),
    (r"clip|retainer|\bguide\b|nozzle|grommet|washer", "Necessary"),
    (r"trim|finisher|garnish|moulding|spoiler|skirt|\bvent\b|badge|emblem|grille|\bmask\b|valance|\bcover\b|cladding|\bflap\b|deflector", "Broken"),
    (r"rim|tyre|wheel", "Bent"),
    (r"absorber|control arm|tie rod|crossmember|drive ?shaft|stabilizer|\blink\b|knuckle", "Bent"),
    (r"panel|tailgate|boot ?lid|bonnet|fender|quarter|\bdoor\b|floor|wheelhouse|member|pillar|roof|firewall|apron|\bdeck\b|body side|support", "Bent"),
    (r"bumper", "Broken"),
]

def _legacy_cond(name):
    n = (name or "").lower()
    for rx, v in _COND:
        if re.search(rx, n):
            return v
    return "Bent"


def decide_conditions(part_rows, vehicle, impact_area):
    """[(row_id, part_name)] -> {row_id: {'value','ok','confidence','source'}}"""
    try:
        out = damage_conditions(part_rows, vehicle, impact_area)
        for r in out:
            out[r]["source"] = "typesafe"
        return out
    except TypeSafeError as e:
        sys.stderr.write("TypeSafe unavailable (%s) — falling back to regex\n" % e)
        return {rid: {"value": _legacy_cond(name), "ok": False, "confidence": 0.0,
                      "source": "regex-fallback",
                      "review": "regex fallback, not a judgment"}
                for rid, name in part_rows}


def decide_misc(misc_rows):
    """[(row_id, line_text)] -> {row_id: {'price' or None, ...}}"""
    try:
        return misc_prices(misc_rows)
    except TypeSafeError as e:
        sys.stderr.write("TypeSafe unavailable (%s) — misc lines left unpriced\n" % e)
        return {r: {"ok": False, "value": None, "price": None, "confidence": 0.0,
                    "review": "TypeSafe unavailable"} for r, _ in misc_rows}


# ---- page I/O ---------------------------------------------------------------
READ_ROWS = r'''(function(){
function rowName(el){if(!el)return "";var tr=el.closest("tr");if(!tr)return "";
 var td=tr.querySelectorAll("td");
 for(var i=0;i<td.length;i++){var t=(td[i].textContent||"").replace(/\s+/g," ").trim();
  if(!t)continue; if(/^[<>=*]+$/.test(t))continue; return t;} return "";}
function q(n){return document.querySelector('[name="'+n+'"]');}
var pc=parseInt((q("PROWCNT")||{}).value||"0",10), mc=parseInt((q("MROWCNT")||{}).value||"0",10);
var parts=[],misc=[];
for(var i=0;i<=pc;i++){var p=q("PDC"+i); if(!p||p.readOnly)continue;
 var n=rowName(q("PPT"+i))||rowName(p); if(n)parts.push([String(i),n]);}
for(var k=0;k<=mc;k++){var m=q("MMI"+k); if(!m||m.readOnly)continue;
 var n2=rowName(m); if(n2)misc.push([String(k),n2]);}
return JSON.stringify({prowcnt:pc,mrowcnt:mc,parts:parts,misc:misc});})()'''


def write_js(cond_map, misc_map):
    """Build the JS that writes the decided values back into the page."""
    conds = {r: v["value"] for r, v in cond_map.items() if v.get("value")}
    prices = {r: v["price"] for r, v in misc_map.items() if v.get("price")}
    return ('(function(){var C=%s,M=%s;'
            'function q(n){return document.querySelector(\'[name="\'+n+\'"]\');}'
            'function fire(e){e.dispatchEvent(new Event("input",{bubbles:true}));'
            'e.dispatchEvent(new Event("change",{bubbles:true}));}'
            'var sp=0,sm=0;'
            'for(var r in C){var p=q("PDC"+r);if(p&&!p.readOnly){p.value=C[r];fire(p);sp++;}}'
            'for(var k in M){var m=q("MMI"+k);if(m&&!m.readOnly){m.value=M[k];fire(m);sm++;}}'
            'var cb=q("MPWCB1")||document.getElementById("MPWCB1");'
            'var pv=q("MPWCV1")||document.getElementById("MPWCV1");'
            'if(cb&&!cb.checked)cb.click();'
            'if(pv){pv.readOnly=false;pv.value="500.00";fire(pv);}'
            '[].forEach.call(document.querySelectorAll("img"),function(im){im.style.pointerEvents="none";});'
            'return JSON.stringify({setP:sp,setM:sm,paintChk:(cb?cb.checked:"noCB"),'
            'paintVal:(pv?pv.value:"noPV")});})()'
            % (json.dumps(conds), json.dumps(prices)))


def run_case(js, tab, url, vehicle, impact_area, ready_fn):
    """js/tab/ready_fn come from the Merimen driver. Returns a report dict."""
    ready_fn(tab)
    rows = json.loads(js(tab, READ_ROWS))
    if not rows["parts"]:
        return {"status": "parts-not-selected", "prowcnt": rows["prowcnt"]}
    parts = [(r, n) for r, n in rows["parts"]]
    miscs = [(r, n) for r, n in rows["misc"]]
    cond_map = decide_conditions(parts, vehicle, impact_area)
    misc_map = decide_misc(miscs) if miscs else {}
    js(tab, write_js(cond_map, misc_map))
    review = [{"row": r, "name": dict(parts).get(r), **v}
              for r, v in cond_map.items() if not v.get("ok")]
    review += [{"row": r, "name": dict(miscs).get(r), **v}
               for r, v in misc_map.items() if not v.get("ok")]
    return {"status": "filled", "parts": len(parts), "misc_priced":
            sum(1 for v in misc_map.values() if v.get("price")),
            "needs_review": review,
            "sources": sorted({v.get("source", "typesafe") for v in cond_map.values()})}
