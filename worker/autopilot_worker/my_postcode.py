"""A Malaysian address with no city: the city (and the state, if that is missing too) from the 5-digit postcode, so the Adjuster
Report never stops on "missing city" (owner 2026-11-28: the build is fully automatic; only the photo names and a missing file need a
person). Pure, no network.

The ranges are the main post-office towns of each postcode block. A guessed city is always said on the case's event, so a person who
looks sees it. Names are the ones Merimen's city lists use (matched as a regex in merimen_report, so a close name still finds it)."""

from __future__ import annotations

import re

# (first, last, city, state) – the state is the long name report_spec.STATES uses. Narrow ranges first (the first match wins).
_RANGES: list[tuple[int, int, str, str]] = [
    # Perlis
    (1000, 2999, "Kangar", "Perlis Indera Kayangan"),
    # Kedah
    (5000, 5999, "Alor Setar", "Kedah Darul Aman"),
    (6000, 6099, "Jitra", "Kedah Darul Aman"),
    (7000, 7099, "Langkawi", "Kedah Darul Aman"),
    (8000, 8099, "Sungai Petani", "Kedah Darul Aman"),
    (9000, 9099, "Kulim", "Kedah Darul Aman"),
    (6100, 9999, "Alor Setar", "Kedah Darul Aman"),
    # Pulau Pinang
    (10000, 11999, "George Town", "Pulau Pinang (Island)"),
    (12000, 13999, "Butterworth", "Pulau Pinang (Mainland)"),
    (14000, 14999, "Bukit Mertajam", "Pulau Pinang (Mainland)"),
    # Kelantan
    (15000, 16999, "Kota Bharu", "Kelantan Darul Naim"),
    (17000, 17099, "Pasir Mas", "Kelantan Darul Naim"),
    (18000, 18099, "Kuala Krai", "Kelantan Darul Naim"),
    (17100, 18999, "Kota Bharu", "Kelantan Darul Naim"),
    # Terengganu
    (20000, 21499, "Kuala Terengganu", "Terengganu Darul Iman"),
    (21600, 21699, "Marang", "Terengganu Darul Iman"),
    (21700, 21799, "Kuala Berang", "Terengganu Darul Iman"),
    (22000, 22099, "Jerteh", "Terengganu Darul Iman"),
    (22100, 22299, "Besut", "Terengganu Darul Iman"),
    (23000, 23099, "Dungun", "Terengganu Darul Iman"),
    (24000, 24099, "Kemaman", "Terengganu Darul Iman"),
    (21500, 24999, "Kuala Terengganu", "Terengganu Darul Iman"),
    # Pahang
    (25000, 26999, "Kuantan", "Pahang Darul Makmur"),
    (27000, 27099, "Jerantut", "Pahang Darul Makmur"),
    (27600, 27699, "Raub", "Pahang Darul Makmur"),
    (28000, 28099, "Temerloh", "Pahang Darul Makmur"),
    (28700, 28799, "Bentong", "Pahang Darul Makmur"),
    (39000, 39999, "Cameron Highlands", "Pahang Darul Makmur"),
    (49000, 49999, "Bukit Tinggi", "Pahang Darul Makmur"),
    (69000, 69999, "Genting Highlands", "Pahang Darul Makmur"),
    (27100, 28999, "Kuantan", "Pahang Darul Makmur"),
    # Perak
    (30000, 31999, "Ipoh", "Perak Darul Ridzuan"),
    (32000, 32099, "Sitiawan", "Perak Darul Ridzuan"),
    (33000, 33099, "Kuala Kangsar", "Perak Darul Ridzuan"),
    (34000, 34099, "Taiping", "Perak Darul Ridzuan"),
    (35000, 35099, "Tapah", "Perak Darul Ridzuan"),
    (36000, 36099, "Teluk Intan", "Perak Darul Ridzuan"),
    (32100, 36999, "Ipoh", "Perak Darul Ridzuan"),
    # Selangor
    (40000, 40999, "Shah Alam", "Selangor Darul Ehsan"),
    (41000, 42999, "Klang", "Selangor Darul Ehsan"),
    (43000, 43099, "Kajang", "Selangor Darul Ehsan"),
    (43300, 43399, "Seri Kembangan", "Selangor Darul Ehsan"),
    (43650, 43699, "Bandar Baru Bangi", "Selangor Darul Ehsan"),
    (45000, 45099, "Kuala Selangor", "Selangor Darul Ehsan"),
    (46000, 47399, "Petaling Jaya", "Selangor Darul Ehsan"),
    (47500, 47699, "Subang Jaya", "Selangor Darul Ehsan"),
    (47100, 47199, "Puchong", "Selangor Darul Ehsan"),
    (48000, 48099, "Rawang", "Selangor Darul Ehsan"),
    (63000, 63999, "Cyberjaya", "Selangor Darul Ehsan"),
    (64000, 64999, "Sepang", "Selangor Darul Ehsan"),
    (68000, 68199, "Ampang", "Selangor Darul Ehsan"),
    (43100, 48999, "Shah Alam", "Selangor Darul Ehsan"),
    # Kuala Lumpur, Putrajaya
    (50000, 60999, "Kuala Lumpur", "Wilayah Persekutuan Kuala Lumpur"),
    (62000, 62999, "Putrajaya", "Wilayah Persekutuan Putrajaya"),
    # Negeri Sembilan
    (70000, 70999, "Seremban", "Negeri Sembilan Darul Khusus"),
    (71000, 71099, "Port Dickson", "Negeri Sembilan Darul Khusus"),
    (72000, 72099, "Kuala Pilah", "Negeri Sembilan Darul Khusus"),
    (73000, 73099, "Tampin", "Negeri Sembilan Darul Khusus"),
    (71100, 73999, "Seremban", "Negeri Sembilan Darul Khusus"),
    # Melaka
    (75000, 78999, "Melaka", "Melaka"),
    # Johor
    (79000, 81999, "Johor Bahru", "Johor Darul Takzim"),
    (82000, 82099, "Pontian", "Johor Darul Takzim"),
    (83000, 83099, "Batu Pahat", "Johor Darul Takzim"),
    (84000, 84099, "Muar", "Johor Darul Takzim"),
    (85000, 85099, "Segamat", "Johor Darul Takzim"),
    (86000, 86099, "Kluang", "Johor Darul Takzim"),
    (82100, 86999, "Johor Bahru", "Johor Darul Takzim"),
    # Labuan, Sabah, Sarawak
    (87000, 87999, "Labuan", "Wilayah Persekutuan Labuan"),
    (88000, 89999, "Kota Kinabalu", "Sabah"),
    (90000, 90799, "Sandakan", "Sabah"),
    (91000, 91199, "Tawau", "Sabah"),
    (90800, 91999, "Kota Kinabalu", "Sabah"),
    (93000, 94999, "Kuching", "Sarawak"),
    (96000, 96299, "Sibu", "Sarawak"),
    (97000, 97099, "Bintulu", "Sarawak"),
    (98000, 98099, "Miri", "Sarawak"),
    (95000, 98999, "Kuching", "Sarawak"),
]

# the state's main town: the last fallback when there is no usable postcode either
CAPITAL = {
    "Perlis Indera Kayangan": "Kangar", "Kedah Darul Aman": "Alor Setar", "Pulau Pinang (Island)": "George Town",
    "Pulau Pinang (Mainland)": "Butterworth", "Kelantan Darul Naim": "Kota Bharu", "Terengganu Darul Iman": "Kuala Terengganu",
    "Pahang Darul Makmur": "Kuantan", "Perak Darul Ridzuan": "Ipoh", "Selangor Darul Ehsan": "Shah Alam",
    "Wilayah Persekutuan Kuala Lumpur": "Kuala Lumpur", "Wilayah Persekutuan Putrajaya": "Putrajaya",
    "Negeri Sembilan Darul Khusus": "Seremban", "Melaka": "Melaka", "Johor Darul Takzim": "Johor Bahru",
    "Wilayah Persekutuan Labuan": "Labuan", "Sabah": "Kota Kinabalu", "Sarawak": "Kuching",
}

_TOWN_STATE = {**{c: st for st, c in CAPITAL.items()}, **{r[2]: r[3] for r in reversed(_RANGES)}}
_TOWNS = sorted(_TOWN_STATE, key=len, reverse=True)


def _key(state: str) -> str:
    return re.sub(r"\s*\(.*\)", "", state or "").strip().lower()


def lookup(postcode: str) -> tuple[str, str] | None:
    """(city, state) for a 5-digit postcode, or None."""
    m = re.search(r"\b(\d{5})\b", postcode or "")
    if not m:
        return None
    n = int(m.group(1))
    for lo, hi, city, state in _RANGES:
        if lo <= n <= hi:
            return city, state
    return None


def guess_city(*, postcode: str, state: str, address: str) -> tuple[str, str, str]:
    """(city, state, how) for an address with no city: a town the address names, else the postcode's town, else the state's main town.
    `how` is "" when nothing could be guessed. A postcode in another state than the one given is not used for the city."""
    addr = (address or "").upper()
    hit = lookup(postcode or address)
    st = state or (hit[1] if hit else "")
    for town in _TOWNS:  # "..., 21300 KUALA TERENGGANU": the longest name first, so "Kuala Terengganu" wins over a shorter one
        if re.search(r"\b" + re.escape(town.upper()) + r"\b", addr) and (not st or _key(_TOWN_STATE[town]) == _key(st)):
            return town, st or _TOWN_STATE[town], "address"
    if hit and (not st or _key(hit[1]) == _key(st)):
        return hit[0], st or hit[1], "postcode"
    for name, capital in CAPITAL.items():
        if st and _key(name) == _key(st):
            return capital, st, "state"
    return "", st, ""


def postcode_for(city: str, state: str = "") -> str:
    """A town's main postcode (the first of its block, e.g. Dungun -> 23000) for a box Merimen requires and the bundle left empty;
    "" when the town is not in the table or lies in another state."""
    c = (city or "").strip().lower()
    for lo, _hi, town, st in _RANGES:
        if town.lower() == c and (not state or _key(st) == _key(state)):
            return f"{lo:05d}"
    return ""
