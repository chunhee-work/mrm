"""Phase B, Step 2: Select Parts + Labour from the FINAL photo names (playbook 07, 08).

  1 read the case's Merimen catalogue (parts and labour)            MerimenStep2.catalogue
  2 plan from the final names + the Space parts (step2.build_plan)  the rules of tools/step2, nothing is guessed
  3 the AI reviews the plan with the playbook's "step2" files       Step2Reviewer.review; it can only add catalogue items, manual rows and
                                                                    remove a companion; a photographed item is never dropped (Rule 1)
  4 live only (writes on): tick, then read the rows back             MerimenStep2.apply / selected
  5 the two-way check (step2_check.two_way): every photo name has a row, no changed name is left ticked

With MERIMEN_WRITES / WORKER_SUBMIT off, or with the default adapter, step 4 never runs: the step records the plan it WOULD apply.
Nothing here opens a browser or logs in to Merimen; the real adapter is not wired (the default one reads nothing and refuses every write)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable, Protocol

from . import playbook
from .photo_rules import plan_rows
from .photo_sync import NotPorted
from .step2 import build_plan
from .step2_check import two_way

MAX_CATALOGUE_LINES = 2500  # prompt-size budget: a catalogue is ~1000 to 1500 lines; more than this is cut and the cut is logged


class MerimenStep2(Protocol):
    def catalogue(self, case: dict) -> dict | None:
        """{"cat": [[value, label, _]...], "labs": [[label, _]...], "make": "..."} (selcat2.mjs), or None when it could not be read."""

    def apply(self, case: dict, plan: dict) -> None:
        """Tick {"CP": values, "N": labour labels, "R": labour labels} on dsp_selection, add the manual rows, save (Thatcham: Apply & Submit)."""

    def selected(self, case: dict) -> list[tuple[str, str]] | None:
        """(row label, qty) of every part row now on the estimate (rows.mjs), or None when it could not be read."""


class Step2Reviewer(Protocol):
    def review(self, system: str, user: str) -> dict | None:
        """The AI's answer as a dict (see ANSWER), or None when it could not answer."""


ANSWER = """Answer with ONE JSON object, nothing else:
{"add":[{"value":"<a catalogue value from the list>","reason":"..."}],
 "manual":[{"name":"<part name>","reason":"..."}],
 "remove":[{"value":"<a value of the plan>","reason":"..."}],
 "notes":"<one short sentence>"}
Rules for this answer: use only catalogue values from the list; a part with a photo is never removed (playbook 07 Rule 1); remove only a
companion or a suspension-set item whose rule does not apply to this car; a part you cannot find in the catalogue goes in "manual"."""


@lru_cache(maxsize=1)
def labour_rules() -> dict:
    with open(os.path.join(playbook.DIR, "labour_rules.json"), encoding="utf-8") as f:
        return json.load(f)


@dataclass
class Step2Report:
    mode: str  # dry | live
    action: str = "none"  # plan | applied | refused | unreadable | none
    plan: dict = field(default_factory=dict)
    check: dict = field(default_factory=dict)
    ai: dict = field(default_factory=dict)
    note: str = ""
    code: str = ""  # refused: check | unreadable

    @property
    def ok(self) -> bool:
        return self.action not in ("refused", "unreadable")

    def line(self) -> str:
        if not self.ok:
            return f"Parts and labour not touched: {self.note}"
        p = self.plan
        what = f"{p.get('parts', 0)} parts · {p.get('manual', 0)} manual · labour N {p.get('n', 0)} R {p.get('r', 0)}"
        return f"Parts and labour: {what}" if self.mode == "live" else f"Parts and labour, dry run (Merimen not changed): would {what}"

    def row(self) -> dict:
        return {
            "mode": self.mode, "action": self.action, "plan": self.plan, "check": self.check, "ai": self.ai,
            "playbook": playbook.tag(), "note": self.note[:300],
        }


def impact_of(case: dict, names: list[str]) -> str:
    """The loss description's impact when the read gave one, else what the photo names show (the rule text only tests front / rear)."""
    d = case.get("case_data") or {}
    said = d.get("impact") or (d.get("police") or {}).get("impact") or (d.get("accident") or {}).get("impact") or ""
    if said:
        return str(said).lower()
    text = " ".join(names).lower()
    out = [w for w in ("front", "rear") if w in text or (w == "front" and ("bonnet" in text or "headlamp" in text))]
    return " ".join(out) or "front"


def prompt(names: list[str], plan: dict, cat: dict, check: dict | None) -> tuple[str, str]:
    """System part: the playbook's "step2" files (never changes between cases) + the answer format. User part: this case."""
    lines = [f"{v} | {l}" for v, l, *_ in cat["cat"]]
    cut = len(lines) - MAX_CATALOGUE_LINES
    body = {
        "photo_names_and_space_parts": names,
        "plan": [{"value": v, "label": plan["pick"][v], "why": plan["why"].get(v, "")} for v in plan["CP"]],
        "missing_manual_rows": plan["missing"],
        "labour": {"N": plan["N"], "R": plan["R"]},
        "two_way_check": check,
        "catalogue_values": lines[:MAX_CATALOGUE_LINES] + ([f"... {cut} more lines not shown"] if cut > 0 else []),
    }
    return playbook.block("step2") + "\n\n" + ANSWER, json.dumps(body, ensure_ascii=False)


def review(plan: dict, names: list[str], cat: dict, reviewer: Step2Reviewer | None) -> dict:
    """Let the AI improve the plan, with the guard rails of ANSWER. Mutates plan (CP, missing, why, pick). Returns what happened, for the log."""
    log: dict = {"asked": False, "tag": playbook.tag()}
    if reviewer is None:
        log["note"] = "no AI reviewer configured: the rule plan stands"
        return log
    system, user = prompt(names, plan, cat, None)
    log["asked"] = True
    try:
        got = reviewer.review(system, user)
    except Exception as e:  # an AI failure never stops the case: the rule plan stands
        log["error"] = f"{type(e).__name__}: {str(e)[:120]}"
        return log
    if not isinstance(got, dict):
        log["note"] = "no usable answer: the rule plan stands"
        return log
    labels = {v: l for v, l, *_ in cat["cat"]}
    added, removed, manual, rejected = [], [], [], []
    for a in got.get("add") or []:
        v = str(a.get("value", "")) if isinstance(a, dict) else ""
        if v in labels and v not in plan["pick"]:
            plan["pick"][v] = labels[v]; plan["CP"].append(v); plan["why"][v] = "ai: " + str(a.get("reason", ""))[:160]; added.append(v)
        else:
            rejected.append({"add": v or str(a)[:60], "why": "not a new catalogue value"})
    for r in got.get("remove") or []:
        v = str(r.get("value", "")) if isinstance(r, dict) else ""
        if v in plan["pick"] and not plan["why"].get(v, "").startswith(("photo:", "ai:")):
            plan["CP"].remove(v); plan["pick"].pop(v); removed.append(v)
        else:
            rejected.append({"remove": v or str(r)[:60], "why": "a photographed item or not in the plan stays"})
    for m in got.get("manual") or []:
        n = str(m.get("name", "")).strip()[:120] if isinstance(m, dict) else ""
        if n and n not in plan["missing"]:
            plan["missing"].append(n); manual.append(n)
    log.update(added=added, removed=removed, manual=manual, rejected=rejected, notes=str(got.get("notes", ""))[:200])
    return log


def summary(plan: dict) -> dict:
    return {
        "parts": len(plan["CP"]), "manual": len(plan["missing"]), "n": len(plan["N"]), "r": len(plan["R"]),
        "values": plan["CP"], "labels": [plan["pick"][v] for v in plan["CP"]], "missing": plan["missing"], "N": plan["N"], "R": plan["R"],
    }


Guard = Callable[[], bool]


def run(
    case: dict, desk: list[dict], extras: list[str], *, writes: bool, merimen: MerimenStep2, reviewer: Step2Reviewer | None = None,
    guard: Guard = lambda: True,
) -> Step2Report:
    rep = Step2Report("live" if writes else "dry")
    names = [r["name"] for r in plan_rows(desk)] + list(extras)
    if not names:
        rep.note = "no named photos"
        return rep
    cat = merimen.catalogue(case)
    if cat is None or not cat.get("cat"):
        rep.action = "unreadable" if writes else "none"
        rep.code = "unreadable" if writes else ""
        rep.note = "the Merimen catalogue could not be read" + ("" if writes else " (dry run: no plan)")
        return rep
    plan = build_plan(names, cat, impact_of(case, names), labour_rules(), vehicle=case.get("car_model") or "",
                      make=str(((case.get("case_data") or {}).get("client_vehicle") or {}).get("make") or cat.get("make") or ""))
    rep.ai = review(plan, names, cat, reviewer)
    rep.plan = summary(plan)
    rep.action = "plan"
    changed = [r["model_name"] for r in desk if r.get("final_name") and r.get("model_name") and r["final_name"] != r["model_name"]]
    if not writes:
        # a dry run cannot read the rows: check the plan against the names (every photo name has a planned row, nothing changed is kept)
        rows = [(plan["pick"][v], "1") for v in plan["CP"]] + [(m, "1") for m in plan["missing"]]
        rep.check = two_way(names, rows, changed)
        rep.note = "the plan only: nothing was ticked in Merimen"
        return rep
    if not guard():
        rep.action, rep.code, rep.note = "refused", "undone", "Done was undone: stopped before ticking"
        return rep
    merimen.apply(case, {"CP": plan["CP"], "N": plan["N"], "R": plan["R"], "manual": plan["missing"]})
    got = merimen.selected(case)
    if got is None:
        rep.action, rep.code, rep.note = "unreadable", "unreadable", "the rows could not be read back after ticking"
        return rep
    rep.check = two_way(names, got, changed)
    rep.action = "applied" if rep.check["ok"] else "refused"
    if not rep.check["ok"]:
        rep.code = "check"
        rep.note = f"two-way check: {len(rep.check['add'])} to add, {len(rep.check['remove'])} to remove: fix by hand (playbook 07)"
    return rep


__all__ = ["MerimenStep2", "Step2Reviewer", "Step2Report", "NotPorted", "run", "review", "prompt", "impact_of", "labour_rules"]
