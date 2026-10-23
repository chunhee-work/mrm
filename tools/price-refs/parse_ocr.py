"""OCR text -> TSV: group, desc, part_no, code, price (user's price-reference PDFs, 2026-10-24)."""
import re, sys, glob
for f in glob.glob("*.ocr.txt"):
    out = []
    for line in open(f):
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 2 or line.startswith("==="): continue
        m = None; price = ""
        for c in cells[1:]:
            if re.fullmatch(r"[\d,]+\.\d\d", c): price = c.replace(",", ""); break
        body = " ".join(c for c in cells[1:] if not re.fullmatch(r"[\d,]+\.\d\d|MRCDBP.*", c))
        m = re.match(r"(.*?)\s*\[([^\]]+)\]\s*\[?([A-Z0-9]{5,6})?\]?", body)
        if not m: continue
        out.append("\t".join([cells[0], m.group(1).strip(), m.group(2), m.group(3) or "", price]))
    open(f.replace(".ocr.txt", ".tsv"), "w").write("group\tdesc\tpart_no\tcode\tprice\n" + "\n".join(out) + "\n")
    print(f, len(out), "rows,", sum(1 for o in out if o.split("\t")[4] not in ("", "0.00")), "priced")
