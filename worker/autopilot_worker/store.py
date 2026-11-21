"""Postgres. Statements use parameters. Session tokens are not selected and not written."""

from __future__ import annotations

import json

from .db import make_db
from .gate import worker_gate
from .jobs import CLAIM_SQL, RECLAIM_SQL, TOUCH_SQL, claim_params
from .pipeline import Outcome

_DETAIL_BAD = ("cfid", "cftoken", "http", "password=")


def clean_detail(detail: str | None) -> str | None:
    if not detail:
        return None
    if any(b in detail.lower() for b in _DETAIL_BAD):
        raise ValueError("detail")
    return detail[:80]


class PgRepo:
    def __init__(self, url: str, transport: str = "http", db=None):
        self.db = db or make_db(url, transport)

    def heartbeat(self, worker_id: str, model: str, chrome_ok: bool) -> None:
        self.db.execute(
            """
            INSERT INTO worker_runtimes (id, seen_at, photo_model, chrome_ok)
            VALUES (%s, now(), %s, %s)
            ON CONFLICT (id) DO UPDATE
              SET seen_at = now(), photo_model = EXCLUDED.photo_model, chrome_ok = EXCLUDED.chrome_ok
            """,
            (worker_id, model[:120], chrome_ok),
        )

    def gate(self, org_id: str, *, env_on: bool) -> str:
        if not env_on:
            return "off"
        rows = self.db.execute(
            """
            SELECT g.enabled, g.consent_reference,
                   EXISTS (SELECT 1 FROM ext_consents k WHERE k.org_id = g.org_id) AS consented
            FROM ext_org_settings g WHERE g.org_id = %s
            """,
            (org_id,),
        )
        row = rows[0] if rows else None
        if not row:
            return worker_gate(env_on=True, enabled=False, consent_reference=None, consented=False)
        return worker_gate(env_on=True, enabled=bool(row[0]), consent_reference=row[1], consented=bool(row[2]))

    def claim(self, *, ext_connect: bool, worker_id: str, org_limit: int = 1):
        rows = self.db.execute(CLAIM_SQL, claim_params(ext_connect, org_limit, worker_id))
        if not rows:
            return None
        r = rows[0]
        return {"id": r[0], "case_id": r[1], "step": r[2], "attempts": r[3], "org_id": r[4]}

    def reclaim_stale(self, lease_seconds: int = 900, max_attempts: int = 3) -> int:
        return len(self.db.execute(RECLAIM_SQL, (max_attempts, int(lease_seconds))))

    def touch_job(self, job_id: int, worker_id: str) -> bool:
        """Renew the lease. False means the job is no longer ours."""
        return bool(self.db.execute(TOUCH_SQL, (job_id, worker_id)))

    def load(self, case_id: str) -> dict:
        c = self.db.execute(
            """
            SELECT id, org_id, status, plate, case_data, photos_done_at, merimen_caseid, car_model,
                   (SELECT count(*) FROM case_files f WHERE f.case_id = cases.id),
                   (SELECT count(*) FROM case_photos p WHERE p.case_id = cases.id),
                   created_by
            FROM cases WHERE id = %s
            """,
            (case_id,),
        )[0]
        photos = self.db.execute(
            """
            SELECT id, src_name, blob_path FROM case_photos
            WHERE case_id = %s AND final_name IS NULL AND name_state IN ('pending', 'running', 'failed')
            ORDER BY position, id
            """,
            (case_id,),
        )
        files = self.db.execute(
            "SELECT id, kind, blob_url, original_name FROM case_files WHERE case_id = %s ORDER BY id",
            (case_id,),
        )
        return {
            "id": c[0], "org_id": c[1], "status": c[2], "plate": c[3], "case_data": c[4],
            "photos_done_at": c[5].isoformat() if c[5] else None,
            "merimen_caseid": c[6], "car_model": c[7], "file_count": c[8], "photo_count": c[9],
            "created_by": c[10],
            "photos": [{"id": p[0], "src_name": p[1], "file": p[1], "blob_path": p[2]} for p in photos],
            "files": [{"id": f[0], "kind": f[1], "url": f[2], "name": f[3]} for f in files],
        }

    def session_status(self, org_id: str) -> str:
        rows = self.db.execute("SELECT status FROM worker_sessions WHERE org_id = %s", (org_id,))
        return rows[0][0] if rows else "idle"

    def wanted(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT org_id, account_key, status, wanted, port FROM worker_sessions WHERE wanted IN ('start', 'stop')"
        )
        return [{"org_id": r[0], "account_key": r[1], "status": r[2], "wanted": r[3], "port": r[4]} for r in rows]

    def set_session(self, org_id: str, *, status: str, wanted: str, account: str | None, port: int | None, detail: str | None) -> None:
        detail = clean_detail(detail)
        self.db.execute(
            """
            INSERT INTO worker_sessions (org_id, account_key, port, status, wanted, last_seen_at, detail)
            VALUES (%s, %s, %s, %s, %s, now(), %s)
            ON CONFLICT (org_id) DO UPDATE SET
              account_key = EXCLUDED.account_key, port = EXCLUDED.port, status = EXCLUDED.status,
              wanted = EXCLUDED.wanted, last_seen_at = now(), detail = EXCLUDED.detail
            """,
            (org_id, account or "default", port, status, wanted, detail),
        )

    def apply(self, job: dict, outcome: Outcome) -> None:
        """All writes of one outcome go out as one transaction (one HTTPS request on the http transport)."""
        state = "queued" if outcome.job_state == "requeue" else outcome.job_state
        st: list[tuple[str, object]] = []
        if outcome.job_state == "hold":
            st.append(("UPDATE jobs SET locked_at = now() WHERE id = %s AND state = 'running'", (job["id"],)))
        else:
            st.append((
                "UPDATE jobs SET state = %s, locked_by = NULL, locked_at = NULL WHERE id = %s AND state = 'running'",
                (state, job["id"]),
            ))
        if outcome.invalidate:
            st.append((
                "UPDATE merimen_credentials SET blocked = true, verify_state = %s, updated_at = now() WHERE org_id = %s",
                (outcome.verify_state or "bad_credentials", job["org_id"]),
            ))
            st.append((
                """
                UPDATE jobs SET state = 'paused', locked_by = NULL, locked_at = NULL
                WHERE state IN ('queued', 'running') AND id <> %s AND step IN ('phase_a', 'phase_b', 'checks')
                  AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                """,
                (job["id"], job["org_id"]),
            ))
        if outcome.case_status or outcome.merimen_caseid or outcome.pending_doc or outcome.done or outcome.error:
            st.append((
                """
                UPDATE cases SET
                  status = COALESCE(%s, status),
                  merimen_caseid = COALESCE(%s, merimen_caseid),
                  merimen_extid = COALESCE(%s, merimen_extid),
                  total_rm = COALESCE(%s, total_rm),
                  pending_doc = COALESCE(%s, pending_doc),
                  error = %s,
                  done_at = CASE WHEN %s THEN now() ELSE done_at END
                WHERE id = %s
                """,
                (
                    outcome.case_status, outcome.merimen_caseid, outcome.merimen_extid, outcome.total_rm,
                    outcome.pending_doc, (outcome.error or None), bool(outcome.done), job["case_id"],
                ),
            ))
        if outcome.event:
            st.append((
                "INSERT INTO case_events (case_id, step, message) VALUES (%s, %s, %s)",
                (job["case_id"], job["step"], outcome.event[:400]),
            ))
        for step in outcome.enqueue:
            st.append(("INSERT INTO jobs (case_id, step, state) VALUES (%s, %s, 'queued')", (job["case_id"], step)))
        for row in outcome.photo_rows or []:
            if row.get("failed"):
                st.append((
                    """
                    UPDATE case_photos SET name_state = 'failed', name_error = %s
                    WHERE id = %s AND case_id = %s AND final_name IS NULL
                    """,
                    (str(row.get("name_error") or "worker: failed")[:200], row["id"], job["case_id"]),
                ))
            else:
                st.append((
                    """
                    UPDATE case_photos
                    SET name_state = 'named', model_name = %s, confidence = %s, alts = %s::jsonb,
                        how = 'model', name_error = NULL, named_at = now()
                    WHERE id = %s AND case_id = %s AND final_name IS NULL
                      AND name_state IN ('pending', 'running', 'failed')
                    """,
                    (row.get("model_name"), row.get("confidence"), json.dumps(row.get("alts") or []), row["id"], job["case_id"]),
                ))
        if outcome.photo_fail:
            st.append((
                """
                UPDATE case_photos SET name_state = 'failed', name_error = %s
                WHERE case_id = %s AND final_name IS NULL AND name_state IN ('pending', 'running')
                """,
                (outcome.photo_fail[:200], job["case_id"]),
            ))
        if outcome.browser_minutes and outcome.browser_minutes != "0":
            st.append(("INSERT INTO usage (case_id, browser_minutes) VALUES (%s, %s)", (job["case_id"], outcome.browser_minutes)))
        self.db.batch(st)

    def followup_cases(self) -> list[tuple[dict, list[dict]]]:
        cases = self.db.execute(
            """
            SELECT id, org_id, status, photos_done_at, merimen_caseid
            FROM cases
            WHERE status IN ('phase_a', 'waiting_user', 'phase_b')
            """
        )
        if not cases:
            return []
        by_case: dict[str, list[dict]] = {c[0]: [] for c in cases}
        for case_id, step, state in self.db.execute(
            "SELECT case_id, step, state FROM jobs WHERE case_id IN (SELECT id FROM cases WHERE status IN ('phase_a', 'waiting_user', 'phase_b'))"
        ):
            by_case.setdefault(case_id, []).append({"step": step, "state": state})
        return [
            ({"id": c[0], "org_id": c[1], "status": c[2], "photos_done_at": c[3].isoformat() if c[3] else None, "merimen_caseid": c[4]}, by_case[c[0]])
            for c in cases
        ]

    def enqueue(self, case_id: str, step: str) -> None:
        self.db.execute("INSERT INTO jobs (case_id, step, state) VALUES (%s, %s, 'queued')", (case_id, step))

    def owner_email(self, org_id: str) -> str | None:
        rows = self.db.execute(
            """
            SELECT u.email FROM memberships m
            JOIN "user" u ON u.id = m.user_id
            WHERE m.org_id = %s
            ORDER BY m.id
            LIMIT 1
            """,
            (org_id,),
        )
        return rows[0][0] if rows else None

    def claim_verify(self):
        """Spend the one queued check. A second worker sees login_attempts = 1 and gets nothing. One statement."""
        sql = """
        UPDATE merimen_credentials AS m
        SET verify_state = 'checking', login_attempts = login_attempts + 1, updated_at = now()
        WHERE m.org_id = (
          SELECT org_id FROM merimen_credentials
          WHERE verify_state = 'queued' AND login_attempts = 0
          ORDER BY updated_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING org_id, wrapped_dek, dek_nonce, username_ct, username_nonce, password_ct, password_nonce
        """
        rows = self.db.execute(sql)
        if not rows:
            return None
        keys = ("org_id", "wrapped_dek", "dek_nonce", "username_ct", "username_nonce", "password_ct", "password_nonce")
        return dict(zip(keys, rows[0]))

    def finish_verify(self, org_id: str, decision: dict, email_to: str | None = None, poster=None) -> None:
        from .login_page import login_email

        if decision.get("release"):
            self.db.execute(
                """
                UPDATE merimen_credentials
                SET verify_state = 'queued', login_attempts = 0, updated_at = now()
                WHERE org_id = %s AND verify_state = 'checking'
                """,
                (org_id,),
            )
            return
        event = str(decision.get("event") or "")[:400]
        st: list[tuple[str, object]] = [
            (
                """
                UPDATE merimen_credentials
                SET verify_state = %s, blocked = %s, updated_at = now()
                WHERE org_id = %s AND verify_state IN ('checking', 'otp', 'otp_submitted')
                """,
                (decision["verify_state"], bool(decision["blocked"]), org_id),
            ),
            ("INSERT INTO merimen_cred_audit (org_id, action) VALUES (%s, %s)", (org_id, "login_" + str(decision["verify_state"])[:40])),
        ]
        if decision.get("pause"):
            st.append((
                """
                UPDATE jobs SET state = 'paused', locked_by = NULL, locked_at = NULL
                WHERE state IN ('queued', 'running') AND step IN ('phase_a', 'phase_b', 'checks')
                  AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                """,
                (org_id,),
            ))
            st.append((
                """
                WITH moved AS (
                  UPDATE cases SET status = 'waiting_user'
                  WHERE org_id = %s AND status IN ('phase_a', 'phase_b', 'checking')
                  RETURNING id
                )
                INSERT INTO case_events (case_id, step, message) SELECT id, 'login', %s FROM moved
                """,
                (org_id, event),
            ))
        if decision.get("resume"):
            st.append((
                """
                UPDATE jobs SET state = 'queued', locked_by = NULL, locked_at = NULL, not_before = NULL
                WHERE state = 'paused' AND step IN ('phase_a', 'phase_b', 'checks')
                  AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                """,
                (org_id,),
            ))
            st.append((
                "INSERT INTO case_events (case_id, step, message) SELECT id, 'login', %s FROM cases WHERE org_id = %s AND status = 'waiting_user'",
                (event, org_id),
            ))
        self.db.batch(st)
        if decision.get("email") and email_to and poster:
            try:
                subject, html = login_email(decision["email"])
                poster(email_to, subject, html)
            except Exception:
                return

    def add_screenshot(self, *, org_id: str, user_id: str, case_id: str, job_id: int | None, step: str,
                       caption_zh: str, caption_en: str, blob_pathname: str) -> None:
        self.db.execute(
            """
            INSERT INTO case_screenshots (org_id, user_id, case_id, job_id, step, caption_zh, caption_en, blob_pathname)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (org_id, user_id, case_id, job_id, step, caption_zh[:80], caption_en[:80], blob_pathname),
        )

    def expired_screenshots(self, days: int, limit: int = 50) -> list[tuple[str, str]]:
        rows = self.db.execute(
            """
            SELECT id, blob_pathname FROM case_screenshots
            WHERE deleted_at IS NULL AND created_at < now() - (%s || ' days')::interval
            ORDER BY created_at LIMIT %s
            """,
            (int(days), int(limit)),
        )
        return [(r[0], r[1]) for r in rows]

    def mark_screenshot_deleted(self, row_id: str) -> None:
        self.db.execute("UPDATE case_screenshots SET deleted_at = now() WHERE id = %s AND deleted_at IS NULL", (row_id,))
