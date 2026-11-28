"""The photo step of Phase A and Phase B (playbook 06 "Photos" and "Relabel / reorder", tools/batch/phase_b.py).

  Phase A  upload the photos with the model's names (one shot, the ORIGINAL files, in chunks), unless Merimen already has a photo.
  Phase B  read Merimen first. No photos there: upload with the final names in desk order. Otherwise relabel + reorder the photos
           that are there to the adjuster's names and order (matched by label when an upload landed out of order), then check
           count and order against the new plan: zero mismatches.

Everything that touches Merimen goes through `MerimenPhotos`. Nothing here opens a browser: the real adapter lives in __main__.py, tests use
a fake. With writes off (MERIMEN_WRITES / WORKER_SUBMIT not both on) the step only works out and records what it WOULD do.
Merimen rules kept by the adapter, not decided here: never click Logout, never build dsp_docmanage / act_docinfo URLs, keep the session alive.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .photo_rules import plan_rows, rules, shown_name, snapshot_of


class NotPorted(RuntimeError):
    """The browser side of a Merimen photo operation is not available (yet)."""


class MerimenPhotos(Protocol):
    def labels(self, case: dict) -> list[str] | None:
        """Captions of the case's photos in Merimen order, or None when they could not be read."""

    def upload(self, case: dict, plan: list[dict], chunks: list[list[dict]]) -> None:
        """One upload page for the whole case, the original files fed in chunks, FDESC = name, FTYPE = ftype."""

    def relabel(self, case: dict, mapping: dict[str, list[str]]) -> None:
        """{current position: [old name, new name]}; refuses when the caption at that position differs."""

    def reorder(self, case: dict, mapping: dict[str, list]) -> None:
        """{current position: [name after relabel, new position]}; refuses when a current name/position differs."""

    def verify(self, case: dict, plan: list[dict]) -> dict:
        """{"count": n, "mismatch": n, "missing": [0-based plan positions]} (chkorder.mjs)."""


# ---------- pure helpers (ported from tools/batch/phase_b.py) ----------
def maps(old: list[dict], new: list[dict]) -> tuple[dict, dict]:
    """relabel map {pos: [old name, new name]} on the CURRENT order, and reorder map {pos: [name after relabel, new pos]} for every photo,
    matched by the original file (src). Positions are 1-based strings."""
    lab: dict[str, list[str]] = {}
    ordm: dict[str, list] = {}
    pos: dict[str, list[tuple[int, str]]] = {}
    for j, x in enumerate(new):
        pos.setdefault(x["src"], []).append((j + 1, x["name"]))
    for i, x in enumerate(old):
        j, nm = pos[x["src"]].pop(0) if pos.get(x["src"]) else (i + 1, x["name"])
        if nm != x["name"]:
            lab[str(i + 1)] = [x["name"], nm]
        ordm[str(i + 1)] = [nm, j]
    return lab, ordm


def heal(old: list[dict], new: list[dict], merimen: list[str]) -> tuple[dict, dict] | None:
    """Batch 11 (TCG9645, VGL7278): photos whose upload was retried land at the END in Merimen, so the order no longer matches the Phase A plan.
    Labels were set per file at upload, so match Merimen's photos to the plan by label: in-order blocks first (difflib), the moved photos by label.
    None when a moved photo's label is shared by photos that get different final names (ambiguous: needs a hand fix)."""
    oldl = [x["name"] for x in old]
    if sorted(merimen) != sorted(oldl):
        return None
    lab0, ordm0 = maps(old, new)
    newname = {i: ordm0[str(i + 1)][0] for i in range(len(old))}
    newpos = {i: ordm0[str(i + 1)][1] for i in range(len(old))}
    assign: dict[int, int] = {}
    for a, b, size in difflib.SequenceMatcher(None, merimen, oldl, autojunk=False).get_matching_blocks():
        for k in range(size):
            assign[a + k] = b + k
    free = [i for i in range(len(oldl)) if i not in assign.values()]
    for m in range(len(merimen)):
        if m in assign:
            continue
        cand = [i for i in free if oldl[i] == merimen[m]]
        if len({newname[i] for i in cand}) > 1:
            return None
        assign[m] = cand[0]
        free.remove(cand[0])
    lab: dict[str, list[str]] = {}
    ordm: dict[str, list] = {}
    for m, i in assign.items():
        if newname[i] != merimen[m]:
            lab[str(m + 1)] = [merimen[m], newname[i]]
        ordm[str(m + 1)] = [newname[i], newpos[i]]
    if sorted(v[1] for v in ordm.values()) != list(range(1, len(merimen) + 1)):
        return None
    return lab, ordm


def moves(ordm: dict) -> int:
    return sum(1 for k, v in ordm.items() if int(k) != v[1])


def chunked(plan: list[dict], size: int | None = None) -> list[list[dict]]:
    n = int(size or rules()["photoUpload"]["chunkSize"])
    return [plan[i:i + n] for i in range(0, len(plan), max(1, n))]


def corrections(rows: list[dict]) -> list[dict]:
    """The adjuster's own names, for the photo model's learning data (playbook 03 "Learning loop"): file, what the model said, what the adjuster set."""
    return [
        {"src": r.get("src_name") or "", "model": r.get("model_name"), "final": r["final_name"]}
        for r in rows if r.get("final_name") and r["final_name"] != r.get("model_name")
    ]


# ---------- the step ----------
@dataclass
class PhotoReport:
    phase: str
    mode: str  # dry | live
    action: str  # upload | relabel_reorder | none | refused | unreadable
    upload: int = 0
    relabel: int = 0
    reorder: int = 0
    merimen_count: int | None = None
    photos: list[dict] = field(default_factory=list)
    corrections: list[dict] = field(default_factory=list)
    snapshot: str | None = None
    note: str = ""
    code: str = ""  # why a step was refused: edited | undone | hand_fix | unreadable

    @property
    def ok(self) -> bool:
        return self.action not in ("refused", "unreadable")

    def line(self) -> str:
        """The sentence for the case timeline: what was done, or in a dry run what would be done."""
        if not self.ok:
            return f"Photos not touched: {self.note}"
        what = f"upload {self.upload} · relabel {self.relabel} · reorder {self.reorder}"
        return f"Photos: {what}" if self.mode == "live" else f"Photos, dry run (Merimen not changed): would {what}"

    def row(self) -> dict:
        """The photo_upload_log row."""
        return {
            "phase": self.phase, "mode": self.mode, "action": self.action, "merimen_count": self.merimen_count,
            "photos": self.photos, "would": {"upload": self.upload, "relabel": self.relabel, "reorder": self.reorder},
            "corrections": self.corrections, "snapshot": self.snapshot, "note": self.note[:300],
        }


Guard = Callable[[], bool]


def _read_labels(m: MerimenPhotos, case: dict) -> list[str] | None:
    got = m.labels(case)
    if got is not None and len(got) == 0:
        got = m.labels(case)  # a flaky page load reads 0 photos: read once more before deciding "upload" (2026-11-12)
    return got


def prefix_done(have: list[str] | None, plan: list[dict]) -> int:
    """How many photos an upload that was cut off (Merimen logged out half way, owner 2026-11-28) already left in Merimen: k when the
    captions Merimen holds are EXACTLY the first k planned names in the same order (0 < k < plan). 0 for anything else: an empty list,
    the full list, or photos that do not line up (those keep the hand-fix path, never a guess). A caption that the plan uses more than
    once is not proof of WHICH photo went up, so a start that holds one is not resumed either."""
    if not have or len(have) >= len(plan):
        return 0
    names = [p["name"] for p in plan]
    k = len(have)
    if have != names[:k] or any(names.count(n) > 1 for n in have):
        return 0
    return k


def _resume(rep: PhotoReport, case: dict, plan: list[dict], k: int, merimen: MerimenPhotos, guard: Guard, writes: bool) -> PhotoReport:
    rep.action, rep.upload = "upload", len(plan) - k
    rep.note = f"an upload was cut off: Merimen has the first {k} of {len(plan)}, only the rest is uploaded"
    return rep if not writes else _upload(rep, case, plan, merimen, guard, start=k)


def phase_a(case: dict, rows: list[dict], *, writes: bool, merimen: MerimenPhotos, guard: Guard = lambda: True) -> PhotoReport:
    """Upload with the names the model gave (the adjuster may be slow). A case that already has a photo in Merimen is skipped.
    Only after a logout put-back (`resumed_after_logout`): photos that are exactly the start of this list (an upload that was cut
    off) get the rest uploaded, and any other partial list stops for a hand fix."""
    plan = plan_rows(rows)
    rep = PhotoReport("A", "live" if writes else "dry", "upload", upload=len(plan), photos=plan)
    if not plan:
        rep.action, rep.upload, rep.note = "none", 0, "no named photos"
        return rep
    have = _read_labels(merimen, case)
    rep.merimen_count = None if have is None else len(have)
    resumed = bool(case.get("resumed_after_logout"))
    k = prefix_done(have, plan) if resumed else 0
    if k:
        return _resume(rep, case, plan, k, merimen, guard, writes)
    if resumed and have and have != [p["name"] for p in plan]:
        # put back after a logout: anything but the clean start or the whole list (a gap, a repeated caption, a name changed
        # meanwhile, a photo stored twice) is never taken as "already has photos", a person looks (playbook 06)
        rep.action, rep.upload, rep.code, rep.snapshot = "refused", 0, "hand_fix", None
        rep.note = f"Merimen has {len(have)} photos that do not line up with this list of {len(plan)}: fix by hand (playbook 06)"
        return rep
    if have is not None and len(have) >= int(rules()["photoUpload"]["skipWhenMerimenHasPhotos"]):
        rep.action, rep.upload, rep.note = "none", 0, f"Merimen already has {len(have)} photos"
        return rep
    if have is None and writes:
        rep.action, rep.upload, rep.note, rep.code = "unreadable", 0, "could not read the photos in Merimen", "unreadable"
        return rep
    if have is None:
        rep.note = "Merimen was not read in a dry run: assumes it has no photos"
    if not writes:
        return rep
    return _upload(rep, case, plan, merimen, guard)


def _upload(rep: PhotoReport, case: dict, plan: list[dict], merimen: MerimenPhotos, guard: Guard, start: int = 0) -> PhotoReport:
    """`start`: the first `start` photos of the plan are already in Merimen in order (prefix_done); only the rest goes up, the whole
    list is verified."""
    if not guard():
        rep.snapshot = None
        rep.action, rep.upload, rep.note, rep.code = "refused", 0, "the case changed before the upload", "undone"
        return rep
    rest = plan[start:]
    merimen.upload(case, rest, chunked(rest))
    check = merimen.verify(case, plan)
    for _ in range(2):  # dropped photos: upload the missing positions again (playbook 06, up to 2 rounds)
        miss = check.get("missing") or []
        if not miss:
            break
        if not guard():
            rep.snapshot = None
            rep.action, rep.note, rep.code = "refused", "the case changed during the upload", "undone"
            return rep
        part = [plan[i] for i in miss if 0 <= i < len(plan)]
        merimen.upload(case, part, chunked(part))
        check = merimen.verify(case, plan)
    if check.get("count") != len(plan) or check.get("mismatch"):
        rep.action, rep.code, rep.snapshot = "refused", "hand_fix", None
        rep.note = f"after the upload Merimen has {check.get('count')} photos and {check.get('mismatch')} mismatches (plan {len(plan)})"
    return rep


def phase_b(
    case: dict, rows: list[dict], extras: list[str], *, stored_snapshot: str | None, phase_a_photos: list[dict],
    writes: bool, merimen: MerimenPhotos, guard: Guard = lambda: True,
) -> PhotoReport:
    """Read Merimen first; upload with the final names when it has no photos, else relabel + reorder; verify zero mismatches."""
    snap = snapshot_of(rows, extras)
    new = plan_rows(rows)
    rep = PhotoReport("B", "live" if writes else "dry", "none", photos=new, corrections=corrections(rows), snapshot=None)
    # 1 refuse when anything was edited after the snapshot (or there is none): the names are not final
    if not stored_snapshot or stored_snapshot != snap:
        rep.action, rep.note, rep.code = "refused", "the photo names or order changed after Done (press Done again)", "edited"
        return rep
    rep.snapshot = stored_snapshot  # logged only for a step that went through: a refused or stopped step is not "seen", so the next Done retries it
    if not new:
        rep.note = "no named photos"
        return rep
    if len(new) != len([r for r in rows if shown_name(r)]):
        rep.action, rep.note, rep.code, rep.snapshot = "refused", "a photo has no name", "edited", None
        return rep
    have = _read_labels(merimen, case)
    rep.merimen_count = None if have is None else len(have)
    if have is None and writes:
        rep.action, rep.note, rep.code, rep.snapshot = "unreadable", "could not read the photos in Merimen", "unreadable", None
        return rep
    # 2 nothing in Merimen yet (Done was pressed before Phase A reached the upload): upload with the final names and order
    empty = (have is not None and len(have) == 0) or (have is None and not phase_a_photos)
    if empty:
        rep.action, rep.upload = "upload", len(new)
        if have is None:
            rep.note = "Merimen was not read in a dry run: assumes it has no photos"
        return rep if not writes else _upload(rep, case, new, merimen, guard)
    # 3 an earlier Phase B relabelled Merimen and stopped before its list was logged: Merimen differs from the last logged list but
    # already shows the final names. Captions alone do not say which photo carries which, so this counts only once the file-aware
    # check (chkorder) passes; otherwise go on as usual
    final_names = [x["name"] for x in new]
    if have is not None and have == final_names and have != [x["name"] for x in phase_a_photos or []]:
        if not writes:
            rep.action, rep.relabel, rep.reorder, rep.note = "relabel_reorder", 0, 0, "Merimen already shows the final names"
            return rep
        check = merimen.verify(case, new)
        if check.get("count") == len(new) and not check.get("mismatch"):
            rep.action, rep.relabel, rep.reorder, rep.note = "relabel_reorder", 0, 0, "Merimen already holds the final names"
            return rep
    # 4 photos are there: relabel + reorder against the list Merimen got last (Phase A's upload, or a finished Phase B)
    old = phase_a_photos
    if not old:
        rep.action, rep.note, rep.code, rep.snapshot = "refused", "no Phase A photo list to compare with: fix by hand (playbook 06)", "hand_fix", None
        return rep
    rep.action = "relabel_reorder"
    if have is None:  # dry run: assume Merimen = the Phase A list
        lab, ordm = maps(old, new)
        rep.relabel, rep.reorder = len(lab), moves(ordm)
        rep.note = "Merimen was not read in a dry run: assumes it holds the Phase A list"
        return rep
    same = len(have) == len(old) and have == [x["name"] for x in old]
    if same:
        lab, ordm = maps(old, new)
    else:
        healed = heal(old, new, have)
        if healed is None:
            rep.action, rep.code, rep.snapshot = "refused", "hand_fix", None
            rep.note = f"Merimen has {len(have)} photos that do not match the Phase A list: not relabelled, fix by hand (playbook 06)"
            return rep
        lab, ordm = healed
        rep.note = "photos were out of order after the upload: matched by label"
    rep.relabel, rep.reorder = len(lab), moves(ordm)
    if not writes:
        return rep
    # 5 one case at a time; the guard is asked before EACH write, so an undone 完成 stops it at the next one
    if lab:
        if not guard():
            return _stopped(rep)
        merimen.relabel(case, lab)
    if rep.reorder:
        if not guard():
            return _stopped(rep)
        merimen.reorder(case, ordm)
    check = merimen.verify(case, new)
    if check.get("count") != len(new) or check.get("mismatch"):
        rep.action, rep.code, rep.snapshot = "refused", "hand_fix", None
        rep.note = f"after relabel/reorder Merimen has {check.get('count')} photos and {check.get('mismatch')} mismatches (plan {len(new)})"
    return rep


def _stopped(rep: PhotoReport) -> PhotoReport:
    rep.snapshot = None
    rep.action, rep.note, rep.code = "refused", "Done was undone: stopped before the next Merimen write", "undone"
    return rep
