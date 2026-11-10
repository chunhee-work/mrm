#!/usr/bin/env python3
"""Route new WhatsApp messages from chong (2026-11-10). Called by wa_watch.sh before it exits; it only PRINTS, Claude acts.
READ-ONLY on WhatsApp (sqlite mode=ro). Sends nothing, clicks nothing. Credentials in chat text are redacted before Jev sees them.
Design + test: typesafe/jev_wa_test.py (.json). Code rules for files first (name/size are reliable), Jev (TypeSafe) for the rest,
with confidence gates.
  python3 tools/whatsapp/wa_route.py <last_id>     # route incoming messages with Z_PK > last_id
  python3 tools/whatsapp/wa_route.py --test 30     # test: route the last 30 incoming messages (by time)
One line per burst (consecutive photos < 2 min apart + a short plate text just before/after them = one burst):
  ROUTE <category> <plate|-> <conf> <action> <short text>
Actions: AUTO_INTAKE (new batch -> intake.py), FILE_TO_CASE (file/photo to that plate's case), ASK_USER, LOG (chit-chat).
Text messages are never filed automatically. Jev failure -> ASK_USER (code rules for files still apply)."""
import base64, io, os, re, sqlite3, sys, time, uuid
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "typesafe"))
DB = os.path.expanduser("~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite")
WA = os.path.dirname(DB) + "/Message/"
EPOCH = 978307200
JID = "60176204606@%"
BURST_S = 120
G_CAT, G_PLATE = 0.85, 0.80          # gates: Jev category / plate pick
PEND_DAYS = 30

CATS = {
    "new_batch_file": "A zip (or set of files) with NEW cases to do: a workshop batch zip (sinar.zip, extreme.zip, LKH.zip, "
                      "autoflex.zip, VP AIRBRESH.zip...) or an all-documents zip/pdf for a NEW single case.",
    "missing_document_for_case": "A document or photo for ONE case we already have: RC/geran, police report, insurance policy, "
                                 "JPJ search, adjuster pdf (often a plate + doc name), usually answering our 'pending' notice.",
    "add_on_photos_for_existing_case": "Extra or replacement damage photos for ONE case we already have: an 'ADD FOTO' zip, "
                                       "a resend of the photos for one plate, a few more photos of the damage.",
    "answer_to_our_question": "A reply that answers a question or a 'pending/missing' notice we (the adjuster side) just sent.",
    "estimate_instruction_or_feedback": "An instruction, remark, correction or complaint about how we do the work: estimate/parts, "
                                        "photos, report, narratives, which Merimen account/workshop to use, a list of cases to check.",
    "chit_chat_or_ack": "Acknowledgement or small talk with no task: ok, tq, noted, a lone dot or emoji, greetings.",
    "other": "Anything else: salary/payment/receipts, a status question ('done?', 'report done?'), workshop address, unclear.",
}
ROLE = ("We are the adjuster team doing motor-claim reports in Merimen for chong, who runs several workshop accounts "
        "(Sinar, Extreme, LKH, Autoflex, VP Airbresh, Newvest, Autoris...). chong sends batches of cases as zips, then single "
        "documents/photos for cases we reported as pending, plus instructions and complaints. Malaysian car plates look like "
        "PLG158, VCD3926, BMC2457. 'geran' = RC (registration card). 'lawan' = the other party.")
PLATE = re.compile(r"\b([A-Z]{1,3} ?\d{1,4} ?[A-Z]?)\b")
NOT_PLATE = re.compile(r"^(JPJ|ADJ|PDF|MB|D|GOT|THE|OF|RM|RED|JUN|JUL|AND|TO|AT|IN|IMG|DOC|VID|PTT)\d")
SECRET = re.compile(r"(?i)(password|passw|pw|username|user id|merimen id|id)\s*[:=]\s*\S+")
KIND = {0: "text", 1: "photo", 8: "document", 2: "video", 14: "deleted", 15: "sticker"}


def redact(t): return SECRET.sub(r"\1: <redacted>", t or "")


def plates(s):
    out = []
    for p in PLATE.findall((s or "").upper()):
        p = p.replace(" ", "")
        if re.search(r"\d", p) and len(p) >= 4 and not NOT_PLATE.match(p) and p not in out: out.append(p)
    return out


def load():
    c = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    rows = c.execute("""select m.Z_PK, m.ZISFROMME, m.ZMESSAGEDATE+%d, m.ZMESSAGETYPE, coalesce(m.ZTEXT,''),
        coalesce(i.ZMEDIALOCALPATH,''), coalesce(i.ZFILESIZE,0), coalesce(i.ZTITLE,'')
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION=s.Z_PK left join ZWAMEDIAITEM i on m.ZMEDIAITEM=i.Z_PK
        where s.ZCONTACTJID like ? order by m.ZMESSAGEDATE, m.Z_PK""" % EPOCH, (JID,)).fetchall()
    c.close()
    return [dict(id=r[0], me=r[1], t=r[2], type=r[3], text=redact(r[4]), path=r[5], size=r[6], title=redact(r[7])) for r in rows]


def desc(m):
    s = KIND.get(m["type"], "type%d" % m["type"])
    if m["type"] == 8: s += " file '%s' (%.1f MB)" % (m["text"] or m["title"], m["size"] / 1e6)
    elif m["type"] == 1: s += (" caption '%s'" % m["title"]) if m["title"] else " (no caption)"
    elif m["text"]: s += ": " + m["text"]
    return s


def is_caption(m):
    """A short text that names a plate (e.g. 'PLG158 GERAN') can be the caption of the photos next to it."""
    return m["type"] == 0 and len(m["text"]) <= 60 and bool(plates(m["text"]))


def bursts(msgs, new):
    """Index groups of the NEW incoming messages (list of indexes into msgs, time order).
    Photos < 2 min apart = one burst; a short plate text right before or right after the photos = their caption."""
    out = []
    for i in new:
        m = msgs[i]; cur = out[-1] if out else None
        if cur and cur[-1] == i - 1 and m["t"] - msgs[cur[-1]]["t"] < BURST_S:
            p = msgs[cur[-1]]; texts = [j for j in cur if msgs[j]["type"] == 0]
            if m["type"] == 1 and (p["type"] == 1 or (len(cur) == 1 and is_caption(p))):
                cur.append(i); continue
            if is_caption(m) and p["type"] == 1 and not texts:
                cur.append(i); continue
        out.append([i])
    return out


def photos_of(msgs, g): return [j for j in g if msgs[j]["type"] == 1]


def caption(msgs, g):
    return " / ".join(x for x in [msgs[j]["text"] if msgs[j]["type"] == 0 else msgs[j]["title"] for j in g] if x)


def pending_notices(msgs, g):
    m = msgs[g[0]]
    return [msgs[j]["text"] for j in range(g[0] - 1, -1, -1) if msgs[j]["me"] and m["t"] - msgs[j]["t"] < PEND_DAYS * 86400
            and re.search(r"(?i)pending|missing", msgs[j]["text"])][:6]


def what(msgs, g):
    ph = photos_of(msgs, g)
    if len(g) == 1: return desc(msgs[g[0]])
    cap = caption(msgs, g)
    head = "photo" if len(ph) == 1 else "a burst of %d photos sent within %d s" % (len(ph), msgs[g[-1]]["t"] - msgs[g[0]]["t"])
    return "%s%s" % (head, (" with caption '%s'" % cap) if cap else " (no caption)")


def context(msgs, g):
    i0, i1 = g[0], g[-1]; m = msgs[i0]
    prev_out = next((msgs[j] for j in range(i0 - 1, -1, -1) if msgs[j]["me"]), None)
    near = [msgs[j] for j in range(max(0, i0 - 6), min(len(msgs), i1 + 7)) if j not in g and abs(msgs[j]["t"] - m["t"]) < 300]
    return {
        "this_message": what(msgs, g),
        "sent_at": time.strftime("%Y-%m-%d %H:%M", time.localtime(m["t"])),
        "our_last_message_before_it": (desc(prev_out) + " (%d min earlier)" % ((m["t"] - prev_out["t"]) // 60)) if prev_out else "none",
        "nearby_messages_within_5_min": ["%s: %s (%+d s)" % ("us" if x["me"] else "chong", desc(x), x["t"] - m["t"]) for x in near],
        "our_open_pending_notices_last_30_days": pending_notices(msgs, g) or ["none"],
        "who_is_who": ROLE,
    }


def candidates(st):
    ps = []
    for s in [st["this_message"]] + st["nearby_messages_within_5_min"] + [st["our_last_message_before_it"]] + st["our_open_pending_notices_last_30_days"]:
        for p in plates(s):
            if p not in ps: ps.append(p)
    return ps[:8]


def ask_jev(msgs, g):
    import client
    st = context(msgs, g); ps = candidates(st)
    qs = {"category": {"type": "choice", "instructions": "Classify `this_message` from chong (use the context only to understand it; classify THIS message).", "criteria": CATS}}
    if ps:
        crit = {p: "the case with plate %s" % p for p in ps}; crit["none"] = "no specific plate / a different or unknown case"
        qs["plate"] = {"type": "choice", "instructions": "Which case does `this_message` belong to?", "criteria": crit}
    assets = None; ph = photos_of(msgs, g)
    if len(ph) == 1:
        m = msgs[ph[0]]
        if m["path"] and os.path.exists(WA + m["path"]) and m["size"] < 2_000_000:
            try:
                from PIL import Image
                im = Image.open(WA + m["path"]).convert("RGB"); im.thumbnail((1568, 1568)); b = io.BytesIO(); im.save(b, "JPEG", quality=90)
                ref = str(uuid.uuid4()); st["photo"] = ref
                assets = {ref: {"type": "image", "format": "jpg", "data_base64": base64.b64encode(b.getvalue()).decode()}}
            except Exception: assets = None
    r = client.ask(st, qs, timeout=30, retries=2, images=bool(assets), assets=assets)
    v, c = client.answer(r, "category")
    pv, pc = client.answer(r, "plate") if ps else ("none", 0.0)
    if v not in CATS: raise RuntimeError("bad category %r" % (v,))
    return {"cat": v, "conf": float(c or 0), "plate": pv if pv not in (None, "none") else None, "plate_conf": float(pc or 0)}


def code_rule(msgs, g):
    """Files: name/size are reliable. Returns (category, plate, action) or None."""
    m = msgs[g[0]]
    if len(photos_of(msgs, g)) > 10: return ("new_batch_file", None, "AUTO_INTAKE")
    if len(g) != 1 or m["type"] != 8: return None
    name = (m["text"] or m["title"]).upper(); ps = plates(name); z = name.endswith(".ZIP")
    addon = bool(re.search(r"ADD\s*-?\s*(ON\s*)?(FOTO|PHOTO|GAMBAR|PIC)", name))
    if z and "ALL DOC" in name: return ("new_batch_file", ps[0] if ps else None, "AUTO_INTAKE")
    if ps: return ("add_on_photos_for_existing_case" if addon else "missing_document_for_case", ps[0], "FILE_TO_CASE")
    if z and m["size"] > 30e6: return ("new_batch_file", None, "AUTO_INTAKE")
    return None


def route(msgs, g, jev):
    m = msgs[g[0]]
    r = code_rule(msgs, g)
    if r: return r + (1.0, "")
    if isinstance(jev, Exception) or jev is None:
        return ("other", None, "ASK_USER", 0.0, "Jev failed")
    cat, conf, pl, pc = jev["cat"], jev["conf"], jev["plate"], jev["plate_conf"]
    is_text = all(msgs[j]["type"] == 0 for j in g)
    if cat == "chit_chat_or_ack" and conf >= G_CAT: return (cat, None, "LOG", conf, "")
    if not is_text and cat in ("missing_document_for_case", "add_on_photos_for_existing_case") and conf >= G_CAT \
            and pl and pc >= G_PLATE:
        pend = set(p for t in pending_notices(msgs, g) for p in plates(t))
        if pl in pend: return (cat, pl, "FILE_TO_CASE", conf, "")
        return (cat, pl, "ASK_USER", conf, "plate not in an open pending notice")
    note = "maybe playbook rule" if cat == "estimate_instruction_or_feedback" else ""
    return (cat, pl if pc >= G_PLATE else None, "ASK_USER", conf, note)


def main():
    a = sys.argv[1:]
    msgs = load()
    if a and a[0] == "--test":
        n = int(a[1]) if len(a) > 1 else 30
        # Z_PK is not in time order for old (restored) rows, so the test picks the last n incoming by time.
        new = [i for i, m in enumerate(msgs) if not m["me"]][-n:]
        print("test: routing the last %d incoming messages (first id %d)" % (len(new), msgs[new[0]]["id"] if new else 0))
    elif a and a[0].isdigit():
        new = [i for i, m in enumerate(msgs) if not m["me"] and m["id"] > int(a[0])]   # new rows get Z_PK > the watcher's max
    else: print(__doc__); sys.exit(2)
    gs = bursts(msgs, new)
    need = [g for g in gs if not code_rule(msgs, g)]
    def safe(g):
        try: return ask_jev(msgs, g)
        except Exception as e: return e
    with ThreadPoolExecutor(6) as ex: res = dict(zip((g[0] for g in need), ex.map(safe, need)))
    for g in gs:
        cat, pl, act, conf, note = route(msgs, g, res.get(g[0]))
        ids = str(msgs[g[0]]["id"]) + ("-%d" % msgs[g[-1]]["id"] if len(g) > 1 else "")
        txt = re.sub(r"\s+", " ", what(msgs, g))[:70]
        print("ROUTE %s %s %.2f %s id=%s %s%s" % (cat, pl or "-", conf, act, ids, txt, (" [%s]" % note) if note else ""))


if __name__ == "__main__":
    main()
