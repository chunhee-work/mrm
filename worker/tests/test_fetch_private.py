"""A Blob download survives a passing network blip (2026-11-29: one URLError failed a whole Phase A of 54 files)."""

import io
import os
import urllib.error

import pytest

from autopilot_worker.blobstore import fetch_private


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener_failing(times, calls):
    def op(req, timeout):
        calls.append(timeout)
        if len(calls) <= times:
            raise urllib.error.URLError("timed out")
        return Resp(b"%PDF data")
    return op


def test_a_blip_is_tried_again(tmp_path):
    calls, slept = [], []
    target = str(tmp_path / "c" / "j" / "f1-a.pdf")
    got = fetch_private(target, "https://x", {}, opener=opener_failing(2, calls), sleep=slept.append)
    assert got == target and open(target, "rb").read() == b"%PDF data"
    assert len(calls) == 3 and slept == [3, 10] and not os.path.exists(target + ".part")
    assert oct(os.stat(target).st_mode & 0o777) == "0o600"


def test_three_failures_raise(tmp_path):
    calls = []
    with pytest.raises(urllib.error.URLError):
        fetch_private(str(tmp_path / "c" / "j" / "f1-a.pdf"), "https://x", {}, opener=opener_failing(9, calls), sleep=lambda s: None)
    assert len(calls) == 3


def test_a_file_a_former_try_got_is_reused(tmp_path):
    target = tmp_path / "c" / "j" / "f1-a.pdf"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"done")
    calls = []
    assert fetch_private(str(target), "https://x", {}, opener=opener_failing(0, calls)) == str(target)
    assert calls == []
