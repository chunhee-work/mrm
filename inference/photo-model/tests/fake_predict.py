"""Stands in for predict_case.py in the tests: same argv, same output shape, records the env it got."""
import json, os, sys
files = sys.argv[2:]
if os.environ.get("FAKE_MODE") == "crash":
    sys.stderr.write("secret file name " + files[0])
    sys.exit(3)
json.dump({k: os.environ.get(k) for k in ("JEV", "PROD", "VEHICLE", "HF_TOKEN", "PHOTO_MODEL_SECRET")}, open(files[0] + ".env", "w"))
for f in files:
    print(json.dumps({"file": f, "top": [["Front Bumper", 0.9], ["Bonnet", 0.05]], "conf": 0.9, "sure": True, "area": "FRONT", "area_conf": 0.8, "jev": False}))
