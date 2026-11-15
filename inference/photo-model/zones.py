"""Which area of the car a part name belongs to: FRONT / REAR / SIDE / UNDER / ID (views, documents, interior).
A name can belong to two areas (Quarter Panel = REAR+SIDE, Fender = FRONT+SIDE). Empty set = fits anywhere."""
import re
ID = re.compile(r"view|photo|odometer|road ?tax|chassis (no|number)|engine (no|number)|tyre (size|brand)|interior|dashboard|document|disc|seat|airbag|roof lining", re.I)
SIDE = re.compile(r"\bdoor\b(?! back)|mirror|pillar|runningboard|running board|\bsill\b|side step|bodyside|body side|sliding door|window|regulator|\broof\b|tread plate", re.I)
REAR = re.compile(r"\brear\b|\brr\b|boot|tailgate|tail gate|trunk|spare wheel|exhaust|silencer|tail ?lamp|tail ?light|door back|back door|luton|tail lift|parcel shelf|reverse|towing|quarter|end panel", re.I)
FRONT = re.compile(r"\bfront\b|\bfrt\b|bonnet|hood|headlamp|head lamp|radiator|condenser|grille|fender|engine|washer|cowl|wiper|windscreen|fog ?lamp|horn|battery|a/c|air ?con|cooling fan|fan blade|air filter|starter|alternator|intercooler|firewall|\bpas\b|steering|kangaroo|crossmember|front panel|fuse box|manifold|cylinder head|oil", re.I)
UNDER = re.compile(r"suspension|chassis|axle|driveshaft|knuckle|\barm\b|stabiliser|stabilizer|subframe|brake|\bhub\b|link rod|trailing|spring|shock absorber|leaf", re.I)
def zones(name):
    n = name or ""
    if ID.search(n): return {"ID"}
    z = set()
    if SIDE.search(n): return {"SIDE"}                       # doors etc. are side even when called Front/Rear
    if re.search(r"quarter", n, re.I): z |= {"REAR", "SIDE"}
    if re.search(r"fender|wheel ?rim|\btyre\b|\bwheel\b|mudflap|wheel ?arch|wheelhouse|liner", n, re.I): z |= {"SIDE"}
    if REAR.search(n): z.add("REAR")
    elif FRONT.search(n): z.add("FRONT")
    if UNDER.search(n): z.add("UNDER")
    return z                                                  # empty = anywhere
