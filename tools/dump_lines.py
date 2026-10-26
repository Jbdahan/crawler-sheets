"""Dump every text line (font, size, position) of the DCC books into tools/raw/lines_<book>.json.

The monster extractor parses these instead of re-reading the big PDFs each time.
Run with the dcc-rules venv (it has PyMuPDF):
    ../dcc-rules/.venv/bin/python tools/dump_lines.py
"""
import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
PDF_DIR = Path("/Users/judahan/Library/Mobile Documents/com~apple~CloudDocs")
BOOKS = {
    "Core": "carl_rpg_core_rulebook_digital_hi-res_watermarked (1).pdf",
    "Survival": "rules_for_survival_digital_hi-res_watermarked.pdf",
    "Crawlers": "crawlers_digital_hi-res_watermarked.pdf",
    "Par": "par_for_the_course_digital_hi-res_watermarked.pdf",
    "Toolkit": "Gamemasters Toolkit_Digital_Hi-Res_081226.pdf",
    "Tutorial": "Atlas-Tutorial Floors_Digital_Hi-Res_081226.pdf",
}


def dump(book):
    doc = pymupdf.open(PDF_DIR / BOOKS[book])
    pages = []
    for i, page in enumerate(doc):
        lines = []
        for b in page.get_text("dict", flags=0)["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                spans = [s for s in l["spans"] if s["text"].strip()]
                if not spans:
                    continue
                lines.append({
                    "x": round(l["bbox"][0], 1), "y": round(l["bbox"][1], 1),
                    "font": spans[0]["font"], "size": round(spans[0]["size"], 1),
                    "bold": any("Bold" in s["font"] for s in spans[:1]),
                    "text": "".join(s["text"] for s in l["spans"]),
                })
        pages.append({"pdf": i, "w": page.rect.width, "h": page.rect.height, "label": page.get_label(), "lines": lines})
    (RAW / f"lines_{book}.json").write_text(json.dumps(pages))
    print(book, len(pages), "pages")


if __name__ == "__main__":
    RAW.mkdir(exist_ok=True)
    for b in sys.argv[1:] or BOOKS:
        dump(b)
