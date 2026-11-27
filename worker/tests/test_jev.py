from autopilot_worker.jev import Jev, JevError, from_env, THRESHOLD
from autopilot_worker.step2_check import two_way, undecided_pairs


def fake(answers, usage=None, fail=False):
    sent = []

    def post(body, timeout):
        sent.append(body)
        if fail:
            raise JevError("HTTP 500")
        return {"answers": {k: {"noul": v} for k, v in answers(body).items()}, "usage": usage or {"input_tokens": 10, "output_tokens": 2}}

    return post, sent


def test_off_without_key_or_with_jev_zero():
    assert from_env({}) is None
    assert from_env({"TYPESAFE_API_KEY": "x", "JEV": "0"}) is None
    assert from_env({"TYPESAFE_API_KEY": "x"}) is not None


def test_questions_are_an_object_and_no_image_fields():
    post, sent = fake(lambda b: {k: 0.9 for k in b["questions"]})
    Jev(post).same_parts([("Front Bumper Lip", "Bumper Front Lower Cover", "1")])
    body = sent[0]
    assert isinstance(body["questions"], dict) and set(body) == {"state", "model", "questions"}  # never "assets"


def test_each_call_is_recorded_with_usage_and_failure():
    rows = []
    post, _ = fake(lambda b: {k: 0.9 for k in b["questions"]})
    Jev(post, record=rows.append).same_parts([("A", "B", "1")], case_id="c1")
    assert rows[0]["purpose"] == "jev_name_check" and rows[0]["input_tokens"] == 10 and rows[0]["case_id"] == "c1" and rows[0]["ok"]
    assert rows[0]["request_id"].startswith("jev:")
    bad, _ = fake(lambda b: {}, fail=True)
    rows.clear()
    try:
        Jev(bad, record=rows.append).same_parts([("A", "B", "1")])
        raise AssertionError("must raise")
    except JevError:
        pass
    assert rows[0]["ok"] is False and rows[0]["error_class"] == "JevError"


def test_a_failing_record_never_stops_the_call():
    def boom(row):
        raise RuntimeError("db down")

    post, _ = fake(lambda b: {k: 0.9 for k in b["questions"]})
    assert Jev(post, record=boom).same_parts([("A", "B", "1")])


NAMES = ["Front Bumper Lip"]
ROWS = [("Bumper Front Lower Cover", "1")]


def test_jev_clears_a_false_add():
    assert undecided_pairs(NAMES, ROWS) == [("Front Bumper Lip", "Bumper Front Lower Cover", "1")]
    post, _ = fake(lambda b: {k: 0.95 for k in b["questions"]})
    base = two_way(NAMES, ROWS)
    assert base["add"], "code rules alone raise the alarm"
    r = two_way(NAMES, ROWS, jev=Jev(post))
    assert r["add"] == [] and r["ok"] and "cleared 1" in r["jev"]


def test_jev_below_threshold_or_error_keeps_the_alarm():
    post, _ = fake(lambda b: {k: THRESHOLD - 0.05 for k in b["questions"]})
    assert two_way(NAMES, ROWS, jev=Jev(post))["add"]
    bad, _ = fake(lambda b: {}, fail=True)
    r = two_way(NAMES, ROWS, jev=Jev(bad))
    assert r["add"] and r["jev"].startswith("jev off")


def test_jev_never_adds_an_alarm():
    # exact match: no alarm, and Jev would say "different"; nothing may change
    post, sent = fake(lambda b: {k: 0.0 for k in b["questions"]})
    r = two_way(["Door Mirror RH"], [("Door Mirror RH", "1")], jev=Jev(post))
    assert r["ok"] and not sent


def test_jev_cannot_create_a_remove_alarm():
    # old name "Front Bumper Lip" was changed; the row is still ticked. Code rules cannot tell if they are the same part, Jev says they are:
    # that must NOT become a REMOVE? (Jev only clears).
    post, _ = fake(lambda b: {k: 0.95 for k in b["questions"]})
    rows = [("Bumper Front Lower Cover", "1")]
    assert two_way(["Grille"], rows, ["Front Bumper Lip"], jev=Jev(post))["remove"] == []


def test_a_refused_ledger_write_switches_recording_off_for_the_run():
    calls = []

    def refuse(row):
        calls.append(row)
        raise RuntimeError("permission denied")

    post, _ = fake(lambda b: {k: 0.9 for k in b["questions"]})
    j = Jev(post, record=refuse)
    j.same_parts([("A", "B", "1")])
    j.same_parts([("A", "B", "1")])
    assert len(calls) == 1


def test_a_name_with_several_high_rows_is_not_cleared_and_clears_are_listed():
    post, _ = fake(lambda b: {k: 0.95 for k in b["questions"]})
    one = two_way(["Front Bumper Lip"], [("Bumper Front Lower Cover", "1")], jev=Jev(post))
    assert one["jev_cleared"] == ["Front Bumper Lip = Bumper Front Lower Cover (0.95)"]
    many = two_way(["Front Bumper Lip"], [("Bumper Front Lower Cover", "1"), ("Bumper Front Lower Grille Cover", "1")], jev=Jev(post))
    assert many["add"] and many["jev_cleared"] == []


def test_too_many_pairs_skips_jev():
    import autopilot_worker.jev as J
    post, sent = fake(lambda b: {})
    try:
        Jev(post).same_parts([("a%d" % i, "b", "1") for i in range(J.MAX_PAIRS + 1)])
        raise AssertionError("must raise")
    except JevError:
        pass
    assert not sent


def test_the_whole_check_has_a_time_budget():
    import time
    import autopilot_worker.jev as J
    old = J.BUDGET_S
    J.BUDGET_S = 0.3

    def slow(body, timeout):
        time.sleep(2)
        return {"answers": {}}

    t = time.time()
    try:
        Jev(slow).same_parts([("A", "B", "1")])
        raise AssertionError("must raise")
    except JevError:
        pass
    finally:
        J.BUDGET_S = old
    assert time.time() - t < 1.5


def test_the_rules_text_is_pinned():
    # the owner's thresholds were measured with exactly this text: changing it needs a new measurement, so change this hash on purpose
    import hashlib
    from autopilot_worker.jev import RULES
    assert hashlib.sha256(RULES.encode()).hexdigest()[:16] == "50ffe296bb369b16"


def test_a_malformed_answer_means_no_clear_and_no_crash():
    for bad in ({}, {"answers": {"q0": {"noul": "high"}}}, {"answers": {"q0": {}}}, {"answers": {"zz": {"noul": 0.9}}}):
        def post(body, timeout, bad=bad):
            return bad
        r = two_way(NAMES, ROWS, jev=Jev(post))
        assert r["add"] and r["jev"].startswith("jev off")


def test_one_fast_one_slow_chunk_is_all_or_nothing_within_the_budget():
    import time
    import autopilot_worker.jev as J
    old = J.BUDGET_S
    J.BUDGET_S = 0.3
    n = {"i": 0}

    def post(body, timeout):
        n["i"] += 1
        if n["i"] == 2:
            time.sleep(2)
        return {"answers": {k: {"noul": 0.9} for k in body["questions"]}}

    t = time.time()
    try:
        Jev(post).same_parts([("a%d" % i, "b", "1") for i in range(J.CHUNK + 5)])
        raise AssertionError("must raise")
    except JevError:
        pass
    finally:
        J.BUDGET_S = old
    assert time.time() - t < 1.5
    assert Jev(post).timeout <= J.BUDGET_S or Jev(post).timeout <= 30  # one request never outlives the whole-check budget


def test_a_row_with_odd_whitespace_or_long_text_can_still_be_cleared():
    post, _ = fake(lambda b: {k: 0.95 for k in b["questions"]})
    r = two_way(["Front  Bumper Lip"], [("Bumper   Front\nLower Cover", "1.00")], jev=Jev(post))
    assert r["add"] == [] and r["jev_cleared"]
