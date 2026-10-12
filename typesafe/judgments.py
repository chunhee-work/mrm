"""The five judgments that replace fragile parsing in the Merimen pipeline.

Design rules followed throughout:
  * SELECT, never generate — candidates come from the live Merimen <option> list,
    so insurer-specific codes (Etiqa's 20019 vs everyone else's 18) stop mattering.
  * One narrow judgment per question; independent questions batched into one call.
  * Money, dates, fixed defaults and form mechanics stay in CODE.
  * Every closed set carries a no-match outcome.
"""
from client import ask, answer, gate

# ---------------------------------------------------------------- 1. damage condition
CONDITIONS = {
    "Bent":            "Metal panel or structural part deformed out of shape but not separated.",
    "Broken":          "Part is fractured into pieces, snapped off, or no longer holds together.",
    "Cracked":         "A split or fracture line in a lens, glass or plastic part that is still in one piece.",
    "Cut":             "A rubber seal, strip or soft trim is sliced, torn or severed.",
    "Damage":          "Soiled, scuffed or deteriorated soft/liner material with no clean break or bend.",
    "Necessary":       "Undamaged small fitting that must be renewed because it cannot be reused once disturbed.",
    "Bracket cracked": "The mounting bracket or tab that holds the part has fractured.",
}

def damage_conditions(part_rows, vehicle, impact_area):
    """part_rows: [(row_id, part_name)] from the estimate page.
    Returns {row_id: {'ok','value','confidence'}}. One request for the whole case."""
    state = {"vehicle": vehicle, "impact_area": impact_area,
             "parts": [{"id": rid, "name": name} for rid, name in part_rows]}
    qs = {}
    for rid, name in part_rows:
        qs["c%s" % rid] = {
            "type": "choice",
            "instructions": ("For the selected damaged part `parts` with id '%s' (\"%s\") on this "
                             "vehicle, which repair condition does an adjuster record?" % (rid, name)),
            "criteria": CONDITIONS,
        }
    resp = ask(state, qs)
    out = {}
    for rid, name in part_rows:
        v, c = answer(resp, "c%s" % rid)
        out[rid] = gate(v, c, 0.60, "damage condition for '%s'" % name)
    return out


# ---------------------------------------------------------------- 2. model variant
def pick_model_variant(candidates, rc_line, insurance_line, reg_date, chassis, cc, extra=None):
    """candidates: the ddlbModel option texts already on the page (filter to the make first).
    This is the one that cost RM12 a miss — so it also returns a trim-evidence check."""
    state = {
        "registration_document_model_line": rc_line,
        "insurance_schedule_model_line": insurance_line,
        "first_registration_date": reg_date,
        "chassis_no": chassis,
        "engine_cc": cc,
        "notes": extra or "",
        "candidates": candidates,
    }
    crit = {t: None for t in candidates}
    crit["__none__"] = "None of the candidates matches this vehicle."
    resp = ask(state, {
        "variant": {
            "type": "choice",
            "instructions": (
                "Pick the one entry in `candidates` that describes THIS vehicle. The trim/grade word "
                "(e.g. Executive, Advanced/AV, S, V, X, H, Sport, Standard, SE, GLX) and the transmission "
                "marker (A) automatic or (M) manual must both agree with the documents, and the vehicle's "
                "`first_registration_date` must fall inside the option's [MM/YY-MM/YY] production bracket "
                "(an open bracket like [01/20-] has no end). Prefer an exact chassis/model-code match when present."),
            "criteria": crit,
        },
        "trim_stated": {
            "type": "noul",
            "instructions": ("Do the documents state the vehicle's trim/grade explicitly, rather than "
                             "leaving it to be inferred from engine size or body style alone?"),
        },
        "transmission_stated": {
            "type": "noul",
            "instructions": "Do the documents state whether the vehicle is automatic or manual?",
        },
    })
    v, c = answer(resp, "variant")
    trim, _ = answer(resp, "trim_stated")
    trans, _ = answer(resp, "transmission_stated")
    res = gate(v, c, 0.70, "model variant")
    res["trim_stated"] = trim
    res["transmission_stated"] = trans
    # Policy in code: a wrong model costs RM12 after 3 days — escalate when the
    # documents never stated the trim, however confident the pick looks.
    if isinstance(trim, (int, float)) and trim < 0.5:
        res["ok"] = False
        res["review"] = "trim not stated in documents (p=%.2f) — verify before saving" % trim
    if v == "__none__":
        res["ok"] = False
        res["review"] = "no candidate matches — widen the filter or check the make"
    return res


# ---------------------------------------------------------------- 3. misc pricing
# Prices are OURS and live in code. The model only categorises the line.
MISC_PRICES = {
    "paint_consumables_solvent": "500.00",
    "frame_aligner_bench":       "400.00",
    "tyre":                      "350.00",
    "aircond_regas":             "150.00",
    "underseal":                 "60.00",
    "wheel_alignment":           "45.00",
    "glass_or_windscreen_sealant": "45.00",
    "fogging":                   "45.00",
    "electrical_check":          "35.00",
    "wheel_balancing":           "35.00",
    "other_items":               "35.00",
    "general_sealant":           "30.00",
    "road_test":                 "30.00",
    "number_plate":              "25.00",
}
MISC_CRITERIA = {
    "paint_consumables_solvent": "Paintwork material INCLUDING thinner/solvent.",
    "paint_materials_no_solvent": "Paintwork material WITHOUT solvent — priced by Merimen's paint system, we do not price it.",
    "frame_aligner_bench": "Mounting/dismounting on a Car-O-Liner or similar frame-aligner bench.",
    "tyre": "Supply or replacement of a road tyre.",
    "aircond_regas": "Air-conditioning regas or R134 refrigerant work.",
    "underseal": "Underseal / underbody protective coating material.",
    "wheel_alignment": "Road wheel alignment.",
    "glass_or_windscreen_sealant": "Sealant specifically for a windscreen or other glass.",
    "fogging": "Interior fogging / deodorising treatment.",
    "electrical_check": "Electrical check and diagnosis.",
    "wheel_balancing": "Wheel balancing.",
    "other_items": "A catch-all 'other items' line.",
    "general_sealant": "Sealant that is not for glass (floor board, tail lamp, seam).",
    "road_test": "Road test after repair.",
    "number_plate": "Supply of a registration number plate.",
    "__none__": "None of these — leave this line unpriced.",
}

def misc_prices(misc_rows):
    """misc_rows: [(row_id, line_text)]. Returns {row_id: price-or-None}."""
    state = {"lines": [{"id": r, "text": t} for r, t in misc_rows]}
    qs = {"m%s" % r: {"type": "choice",
                      "instructions": "Which charge does the line in `lines` with id '%s' (\"%s\") represent?" % (r, t),
                      "criteria": MISC_CRITERIA}
          for r, t in misc_rows}
    resp = ask(state, qs)
    out = {}
    for r, t in misc_rows:
        v, c = answer(resp, "m%s" % r)
        g = gate(v, c, 0.60, "misc line '%s'" % t)
        g["price"] = MISC_PRICES.get(v) if g["ok"] else None
        out[r] = g
    return out


# ---------------------------------------------------------------- 4. document triage
DOC_TYPES = {
    "vehicle_ownership_certificate": "JPJ Sijil Pemilikan Kenderaan / vehicle ownership certificate (geran).",
    "insurance_schedule_or_cover_note": "An insurer's policy schedule, certificate or cover note for a vehicle.",
    "isearch_report": "An ISM/MyCarInfo I-SEARCH or vehicle-detail report listing a vehicle's insurers and policy numbers.",
    "police_report": "A police report (Repot Polis) narrative made by a party.",
    "police_investigation_result": "The police Keputusan Penyiasatan letter naming the party at fault (disalahkan).",
    "police_sketch": "A police sketch plan (Rajah Kasar) or measurement page.",
    "road_tax": "A road tax / Lesen Kenderaan Motor disc.",
    "__none__": "Something else or unreadable.",
}

def triage_page(page_text, our_plate, our_owner_name):
    """One page of the bundle. Catches the misfiled-document case that actually
    happened (a third party's schedule sitting inside our client's bundle)."""
    state = {"page_text": page_text, "our_vehicle_plate": our_plate,
             "our_client_name": our_owner_name}
    resp = ask(state, {
        "doc_type": {"type": "choice",
                     "instructions": "What kind of document is `page_text`?",
                     "criteria": DOC_TYPES},
        "belongs_to_our_vehicle": {"type": "noul",
            "instructions": ("Does `page_text` concern the vehicle `our_vehicle_plate` or its owner "
                             "`our_client_name`, as opposed to some other vehicle or person?")},
        "is_at_fault_party_doc": {"type": "noul",
            "instructions": ("Does `page_text` describe the OTHER party's vehicle or insurance — the party "
                             "being claimed against — rather than our own client's?")},
        "names_the_blamed_party": {"type": "noul",
            "instructions": "Does `page_text` state which party or vehicle the police blamed for the accident?"},
    })
    out = {}
    for qid, thr in (("doc_type", 0.60), ("belongs_to_our_vehicle", 0.0),
                     ("is_at_fault_party_doc", 0.0), ("names_the_blamed_party", 0.0)):
        v, c = answer(resp, qid)
        out[qid] = {"value": v, "confidence": c}
    dt = out["doc_type"]
    out["ok"] = dt["confidence"] >= 0.60
    return out


# ---------------------------------------------------------------- 5. loss description
def loss_description(loss_desc_options, colltype_options, police_narrative, damage_seen, at_fault_vehicle_kind):
    """Both closed sets come from the live page, so per-insurer codes never matter."""
    state = {
        "police_report_narrative": police_narrative,
        "damage_seen_on_our_vehicle": damage_seen,
        "at_fault_vehicle_kind": at_fault_vehicle_kind,
        "who_is_who": (
            "Merimen wording, which is the opposite way round from the police report. "
            "INSURED = the AT-FAULT vehicle (the one this insurer covers, the one being "
            "claimed against). TP / third party / claimant = OUR client's vehicle, the one "
            "we are claiming for. The police narrative is usually written in the first person "
            "by our own client, so 'saya' / 'I' in the narrative is the TP, never the Insured."),
    }
    # Spell both directions out rather than relying on the option text alone: the
    # first-person narrative flips the model's reading of who "Insured" is.
    def _ld_criteria(t):
        low = t.lower()
        if "insured hit tp" in low:
            return ("The AT-FAULT vehicle struck our client's vehicle. Use this when the "
                    "narrator (our client) describes being hit by the other vehicle.")
        if "tp hit insured" in low:
            return ("Our client's vehicle struck the at-fault vehicle. Use this only when our "
                    "own client was the one who ran into the other vehicle.")
        return None

    ld = {t: _ld_criteria(t) for t in loss_desc_options}
    ld["__none__"] = "None of these fits."
    ct = {t: None for t in colltype_options}; ct["__none__"] = "None of these fits."
    resp = ask(state, {
        "loss_desc": {"type": "choice",
            "instructions": ("Which loss description matches this accident? Read `who_is_who` first: "
                             "in Merimen's wording INSURED is the at-fault vehicle and TP is our own "
                             "client. Judge the direction of impact from `police_report_narrative` and "
                             "`damage_seen_on_our_vehicle`."),
            "criteria": ld},
        "collision_type": {"type": "choice",
            "instructions": "What kind of vehicle is the at-fault one (`at_fault_vehicle_kind`)?",
            "criteria": ct},
    })
    v1, c1 = answer(resp, "loss_desc")
    v2, c2 = answer(resp, "collision_type")
    return {"loss_desc": gate(v1, c1, 0.65, "loss description"),
            "collision_type": gate(v2, c2, 0.65, "collision type")}
