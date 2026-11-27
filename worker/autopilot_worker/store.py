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


def _missing_0010(e: Exception) -> bool:
    """True only when migration 0010's table or column does not exist yet (Postgres 42P01 / 42703)."""
    code = str(getattr(e, "sqlstate", None) or getattr(getattr(e, "diag", None), "sqlstate", None) or getattr(e, "code", None) or "")  # psycopg, or the HTTP transport's DbError.code
    text = str(e).lower()
    return code in ("42P01", "42703") or ("does not exist" in text and ("photo_upload_log" in text or "photos_snapshot" in text))


# What Merimen holds now: the list the last live Phase A uploaded (not a Phase A that found photos there already or stopped), or the list a later live Phase B uploaded or relabelled to and
# verified (only such a row keeps its snapshot). A Phase B run again (names changed during Step 2, or a failed checks job and 完成
# again) then compares Merimen with the names the first Phase B left there, not with the model's Phase A names.
LAST_PHOTO_LIST_SQL = (
    "SELECT photos FROM photo_upload_log WHERE case_id = %s AND mode = 'live' AND ((phase = 'A' AND action = 'upload') OR "
    "(phase = 'B' AND snapshot IS NOT NULL AND action IN ('upload', 'relabel_reorder'))) ORDER BY created_at DESC, id DESC LIMIT 1"
)


def _missing_workshops(e: Exception) -> bool:
    """The workshop tables come with migration 0014: a missing table is "not there yet", not an error."""
    t = str(e)
    # only a missing table or column. A permission error (42501) must NOT land here: it would quietly use the wrong workshop.
    return "42P01" in t or "42703" in t or "does not exist" in t


class PgRepo:
    def __init__(self, url: str, transport: str = "http", db=None):
        self.db = db or make_db(url, transport)

    def record_llm_call(self, row: dict) -> None:
        """One llm_calls row for a Jev (TypeSafe) call: the same ledger the web app writes, so /admin/cost can show it. cost_usd stays NULL
        (no price known). Needs migration 0016 (INSERT for the worker role); until it is applied the insert is refused and the caller skips it."""
        self.db.execute(
            "INSERT INTO llm_calls (request_id, user_id, org_id, case_id, purpose, model, input_tokens, output_tokens, latency_ms, ok, error_class) "
            "SELECT %s, c.created_by, c.org_id, %s, %s, %s, %s::bigint, %s::bigint, %s::int, %s::boolean, %s FROM (SELECT 1) one LEFT JOIN cases c ON c.id = %s::text "
            "ON CONFLICT (request_id) DO NOTHING",
            (row["request_id"], row.get("case_id"), row["purpose"], row["model"], row["input_tokens"], row["output_tokens"],
             row.get("latency_ms"), bool(row["ok"]), row.get("error_class"), row.get("case_id")),
        )

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
        desk = self.db.execute(
            "SELECT id, src_name, final_name, model_name, content_hash, blob_path FROM case_photos WHERE case_id = %s ORDER BY position, id",
            (case_id,),
        )
        extras = self.db.execute("SELECT name FROM case_extras WHERE case_id = %s ORDER BY id", (case_id,))
        snapshot, a_photos = self._photo_sync_state(case_id)
        return {
            "id": c[0], "org_id": c[1], "status": c[2], "plate": c[3], "case_data": c[4],
            "photos_done_at": c[5].isoformat() if c[5] else None,
            "merimen_caseid": c[6], "car_model": c[7], "file_count": c[8], "photo_count": c[9],
            "created_by": c[10],
            "photos": [{"id": p[0], "src_name": p[1], "file": p[1], "blob_path": p[2]} for p in photos],
            "files": [{"id": f[0], "kind": f[1], "url": f[2], "name": f[3]} for f in files],
            # the whole desk in order (photo step of Phase A/B), the parts with no photo, the fingerprint taken at 完成, and the list Phase A uploaded
            "desk": [{"id": d[0], "src_name": d[1], "final_name": d[2], "model_name": d[3], "content_hash": d[4], "blob_path": d[5]} for d in desk],
            "extras": [e[0] for e in extras],
            "photos_snapshot": snapshot,
            "phase_a_photos": a_photos,
        }

    def _photo_sync_state(self, case_id: str):
        """(fingerprint taken at 完成, the list Phase A uploaded). Before migration 0010 there is neither: (None, [])."""
        try:
            snap = self.db.execute("SELECT photos_snapshot FROM cases WHERE id = %s", (case_id,))
            logged = self.db.execute(
                LAST_PHOTO_LIST_SQL,
                (case_id,),
            )
        except Exception as e:  # only "the 0010 table/column is not there yet" is tolerated; a transient DB error fails the job instead of skipping the check
            if not _missing_0010(e):
                raise
            return None, []
        photos = logged[0][0] if logged else []
        if isinstance(photos, str):
            photos = json.loads(photos)
        return (snap[0][0] if snap else None), [{"id": p["id"], "src": p["src"], "name": p["name"], "ftype": p.get("fileType") or p.get("ftype"), "position": p.get("position")} for p in photos]

    def still_final(self, case_id: str, snapshot: str | None) -> bool:
        """Asked before every Merimen photo write: Done still pressed and nothing edited since the fingerprint was taken."""
        rows = self.db.execute("SELECT photos_done_at IS NOT NULL, photos_snapshot FROM cases WHERE id = %s", (case_id,))
        # a missing snapshot is "not final": a case with no fingerprint (done before 0010, or never snapshotted) is never written to
        return bool(rows) and bool(rows[0][0]) and snapshot is not None and rows[0][1] == snapshot

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
        # still final: 完成 pressed with the fingerprint Phase B wrote (else the web app cleared it meanwhile and the case waits)
        final_sql, final_args = ("", ())
        if outcome.require_snapshot is not None:
            final_sql, final_args = (" AND photos_done_at IS NOT NULL AND photos_snapshot = %s", (outcome.require_snapshot,))
        if final_sql:
            # one row lock before the checks below, so a web write cannot land between them (each statement re-reads the row)
            st.append(("SELECT 1 FROM cases WHERE id = %s FOR UPDATE", (job["case_id"],)))
            if outcome.total_rm:  # the estimate is saved in Merimen either way
                st.append(("UPDATE cases SET total_rm = %s WHERE id = %s", (outcome.total_rm, job["case_id"])))
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
                WHERE id = %s AND deleted_at IS NULL""" + final_sql,
                (
                    outcome.case_status, outcome.merimen_caseid, outcome.merimen_extid, outcome.total_rm,
                    outcome.pending_doc, (outcome.error or None), bool(outcome.done), job["case_id"],
                ) + final_args,
            ))
        if outcome.event:
            st.append((
                "INSERT INTO case_events (case_id, step, message) SELECT %s, %s, %s WHERE EXISTS (SELECT 1 FROM cases WHERE id = %s" + final_sql + ")",
                (job["case_id"], job["step"], outcome.event[:400], job["case_id"]) + final_args,
            ))
        for line in (outcome.extra_events or [])[:4]:
            st.append((
                "INSERT INTO case_events (case_id, step, message) SELECT %s, 'jev_check', %s WHERE EXISTS (SELECT 1 FROM cases WHERE id = %s AND deleted_at IS NULL) "
                "AND NOT EXISTS (SELECT 1 FROM case_events WHERE case_id = %s AND step = 'jev_check' AND message = %s)",
                (job["case_id"], line[:400], job["case_id"], job["case_id"], line[:400]),
            ))
        if outcome.stale_event and final_sql:
            st.append((
                "INSERT INTO case_events (case_id, step, message) SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM cases WHERE id = %s" + final_sql + ")",
                (job["case_id"], job["step"], outcome.stale_event[:400], job["case_id"]) + final_args,
            ))
        for step in outcome.enqueue:
            st.append((
                "INSERT INTO jobs (case_id, step, state) SELECT %s, %s, 'queued' WHERE EXISTS (SELECT 1 FROM cases WHERE id = %s" + final_sql + ")",
                (job["case_id"], step, job["case_id"]) + final_args,
            ))
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
        if outcome.photo_log:
            r = outcome.photo_log
            st.append((
                """
                INSERT INTO photo_upload_log (case_id, phase, mode, action, merimen_count, photos, would, corrections, snapshot, note)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                """,
                (
                    job["case_id"], r["phase"], r["mode"], r["action"], r.get("merimen_count"), json.dumps(r.get("photos") or []),
                    json.dumps(r.get("would") or {}), json.dumps(r.get("corrections") or []), r.get("snapshot"), r.get("note"),
                ),
            ))
        if outcome.step2_log:
            r = outcome.step2_log
            st.append((
                """
                INSERT INTO step2_log (case_id, mode, action, plan, "check", ai, playbook, note)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                """,
                (job["case_id"], r["mode"], r["action"], json.dumps(r.get("plan") or {}), json.dumps(r.get("check") or {}),
                 json.dumps(r.get("ai") or {}), r.get("playbook"), r.get("note")),
            ))
        for L in outcome.learning or []:
            # the adjuster's final names for the photo model; a name changed after an undo + Done again is updated and taken again
            st.append((
                """
                INSERT INTO photo_learning (case_id, org_id, photo_id, content_hash, blob_path, model_name, label, changed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (case_id, photo_id) DO UPDATE
                SET label = EXCLUDED.label, changed = EXCLUDED.changed, model_name = EXCLUDED.model_name, updated_at = now(),
                    exported_at = CASE WHEN photo_learning.label = EXCLUDED.label THEN photo_learning.exported_at ELSE NULL END
                """,
                (job["case_id"], job["org_id"], L["photo_id"], L.get("content_hash"), L.get("blob_path") or "", L.get("model_name"), L["label"], L["changed"]),
            ))
        if outcome.browser_minutes and outcome.browser_minutes != "0":
            st.append(("INSERT INTO usage (case_id, browser_minutes) VALUES (%s, %s)", (job["case_id"], outcome.browser_minutes)))
        self.db.batch(st)

    def take_learning(self, limit: int = 5000) -> list[dict]:
        """The learning rows not yet taken into a training build (oldest first); marks them taken in the same statement."""
        rows = self.db.execute(
            """
            UPDATE photo_learning SET exported_at = now()
            WHERE id IN (SELECT id FROM photo_learning WHERE exported_at IS NULL ORDER BY id LIMIT %s)
            RETURNING case_id, org_id, photo_id, content_hash, blob_path, model_name, label, changed
            """,
            (limit,),
        )
        return [{"case_id": r[0], "org_id": r[1], "photo_id": r[2], "content_hash": r[3], "blob_path": r[4], "model_name": r[5], "label": r[6], "changed": r[7]} for r in rows]

    def followup_cases(self) -> list[tuple[dict, list[dict]]]:
        try:
            cases = self.db.execute(
                """
                SELECT id, org_id, status, photos_done_at, merimen_caseid, photos_snapshot, extract(epoch from photos_done_at)
                FROM cases
                WHERE status IN ('phase_a', 'waiting_user', 'phase_b')
                """
            )
        except Exception as e:  # before migration 0010: no snapshot, no photo log; any other error fails the job
            if not _missing_0010(e):
                raise
            cases = [tuple(c[:5]) + (None, c[5]) for c in self.db.execute(
                "SELECT id, org_id, status, photos_done_at, merimen_caseid, extract(epoch from photos_done_at) FROM cases WHERE status IN ('phase_a', 'waiting_user', 'phase_b')"
            )]
        if not cases:
            return []
        by_case: dict[str, list[dict]] = {c[0]: [] for c in cases}
        for case_id, step, state, created in self.db.execute(
            "SELECT case_id, step, state, extract(epoch from created_at) FROM jobs WHERE case_id IN (SELECT id FROM cases WHERE status IN ('phase_a', 'waiting_user', 'phase_b'))"
        ):
            by_case.setdefault(case_id, []).append({"step": step, "state": state, "created_epoch": float(created) if created is not None else None})
        return [
            ({"id": c[0], "org_id": c[1], "status": c[2], "photos_done_at": c[3].isoformat() if c[3] else None, "merimen_caseid": c[4],
              "photos_snapshot": c[5], "done_epoch": float(c[6]) if c[6] is not None else None}, by_case[c[0]])
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

    def profile_for(self, org_id: str) -> dict | None:
        """What the user typed on the front page besides the login: workshop, manager, adjuster (migration 0013).
        `version` goes up by one on every save, so the worker can tell it must replace what it remembered for this user.
        None when nothing is saved or the columns are not there yet."""
        try:
            rows = self.db.execute(
                "SELECT workshop_name, manager_name, adjuster_name, profile_version FROM merimen_credentials WHERE org_id = %s",
                (org_id,),
            )
        except Exception as e:  # the columns come with migration 0013
            if "workshop_name" in str(e) or "42703" in str(e):
                return None
            raise
        if not rows:
            return None
        w, m, a, v = rows[0]
        return {"workshop": w, "manager": m, "adjuster": a, "version": int(v or 0)}

    def workshops_for(self, org_id: str) -> list[dict]:
        """The user's workshops (migration 0014): [{"slot": 1, "name": ...}, ...] by slot, up to three. Empty before the migration."""
        try:
            rows = self.db.execute("SELECT slot, name FROM merimen_workshops WHERE org_id = %s ORDER BY slot", (org_id,))
        except Exception as e:
            if _missing_workshops(e):
                return []
            raise
        return [{"slot": int(r[0]), "name": r[1]} for r in rows]

    def claim_workshop_for_case(self, case_id: str) -> dict | None:
        """Call this at the moment the case is made in Merimen, before typing the workshop. In one statement it fixes (locks) the
        workshop for this case, so the user can no longer switch it, and returns what to use: {"slot": n, "name": ...}.
        A case nobody moved is workshop 1. Asking again returns the same workshop and the same name, even if the workshop was renamed since.
        The lock is only written when the workshop has a name, so an unnamed workshop never freezes a case.
        Returns None when the case is unknown or its workshop has no name (for example the user removed that workshop).
        NEVER fall back to workshop 1 on None: stop the case and report it, or it is made in the wrong workshop.
        Before migration 0014 there is one workshop per account (the 0013 column) and nothing to lock."""
        try:
            rows = self.db.execute(
                """
                WITH cur AS (
                  SELECT c.id, COALESCE(cw.slot, 1) AS slot, cw.locked_at, cw.locked_name,
                         CASE WHEN COALESCE(cw.slot, 1) = 1 THEN COALESCE(w.name, mc.workshop_name) ELSE w.name END AS name
                  FROM cases c
                  LEFT JOIN merimen_case_workshop cw ON cw.case_id = c.id
                  LEFT JOIN merimen_workshops w ON w.org_id = c.org_id AND w.slot = COALESCE(cw.slot, 1)
                  LEFT JOIN merimen_credentials mc ON mc.org_id = c.org_id
                  WHERE c.id = %s
                ), claim AS (
                  INSERT INTO merimen_case_workshop (case_id, slot, locked_at, locked_name)
                  SELECT id, slot, now(), name FROM cur WHERE name IS NOT NULL
                  ON CONFLICT (case_id) DO UPDATE SET locked_at = COALESCE(merimen_case_workshop.locked_at, now()),
                                                      locked_name = COALESCE(merimen_case_workshop.locked_name, EXCLUDED.locked_name)
                  -- the user moved the case between our read and now: write nothing (no lock); the case then comes back as None
                  WHERE merimen_case_workshop.slot = EXCLUDED.slot
                  RETURNING slot, locked_name
                )
                SELECT COALESCE(claim.slot, cur.slot)::int,
                       CASE WHEN claim.slot IS NOT NULL THEN claim.locked_name WHEN cur.locked_at IS NOT NULL THEN cur.locked_name END
                FROM cur LEFT JOIN claim ON true
                """,
                (case_id,),
            )
        except Exception as e:
            if not _missing_workshops(e):
                raise
            rows = self.db.execute(
                "SELECT 1, mc.workshop_name FROM cases c LEFT JOIN merimen_credentials mc ON mc.org_id = c.org_id WHERE c.id = %s",
                (case_id,),
            )
        if not rows or not rows[0][1]:
            return None
        return {"slot": int(rows[0][0]), "name": rows[0][1]}

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
                  WHERE org_id = %s AND deleted_at IS NULL AND status IN ('phase_a', 'phase_b', 'checking')
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
                "INSERT INTO case_events (case_id, step, message) SELECT id, 'login', %s FROM cases WHERE org_id = %s AND deleted_at IS NULL AND status = 'waiting_user'",
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
