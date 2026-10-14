#!/usr/bin/env python3
"""User 2026-10-14: motorcycle cases are not taken (not trained, not labeled).
A case is a motorcycle when >=2 photo captions name motorcycle-only parts, or its Vehicle Model is a motorcycle -> motor_cases.json"""
import json, os, re, collections
HERE = os.path.dirname(os.path.abspath(__file__))
MOTOR = re.compile(r"handle ?bar|front fork|fork (tube|inner|outer|assy|under)|(?<!tailgate )swing ?arm|motorcycle|motor ?cycle|motosikal|leg ?shield|foot ?rest|kick start|chain guard|cover body|headlamp case|meter cover|mudguard (front|rear)|(front|rear) mudguard|tank cover|fuel tank cover|cylinder comp|carburet", re.I)
MODEL = re.compile(r"motorcycle|motosikal|\bEX5\b|\bwave\b|\bY15|LC ?135|\bkriss\b|\bRS ?150|scooter|\bvario\b|\bNVX\b|\bSRL\b|\bRXZ\b|\bkapchai\b", re.I)
def main():
    n = collections.Counter()
    for l in open(os.path.join(HERE, "index.jsonl")):
        try: r = json.loads(l)
        except ValueError: continue
        if MOTOR.search(r.get("name", "")): n[r["cid"]] += 1
    m = {c for c, k in n.items() if k >= 2}
    V = json.load(open(os.path.join(HERE, "lamp_models.json"))) if os.path.exists(os.path.join(HERE, "lamp_models.json")) else {}
    m |= {c for c, v in V.items() if MODEL.search(v)}
    json.dump(sorted(m), open(os.path.join(HERE, "motor_cases.json"), "w")); print("motor cases", len(m))
if __name__ == "__main__": main()
