"""Postgres. Statements use parameters. Session tokens are not selected and not written."""

from __future__ import annotations

from .gate import worker_gate
from .jobs import CLAIM_SQL, claim_params
from .pipeline import Outcome

_DETAIL_BAD = ("cfid", "cftoken", "http", "password=")


def clean_detail(detail: str | None) -> str | None:
    if not detail:
        return None
    if any(b in detail.lower() for b in _DETAIL_BAD):
        raise ValueError("detail")
    return detail[:80]


class PgRepo:
    def __init__(self, url: str):
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        self.url = url

    def _conn(self):
        import psycopg

        return psycopg.connect(self.url)

    def heartbeat(self, worker_id: str, model: str, chrome_ok: bool) -> None:
        with self._conn() as conn:
            conn.execute(
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
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT g.enabled, g.consent_reference,
                       EXISTS (SELECT 1 FROM ext_consents k WHERE k.org_id = g.org_id) AS consented
                FROM ext_org_settings g WHERE g.org_id = %s
                """,
                (org_id,),
            ).fetchone()
        if not row:
            return worker_gate(env_on=True, enabled=False, consent_reference=None, consented=False)
        return worker_gate(env_on=True, enabled=bool(row[0]), consent_reference=row[1], consented=bool(row[2]))

    def claim(self, *, ext_connect: bool, worker_id: str, org_limit: int = 1):
        with self._conn() as conn:
            with conn.transaction():
                row = conn.execute(CLAIM_SQL, claim_params(ext_connect, org_limit)).fetchone()
                if not row:
                    return None
                conn.execute(
                    "UPDATE jobs SET state = 'running', locked_by = %s, locked_at = now(), attempts = attempts + 1 WHERE id = %s",
                    (worker_id, row[0]),
                )
                return {"id": row[0], "case_id": row[1], "step": row[2], "attempts": row[3] + 1, "org_id": row[4]}

    def reclaim_stale(self, minutes: int = 20, max_attempts: int = 3) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                """
                UPDATE jobs SET state = CASE WHEN attempts >= %s THEN 'failed' ELSE 'queued' END,
                                locked_by = NULL, locked_at = NULL
                WHERE state = 'running' AND locked_at < now() - (%s || ' minutes')::interval
                """,
                (max_attempts, int(minutes)),
            )
            return cur.rowcount

    def load(self, case_id: str) -> dict:
        with self._conn() as conn:
            c = conn.execute(
                """
                SELECT id, org_id, status, plate, case_data, photos_done_at, merimen_caseid, car_model,
                       (SELECT count(*) FROM case_files f WHERE f.case_id = cases.id),
                       (SELECT count(*) FROM case_photos p WHERE p.case_id = cases.id)
                FROM cases WHERE id = %s
                """,
                (case_id,),
            ).fetchone()
            photos = conn.execute(
                """
                SELECT id, src_name, blob_path FROM case_photos
                WHERE case_id = %s AND final_name IS NULL AND name_state IN ('pending', 'running', 'failed')
                ORDER BY position, id
                """,
                (case_id,),
            ).fetchall()
            files = conn.execute(
                "SELECT id, kind, blob_url, original_name FROM case_files WHERE case_id = %s ORDER BY id",
                (case_id,),
            ).fetchall()
        return {
            "id": c[0], "org_id": c[1], "status": c[2], "plate": c[3], "case_data": c[4],
            "photos_done_at": c[5].isoformat() if c[5] else None,
            "merimen_caseid": c[6], "car_model": c[7], "file_count": c[8], "photo_count": c[9],
            "photos": [{"id": p[0], "src_name": p[1], "file": p[1], "blob_path": p[2]} for p in photos],
            "files": [{"id": f[0], "kind": f[1], "url": f[2], "name": f[3]} for f in files],
        }

    def session_status(self, org_id: str) -> str:
        with self._conn() as conn:
            row = conn.execute("SELECT status FROM worker_sessions WHERE org_id = %s", (org_id,)).fetchone()
        return row[0] if row else "idle"

    def wanted(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT org_id, account_key, status, wanted, port FROM worker_sessions WHERE wanted IN ('start', 'stop')"
            ).fetchall()
        return [{"org_id": r[0], "account_key": r[1], "status": r[2], "wanted": r[3], "port": r[4]} for r in rows]

    def set_session(self, org_id: str, *, status: str, wanted: str, account: str | None, port: int | None, detail: str | None) -> None:
        detail = clean_detail(detail)
        with self._conn() as conn:
            conn.execute(
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
        state = "queued" if outcome.job_state == "requeue" else outcome.job_state
        with self._conn() as conn:
            if outcome.job_state == "hold":
                conn.execute("UPDATE jobs SET locked_at = now() WHERE id = %s AND state = 'running'", (job["id"],))
            else:
                conn.execute(
                    "UPDATE jobs SET state = %s, locked_by = NULL, locked_at = NULL WHERE id = %s AND state = 'running'",
                    (state, job["id"]),
                )
            if outcome.invalidate:
                conn.execute(
                    "UPDATE merimen_credentials SET blocked = true, verify_state = %s, updated_at = now() WHERE org_id = %s",
                    (outcome.verify_state or "bad_credentials", job["org_id"]),
                )
                conn.execute(
                    """
                    UPDATE jobs SET state = 'paused', locked_by = NULL, locked_at = NULL
                    WHERE state IN ('queued', 'running') AND id <> %s AND step IN ('phase_a', 'phase_b', 'checks')
                      AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                    """,
                    (job["id"], job["org_id"]),
                )
            if outcome.case_status or outcome.merimen_caseid or outcome.pending_doc or outcome.done or outcome.error:
                conn.execute(
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
                        outcome.pending_doc, (outcome.error or None), outcome.done, job["case_id"],
                    ),
                )
            if outcome.event:
                conn.execute(
                    "INSERT INTO case_events (case_id, step, message) VALUES (%s, %s, %s)",
                    (job["case_id"], job["step"], outcome.event[:400]),
                )
            for step in outcome.enqueue:
                conn.execute(
                    "INSERT INTO jobs (case_id, step, state) VALUES (%s, %s, 'queued')",
                    (job["case_id"], step),
                )
            if outcome.photo_rows:
                for row in outcome.photo_rows:
                    if row.get("failed"):
                        conn.execute(
                            """
                            UPDATE case_photos SET name_state = 'failed', name_error = %s
                            WHERE id = %s AND case_id = %s AND final_name IS NULL
                            """,
                            (str(row.get("name_error") or "worker: failed")[:200], row["id"], job["case_id"]),
                        )
                    else:
                        conn.execute(
                            """
                            UPDATE case_photos
                            SET name_state = 'named', model_name = %s, confidence = %s, alts = %s::jsonb,
                                how = 'model', name_error = NULL, named_at = now()
                            WHERE id = %s AND case_id = %s AND final_name IS NULL
                              AND name_state IN ('pending', 'running', 'failed')
                            """,
                            (row.get("model_name"), row.get("confidence"), __import__("json").dumps(row.get("alts") or []), row["id"], job["case_id"]),
                        )
            if outcome.photo_fail:
                conn.execute(
                    """
                    UPDATE case_photos SET name_state = 'failed', name_error = %s
                    WHERE case_id = %s AND final_name IS NULL AND name_state IN ('pending', 'running')
                    """,
                    (outcome.photo_fail[:200], job["case_id"]),
                )
            if outcome.browser_minutes and outcome.browser_minutes != "0":
                conn.execute(
                    """
                    INSERT INTO usage (case_id, browser_minutes) VALUES (%s, %s)
                    """,
                    (job["case_id"], outcome.browser_minutes),
                )

    def followup_cases(self) -> list[tuple[dict, list[dict]]]:
        with self._conn() as conn:
            cases = conn.execute(
                """
                SELECT id, org_id, status, photos_done_at, merimen_caseid
                FROM cases
                WHERE status IN ('phase_a', 'waiting_user', 'phase_b')
                """
            ).fetchall()
            out = []
            for c in cases:
                jobs = conn.execute(
                    "SELECT step, state FROM jobs WHERE case_id = %s",
                    (c[0],),
                ).fetchall()
                out.append((
                    {"id": c[0], "org_id": c[1], "status": c[2], "photos_done_at": c[3].isoformat() if c[3] else None, "merimen_caseid": c[4]},
                    [{"step": j[0], "state": j[1]} for j in jobs],
                ))
        return out

    def enqueue(self, case_id: str, step: str) -> None:
        with self._conn() as conn:
            conn.execute("INSERT INTO jobs (case_id, step, state) VALUES (%s, %s, 'queued')", (case_id, step))

    def owner_email(self, org_id: str) -> str | None:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT u.email FROM memberships m
                JOIN "user" u ON u.id = m.user_id
                WHERE m.org_id = %s
                ORDER BY m.id
                LIMIT 1
                """,
                (org_id,),
            ).fetchone()
        return row[0] if row else None

    def claim_verify(self):
        """Spend the one queued check. A second worker sees login_attempts = 1 and gets nothing."""
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
        with self._conn() as conn:
            row = conn.execute(sql).fetchone()
        if not row:
            return None
        keys = ("org_id", "wrapped_dek", "dek_nonce", "username_ct", "username_nonce", "password_ct", "password_nonce")
        return dict(zip(keys, row))

    def finish_verify(self, org_id: str, decision: dict, email_to: str | None = None, poster=None) -> None:
        from .login_page import login_email

        with self._conn() as conn:
            if decision.get("release"):
                conn.execute(
                    """
                    UPDATE merimen_credentials
                    SET verify_state = 'queued', login_attempts = 0, updated_at = now()
                    WHERE org_id = %s AND verify_state = 'checking'
                    """,
                    (org_id,),
                )
                return
            conn.execute(
                """
                UPDATE merimen_credentials
                SET verify_state = %s, blocked = %s, updated_at = now()
                WHERE org_id = %s AND verify_state IN ('checking', 'otp', 'otp_submitted')
                """,
                (decision["verify_state"], decision["blocked"], org_id),
            )
            conn.execute(
                "INSERT INTO merimen_cred_audit (org_id, action) VALUES (%s, %s)",
                (org_id, "login_" + str(decision["verify_state"])[:40]),
            )
            if decision.get("pause"):
                conn.execute(
                    """
                    UPDATE jobs SET state = 'paused', locked_by = NULL, locked_at = NULL
                    WHERE state IN ('queued', 'running') AND step IN ('phase_a', 'phase_b', 'checks')
                      AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                    """,
                    (org_id,),
                )
                cases = conn.execute(
                    """
                    UPDATE cases SET status = 'waiting_user'
                    WHERE org_id = %s AND status IN ('phase_a', 'phase_b', 'checking')
                    RETURNING id
                    """,
                    (org_id,),
                ).fetchall()
                for (cid,) in cases:
                    conn.execute(
                        "INSERT INTO case_events (case_id, step, message) VALUES (%s, 'login', %s)",
                        (cid, decision["event"][:400]),
                    )
            if decision.get("resume"):
                conn.execute(
                    """
                    UPDATE jobs SET state = 'queued', locked_by = NULL, locked_at = NULL, not_before = NULL
                    WHERE state = 'paused' AND step IN ('phase_a', 'phase_b', 'checks')
                      AND case_id IN (SELECT id FROM cases WHERE org_id = %s)
                    """,
                    (org_id,),
                )
                cases = conn.execute(
                    "SELECT id FROM cases WHERE org_id = %s AND status = 'waiting_user'",
                    (org_id,),
                ).fetchall()
                for (cid,) in cases:
                    conn.execute(
                        "INSERT INTO case_events (case_id, step, message) VALUES (%s, 'login', %s)",
                        (cid, decision["event"][:400]),
                    )
        if decision.get("email") and email_to and poster:
            try:
                subject, html = login_email(decision["email"])
                poster(email_to, subject, html)
            except Exception:
                return
