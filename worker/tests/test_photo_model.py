import json
import os

import pytest

from autopilot_worker.photos import (ModelError, Prediction, apply_name_rules, parse_predict_stdout, predict_timeout,
                                     resolve_production)

IDENT = lambda n: None if n == "General View" else n  # noqa: E731  a stand-in for name_map.final (None = banned)


def P(*top, conf=0.8):
    return Prediction("f.jpg", top[0], conf, tuple(top[1:3]), tuple(top))


def test_parse_keeps_every_name():
    out = parse_predict_stdout('{"file": "a.jpg", "top": [["Bonnet", 0.7], ["Fender LH", 0.2], ["Front Bumper", 0.1]], "conf": 0.7}')
    assert out[0].top == ("Bonnet", "Fender LH", "Front Bumper") and out[0].model_name == "Bonnet"


def test_banned_name_falls_to_next_guess():
    r = apply_name_rules([P("General View", "Front View", "Bonnet")], "PERODUA MYVI 1.3", IDENT)[0]
    assert r.model_name == "Front View" and r.alts == ("Bonnet",)


def test_perodua_never_front_panel_assembly():
    r = apply_name_rules([P("Front Panel Assembly", "Front Panel Upper", "Bonnet")], "PERODUA MYVI 1.3", IDENT)[0]
    assert r.model_name == "Front Panel Upper" and r.confidence == 0.3


def test_other_make_fender_inner_is_front_panel_assembly():
    r = apply_name_rules([P("Fender Inner RH", "Headlamp RH")], "HONDA HR-V 1.8L E", IDENT)[0]
    assert r.model_name == "Front Panel Assembly"
    assert apply_name_rules([P("Fender Inner RH")], "PERODUA BEZZA", IDENT)[0].model_name == "Fender Inner RH"


def test_viva_has_no_quarter_liner():
    r = apply_name_rules([P("Quarter Liner LH", "Rear Bumper")], "PERODUA VIVA 1000 EZ", IDENT)[0]
    assert r.model_name == "Rear Bumper"


def test_logo_badge_gets_the_brand():
    assert apply_name_rules([P("Grille Badge (LOGO)")], "proton saga", IDENT)[0].model_name == "Grille Badge (PROTON)"


def test_resolve_production_points_at_model_dir(tmp_path):
    d = tmp_path / "production"
    d.mkdir()
    (d / "production.json").write_text(json.dumps({"groups": [{"stage1": "models/a.pt", "seq": ["models/b.pt"]}]}))
    with pytest.raises(ModelError):
        resolve_production(str(tmp_path))  # weights not there yet
    (d / "a.pt").write_bytes(b"x")
    (d / "b.pt").write_bytes(b"x")
    cfg = json.load(open(resolve_production(str(tmp_path))))
    assert cfg["groups"][0]["stage1"] == os.path.join(str(d), "a.pt") and cfg["groups"][0]["seq"] == [os.path.join(str(d), "b.pt")]


def test_timeout_grows_with_photos():
    assert predict_timeout(10) == 600 and predict_timeout(150) == 1500


def test_real_name_rules_load_without_official_names():
    # official_names.txt is gitignored, so the worker image does not have it; the real rules must still load
    from autopilot_worker.photos import load_rules
    final, nr = load_rules()
    assert final.__name__ == "final" and nr.apply_case
    r = apply_name_rules([P("Grille Badge (LOGO)")], "PERODUA MYVI 1.3")[0]
    assert r.model_name == "Grille Badge (PERODUA)"


def test_rules_missing_fails_the_job(monkeypatch):
    import autopilot_worker.photos as ph
    monkeypatch.setattr(ph, "_PT", "/nonexistent")
    monkeypatch.setattr(ph, "_RULES", None)
    monkeypatch.setitem(__import__("sys").modules, "name_rules", None)  # import name_rules -> ImportError
    with pytest.raises(ModelError, match="name rules missing"):
        ph.apply_name_rules([P("Bonnet")], "PROTON SAGA", IDENT)


def test_rear_lamp_inner_makes_plain_rear_lamp_outer():
    out = apply_name_rules([P("Rear Lamp Inner LH"), P("Rear Lamp RH")], "TOYOTA VIOS", IDENT)
    assert [o.model_name for o in out] == ["Rear Lamp Inner LH", "Rear Lamp Outer RH"] and out[1].confidence == 0.59


def test_swap_also_when_vehicle_unknown():
    # same as naming.py build: only a car known to be a Perodua keeps Fender Inner
    assert apply_name_rules([P("Fender Inner LH")], "", IDENT)[0].model_name == "Front Panel Assembly"


def _prod(tmp_path):
    d = tmp_path / "production"
    d.mkdir()
    (d / "production.json").write_text(json.dumps({"groups": [{"stage1": "models/a.pt", "seq": []}]}))
    (d / "a.pt").write_bytes(b"x")


def test_resolve_production_safe_with_threads(tmp_path):
    import threading
    _prod(tmp_path)
    errs = []

    def run():
        for _ in range(200):
            try:
                json.load(open(resolve_production(str(tmp_path))))
            except Exception as e:  # noqa: BLE001
                errs.append(e)
    ts = [threading.Thread(target=run) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert not errs and not [f for f in os.listdir(tmp_path / "production") if f.endswith(".tmp")]


def test_broken_production_json_is_model_missing(tmp_path):
    d = tmp_path / "production"
    d.mkdir()
    (d / "production.json").write_text("{not json")
    with pytest.raises(ModelError, match="model missing"):
        resolve_production(str(tmp_path))


def test_revision_change_downloads_again(tmp_path, monkeypatch):
    import sys
    import types
    from autopilot_worker.photos import ensure_weights
    _prod(tmp_path)
    calls = []
    hub = types.SimpleNamespace(snapshot_download=lambda **kw: calls.append(kw["revision"]))
    monkeypatch.setitem(sys.modules, "huggingface_hub", hub)
    ensure_weights(str(tmp_path), "o/r", "tok")             # files there, no revision pinned: no download
    assert calls == []
    ensure_weights(str(tmp_path), "o/r", "tok", "abc123")   # pinned and the folder is not at it: download once
    ensure_weights(str(tmp_path), "o/r", "tok", "abc123")
    assert calls == ["abc123"]


def test_predict_env_has_no_secrets():
    from autopilot_worker.photos import predict_env
    env = predict_env({"PATH": "/bin", "HF_TOKEN": "x", "DATABASE_URL": "y", "MERIMEN_CRED_KEY": "z", "DINOV2_HUB": "/opt/h"},
                      {"PROD": "1", "VEHICLE": "PROTON SAGA"})
    assert env == {"PATH": "/bin", "DINOV2_HUB": "/opt/h", "PROD": "1", "VEHICLE": "PROTON SAGA"}


def test_predict_slot_one_at_a_time(tmp_path):
    import threading
    import time
    from autopilot_worker.photos import predict_slot
    inside, most = [0], [0]

    def run():
        with predict_slot(str(tmp_path)):
            inside[0] += 1
            most[0] = max(most[0], inside[0])
            time.sleep(0.02)
            inside[0] -= 1
    ts = [threading.Thread(target=run) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert most[0] == 1


def test_vehicle_with_spaces_is_still_a_perodua():
    assert apply_name_rules([P("Fender Inner LH")], "  PERODUA BEZZA", IDENT)[0].model_name == "Fender Inner LH"


# ---- the namer as the worker runs it (__main__._namer_factory), with subprocess and the download faked

def _namer(tmp_path, monkeypatch, run=None, token="tok"):
    import subprocess
    from autopilot_worker import __main__ as m
    from autopilot_worker.config import Config
    _prod(tmp_path)
    cfg = Config.from_env({"WORKER_STATE": str(tmp_path / "state"), "PHOTO_MODEL_DIR": str(tmp_path), "HF_TOKEN": token,
                           "DATABASE_URL": "postgres://secret"})
    seen = {}

    def fake_run(cmd, **kw):
        seen.update(kw)
        if run:
            return run(cmd, **kw)
        return subprocess.CompletedProcess(cmd, 0, '{"file": "1-a.jpg", "top": [["Grille Badge (LOGO)", 0.9]], "conf": 0.9}\n', "")
    monkeypatch.setattr(m.subprocess, "run", fake_run)
    monkeypatch.setenv("HF_TOKEN", "tok")
    monkeypatch.setenv("DATABASE_URL", "postgres://secret")
    return m._namer_factory(cfg), seen


def test_namer_names_with_rules_and_no_secrets(tmp_path, monkeypatch):
    namer, seen = _namer(tmp_path, monkeypatch)
    rows = namer([{"id": 7, "local": "/x/1-a.jpg"}], "PROTON SAGA")
    assert rows[0]["model_name"] == "Grille Badge (PROTON)" and not rows[0]["failed"]
    assert "HF_TOKEN" not in seen["env"] and "DATABASE_URL" not in seen["env"] and seen["env"]["VEHICLE"] == "PROTON SAGA"
    assert seen["timeout"] == 600


def test_namer_timeout_is_model_error(tmp_path, monkeypatch):
    import subprocess

    def boom(cmd, **kw):
        raise subprocess.TimeoutExpired(cmd, kw["timeout"])
    namer, _ = _namer(tmp_path, monkeypatch, run=boom)
    with pytest.raises(ModelError, match="predict timed out"):
        namer([{"id": 1, "local": "/x/1-a.jpg"}], "PROTON SAGA")


def test_namer_crash_is_predict_failed(tmp_path, monkeypatch):
    import subprocess
    namer, _ = _namer(tmp_path, monkeypatch, run=lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, "", "Traceback"))
    with pytest.raises(ModelError, match="predict failed"):
        namer([{"id": 1, "local": "/x/1-a.jpg"}], "PROTON SAGA")


def test_first_download_then_resolve(tmp_path, monkeypatch):
    import sys
    import types
    from autopilot_worker.photos import ensure_weights

    def dl(**kw):
        d = os.path.join(kw["local_dir"], "production")
        os.makedirs(d, exist_ok=True)
        json.dump({"groups": [{"stage1": "models/a.pt", "seq": []}]}, open(os.path.join(d, "production.json"), "w"))
        open(os.path.join(d, "a.pt"), "wb").write(b"x")
    monkeypatch.setitem(sys.modules, "huggingface_hub", types.SimpleNamespace(snapshot_download=dl))
    out = ensure_weights(str(tmp_path), "o/r", "tok")
    assert json.load(open(out))["groups"][0]["stage1"] == os.path.join(str(tmp_path), "production", "a.pt")


def test_no_token_no_files_is_model_missing(tmp_path):
    from autopilot_worker.photos import ensure_weights
    with pytest.raises(ModelError, match="model missing"):
        ensure_weights(str(tmp_path), "o/r", "")


def test_download_error_hides_the_token(tmp_path, monkeypatch):
    import sys
    import types
    from autopilot_worker.photos import ensure_weights

    def dl(**kw):
        raise RuntimeError(f"401 for token {kw['token']}")
    monkeypatch.setitem(sys.modules, "huggingface_hub", types.SimpleNamespace(snapshot_download=dl))
    with pytest.raises(ModelError) as e:
        ensure_weights(str(tmp_path), "o/r", "hf_SECRET")
    assert str(e.value) == "model download failed" and e.value.__cause__ is None and e.value.__suppress_context__


def test_new_revision_without_token_is_model_missing(tmp_path, monkeypatch):
    import sys
    import types
    from autopilot_worker.photos import ensure_weights
    _prod(tmp_path)
    calls = []
    monkeypatch.setitem(sys.modules, "huggingface_hub", types.SimpleNamespace(snapshot_download=lambda **kw: calls.append(1)))
    with pytest.raises(ModelError, match="model missing"):
        ensure_weights(str(tmp_path), "o/r", "", "newsha")
    assert calls == []


def test_empty_groups_is_model_missing(tmp_path):
    d = tmp_path / "production"
    d.mkdir()
    (d / "production.json").write_text(json.dumps({"groups": []}))
    with pytest.raises(ModelError, match="model missing"):
        resolve_production(str(tmp_path))


def test_namer_garbled_output_is_predict_failed(tmp_path, monkeypatch):
    import subprocess
    namer, _ = _namer(tmp_path, monkeypatch, run=lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0, "{not json\n", ""))
    with pytest.raises(ModelError, match="predict failed"):
        namer([{"id": 1, "local": "/x/1-a.jpg"}], "PROTON SAGA")


def test_load_rules_leaves_sys_path_alone():
    import sys
    from autopilot_worker.photos import load_rules
    before = list(sys.path)
    load_rules()
    assert sys.path == before


def test_case_vehicle_falls_back_to_the_registration_card():
    from autopilot_worker.pipeline import case_vehicle
    assert case_vehicle({"car_model": " PROTON SAGA "}) == "PROTON SAGA"
    assert case_vehicle({"car_model": None, "case_data": {"client_vehicle": {"model": "PERODUA MYVI"}}}) == "PERODUA MYVI"
    assert case_vehicle({}) == ""


def test_rules_need_name_decisions(monkeypatch, tmp_path):
    import autopilot_worker.photos as ph
    monkeypatch.setattr(ph, "_PT", str(tmp_path))
    monkeypatch.setattr(ph, "_RULES", None)
    with pytest.raises(ModelError, match="name rules missing"):
        ph.load_rules()


def test_rear_lamp_rule_reads_the_shared_playbook():
    import sys
    from autopilot_worker.photos import load_rules
    _, nr = load_rules()
    assert nr._LAMP_UNSURE == 0.59 and ["LAND", "ROVER"] in nr._TWO_WORD and nr._RULES_JSON


def test_model_bans_and_swaps_come_from_the_playbook():
    import json
    from autopilot_worker.photos import load_rules
    _, nr = load_rules()
    pr = json.load(open(nr._RULES_JSON, encoding="utf-8"))
    assert nr.MODEL_BANS == [(b["vehicle"], b["name"]) for b in pr["modelBans"]] and nr.MODEL_BANS
    assert nr.MODEL_SWAPS == [(w["notVehicle"], w["name"], w["to"]) for w in pr["modelSwaps"]] and nr.MODEL_SWAPS


def test_load_rules_is_loaded_once():
    from autopilot_worker.photos import load_rules
    assert load_rules() is load_rules()


def test_namer_other_errors_fall_back_to_claude(tmp_path, monkeypatch):
    def nolaunch(cmd, **kw):
        raise OSError("No space left on device")
    namer, _ = _namer(tmp_path, monkeypatch, run=nolaunch)
    with pytest.raises(ModelError, match="predict failed"):
        namer([{"id": 1, "local": "/x/1-a.jpg"}], "PROTON SAGA")


def test_namer_skips_a_photo_that_was_not_downloaded(tmp_path, monkeypatch):
    seen = {}

    def run(cmd, **kw):
        import subprocess
        seen["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, '{"file": "1-a.jpg", "top": [["Bonnet", 0.9]], "conf": 0.9}\n', "")
    namer, _ = _namer(tmp_path, monkeypatch, run=run)
    rows = namer([{"id": 1, "local": "/x/1-a.jpg"}, {"id": 2, "src_name": "b.jpg"}], "PROTON SAGA")
    assert "b.jpg" not in seen["cmd"] and "/x/1-a.jpg" in seen["cmd"]
    assert rows[0]["model_name"] == "Bonnet" and rows[1]["failed"] and rows[1]["name_error"] == "worker: no prediction"
