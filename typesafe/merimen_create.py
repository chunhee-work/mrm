"""Judgment #2 (model variant) and #5 (loss description) wired for the create /
report steps. Both SELECT from the live <option> lists, so per-insurer option
codes stop mattering."""
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from judgments import pick_model_variant, loss_description
from client import TypeSafeError

READ_MODEL_OPTIONS = r'''(function(re){var s=document.querySelector('[name="ddlbModel"]');
 if(!s)return "[]"; var r=new RegExp(re,"i");
 return JSON.stringify([...s.options].filter(function(o){return o.value&&r.test(o.text);})
   .map(function(o){return [o.value,o.text.trim()];}));})'''

SET_MODEL = r'''(function(txt){var s=document.querySelector('[name="ddlbModel"]');
 var o=[...s.options].find(function(x){return x.text.trim()===txt;});
 if(!o)return "NOTFOUND"; s.value=o.value;
 s.dispatchEvent(new Event("change",{bubbles:true}));
 return o.value+"="+o.text.trim();})'''


def apply_exact(js, tab, text):
    """Operator-confirmed variant: write it, no judgment, no gate."""
    r = js(tab, SET_MODEL + "(%s)" % json.dumps(text))
    return {"ok": r != "NOTFOUND", "value": text, "confidence": 1.0,
            "source": "operator-confirmed", "applied": None if r == "NOTFOUND" else r}


def choose_model(js, tab, make_filter, rc_line, insurance_line, reg_date, chassis, cc, notes=None):
    """Replaces par3.pick_model(). make_filter narrows the option list (e.g. 'MYVI').
    Returns the judgment dict; caller decides whether to write it."""
    # The model list is populated by an async callback after ddlbMan changes; a big
    # make (Mazda has 363 entries) can still be empty when we first look.
    opts = []
    for _ in range(10):
        opts = json.loads(js(tab, READ_MODEL_OPTIONS + "(%s)" % json.dumps(make_filter)))
        if opts:
            break
        time.sleep(3)
    if not opts:
        total = js(tab, '(function(){var s=document.querySelector(\'[name="ddlbModel"]\');return s?s.options.length:0;})()')
        return {"ok": False, "value": None,
                "review": "no options matched filter %r (list had %s entries)" % (make_filter, total)}
    texts = [t for _v, t in opts]
    try:
        r = pick_model_variant(texts, rc_line, insurance_line, reg_date, chassis, cc, notes)
    except TypeSafeError as e:
        return {"ok": False, "value": None, "review": "TypeSafe unavailable: %s" % e}
    r["candidates"] = len(texts)
    if r["ok"] and r["value"] and r["value"] != "__none__":
        r["applied"] = js(tab, SET_MODEL + "(%s)" % json.dumps(r["value"]))
    else:
        # never auto-write a low-confidence model: RM12 per mistake after 3 days
        r["applied"] = None
    return r


READ_LOSS_OPTIONS = r'''(function(){
 function opts(n){var s=document.querySelector('[name="'+n+'"]');
  return s?[...s.options].filter(function(o){return o.value;}).map(function(o){return o.text.trim();}):[];}
 return JSON.stringify({loss:opts("ddlbLossDesc"),coll:opts("ddlbCollType")});})()'''

SET_BY_TEXT = r'''(function(n,txt){var s=document.querySelector('[name="'+n+'"]');
 var o=[...s.options].find(function(x){return x.text.trim()===txt;});
 if(!o)return "NOTFOUND"; s.value=o.value;
 s.dispatchEvent(new Event("change",{bubbles:true})); return o.value;})'''


def choose_loss(js, tab, police_narrative, damage_seen, at_fault_kind):
    """Replaces the hard-coded lossdescid/colltype in rdata*.py."""
    o = json.loads(js(tab, READ_LOSS_OPTIONS))
    if not o["loss"]:
        return {"ok": False, "review": "ddlbLossDesc empty - set ddlbDAMTYPE first"}
    try:
        r = loss_description(o["loss"], o["coll"], police_narrative, damage_seen, at_fault_kind)
    except TypeSafeError as e:
        return {"ok": False, "review": "TypeSafe unavailable: %s" % e}
    for key, field in (("loss_desc", "ddlbLossDesc"), ("collision_type", "ddlbCollType")):
        g = r[key]
        if g["ok"] and g["value"] and g["value"] != "__none__":
            g["applied"] = js(tab, SET_BY_TEXT + "(%s,%s)" % (json.dumps(field), json.dumps(g["value"])))
    return r
