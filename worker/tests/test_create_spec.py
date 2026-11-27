import pytest

from autopilot_worker.create_spec import SpecError, build_spec, fmt_ic, hour_of, insurer_of, liberty_region, loss_text, polcover_rx

PROFILE = {"manager": "VINCENT KANG", "adjuster": "Terrence Chia"}
WORKSHOP = {"slot": 2, "name": "Bengkel Kereta Sinar Gemilang"}


def case_data(**over):
    d = {
        "plate": "BNN 6055",
        "client_vehicle": {"owner": {"name": "Azeyam Binti Ramli", "nric": "770124115274", "phone": "012-345 6789"}, "chassis_no": "pm2m603s002140821",
                           "cc": "1495", "model": "PERODUA / MYVI - 1500 SE (AUTO)", "body_type": "4 Dr Hatch", "registration_date": "2015-11-24", "year_body": "2015"},
        "client_policy": {"insurer": "Zurich General Takaful Malaysia Berhad", "policy_no": "562160030165-00"},
        "police": {"report_no": "TRAFIKKUANTAN/008375/26", "place": "Jalan Tun Razak, Kuantan, Pahang", "accident_datetime": "2026-09-07 21:30", "blamed_plate": "TAY6075"},
        "at_fault": {"plate": "TAY 6075", "policy": {"insurer": "Allianz General Insurance Malaysia Berhad", "policy_no": "AEKT1268872", "cover_note_no": "AEKT1268872",
                                                      "effective": "2026-08-23", "expiry": "2027-08-22", "cover_type": "Comprehensive"},
                     "owner": {"name": "Muhammad Rakhimie", "nric": "060907110019"}, "driver": None},
    }
    d.update(over)
    return d


def test_a_full_case_maps_to_the_form_values():
    s = build_spec(case_data(), "BNN 6055", PROFILE, WORKSHOP)
    assert (s.plate, s.insurer, s.ins_coid, s.branch_match) == ("BNN6055", "Allianz", "35", "HQ|Head")
    assert (s.acc_date, s.acc_hour) == ("07/09/2026", "21")
    assert s.client["ins_coid"] == "9616" and s.client["policy"] == "562160030165-00" and s.client["phone"] == "0123456789"
    assert s.veh["make"] == "PERODUA" and s.veh["rc_model"] == "MYVI - 1500 SE (AUTO)" and s.veh["chassis"] == "PM2M603S002140821"
    assert s.veh["reg_date"] == "24/11/2015"
    a = s.atfault
    assert (a["plate"], a["from"], a["to"], a["is_cover_note"], a["owner_name"]) == ("TAY6075", "23/08/2026", "22/08/2027", True, "MUHAMMAD RAKHIMIE")
    assert s.polcover == "Comprehensive" and (s.manager, s.adjuster, s.workshop_slot) == ("VINCENT KANG", "Terrence Chia", 2)


def test_a_missing_field_stops_with_its_name_never_a_guess():
    cd = case_data()
    cd["police"]["accident_datetime"] = "2026-09-07"  # a date but no time
    with pytest.raises(SpecError) as e:
        build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert e.value.code == "missing_data" and "accident time" in e.value.detail
    cd = case_data()
    cd["at_fault"]["policy"]["policy_no"] = ""
    with pytest.raises(SpecError) as e:
        build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert "at-fault policy" in e.value.detail


def test_profile_and_workshop_are_required_and_no_workshop_never_falls_back():
    with pytest.raises(SpecError) as e:
        build_spec(case_data(), "BNN6055", {"manager": "X", "adjuster": ""}, WORKSHOP)
    assert e.value.code == "profile_incomplete"
    for ws in (None, {"slot": 1, "name": "  "}):
        with pytest.raises(SpecError) as e:
            build_spec(case_data(), "BNN6055", PROFILE, ws)
        assert e.value.code == "workshop_missing"


def test_an_unknown_at_fault_insurer_stops():
    cd = case_data()
    cd["at_fault"]["policy"]["insurer"] = "Kurnia Insurans Bhd"
    with pytest.raises(SpecError) as e:
        build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert e.value.code == "insurer_unknown"
    cd["at_fault"]["policy"]["insurer"] = "Lonpac Insurance Bhd"  # the spare-case rule (playbook 02) has its own reason
    with pytest.raises(SpecError) as e:
        build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert e.value.code == "insurer_lonpac" and "spare" in e.value.detail


def test_liberty_needs_a_region_from_the_place_and_hq_never_goes_out():
    cd = case_data()
    cd["at_fault"]["policy"]["insurer"] = "Liberty General Insurance Berhad"
    assert build_spec(cd, "BNN6055", PROFILE, WORKSHOP).branch_match == "^East\\ Coast"
    cd["police"]["place"] = "somewhere unknown"
    with pytest.raises(SpecError) as e:
        build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert e.value.code == "liberty_branch"
    assert liberty_region("Selangor and Johor") is None  # two regions: not guessed


def test_no_claimant_insurance_is_blank_but_an_unusable_one_stops():
    s = build_spec(case_data(client_policy=None), "BNN6055", PROFILE, WORKSHOP)
    assert s.client["ins_coid"] == "" and s.client["policy"] == ""  # the bundle has none: not a blocker (playbook 01)
    for change in ({"insurer": "Kurnia Insurans"}, {"policy_no": ""}):  # playbook 02: mandatory when the bundle has it, blank would say "none"
        cd = case_data()
        cd["client_policy"].update(change)
        with pytest.raises(SpecError) as e:
            build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
        assert e.value.code == "client_insurance"


def test_owner_falls_back_to_the_driver_and_a_company_is_noticed():
    cd = case_data()
    cd["at_fault"]["owner"] = None
    cd["at_fault"]["driver"] = {"name": "Ali bin Abu", "nric": "800101015555"}
    assert build_spec(cd, "BNN6055", PROFILE, WORKSHOP).atfault["owner_name"] == "ALI BIN ABU"
    cd["at_fault"]["owner"] = {"name": "ABC Trading Sdn Bhd", "nric": "123456-A"}
    assert build_spec(cd, "BNN6055", PROFILE, WORKSHOP).atfault["owner_is_company"] is True


def test_small_helpers():
    assert fmt_ic("770124115274") == "770124-11-5274" and fmt_ic("A1234567") == "A1234567" and fmt_ic("") == "-"
    assert hour_of("2026-09-07 21:30") == "21" and hour_of("07/09/2026 9.30 PM") == "21" and hour_of("12:05 AM") == "00" and hour_of("2026-09-07") is None
    assert insurer_of("Etiqa General Takaful") == ("Etiqa General Takaful", "9516") and insurer_of("Etiqa General Insurance")[1] == "9517"
    assert polcover_rx("TP, Fire & Theft") == "Fire|TPFT" and polcover_rx("") == "Comprehensive"
    assert loss_text("rear") == "COLLISION- HEAD TO REAR (INSURED HIT TP)" and loss_text("") == "COLLISION (INSURED HIT TP)"


def test_make_aliases_and_number_parsing():
    from autopilot_worker.create_spec import make_and_model

    assert make_and_model("BMW / MINI COOPER S") == ("MINI", "COOPER S") and make_and_model("MERCEDES BENZ / C180")[0] == "MERCEDES-BENZ"
    assert make_and_model("PERODUA / MYVI - 1500 SE")[0] == "PERODUA"
    cd = case_data()
    cd["client_vehicle"].update({"cc": "1,495 cc", "year_body": "SALOON / 2015"})
    s = build_spec(cd, "BNN6055", PROFILE, WORKSHOP)
    assert s.veh["cc"] == "1495" and s.veh["year"] == "2015"
