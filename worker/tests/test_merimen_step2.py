"""The real Select Parts adapter (merimen_step2.RealStep2) against a local stand-in for dsp_selection / dsp_details."""
import pytest

from autopilot_worker.merimen_step2 import RealStep2, Step2Error
from test_merimen_create import LOGGED_IN, browser  # noqa: F401  (fixture)

SEL = """<html><body>Vehicle Model: PERODUA MYVI 1.5<br>
<input type=checkbox name=CP value="10@1">Bumper Rear Cover<br>
<input type=checkbox name=CP value="10@2">Tail Lamp LH<br>
<input type=checkbox name=CP value="10@3" checked>Boot Lid<br>
<input type=checkbox name=CL>Rear Bumper R/R<br>
<input type=checkbox name=CLR>Boot Lid Repair<br>
<table><tr><td onclick="MClk('save'); document.title='saved:' + [...document.querySelectorAll('input:checked')].length; %(save)s">Save</td>
<td onclick="MClk('next'); window.nextClicked = 1; parent.document.title += ':next'; location.href=location.href.replace('dsp_selection','dsp_details')">Next &gt;&gt;</td></tr></table>
<script>function MClk(x){}
function showQ(){ var d=document.createElement('div'); d.className='modal'; d.innerHTML='Are you sure you want to remove these parts? <input type=button value=OK>'; document.body.appendChild(d); }</script></body></html>"""
DET = """<html><body><input name=PROWCNT value=2><table>
<tr><td><input name=PPT1></td><td><input id=PDS1 value="Bumper Rear Cover"></td><td><input name=PBT1 value=1></td></tr>
<tr><td><input name=PPT2></td><td><input id=PDS2 value="Tail Lamp LH"></td><td><input name=PBT2 value=1></td></tr></table></body></html>"""

CASE = {"org_id": "o1", "merimen_caseid": "22322999", "merimen_extid": "9800111"}


def site(browser, save_js=""):  # noqa: F811
    ctx = browser.new_context()
    seen = {"saves": [], "urls": []}

    def route(r):
        url = r.request.url
        seen["urls"].append(url)
        if "fuseaction=dsp_selection" in url:
            r.fulfill(content_type="text/html", body=SEL % {"save": save_js})
        elif "fuseaction=dsp_details" in url:
            r.fulfill(content_type="text/html", body=DET)
        else:
            r.fulfill(content_type="text/html", body="<html><body>home</body></html>")

    ctx.route("https://www.merimen.com.my/**", route)
    base = ctx.new_page()
    base.goto(LOGGED_IN)
    return ctx, base, seen


def test_catalogue_reads_parts_labour_and_make(browser):  # noqa: F811
    ctx, base, seen = site(browser)
    cat = RealStep2(lambda: base, timeout_scale=0.02).catalogue(CASE)
    assert cat["cat"] == [["10@1", "Bumper Rear Cover", False], ["10@2", "Tail Lamp LH", False], ["10@3", "Boot Lid", True]]
    assert cat["labs"] == [["Rear Bumper R/R", False]] and cat["make"] == "PERODUA"
    assert all("caseid=22322999&extid=9800111" in u for u in seen["urls"][1:])
    assert len(ctx.pages) == 1  # its own tab is closed again
    ctx.close()


def test_apply_ticks_saves_and_goes_next_then_rows_read_back(browser):  # noqa: F811
    ctx, base, _ = site(browser)
    s2 = RealStep2(lambda: base, timeout_scale=0.02)
    s2.apply(CASE, {"CP": ["10@1", "10@2"], "N": ["Rear Bumper R/R"], "R": [], "manual": ["Bumper Clips"]})
    assert s2.last == "ticked 2 parts, labour N 1 R 0, misc 0"
    assert s2.selected(CASE) == [("Bumper Rear Cover", "1"), ("Tail Lamp LH", "1")]
    assert len(ctx.pages) == 1
    ctx.close()


def test_a_question_box_is_never_answered(browser):  # noqa: F811
    ctx, base, _ = site(browser, "showQ();")
    with pytest.raises(Step2Error) as e:
        RealStep2(lambda: base, timeout_scale=0.02).apply(CASE, {"CP": ["10@1"], "N": [], "R": []})
    assert e.value.code == "unexpected_dialog"
    ctx.close()


def test_no_ids_or_no_login_reads_nothing(browser):  # noqa: F811
    ctx, base, seen = site(browser)
    s2 = RealStep2(lambda: base, timeout_scale=0.02)
    assert s2.catalogue({"org_id": "o1", "merimen_caseid": "22322999", "merimen_extid": ""}) is None
    assert RealStep2(lambda: None).catalogue(CASE) is None
    with pytest.raises(Step2Error):
        RealStep2(lambda: None).apply(CASE, {"CP": []})
    assert len(seen["urls"]) == 1  # only the home page the test opened
    ctx.close()
