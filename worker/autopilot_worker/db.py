"""Database transport. `http` (default) talks to Neon's SQL-over-HTTPS endpoint, so the box needs no outbound port 5432.
`tcp` is plain psycopg. Both take `%s` / `%(name)s` placeholders and return rows as tuples.
`batch()` runs several statements in ONE transaction (one HTTPS request on `http`). Nothing here logs a connection string."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from decimal import Decimal
from urllib.parse import urlparse

_PLACEHOLDER = re.compile(r"%%|%\((\w+)\)s|%s")


class DbError(RuntimeError):
    """Message and code only. Never the connection string or the parameters."""

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message[:200])
        self.code = code


def to_numbered(sql: str, params) -> tuple[str, list]:
    """`%s` / `%(name)s` -> `$1`, `$2`. A named placeholder used twice reuses its number."""
    out: list = []
    index: dict[str, int] = {}
    pos = iter(params if isinstance(params, (list, tuple)) else ())

    def sub(m: re.Match) -> str:
        if m.group(0) == "%%":
            return "%"
        name = m.group(1)
        if name is None:
            out.append(next(pos))
            return f"${len(out)}"
        if name not in index:
            out.append(params[name])
            index[name] = len(out)
        return f"${index[name]}"

    return _PLACEHOLDER.sub(sub, sql), out


def wire_param(v):
    """Every parameter travels as text and the server infers the type, like psycopg's text mode."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def from_wire(value, oid: int):
    if value is None:
        return None
    if oid == 16:
        return value in ("t", "true", True)
    if oid in (20, 21, 23, 26):
        return int(value)
    if oid in (700, 701):
        return float(value)
    if oid == 1700:
        return Decimal(value)
    if oid in (114, 3802):
        return json.loads(value)
    if oid in (1114, 1184):
        return datetime.fromisoformat(value.replace(" ", "T", 1) if "T" not in value else value)
    return value


class HttpDb:
    def __init__(self, url: str, *, opener=None, retries: int = 3, sleep=time.sleep):
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        parts = urlparse(url)
        if not parts.hostname:
            raise RuntimeError("DATABASE_URL has no host")
        self._conn_string = url
        self.endpoint = f"https://{parts.hostname}/sql"
        self._open = opener or urllib.request.urlopen
        self._retries = retries
        self._sleep = sleep

    def _post(self, body: dict, *, retry: bool) -> dict:
        data = json.dumps(body).encode()
        attempts = self._retries if retry else 1
        for n in range(attempts):
            req = urllib.request.Request(
                self.endpoint, data=data, method="POST",
                headers={
                    "Neon-Connection-String": self._conn_string,
                    "Neon-Raw-Text-Output": "true",
                    "Neon-Array-Mode": "true",
                    "Content-Type": "application/json",
                },
            )
            try:
                with self._open(req, timeout=30) as r:
                    return json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e:
                try:
                    detail = json.loads(e.read() or b"{}")
                except Exception:
                    detail = {}
                if e.code >= 500 and n + 1 < attempts:
                    self._sleep(0.5 * (n + 1))
                    continue
                raise DbError(str(detail.get("message") or f"http {e.code}"), detail.get("code")) from None
            except (urllib.error.URLError, TimeoutError, OSError):
                if n + 1 < attempts:
                    self._sleep(0.5 * (n + 1))
                    continue
                raise DbError("database unreachable") from None
        raise DbError("database unreachable")

    @staticmethod
    def _rows(result: dict) -> list[tuple]:
        oids = [f.get("dataTypeID", 0) for f in result.get("fields") or []]
        return [tuple(from_wire(v, oids[i] if i < len(oids) else 0) for i, v in enumerate(row)) for row in result.get("rows") or []]

    def execute(self, sql: str, params=()) -> list[tuple]:
        text, args = to_numbered(sql, params)
        # Only reads are repeated after a dropped answer. A write may already have run.
        res = self._post({"query": text, "params": [wire_param(a) for a in args]}, retry=sql.lstrip().upper().startswith("SELECT"))
        return self._rows(res)

    def batch(self, statements: list[tuple[str, object]]) -> list[list[tuple]]:
        if not statements:
            return []
        queries = []
        for sql, params in statements:
            text, args = to_numbered(sql, params)
            queries.append({"query": text, "params": [wire_param(a) for a in args]})
        res = self._post({"queries": queries}, retry=False)
        return [self._rows(r) for r in res.get("results") or []]


class TcpDb:
    def __init__(self, url: str):
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        self.url = url

    def _conn(self):
        import psycopg

        return psycopg.connect(self.url)

    def execute(self, sql: str, params=()) -> list[tuple]:
        with self._conn() as conn:
            cur = conn.execute(sql, params)
            return cur.fetchall() if cur.description else []

    def batch(self, statements: list[tuple[str, object]]) -> list[list[tuple]]:
        out: list[list[tuple]] = []
        with self._conn() as conn:
            with conn.transaction():
                for sql, params in statements:
                    cur = conn.execute(sql, params)
                    out.append(cur.fetchall() if cur.description else [])
        return out


def make_db(url: str, transport: str = "http"):
    if transport == "http":
        return HttpDb(url)
    if transport == "tcp":
        return TcpDb(url)
    raise ValueError("DB_TRANSPORT must be http or tcp")
