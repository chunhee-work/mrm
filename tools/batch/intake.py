#!/usr/bin/env python3
"""New WhatsApp batch -> batch folder ready for step 1, in one go (user 2026-11-04: faster workflow).

  python3 intake.py <batch_dir> <zip | WhatsApp msg id from wa_watch.sh>

1 msg id -> tools/whatsapp/wa_fetch.sh copies the file to ~/Downloads (prints NEEDS_CLICK if WhatsApp has not downloaded it)
2 unzip into <batch_dir>/src, list every name in full (unzip -Z1)
3 one folder per case: <batch_dir>/<PLATE>/ (photos + its PDFs; a PDF at the zip root whose name starts with the plate goes in)
4 RC pages for the quick make/model read: <batch_dir>/rc/<PLATE>_<page>.png (first 3 pages of each PDF, 110 dpi)
Prints one line per case: plate · photos · PDFs · pages. Next: read the RC pages -> meta_rc.json -> photos.py model (playbook 00).
"""
import os, re, shutil, subprocess, sys, zipfile
PLATE = re.compile(r"^[A-Z]{1,3}\d{1,4}[A-Z]?$")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def main():
    b, src = sys.argv[1], sys.argv[2]; os.makedirs(b, exist_ok=True)
    if re.fullmatch(r"\d+", src):
        o = subprocess.run([os.path.join(REPO, "tools", "whatsapp", "wa_fetch.sh"), src], capture_output=True, text=True).stdout
        print(o.strip()); m = re.search(r"SAVED (.+) \d+$", o.strip())
        if not m:
            sys.exit(1)
        src = m.group(1)
    z = zipfile.ZipFile(src); names = z.namelist(); print(f"zip {os.path.basename(src)}: {len(names)} entries")
    z.extractall(os.path.join(b, "src"))
    root = os.path.join(b, "src"); top = sorted(set(n.split("/")[0] for n in names if not n.startswith("__MACOSX")))
    # a zip that holds one wrapper folder (e.g. "sinar/<PLATE>/...") -> go one level down
    while len(top) == 1 and os.path.isdir(os.path.join(root, top[0])) and not re.match(r"^[A-Z]{1,3}\s?\d", top[0], re.I):
        root = os.path.join(root, top[0]); top = sorted(x for x in os.listdir(root) if not x.startswith("."))
    plates = {}
    for t in top:
        p = os.path.join(root, t)
        if os.path.isdir(p):
            plate = re.sub(r"\s+", "", re.split(r"[\s(]", t.strip())[0]).upper()
            if not PLATE.match(plate):   # VP AIRBRESH zips name folders by date -> take the plate from the PDF inside
                for f in sorted(os.listdir(p)):
                    m = re.match(r"\s*([A-Za-z]{1,3}\s?\d{1,4}[A-Za-z]?)\b", f) if f.lower().endswith(".pdf") else None
                    if m:
                        print(f"folder {t} -> {m.group(1)} (from {f})"); plate = re.sub(r"\s+", "", m.group(1)).upper(); break
            plates[plate] = p
    import fitz
    for plate, p in plates.items():
        dst = os.path.join(b, plate)
        if not os.path.exists(dst):
            shutil.copytree(p, dst)
        for f in os.listdir(root):   # root-level PDFs that belong to this plate
            if f.lower().endswith(".pdf") and re.sub(r"\s+", "", f).upper().startswith(plate):
                shutil.copy(os.path.join(root, f), dst)
        files = os.listdir(dst); pdfs = [f for f in files if f.lower().endswith(".pdf")]
        photos = [f for f in files if f.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))]
        os.makedirs(os.path.join(b, "rc"), exist_ok=True); pages = 0; k = 0
        for f in pdfs:
            d = fitz.open(os.path.join(dst, f)); pages += len(d)
            for i in range(min(3, len(d))):
                k += 1; d[i].get_pixmap(dpi=110).save(os.path.join(b, "rc", f"{plate}_{k}.png"))
        print(f"{plate}: {len(photos)} photos · PDFs {pdfs or 'NONE -> pending'} · {pages} pages")
    loose = [f for f in os.listdir(root) if os.path.isfile(os.path.join(root, f)) and not any(re.sub(r"\s+", "", f).upper().startswith(p) for p in plates)]
    if loose:
        print("NOT MATCHED to a case (check by hand):", loose)


if __name__ == "__main__":
    main()
