"""The Adjuster Report step: the pure report JSON (report_spec) and the page driver against a local stand-in for dsp_estmain."""
from datetime import date

import pytest

from autopilot_worker.create_spec import SpecError
from autopilot_worker.merimen_report import MerimenReport
from autopilot_worker.report_spec import build_report, driving_exp, impact_of, labour_rx, nric_dob_gender, state_name
from test_create_spec import case_data
from test_merimen_create import LOGGED_IN, browser  # noqa: F401  (fixture)

TODAY = date(2026, 11, 27)
WS = {"slot": 1, "name": "Bengkel Kereta Sinar Gemilang"}
NAMES = ["Rear Bumper", "Boot Lid", "Rear Panel", "Tail Lamp LH"]


def report_case():
    d = case_data()
    d["client_vehicle"].update(engine_no="k3ve123456", jpj_log_book_no="", colour="Silver")
    d["client_vehicle"]["owner"].update(address="No 1 Jalan Satu", state="Pahang", city="Kuantan", postcode="25000", dob="", gender="")
    d["police"].update(report_datetime="2026-09-07 23:10", station="", loss_state="Pahang Darul Makmur", loss_city="Kuantan", loss_postcode="25050")
    d["at_fault"]["driver"] = {"name": "Ali Bin Abu", "nric": "900101-03-5531", "address": "Lot 2 Kg Dua", "phone": "+60 13-999 8888",
                               "dob": "", "gender": "", "state": "Terengganu", "city": "Kemaman", "postcode": "24000"}
    d["total_loss"] = False
    return d


def test_report_json_follows_playbook_04():
    D = build_report(report_case(), case_id="22322999", ext_id="9800111", workshop=WS, photo_names=NAMES, today=TODAY)
    assert D["adjFile"] == "EXT/22322999/TP" and D["reserve"] == "10000.00" and D["TL"] == "No"
    assert D["police"] == "TRAFIKKUANTAN/008375/26" and D["policeDate"] == "07/09/2026" and D["policeTimeBand"] == "23"
    assert D["policeStation"] == "IPD Kuantan" and D["stationGuessed"]  # no station in the report: placeholder, flagged for a person
    assert D["lossDescCat"] == "Head to Rear" and D["lossState"] == "Pahang Darul Makmur"
    i, c = D["insDriver"], D["claimant"]
    assert (i["dob"], i["gender"], i["exp"], i["phone"], i["state"]) == ("01/01/1990", "Male", "18", "0139998888", "Terengganu Darul Iman")
    assert D["insured"]["name"] == "MUHAMMAD RAKHIMIE" and D["insured"]["addr"] == "Lot 2 Kg Dua"  # insured address = at-fault party's
    assert (c["dob"], c["gender"], c["state"]) == ("24/01/1977", "Female", "Pahang Darul Makmur")
    assert D["clmDriver"]["name"] == c["name"]  # no separate driver: the claimant drove
    v = D["veh"]
    assert (v["eng"], v["jpjLogbook"], v["jpjReg"], v["cc"], v["odo"], v["labour"]) == ("K3VE123456", "-", "24/11/2015", "1495", "0", "5 DR HATCH")


def test_report_stops_instead_of_guessing():
    with pytest.raises(SpecError) as e:
        build_report(report_case(), case_id="1234", ext_id="5678", workshop=WS, photo_names=["Interior"], today=TODAY)
    assert e.value.code == "impact_unknown"
    d = report_case()
    d["client_vehicle"]["colour"] = ""
    with pytest.raises(SpecError) as e:
        build_report(d, case_id="1234", ext_id="5678", workshop=WS, photo_names=NAMES, extras={}, today=TODAY)
    assert e.value.code == "colour_unknown"
    d = report_case()
    d["police"]["loss_city"] = ""
    with pytest.raises(SpecError) as e:
        build_report(d, case_id="1234", ext_id="5678", workshop=WS, photo_names=NAMES, today=TODAY)
    assert e.value.code == "missing_data" and "accident city" in e.value.detail
    with pytest.raises(SpecError) as e:
        build_report(report_case(), case_id="1234", ext_id="", workshop=WS, photo_names=NAMES, today=TODAY)
    assert e.value.code == "no_case"


def test_helpers():
    assert nric_dob_gender("060907110019", TODAY) == ("07/09/2006", "Male")
    assert nric_dob_gender("770124115274", TODAY) == ("24/01/1977", "Female")
    assert nric_dob_gender("A1234567", TODAY) == ("", "")
    assert driving_exp("01/12/1990", TODAY) == "17" and driving_exp("", TODAY) == "10"
    assert impact_of(["Front Bumper", "Bonnet", "Head Lamp RH"]) == "front"
    assert impact_of(["Front Bumper", "Fender RH", "Front Door RH"]) == "side"  # a front corner is Head to Side
    assert impact_of(["Rear Bumper", "Front Bumper"]) is None
    assert labour_rx("SEDAN") == "4 DR|SALOON" and labour_rx("MPV") == "MPV" and labour_rx("") is None
    assert state_name("Penang") == "Pulau Pinang (Island)" and state_name("Kedah") == "Kedah Darul Aman"


# --- the page: a cut-down dsp_estmain with the owner's field names -------------------------------------------------------------------------
FORM = """<html><head><style>.req{background:rgb(242,204,204)}</style></head><body><form>
<input name=sleFILENO><input name=sleASGMT><input name=sleINSPECT class=req><input name=sleNUM_REPDAYS><textarea name=mleINSPECTAT></textarea><input name=sleRESERVE>
<input name=slePoliceRef><input name=slePOLICERPTDT><select name=slePOLICERPTTM><option value="">-</option><option value=23>23:00 - 23:59</option></select>
<input name=vaCDPOLICESTATION><input name=slePOLICEDCODE>
<select name=ddlbFault><option value="">-</option><option value=2>Third Party</option></select>
<select name=ddlbDAMTYPE><option value="">-</option><option value=1>Collision</option></select>
<select name=ddlbLossDesc><option value="">-</option><option value=a>Collision- Head to Rear (TP Hit Insured)</option><option value=b>Collision- Head to Rear (Insured Hit TP)</option></select>
<textarea name=mleLossDesc></textarea><input type=button name=AddLD onclick="var s=document.querySelector('[name=ddlbLossDesc]');document.querySelector('[name=mleLossDesc]').value=s.options[s.selectedIndex].text.toUpperCase()">
<input name=sleAccPlace><select name=ddlbLocClaim><option value="">-</option><option value=1>City Road</option></select>
<input name=sleInm><input name=sleIID1><input name=sleIDOB><select name=sleIGender><option value="">-</option><option>Female</option><option>Male</option></select>
<input name=sleIAddr1 class=req><select name=ddlbIState><option value="">-</option><option>Terengganu Darul Iman</option></select>
<input name=sleDnm><input name=sleDID1><input name=sleDDOB><select name=sleDGender><option value="">-</option><option>Female</option><option>Male</option></select>
<input name=sleCLMnm><input name=sleCLMID1><select name=sleCLMGender><option value="">-</option><option>Female</option><option>Male</option></select>
<select name=sleCLMPhone1pref><option value="">-</option><option>6012-</option><option>6013-</option></select><input name=sleCLMPhone1>
<input name=sleENGNO><input name=sleJPJREG><select name=ddlbCOLORID class=req><option value="">-</option><option>Silver</option></select>
<input name=sleODO><select name=cbxTL><option value="">-</option><option>Yes</option><option>No</option></select>
<input type=radio name=rbLABTYPE onclick="document.querySelector('[name=ddlbLABTYPE]').innerHTML='<option value=\\'\\'>-</option><option>THATCHAM 4 DR SALOON</option><option>THATCHAM 5 DR HATCH</option>'">
<select name=ddlbLABTYPE><option value="">-</option></select>
<input name=sleTINTBRAND class=req>
</form><script>
function SaveReport(n){ var bad=['sleINSPECT','sleIAddr1'].filter(function(x){return !document.querySelector('[name='+x+']').value;});
  if (%(reject)s || bad.length) { document.title='rejected'; return; }
  location.href='/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_selection&caseid=22322999&CFID=11&CFTOKEN=22&USID=33&RID=44'; }
</script></body></html>"""


def site(browser, reject="false"):  # noqa: F811
    ctx = browser.new_context()
    seen = {"opened": []}

    def route(r):
        url = r.request.url
        if "fuseaction=dsp_estmain" in url:
            seen["opened"].append("caseid=22322999&extid=9800111" in url)
            r.fulfill(content_type="text/html", body=FORM % {"reject": reject})
        elif "fuseaction=dsp_selection" in url:
            r.fulfill(content_type="text/html", body="<html><body>Select parts</body></html>")
        else:
            r.fulfill(content_type="text/html", body="<html><body>home</body></html>")

    ctx.route("https://www.merimen.com.my/**", route)
    base = ctx.new_page()
    base.goto(LOGGED_IN)
    return ctx, base, seen


def D():
    return build_report(report_case(), case_id="22322999", ext_id="9800111", workshop=WS, photo_names=NAMES, today=TODAY)


def test_fill_reads_back_and_saves_nothing(browser):  # noqa: F811
    ctx, base, seen = site(browser)
    run = MerimenReport(base, timeout_scale=0.05, today="27/11/2026")
    res = run.fill(D())
    page = run.cur
    vals = page.evaluate("""() => { var g = n => { var e = document.querySelector('[name=' + n + ']'); return e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.value; };
      return ['sleINSPECT','slePOLICERPTTM','ddlbLossDesc','mleLossDesc','sleIGender','sleDGender','sleCLMGender','sleCLMPhone1pref','sleCLMPhone1','ddlbLABTYPE','ddlbCOLORID','sleIID1'].map(g); }""")
    run.close()
    assert seen["opened"] == [True]
    assert vals[0] == "27/11/2026" and vals[1].startswith("23:")
    assert vals[2] == "Collision- Head to Rear (Insured Hit TP)" and vals[3] == "COLLISION- HEAD TO REAR (INSURED HIT TP)"
    assert vals[4:7] == ["Male", "Male", "Female"]  # exact match: "Female" is never picked for "Male" (it is listed first)
    assert vals[7:9] == ["6012-", "3456789"] and vals[9] == "THATCHAM 5 DR HATCH" and vals[10] == "Silver" and vals[11] == "060907-11-0019"
    assert res.ok and res.missing == []  # sleTINTBRAND stays pink by design and is not counted
    assert any("IPD" in n for n in res.notes)
    ctx.close()


def test_save_lands_on_select_parts(browser):  # noqa: F811
    ctx, base, _ = site(browser)
    res = MerimenReport(base, timeout_scale=0.05, today="27/11/2026").save(D())
    assert res.saved and res.ok and res.code == ""
    ctx.close()


def test_save_rejected_stops_for_a_person(browser):  # noqa: F811
    ctx, base, _ = site(browser, reject="true")
    res = MerimenReport(base, timeout_scale=0.05, today="27/11/2026").save(D())
    assert not res.saved and res.code == "report_rejected"
    ctx.close()


def test_a_case_without_ids_never_opens_a_page(browser):  # noqa: F811
    ctx, base, seen = site(browser)
    d = D()
    d["extid"] = "../x"
    res = MerimenReport(base, timeout_scale=0.05).fill(d)
    assert res.code == "no_case" and seen["opened"] == []
    ctx.close()
