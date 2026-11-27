"""The create-case step against a local stand-in for Merimen's pages (Playwright routes). The live selectors come from the owner's script;
what is tested here is the order, the checks before saving, and every stop."""
import pytest

from autopilot_worker.create_spec import build_spec
from autopilot_worker.merimen_create import MerimenCreate, keywords_for, norm, pick_person, pick_workshop_row, session_query
from test_create_spec import PROFILE, WORKSHOP, case_data

LOGGED_IN = "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&CFID=11&CFTOKEN=22&USID=33&RID=44"


def test_session_query_keeps_only_the_four_marks_and_refuses_other_pages():
    assert session_query(LOGGED_IN) == "CFID=11&CFTOKEN=22&USID=33&RID=44"
    assert session_query("https://www.merimen.com.my/claims/index.cfm?fusebox=x") is None
    assert session_query("https://evil.example/claims/index.cfm?CFID=1&RID=2") is None
    assert session_query("http://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2") is None


def test_pick_person_prefers_the_exact_name_and_the_hq_option():
    opts = [("", "-- select --"), ("1", "Terrence Chia"), ("2", "(HQ) Terrence Chia"), ("3", "(HQ) Terrence Chia Kok")]
    assert pick_person(opts, "Terrence Chia") == "2"
    assert pick_person(opts, "terrence  chia") == "2"
    assert pick_person([("1", "Someone Else")], "Terrence Chia") is None
    assert pick_person(opts, "") is None
    # no exact name: a short option text inside a longer typed name is NOT a match, and two partial hits are not guessed between
    assert pick_person([("1", "Tan"), ("2", "Ng")], "Tan Ah Kow") is None
    assert pick_person([("1", "Tan Ah Kow Junior"), ("2", "Tan Ah Kow Senior")], "Tan Ah Kow") is None
    assert pick_person([("1", "Tan Ah Kow Junior"), ("2", "Lim")], "Tan Ah Kow") == "1"


def test_pick_workshop_row_is_exactly_one_never_the_first_of_several():
    rows = ["Motor Repairer - Bengkel Kereta Sinar Gemilang - Kemaman", "Motor Repairer - Bengkel Kereta Sinar Jaya - Kuantan"]
    assert pick_workshop_row(rows, "Bengkel Kereta Sinar Gemilang") == (0, "")
    assert pick_workshop_row(rows, "Bengkel Kereta Sinar") == (None, "workshop_ambiguous")
    assert pick_workshop_row(rows, "Lee Kean Hin") == (None, "workshop_not_found")
    two = ["Lee Kean Hin Car Body Repairs (HQ)", "Lee Kean Hin Car Body Repairs - Ipoh"]
    assert pick_workshop_row(two, "Lee Kean Hin") == (0, "")  # one "(HQ)" row settles it
    assert keywords_for("Bengkel Kereta Sinar Gemilang") == ["bengkel kereta sinar gemilang", "bengkel kereta sinar", "bengkel kereta"]
    assert norm("(HQ) Abc-D") == "abc d"


# ---- a stand-in for the create form ----
FORM = """<html><body><form name="ClaimHeader" onsubmit="return false">
<select name="ddlbInsurer" onchange="document.querySelector('[name=ddlbINSCOID]').innerHTML='<option value=1>ET/EI HQ</option><option value=2>Klang Valley</option>'">
 <option value="">-</option><option value="35">Allianz</option><option value="61">Liberty</option></select>
<select name="ddlbINSCOID"><option value="">-</option></select>
<select name="ddlbCLAIMTYPE"><option value="">-</option><option value="TP">Third Party Vehicle Damage (TP)</option></select>
<input name="sleCURINSCOID"><input name="sleACCDATE">
<select name="sleACCTIME"><option value="">-</option><option value="21">21:00-21:59 (Night)</option></select>
<input type=radio name="sleCLMnmsel" value="2"><input name="sleCLMnm"><input name="sleCLMID1"><input name="sleREGNO"><input name="sleCHANO">
<button id="MTRworkshopbtn" type="button" onclick="window.open('/claims/popup','ws','width=400,height=300')">Lookup</button>
<input name="ddlbREPCOIDTEXT"><input name="ddlbREPCOID">
<input name="slePOLNO"><input type=checkbox name="siISCOVERNOTE"><input name="slePOLFROM"><input name="slePOLTO">
<select name="ddlbNEWPOL"><option value="">-</option><option value="1">Yes</option></select>
<input name="sleInm"><input name="sleIID1"><input name="sleIPhone1"><input name="sleTPnm"><input name="sleTPID1"><input name="sleTPREGNO">
<input type=checkbox id="TPOWN" name="" onclick="document.querySelector('[name=ddlb3INSCOID]').disabled=!this.checked;document.querySelector('[name=sleTPPOLNO]').disabled=!this.checked">
<select name="ddlb3INSCOID" disabled><option value="">-</option><option value="9616">Zurich General Takaful</option></select><input name="sleTPPOLNO" disabled>
<select name="ddlbDAMTYPE"><option value="">-</option><option value="0">Collision</option></select>
<textarea name="mleLossDesc"></textarea>
<select name="sleINITIALEST_DD"><option value="">-</option><option value="x">10,000 - 12,500</option></select>
<select name="ddlbPOLCOVER"><option value="">-</option><option value="1">Comprehensive</option><option value="2">TPFT</option></select>
<select name="ddlbMan" onchange="fill(this.value)"><option value="">-</option><option value="60">PERODUA</option></select>
<select name="ddlbModel"><option value="">-</option></select>
<input type=button value="Next (Enter Details) >>" onclick="location.href='/claims/index.cfm?fusebox=MTRclaim&fuseaction=%(next)s&caseid=%(cid)s&extid=%(eid)s&CFID=11&CFTOKEN=22&USID=33&RID=44'">
</form><script>
function fill(v){ var m=document.querySelector('[name=ddlbModel]'); m.innerHTML='<option value="">-</option>' + %(models)s.map(function(t,i){return '<option value="'+(100+i)+'" class="clsMTRModelLevel1">'+t+'</option>';}).join(''); }
</script></body></html>"""
POPUP = """<html><body><input type="text" name="MTRworkshopslcFilter"><input type="button" value="Search" onclick="show()"><table id="t"></table>
<script>function show(){ var kw=document.querySelector('input[type=text]').value.toLowerCase(); var rows=%(rows)s.filter(function(r){return r.toLowerCase().indexOf(kw)==0 || r.toLowerCase().indexOf('- '+kw)>=0;});
document.getElementById('t').innerHTML=rows.map(function(r,i){return '<tr onclick="pick('+i+')"><td>'+r+'</td></tr>';}).join('');}
function pick(i){ var r=%(rows)s[i]; var o=window.opener.document; o.querySelector('[name=ddlbREPCOID]').value='29709'; o.querySelector('[name=ddlbREPCOIDTEXT]').value=r; window.close(); }</script></body></html>"""
ADJ = """<html><body><select name="ddlbMGRNAME"><option value="">-</option><option value="m1">(HQ) VINCENT KANG</option></select>
<select name="ddlbADJNAME"><option value="">-</option><option value="a1">Terrence Chia</option><option value="a2">(HQ) Terrence Chia</option></select>
<script>function SaveReport(n){ document.title='saved:'+document.querySelector('[name=ddlbMGRNAME]').value+':'+document.querySelector('[name=ddlbADJNAME]').value; }</script></body></html>"""


@pytest.fixture(scope="module")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    pw = sync_api.sync_playwright().start()
    import os

    b = None
    for exe in (None, os.environ.get("CHROME_BIN"), "/opt/pw-browsers/chromium"):
        try:
            b = pw.chromium.launch(args=["--no-sandbox"], **({"executable_path": exe} if exe and os.path.exists(exe) else {}))
            break
        except Exception:  # noqa: BLE001  (CI installs the python package but no browser)
            continue
    if b is None:
        pw.stop()
        pytest.skip("no chromium")
    yield b
    b.close()
    pw.stop()


def site(browser, *, models=("Myvi 2015 To 2018 4 Dr Hatch 1.5 SE (A) [11/15-]", "Myvi 2005 To 2011 5 Dr Hatch 1.3 EZ (M) [05/05-]"),
         rows=("Motor Repairer - Bengkel Kereta Sinar Gemilang - Kemaman",), next_action="dsp_adjclmref", cid="22322999", eid="9800111"):
    import json

    ctx = browser.new_context()
    seen = {"saves": 0}

    def route(r):
        url = r.request.url
        if "fuseaction=dsp_clmreg" in url:
            r.fulfill(content_type="text/html", body=FORM % {"next": next_action, "cid": cid, "eid": eid, "models": json.dumps(list(models))})
        elif "/claims/popup" in url:
            r.fulfill(content_type="text/html", body=POPUP % {"rows": json.dumps(list(rows))})
        elif "fuseaction=dsp_adjclmref" in url:
            seen["saves"] += 1
            r.fulfill(content_type="text/html", body=ADJ)
        else:
            r.fulfill(content_type="text/html", body="<html><body>home</body></html>")

    ctx.route("https://www.merimen.com.my/**", route)
    base = ctx.new_page()
    base.goto(LOGGED_IN)
    return ctx, base, seen


def spec(**over):
    cd = case_data()
    cd["at_fault"]["policy"]["cover_type"] = "Comprehensive"
    return build_spec(cd, "BNN6055", PROFILE, {**WORKSHOP, **over})


def test_fill_checks_every_field_and_saves_nothing(browser):
    ctx, base, seen = site(browser)
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.fill(spec())
    try:
        assert rep.ok and rep.problems == [] and rep.workshop_coid == "29709" and "Myvi 2015 To 2018" in rep.model
        form = run.cur
        assert form.input_value("[name=sleCURINSCOID]") == "35" and form.input_value("[name=sleREGNO]") == "BNN6055"
        assert form.input_value("[name=sleACCDATE]") == "07/09/2026" and form.input_value("[name=sleCLMID1]") == "770124-11-5274"
        assert form.input_value("[name=ddlb3INSCOID]") == "9616" and form.input_value("[name=sleTPPOLNO]") == "562160030165-00"
        assert form.is_checked("[name=siISCOVERNOTE]") and form.input_value("[name=sleTPREGNO]") == "TAY6075"
        assert form.input_value("[name=mleLossDesc]") == "COLLISION (INSURED HIT TP)"
        assert seen["saves"] == 0 and "dsp_clmreg" in form.url  # not saved: still on the form
    finally:
        run.close()
        ctx.close()


def test_create_saves_sets_manager_and_adjuster_and_returns_the_ids(browser):
    ctx, base, seen = site(browser)
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.create(spec())
    try:
        assert rep.ok and (rep.case_id, rep.ext_id, rep.note) == ("22322999", "9800111", None)
        assert len(ctx.pages) == 1  # the create tab was closed
    finally:
        ctx.close()


def test_an_unsure_model_stops_before_saving(browser):
    ctx, base, seen = site(browser, models=("Myvi 2015 To 2018 4 Dr Hatch 1.5 SE (A) [11/15-]", "Myvi 2015 To 2018 4 Dr Hatch 1.5 SE (A) [11/15-]"))
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.create(spec())
    try:
        assert not rep.ok and rep.code == "form_not_ready" and any(p.startswith("model_unsure") for p in rep.problems) and rep.case_id is None
        assert seen["saves"] == 0
    finally:
        ctx.close()


def test_a_workshop_that_is_not_exactly_one_row_stops(browser):
    for rows, want in ((("Motor Repairer - Bengkel Kereta Sinar Gemilang - A", "Motor Repairer - Bengkel Kereta Sinar Gemilang - B"), "workshop_ambiguous"),
                       (("Motor Repairer - Somewhere Else",), "workshop_not_found")):
        ctx, base, _ = site(browser, rows=rows)
        run = MerimenCreate(base, timeout_scale=0.02)
        rep = run.create(spec())
        try:
            assert not rep.ok and want in rep.problems
        finally:
            ctx.close()


def test_a_duplicate_warning_is_not_confirmed(browser):
    ctx, base, _ = site(browser, next_action="act_clmreg")
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=act_clmreg*", lambda r: r.fulfill(content_type="text/html", body="<html><body>There is already an active claim within 1 day. CONFIRM that this is NOT a duplicate</body></html>"))
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.create(spec())
    try:
        assert not rep.ok and rep.code == "duplicate_warning" and rep.case_id is None
    finally:
        ctx.close()


def test_a_rejected_form_reports_merimens_words(browser):
    ctx, base, _ = site(browser, next_action="act_clmreg")
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=act_clmreg*", lambda r: r.fulfill(content_type="text/html", body="<html><body><p>Handling Insurer must be indicated</p></body></html>"))
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.create(spec())
    try:
        assert not rep.ok and rep.code == "form_rejected" and rep.messages == ["Handling Insurer must be indicated"]
    finally:
        ctx.close()


def test_a_manager_that_is_missing_leaves_the_case_made_and_says_so(browser):
    ctx, base, _ = site(browser)
    run = MerimenCreate(base, timeout_scale=0.02)
    s = build_spec(case_data(), "BNN6055", {"manager": "Nobody Known", "adjuster": "Terrence Chia"}, WORKSHOP)
    rep = run.create(s)
    try:
        assert rep.ok and rep.case_id == "22322999" and rep.note == "manager_adjuster_not_set"
    finally:
        ctx.close()


def test_a_logged_out_tab_never_opens_the_form(browser):
    ctx = browser.new_context()
    ctx.route("https://www.merimen.com.my/**", lambda r: r.fulfill(content_type="text/html", body="login"))
    base = ctx.new_page()
    base.goto("https://www.merimen.com.my/claims/index.cfm")
    rep = MerimenCreate(base, timeout_scale=0.02).fill(spec())
    assert not rep.ok and rep.code == "not_logged_in" and len(ctx.pages) == 1
    ctx.close()


def test_a_field_that_is_not_on_the_form_is_a_problem_and_nothing_is_saved(browser):
    ctx, base, seen = site(browser)
    import json

    def route(r):
        url = r.request.url
        if "fuseaction=dsp_clmreg" in url:
            r.fulfill(content_type="text/html", body=(FORM % {"next": "dsp_adjclmref", "cid": "1", "eid": "2", "models": json.dumps(["Myvi 2015 To 2018 4 Dr Hatch 1.5 SE (A) [11/15-]"])}).replace('<input name="sleCHANO">', ""))
        elif "/claims/popup" in url:
            r.fulfill(content_type="text/html", body=POPUP % {"rows": json.dumps(["Motor Repairer - Bengkel Kereta Sinar Gemilang - Kemaman"])})
        else:
            r.fulfill(content_type="text/html", body="<html><body>x</body></html>")

    ctx2 = browser.new_context()
    ctx2.route("https://www.merimen.com.my/**", route)
    base2 = ctx2.new_page()
    base2.goto(LOGGED_IN)
    rep = MerimenCreate(base2, timeout_scale=0.02).create(spec())
    assert not rep.ok and "field:sleCHANO" in rep.problems and rep.case_id is None
    ctx.close()
    ctx2.close()


def test_an_error_after_next_is_never_a_retry(browser, monkeypatch):
    ctx, base, _ = site(browser)
    monkeypatch.setattr(MerimenCreate, "_save", lambda self, spec, rep: (_ for _ in ()).throw(RuntimeError("boom")))
    rep = MerimenCreate(base, timeout_scale=0.02).create(spec())
    assert not rep.ok and rep.code == "create_unclear"
    ctx.close()


def test_the_create_step_never_takes_a_screenshot_or_a_trace():
    import re
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "autopilot_worker" / "merimen_create.py").read_text()
    assert not re.search(r"screenshot|tracing|\.trace|video|har_path|record_har", src, re.I)  # the page holds the session marks and the claim


def test_every_field_the_owners_script_sets_is_set_here_or_named_as_left_out():
    """Parity with tools/mrm-bot/createpar2_sinar.mjs (plan #113, D6): a field added to or dropped from either side fails this test."""
    import re
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    script = (root / "tools" / "mrm-bot" / "createpar2_sinar.mjs").read_text()
    ours = (root / "worker" / "autopilot_worker" / "merimen_create.py").read_text()
    theirs = set(re.findall(r"['\"]((?:sle|ddlb|mle|si|chk)[A-Za-z0-9_]+|TPOWN|MTRworkshopbtn|MTRworkshopslcFilter)['\"]", script))
    theirs |= set(re.findall(r"name=((?:sle|ddlb|mle|si)[A-Za-z0-9_]+)", script))
    left_out = {
        "sleTRAILERREGNO", "sleTRAILERTPREGNO",  # only stripped of "required" in the script; set the same way here
        "ddlbVehClass_TMI",  # Tokio Marine only: set here, named in a different string
        "ddlbREPCOIDTEXT",  # read back, never typed
    }
    missing = sorted(n for n in theirs if n not in ours and n not in left_out)
    assert missing == [], f"fields in the owner's script but not in merimen_create.py: {missing}"


def test_pick_model_is_the_same_code_as_the_batch_tool():
    import importlib.util
    import inspect
    from pathlib import Path

    from autopilot_worker import pick_model as ours

    path = Path(__file__).resolve().parents[2] / "tools" / "batch" / "pick_model.py"
    spec_ = importlib.util.spec_from_file_location("batch_pick_model", path)
    theirs = importlib.util.module_from_spec(spec_)
    spec_.loader.exec_module(theirs)
    for name in ("toks", "bracket", "score", "pick"):
        assert inspect.getsource(getattr(ours, name)) == inspect.getsource(getattr(theirs, name)), f"{name} drifted from tools/batch/pick_model.py"
    assert (ours.SYN, ours.STOP) == (theirs.SYN, theirs.STOP)


def test_a_landing_that_is_neither_the_form_nor_the_manager_page_names_the_page_and_stores_nothing(browser):
    ctx, base, _ = site(browser, next_action="dsp_surprise")
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=dsp_surprise*", lambda r: r.fulfill(content_type="text/html", body="<html><body>?</body></html>"))
    rep = MerimenCreate(base, timeout_scale=0.02).create(spec())
    assert not rep.ok and rep.code == "create_unclear" and rep.messages == ["landed on dsp_surprise"] and rep.case_id is None
    assert "CFID" not in " ".join(rep.messages)
    ctx.close()


def test_the_number_is_reported_before_the_manager_is_set(browser):
    ctx, base, seen = site(browser)
    got = []
    rep = MerimenCreate(base, timeout_scale=0.02, on_created=lambda c, e: got.append((c, e))).create(spec())
    assert rep.ok and got == [("22322999", "9800111")]
    ctx.close()


def test_a_confirm_is_dismissed_and_the_case_stops_cleared(browser):
    ctx, base, seen = site(browser)
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=dsp_clmreg*", lambda r: r.fulfill(content_type="text/html", body=(FORM % {
        "next": "dsp_adjclmref", "cid": "1", "eid": "2", "models": '["Myvi 2015 To 2018 4 Dr Hatch 1.5 SE (A) [11/15-]"]'}).replace(
        "onclick=\"location.href='/claims", "onclick=\"if(!confirm('This claim exists. Overwrite?')) return; location.href='/claims")))
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.create(spec())
    assert not rep.ok and rep.code == "unexpected_dialog" and not rep.cleared and rep.messages == ["This claim exists. Overwrite?"] and seen["saves"] == 0
    ctx.close()


def test_a_workshop_switch_between_the_fill_and_next_stops_before_next(browser):
    ctx, base, seen = site(browser)
    rep = MerimenCreate(base, timeout_scale=0.02, before_submit=lambda: "workshop_changed").create(spec())
    assert not rep.ok and rep.code == "workshop_changed" and rep.case_id is None and seen["saves"] == 0
    ctx.close()


def test_the_session_marks_never_reach_a_line_a_message_or_a_readback(browser):
    from autopilot_worker.merimen_create import redact

    assert redact("go to /claims/index.cfm?CFID=SECRET1&CFTOKEN=SECRET2&USID=SECRET3&RID=SECRET4 now") == "go to /claims/index.cfm?CFID=***&CFTOKEN=***&USID=***&RID=*** now"
    ctx, base, _ = site(browser, next_action="act_clmreg")
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=act_clmreg*", lambda r: r.fulfill(
        content_type="text/html", body="<html><body><p>Session CFID=SECRET1&CFTOKEN=SECRET2 is invalid, please login</p></body></html>"))
    rep = MerimenCreate(base, timeout_scale=0.02).create(spec())
    assert rep.code == "form_rejected" and "SECRET" not in rep.line() and "SECRET" not in repr(rep.readback)
    ctx.close()


def test_a_white_model_option_is_flagged(browser):
    ctx, base, _ = site(browser)
    run = MerimenCreate(base, timeout_scale=0.02)
    rep = run.fill(spec())
    run.close()
    assert rep.ok and rep.white_model is False and rep.readback.startswith("ddlbInsurer=Allianz")
    ctx.close()


def test_a_form_that_stays_without_saying_why_is_unclear_and_keeps_the_mark(browser):
    ctx, base, _ = site(browser, next_action="act_clmreg")
    ctx.route("https://www.merimen.com.my/claims/index.cfm?*fuseaction=act_clmreg*", lambda r: r.fulfill(content_type="text/html", body="<html><body><p>Saving</p></body></html>"))
    rep = MerimenCreate(base, timeout_scale=0.02).create(spec())
    assert not rep.ok and rep.code == "create_unclear" and rep.cleared is False and rep.case_id is None
    ctx.close()


def test_a_workshop_name_is_matched_by_whole_words_and_the_exact_row_wins():
    from autopilot_worker.merimen_create import pick_workshop_row
    assert pick_workshop_row(["CAB MOTOR WORKS"], "AB Motor") == (None, "workshop_not_found")
    assert pick_workshop_row(["Bengkel Ali Jaya", "Bengkel Ali"], "Bengkel Ali") == (1, "")
