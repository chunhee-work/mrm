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
