"""Manual estimate rows: group, quantity and reference price (manual_price.py), and adding them on a stand-in dsp_details page."""
import pytest

from autopilot_worker import manual_price
from autopilot_worker.merimen_step2 import RealStep2
from test_merimen_create import LOGGED_IN, browser  # noqa: F401  (fixture)

CAT = [["10@1", "Bumper Front Cover", False], ["70@2", "Bumper Rear Cover", False], ["20@3", "Bonnet", False]]


@pytest.fixture(autouse=True)
def fresh_cache():
    manual_price._cache.clear()
    yield
    manual_price._cache.clear()


def test_the_real_reference_price_matches_the_playbook_example():
    price, note = manual_price.ref_price("Rear Wheelhouse RH", "MAZDA 3 2.0 2022")
    assert price == "1356.58" and "< 5 rows" in note  # playbook 08: Mazda 3 2022 Rear Wheelhouse RH = RM1,356.58 (Civic 2016-2020)


def test_groups_quantities_and_no_other_tier_price(monkeypatch):
    seen = []

    def fake(part, model):
        seen.append(part)
        return ("325.00", "median of 6 rows, same brand") if "Liner" in part else ("", "only an other-tier price (never used as is)")

    monkeypatch.setattr(manual_price, "ref_price", fake)
    rows, unpriced = manual_price.rows_for([
        "Bumper Clips  (front bumper, manual 15 x 10.00)", "Bumper Clips  (rear bumper, manual 15 x 10.00)",
        "Quarter Liner LH  (companion: quarter -> liner)", "Suspension Crossmember Front  (suspension set, manual)", "Rear Panel Inner Trim",
    ], CAT, "NISSAN ALMERA 2016")
    assert rows == [["10", "Bumper Clips", "10.00", "30", ""], ["70", "Quarter Liner LH", "325.00", "1", ""]]
    assert [n for n, _ in unpriced] == ["Suspension Crossmember Front", "Rear Panel Inner Trim"]
    assert manual_price.group(CAT, "Suspension Crossmember Front") == "130" and manual_price.group(CAT, "Rear Panel Inner Trim") == "70"
    assert manual_price.group(CAT, "Bumper Clips  (front bumper)") == "10" and manual_price.group(CAT, "Door Moulding") == "10"
    assert seen == ["Quarter Liner LH", "Suspension Crossmember Front", "Rear Panel Inner Trim"]  # Bumper Clips is a fixed price


def test_no_price_data_means_no_price(monkeypatch, tmp_path):
    monkeypatch.setenv("PRICE_DATA_DIR", str(tmp_path))
    assert manual_price.ref_price("Bonnet", "PERODUA MYVI") == ("", "no price data on this machine")


SEL = """<html><body>Vehicle Model: NISSAN ALMERA 1.5 2016<br><input type=checkbox name=CP value="10@1">Bumper Front Cover<br>
<input type=checkbox name=CP value="70@2">Bumper Rear Cover<br>
<table><tr><td onclick="MClk('save')">Save</td><td onclick="MClk('next')">Next &gt;&gt;</td></tr></table><script>function MClk(x){}</script></body></html>"""
DET = """<html><body><input name=PROWCNT id=PROWCNT value=1><table id=t>
<tr><td><input name=PPT1></td><td><input id=PDS1 value="Bumper Front Cover"></td><td><input name=PBT1 value=1></td></tr></table>
<input id=PADDGP><input id=PADDDS><input id=PADDPT><span onclick="save()">Save</span>
<script>
const S = JSON.parse(localStorage.getItem('R') || '[]'); var oest = {PGrp: {'10': 'Front Panel', '70': 'Rear Panel'}};
function add(g, d, p, q) { const c = document.getElementById('PROWCNT'); const i = +c.value + 1; c.value = i; const tr = document.createElement('tr');
  tr.innerHTML = '<td><input name=PPT' + i + '></td><td><input id=PDS' + i + ' value="' + d + '"></td><td><input name=PBT' + i + ' value=' + q + '></td><td><input id=PCM' + i + '></td>';
  tr.dataset.g = g; tr.dataset.p = p; document.getElementById('t').appendChild(tr); }
S.forEach(r => add(r[0], r[1], r[2], r[3]));
function PCloneRow(a, b) { const gp = document.getElementById('PADDGP'); add(gp.getAttribute('KEY'), document.getElementById('PADDDS').value, document.getElementById('PADDPT').value, 1); }
function save() { const o = []; document.querySelectorAll('#t tr').forEach((tr, j) => { if (j) o.push([tr.dataset.g, tr.querySelector('[id^=PDS]').value, tr.dataset.p, tr.querySelector('[name^=PBT]').value]); });
  localStorage.setItem('R', JSON.stringify(o)); }
</script></body></html>"""


def test_manual_rows_are_added_with_group_price_and_qty_then_read_back(browser):  # noqa: F811
    ctx = browser.new_context()

    def route(r):
        url = r.request.url
        body = SEL if "dsp_selection" in url else DET if "dsp_details" in url else "<html><body>home</body></html>"
        r.fulfill(content_type="text/html", body=body)

    ctx.route("https://www.merimen.com.my/**", route)
    base = ctx.new_page()
    base.goto(LOGGED_IN)
    asked = []

    def rows_for(missing, cat, model):
        asked.append(model)
        return ([["70", "Quarter Liner LH", "325.00", "1", ""], ["10", "Bumper Clips", "10.00", "15", ""], ["10", "Bumper Front Cover", "1.00", "1", ""]],
                [("Rear Panel Inner Trim", "no reference price")])

    case = {"org_id": "o1", "merimen_caseid": "22322999", "merimen_extid": "9800111"}
    s2 = RealStep2(lambda: base, timeout_scale=0.02, rows_for=rows_for)
    s2.catalogue(case)
    s2.apply(case, {"CP": ["70@2"], "N": [], "R": [], "manual": ["Quarter Liner LH", "Bumper Clips", "Rear Panel Inner Trim"]})
    assert asked == ["NISSAN ALMERA 1.5 2016"]  # Merimen's own model text
    assert s2.manual["added"] == 2 and s2.last.endswith("manual rows 2 (1 without a price)")
    assert s2.selected(case) == [("Bumper Front Cover", "1"), ("Quarter Liner LH", "1"), ("Bumper Clips", "15")]  # the existing row is not added twice
    p = ctx.new_page()
    p.goto("https://www.merimen.com.my/claims/index.cfm?fusebox=x")
    assert p.evaluate("() => JSON.parse(localStorage.getItem('R'))") == [["70", "Quarter Liner LH", "325.00", "1"], ["10", "Bumper Clips", "10.00", "15"]]
    ctx.close()
