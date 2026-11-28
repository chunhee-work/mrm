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
    # official_names.txt is gitignored, so the worker image does not have it; name_map.final must still load
    from autopilot_worker.photos import _final_fn
    f = _final_fn()
    assert f.__name__ == "final"
    r = apply_name_rules([P("Grille Badge (LOGO)")], "PERODUA MYVI 1.3", f)[0]
    assert r.model_name == "Grille Badge (PERODUA)"
