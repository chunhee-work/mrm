"""HTTP wrapper of the photo-model service (plan: chunhee-work/mrm#26, Revision 6).

POST /jobs        signed multipart: meta (JSON) + photos in shooting order -> {job_id, status}
GET  /jobs/{id}   signed -> {status, queue_position, error?, results?}
GET  /health      unsigned, no secrets: {ok, busy, waiting}
GET  /labels      signed -> label list of the pinned checkpoints (used once, in the dry run)

Logging: no request bodies, file names, headers or vehicle text ever reach a log. Access logging is off and every error
answers with a short generic body.
"""
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from typing import List

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

import core

MAX_PHOTOS = int(os.environ.get("MAX_PHOTOS", "120"))
MAX_PHOTO_BYTES = int(os.environ.get("MAX_PHOTO_BYTES", str(8 * 1024 * 1024)))
MAX_TOTAL_BYTES = int(os.environ.get("MAX_TOTAL_BYTES", str(200 * 1024 * 1024)))
MAX_WAITING = int(os.environ.get("MAX_WAITING", "3"))
RUN_LIMIT_S = int(os.environ.get("RUN_LIMIT_S", "1800"))

logging.getLogger("uvicorn.access").disabled = True
log = logging.getLogger("photo-model")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)  # no schema page, no debug
queue = core.Queue(MAX_WAITING, RUN_LIMIT_S, os.environ.get("WORK_DIR", tempfile.gettempdir()))
queue.start()


def deny(code: int, error: str) -> JSONResponse:
    return JSONResponse({"error": error}, status_code=code)


@app.middleware("http")
async def size_guard(request: Request, call_next):
    """Refuse an oversize upload from its declared length, before the multipart body is parsed."""
    n = request.headers.get("content-length")
    if request.method == "POST" and n and n.isdigit() and int(n) > MAX_TOTAL_BYTES + 1024 * 1024:
        return deny(413, "too_large")
    return await call_next(request)


@app.exception_handler(Exception)
async def generic(_req: Request, exc: Exception):
    log.error("error %s", exc.__class__.__name__)  # class name only: a parse error must not leak a file name
    return deny(500, "server")


@app.get("/health")
def health():
    return {"ok": True, "busy": any(j.status == "running" for j in queue.jobs.values()), "waiting": queue.waiting()}


@app.post("/jobs")
async def post_job(request: Request, meta: str = Form(...), photos: List[UploadFile] = File(...)):
    secrets = core.secrets_from_env()
    if not secrets:
        return deny(401, "unauthorized")
    ts = request.headers.get("x-photo-ts", "")
    sig = request.headers.get("x-photo-sig", "")
    try:
        m = json.loads(meta)
        case_id, job_id, order_hash, vehicle = str(m["case_id"]), str(m["job_id"]), str(m["order_hash"]), str(m.get("vehicle", ""))
    except Exception:
        return deny(400, "invalid")
    if not (1 <= len(photos) <= MAX_PHOTOS):
        return deny(400, "photo_count")
    data = []
    total = 0
    for f in photos:
        b = await f.read(MAX_PHOTO_BYTES + 1)
        total += len(b)
        if len(b) > MAX_PHOTO_BYTES or total > MAX_TOTAL_BYTES:
            return deny(413, "too_large")
        ext = core.photo_ext(f.content_type or "", "")
        if ext is None:
            return deny(415, "format")
        data.append((ext, b))
    # The signature covers the sha256 of every received photo, so a changed or reordered photo is a 401, before any model work.
    canon = core.canonical_post(ts, case_id, job_id, order_hash, vehicle, [core.sha256_hex(b) for _, b in data])
    if not core.check_signature(secrets, canon, sig, ts):
        return deny(401, "unauthorized")
    if not job_id.replace("-", "").isalnum() or len(job_id) > 64:
        return deny(400, "invalid")
    try:
        job = queue.submit(job_id, canon, vehicle, data)
    except core.Full:
        return deny(429, "busy")
    except core.Mismatch:
        return deny(409, "job_id_reused")
    return JSONResponse({"job_id": job.job_id, "status": job.status}, status_code=202)


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    secrets = core.secrets_from_env()
    ts = request.headers.get("x-photo-ts", "")
    if not core.check_signature(secrets, core.canonical_get(ts, job_id), request.headers.get("x-photo-sig", ""), ts):
        return deny(401, "unauthorized")
    job = queue.seen(job_id)
    if job is None:
        return deny(404, "unknown_job")
    pos = None
    if job.status == "queued":
        pos = [j for j in queue.order if queue.jobs[j].status in ("queued", "running")].index(job_id)
    body = {"status": job.status, "queue_position": pos}
    if job.status == "failed":
        body["error"] = job.error
    if job.status == "done":
        body["results"] = job.results
    return body


@app.get("/labels")
def labels(request: Request):
    secrets = core.secrets_from_env()
    ts = request.headers.get("x-photo-ts", "")
    if not core.check_signature(secrets, core.canonical_get(ts, "labels"), request.headers.get("x-photo-sig", ""), ts):
        return deny(401, "unauthorized")
    here = os.path.dirname(os.path.abspath(__file__))
    p = subprocess.run([sys.executable, os.path.join(here, "dump_labels.py")], capture_output=True, text=True, timeout=600,
                       env={"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", ""), "PROD_FILE": os.path.join(here, "models", "production.json")})
    if p.returncode != 0:
        return deny(500, "server")
    return JSONResponse(json.loads(p.stdout))
