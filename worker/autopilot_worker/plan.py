"""What Phase A / Phase B would enter. Mirrors web/src/lib/ext/dryrun.ts. Never opens Merimen."""

from __future__ import annotations

from dataclasses import dataclass


PHASE_A = ("create_case", "adjuster_report", "upload_docs", "upload_photos")
PHASE_B = ("parts_labour", "estimate_details", "checks")


@dataclass(frozen=True)
class Step:
    code: str
    ok: bool
    missing: tuple[str, ...]


@dataclass(frozen=True)
class Plan:
    steps: tuple[Step, ...]

    @property
    def all_ready(self) -> bool:
        return all(s.ok for s in self.steps)


def _miss(pairs: list[tuple[str, object]]) -> tuple[str, ...]:
    return tuple(k for k, v in pairs if not v)


def plan_case(*, case_data: dict | None, files: int, photos: int, photos_done: bool) -> Plan:
    d = case_data or {}
    veh = d.get("client_vehicle") or {}
    police = d.get("police") or {}
    at = d.get("at_fault") or {}
    policy = at.get("policy") or {}
    missing_docs = d.get("missing") or []
    create = _miss([
        ("plate", d.get("plate")),
        ("chassis_no", veh.get("chassis_no")),
        ("vehicle_model", veh.get("model")),
        ("police_report_no", police.get("report_no")),
        ("accident_datetime", police.get("accident_datetime")),
        ("policy", policy.get("policy_no")),
    ])
    report = _miss([
        ("police_report_no", police.get("report_no")),
        ("police_place", police.get("place")),
        ("accident_datetime", police.get("accident_datetime")),
    ])
    docs = _miss([("documents", files > 0 and not missing_docs)])
    photo_step = _miss([("photos", photos > 0)])
    parts = _miss([("photo_naming", photos_done)]) + (("earlier_step",) if create else ())
    est = ("earlier_step",) if parts else ()
    checks = ("earlier_step",) if est else ()
    raw = (
        ("create_case", create),
        ("adjuster_report", report),
        ("upload_docs", docs),
        ("upload_photos", photo_step),
        ("parts_labour", parts),
        ("estimate_details", est),
        ("checks", checks),
    )
    return Plan(tuple(Step(code, not missing, missing) for code, missing in raw))


def steps_for(phase: str, plan: Plan) -> tuple[Step, ...]:
    want = PHASE_A if phase == "A" else PHASE_B
    return tuple(s for s in plan.steps if s.code in want)
