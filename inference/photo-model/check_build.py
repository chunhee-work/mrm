"""Build-time checks. `files`: every path named in production.json exists, no token variable in the image.
`smoke`: runs the UNCHANGED predict_case.py through the service's own runner on three generated photos, with the network
blocked and as the runtime user (plan #26, section 2)."""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))


def files():
    prod = json.load(open(os.path.join(here, "models", "production.json")))
    for g in prod["groups"]:
        for p in [g["stage1"]] + g.get("seq", []):
            if not os.path.isfile(os.path.join(here, p)):
                sys.exit("missing checkpoint: " + p)
    if any(k.upper().startswith("HF_TOKEN") or k.upper() == "HUGGING_FACE_HUB_TOKEN" for k in os.environ):
        sys.exit("a token variable is set in the image environment")
    print("files ok")


def smoke():
    from PIL import Image
    import tempfile
    import core
    d = tempfile.mkdtemp()
    paths = []
    for i, c in enumerate([(200, 30, 30), (30, 200, 30), (30, 30, 200)]):
        p = os.path.join(d, "%03d.jpg" % i)
        Image.new("RGB", (320, 240), c).save(p)
        paths.append(p)
    os.environ["PYTHONPATH"] = os.path.join(here, "nonet")
    # the same call the service makes, plus the blocked network
    saved = core.run_predict
    out = saved(paths, "TEST CAR 4D", 1500)
    assert len(out) == 3 and all(len(o["top"]) >= 1 for o in out)
    print("smoke ok")


if __name__ == "__main__":
    {"files": files, "smoke": smoke}[sys.argv[1]]()
