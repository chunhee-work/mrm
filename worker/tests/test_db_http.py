import io
import json
import urllib.error
from datetime import datetime

import pytest

from autopilot_worker.config import Config
from autopilot_worker.db import DbError, HttpDb, TcpDb, from_wire, make_db, to_numbered, wire_param

URL = "postgresql://autopilot_worker:s3cret-pw@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"


class Resp:
    def __init__(self, body):
        self.b = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self.b


def test_placeholders_numbered_and_named_reused():
    sql, args = to_numbered("WHERE a = %(x)s AND b = %(x)s AND c = %(y)s AND d LIKE '5%%'", {"x": 1, "y": 2})
    assert sql == "WHERE a = $1 AND b = $1 AND c = $2 AND d LIKE '5%'" and args == [1, 2]
    assert to_numbered("VALUES (%s, %s::jsonb)", ("a", "{}")) == ("VALUES ($1, $2::jsonb)", ["a", "{}"])


def test_wire_values():
    assert [wire_param(v) for v in (None, True, False, 3, "x", {"a": 1}, ["b"])] == [None, "true", "false", "3", "x", '{"a": 1}', '["b"]']
    assert from_wire("t", 16) is True and from_wire("12", 20) == 12 and from_wire('["a"]', 3802) == ["a"]
    assert from_wire("2026-11-21 14:35:50.123+00", 1184) == datetime.fromisoformat("2026-11-21T14:35:50.123+00:00")
    assert from_wire(None, 25) is None and from_wire("abc", 25) == "abc"


def test_execute_posts_to_sql_endpoint_with_connection_header():
    seen = {}

    def opener(req, timeout):
        seen.update(url=req.full_url, headers={k.lower(): v for k, v in req.header_items()}, body=json.loads(req.data))
        return Resp({"rows": [["5", "t", None, '{"k":1}']], "fields": [{"dataTypeID": 20}, {"dataTypeID": 16}, {"dataTypeID": 25}, {"dataTypeID": 3802}]})

    db = HttpDb(URL, opener=opener)
    rows = db.execute("SELECT id FROM jobs WHERE state = %s AND ok = %s", ("queued", True))
    assert rows == [(5, True, None, {"k": 1})]
    assert seen["url"] == "https://ep-x-pooler.ap-southeast-1.aws.neon.tech/sql"
    assert seen["headers"]["neon-connection-string"] == URL
    assert seen["headers"]["neon-array-mode"] == "true" and seen["headers"]["neon-raw-text-output"] == "true"
    assert seen["body"] == {"query": "SELECT id FROM jobs WHERE state = $1 AND ok = $2", "params": ["queued", "true"]}


def test_batch_is_one_request_one_transaction():
    calls = []

    def opener(req, timeout):
        calls.append(json.loads(req.data))
        return Resp({"results": [{"rows": [], "fields": []}, {"rows": [["1"]], "fields": [{"dataTypeID": 23}]}]})

    out = HttpDb(URL, opener=opener).batch([("UPDATE a SET x = %s", (1,)), ("SELECT %s", (1,))])
    assert len(calls) == 1 and [q["query"] for q in calls[0]["queries"]] == ["UPDATE a SET x = $1", "SELECT $1"]
    assert out == [[], [(1,)]]


def test_only_reads_are_retried_and_errors_never_show_the_connection_string():
    n = {"c": 0}

    def flaky(req, timeout):
        n["c"] += 1
        raise urllib.error.URLError("boom " + URL)

    db = HttpDb(URL, opener=flaky, sleep=lambda s: None)
    with pytest.raises(DbError) as e:
        db.execute("SELECT 1")
    assert n["c"] == 3 and "s3cret" not in str(e.value)
    n["c"] = 0
    with pytest.raises(DbError):
        db.execute("UPDATE jobs SET state = 'x'")
    assert n["c"] == 1  # a write may already have run: no blind repeat

    def bad(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 400, "x", {}, io.BytesIO(json.dumps({"message": "relation does not exist", "code": "42P01"}).encode()))

    with pytest.raises(DbError) as e2:
        HttpDb(URL, opener=bad).execute("SELECT 1")
    assert e2.value.code == "42P01" and "s3cret" not in str(e2.value)


def test_transport_switch_and_default(monkeypatch):
    assert isinstance(make_db(URL), HttpDb) and isinstance(make_db(URL, "tcp"), TcpDb)
    with pytest.raises(ValueError):
        make_db(URL, "ws")
    assert Config.from_env({}).db_transport == "http"
    assert Config.from_env({"DB_TRANSPORT": "tcp"}).db_transport == "tcp"
    with pytest.raises(ValueError):
        Config.from_env({"DB_TRANSPORT": "websocket"})
    c = Config.from_env({"SCREENSHOT_RETENTION_DAYS": "30", "JOB_LEASE_SECONDS": "300", "WORKER_UI": "on"})
    assert (c.retention_days, c.lease_seconds, c.worker_ui) == (30, 300, True)
    assert Config.from_env({}).retention_days == 90
