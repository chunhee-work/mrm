"""Estimate details (merimen_estimate.py): the playbook 08 rules, and the adapter against a local stand-in for dsp_details."""
import json

from autopilot_worker.merimen_estimate import MerimenEstimate, _paint_ok, cond, misc, plan_details
from test_merimen_create import LOGGED_IN, browser  # noqa: F401  (fixture)

CASE = {"org_id": "o1", "merimen_caseid": "22322999", "merimen_extid": "9800111"}


def test_conditions_follow_the_playbook_order():
    assert cond("Spare Wheel Retainer") == "Bent"  # user 2026-11-04, before the retainer rule
    assert cond("Rooflining") == "Broken" and cond("Roof Lining") == "Broken"
    assert cond("Bumper Front Side Retainer RH") == "Bracket cracked"
    assert cond("Fender Signal Lamp Front RH") == "Cracked"
    assert cond("Grille Front") == "Cut" and cond("Grille Front Badge") == "Broken"
    assert cond("Bumper Rear Sensor") == "Cut" and cond("Fender Liner Front LH") == "Damage"
    assert cond("Door Front Hinge LH") == "Bent" and cond("Bumper Clips") == "Necessary"
    assert cond("Tailgate Support Strut") == "Broken" and cond("Bumper Rear Cover") == "Broken"
    assert cond("Something Odd") == "Bent"


def test_misc_prices_and_paint_once():
    assert misc("Paintwork Materials") == "500.00" and misc("Paintwork material (Water-based)") is None
    assert misc("Windscreen sealant rear") == "120.00" and misc("Tail lamp sealant") == "15.00" and misc("Body sealant") == "30.00"
    assert misc("Car-O-Liner frame aligner bench") == "400.00" and misc("Radiator coolant") == "35.00" and misc("Towing") is None
    plan = plan_details([], [[1, "Paintwork Materials", True, "0.00"], [2, "Paintwork material (Solvent)", True, ""], [3, "Paintwork material (Water-based)", True, ""],
                             [4, "Underseal", True, "60.00"], [5, "Electrical", False, ""]])
    assert plan["MMI"] == {"2": "500.00", "5": "35.00"}  # generic row skipped next to Solvent (never 500 twice); read-only non-paint skipped
    assert _paint_ok([[1, "Paintwork Materials", False, "500.00"]]) and not _paint_ok([[1, "Paintwork Materials", False, "0.00"]])
    assert _paint_ok([[1, "Underseal", False, "60"]])  # no paint row: nothing to check


def test_only_empty_rows_get_a_condition_in_the_second_pass():
    rows = [[1, "Bumper Rear Cover", False, "Broken"], [2, "Tail Lamp LH", False, ""], [3, "Boot Lid", True, ""], [4, "", False, ""]]
    assert plan_details(rows, [], only_empty=True)["PDC"] == {"2": "Cracked"}
    assert plan_details(rows, [])["PDC"] == {"1": "Broken", "2": "Cracked"}


# The stand-in keeps what Save stored in localStorage, so a reload shows the saved values (as Merimen does).
DET = """<html><body><input name=PROWCNT value=%(n)d><input name=MROWCNT value=2><table id=t></table>
<table><tr><td>Paintwork Materials</td><td><input name=MMI1 readonly value="0.00"></td><td><img src="x" onclick="PWEdit(0,0)"><input type=button value=Edit onclick="PWEdit(0,0)"></td></tr>
<tr><td>Underseal</td><td><input name=MMI2 value=""></td></tr></table><div id=pwm_man0></div>
<div id=pop style="display:none"><select id=slePNTMAN><option value=1>Sikkens</option><option value=-1>Other</option></select>
<input id=sleMANCUSTOM style="display:none"><input type=checkbox id=slePNTCONSUM checked>
<input type=button value=Submit onclick="PWSubmitConfirm()"></div>
<span onclick="save()">Save</span>
<script>
const S = JSON.parse(localStorage.getItem('S') || '{}'); const names = %(names)s; const late = %(late)s;
function row(i, nm) { const tr = document.createElement('tr'); tr.innerHTML = '<td><input name=PPT' + i + '></td><td>' + nm + '</td><td><input name=PDC' + i + ' value="' + (S['PDC' + i] || '') + '"></td>'; document.getElementById('t').appendChild(tr); }
names.forEach((nm, j) => { if (j < names.length - late) row(j + 1, nm); });
setTimeout(() => names.forEach((nm, j) => { if (j >= names.length - late) row(j + 1, nm); }), 150);  // the render race
for (const k of ['MMI1', 'MMI2']) if (S[k] !== undefined) document.querySelector('[name=' + k + ']').value = S[k];
if (S.man) document.getElementById('pwm_man0').innerText = 'Paint Manufacturer: ' + S.man;
function PWEdit(a, b) { document.getElementById('pop').style.display = ''; }
function PWSubmitConfirm() { if (!confirm('Unsaved values will be reset. Continue?')) return; window.man = document.getElementById('sleMANCUSTOM').value;
  window.consum = document.getElementById('slePNTCONSUM').checked; document.getElementById('pop').style.display = 'none';
  document.getElementById('pwm_man0').innerText = 'Paint Manufacturer: ' + window.man; %(ask)s }
function save() { %(skip)s const o = {}; document.querySelectorAll('[name^=PDC],[name^=MMI]').forEach(e => o[e.name] = e.value); if (window.man) o.man = window.man;
  else if (S.man) o.man = S.man; localStorage.setItem('S', JSON.stringify(o)); window.saves = (window.saves || 0) + 1; document.title = 'saved' + window.saves; }
</script></body></html>"""


def site(browser, names, *, late=0, ask="", skip=""):  # noqa: F811
    ctx = browser.new_context()
    seen = {"urls": []}

    def route(r):
        url = r.request.url
        seen["urls"].append(url)
        if "fuseaction=dsp_details" in url:
            r.fulfill(content_type="text/html", body=DET % {"n": len(names), "names": json.dumps(names), "late": late, "ask": ask, "skip": skip})
        else:
            r.fulfill(content_type="text/html", body="<html><body>home</body></html>")

    ctx.route("https://www.merimen.com.my/**", route)
    base = ctx.new_page()
    base.goto(LOGGED_IN)
    return ctx, base, seen


def _stored(ctx):
    p = ctx.new_page()
    p.goto("https://www.merimen.com.my/claims/index.cfm?fusebox=x")
    s = p.evaluate("() => JSON.parse(localStorage.getItem('S') || '{}')")
    p.close()
    return s


def test_fill_sets_paint_conditions_and_misc_then_reads_back(browser):  # noqa: F811
    ctx, base, seen = site(browser, ["Bumper Rear Cover", "Tail Lamp LH", "Spare Wheel Retainer"], late=1)
    r = MerimenEstimate(lambda: base, timeout_scale=0.05).fill(CASE)
    assert r.ok, r.line()
    assert r.parts == 3 and r.empty == 0 and r.paint == "Paint Manufacturer: anything"
    s = _stored(ctx)
    assert s["PDC1"] == "Broken" and s["PDC2"] == "Cracked" and s["PDC3"] == "Bent"  # the late row was waited for
    assert s["MMI1"] == "500.00" and s["MMI2"] == "60.00" and s["man"] == "anything"
    assert all("caseid=22322999&extid=9800111" in u for u in seen["urls"][1:] if "dsp_details" in u)
    assert "Estimate details set: conditions on 3 part rows, misc 2" in r.line()
    assert len(ctx.pages) == 1
    ctx.close()


def test_dry_run_reads_and_plans_without_typing(browser):  # noqa: F811
    ctx, base, _ = site(browser, ["Bumper Rear Cover", "Tail Lamp LH"])
    r = MerimenEstimate(lambda: base, timeout_scale=0.05).read(CASE)
    assert r.ok and r.mode == "dry" and r.parts == 2 and r.empty == 2 and r.misc == {"Paintwork Materials": "500.00", "Underseal": "60.00"}
    assert r.line().startswith("Estimate details would set")
    assert _stored(ctx) == {}  # nothing saved
    ctx.close()


def test_a_question_box_is_never_answered(browser):  # noqa: F811
    ask = "const d = document.createElement('div'); d.className = 'modal'; d.innerHTML = 'Are you sure you want to delete these rows? <input type=button value=OK>'; document.body.appendChild(d);"
    ctx, base, _ = site(browser, ["Bumper Rear Cover"], ask=ask)
    r = MerimenEstimate(lambda: base, timeout_scale=0.05).fill(CASE)
    assert not r.ok and r.code == "unexpected_dialog"
    ctx.close()


def test_a_save_that_did_not_stick_stops_for_a_person(browser):  # noqa: F811
    ctx, base, _ = site(browser, ["Bumper Rear Cover"], skip="return;")
    r = MerimenEstimate(lambda: base, timeout_scale=0.05).fill(CASE)
    assert not r.ok and r.code == "empty_conditions" and "1 part rows still have no Damage Condition" in r.line()
    ctx.close()


def test_no_ids_or_no_login_opens_nothing(browser):  # noqa: F811
    ctx, base, seen = site(browser, ["Bumper Rear Cover"])
    assert MerimenEstimate(lambda: base).read({"org_id": "o1", "merimen_caseid": "22322999", "merimen_extid": ""}).code == "unreadable"
    assert MerimenEstimate(lambda: None).fill(CASE).code == "unreadable"
    assert len(seen["urls"]) == 1
    ctx.close()


def test_the_driver_saves_b_only_with_both_switches_and_never_claims_checks(monkeypatch):
    from autopilot_worker.__main__ import _CdpDriver
    from autopilot_worker.merimen_estimate import EstimateResult

    class Est:
        def __init__(self, r):
            self.r = r

        def fill(self, case):
            return self.r

        def read(self, case):
            return EstimateResult(ok=True, parts=2, misc={"Underseal": "60.00"})

    d = _CdpDriver("x")
    d.case = CASE
    for k, v in (("MERIMEN_WRITES", "on"), ("WORKER_SUBMIT", "on"), ("MERIMEN_DRYRUN", "off")):
        monkeypatch.setenv(k, v)
    d._estimate = lambda: Est(EstimateResult(ok=True, mode="live", parts=3, misc={"Underseal": "60.00"}))
    r = d.save("B", ())
    assert not r.ok and r.error == "step_not_ported" and "Estimate details set: conditions on 3 part rows" in r.line and "not automated yet" in r.line
    d._estimate = lambda: Est(EstimateResult(ok=False, mode="live", code="empty_conditions", empty=1))
    r = d.save("B", ())
    assert r.fatal and r.error == "estimate"
    d._estimate = lambda: Est(EstimateResult(ok=False, mode="live", code="unreadable"))
    assert not d.save("B", ()).fatal  # try again later
    monkeypatch.setenv("MERIMEN_DRYRUN", "on")
    called = []
    d._estimate = lambda: called.append(1)
    assert d.save("B", ()).error == "step_not_ported" and called == []  # dry run: never saves
    d._estimate = lambda: Est(None)
    assert d.dry_run("B", ()).line.startswith("Estimate details would set")


def test_read_back_review_lists_quantities_and_comments_for_the_person_who_submits():
    from autopilot_worker.merimen_estimate import review_rows

    rows = [[1, "Bumper Clips", False, "Necessary", "1", ""], [2, "Bumper Clips", False, "Necessary", "30", ""], [3, "Grille Clips", False, "Necessary", "9", ""],
            [4, "Bonnet Hinge", False, "Bent", "1", ""], [5, "Grille Badge", False, "Broken", "1", "proton"], [6, "Boot Lid Badge", False, "Broken", "1", "(SAGA)"],
            [7, "Door Front Hinge LH", False, "Bent", "2", ""], [8, "Bonnet Support Strut LH", False, "Broken", "1", "LH"],
            [9, "Door Front Hinge LH", False, "Bent", "2", "Upper LH & Lower LH"], [10, "Bumper Rear Bracket Side", False, "Bracket cracked", "2", ""]]
    got = review_rows(rows)
    assert got == ["Bumper Clips qty 1 (15 per bumper)", "Bonnet Hinge qty 1 (2, single row)", "Grille Badge: comment should be the badge name in capitals, e.g. (PROTON)",
                   "Door Front Hinge LH: comment Upper / Lower missing", "Bonnet Support Strut LH: has LH/RH, no comment needed",
                   "Bumper Rear Bracket Side: qty 2 needs the sides in the comment (Front LH & Front RH)"]
