"""Turn Core Rulebook pages into a typed stream of paragraphs using font cues.

Each paragraph is a dict: {kind, text, page, label?}. Kinds:
  section  - chapter/subsection headings (NeueKabel, big CitrusGothic)
  entry    - an entry name (skill/spell: TextbookNew-Bold 12, race/class: CitrusGothic 13)
  kw       - italic keyword line under a skill/spell name
  quote    - flavour quote under a spell name
  field    - paragraph that starts with a bold label ("Base Damage:", "Rank 5:")
  text     - anything else
"""
import re
from pathlib import Path

import pymupdf

PDF_DIR = Path("/Users/judahan/Library/Mobile Documents/com~apple~CloudDocs")
CORE = PDF_DIR / "carl_rpg_core_rulebook_digital_hi-res_watermarked (1).pdf"
PAGE_OFFSET = 1  # pdf index = printed page + 1
PARA_GAP = 14.8  # line gaps above this start a new paragraph

_doc = None


def doc():
    global _doc
    if _doc is None:
        _doc = pymupdf.open(CORE)
    return _doc


def classify(span):
    f, s = span["font"], span["size"]
    if f.startswith("CCSmash"):
        return "skip"  # pull quotes
    if f.startswith("NeueKabel") and s >= 15:
        return "section"
    if f.startswith("CitrusGothic") and s >= 20:
        return "section"
    if f.startswith("CitrusGothic") and s >= 12:
        return "entry"
    if f.startswith("TextbookNew-Bold") and s >= 11.5:
        return "entry"
    if "Ita" in f and f.startswith("ClassicoURW") and s >= 10.8:
        return "quote"
    if f.startswith("TextbookNew-Italic"):
        return "kw"
    if f.startswith(("TextbookNew-Bold", "ClassicoURW-Bol")):
        return "bold"
    return "text"


def page_lines(printed):
    page = doc()[printed + PAGE_OFFSET]
    w, h = page.rect.width, page.rect.height
    mid = w / 2
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in l["spans"]).strip()
            x0, y0 = l["bbox"][0], l["bbox"][1]
            if "Unauthorized distribution" in text or "Copyright Renegade" in text:
                continue
            if y0 < 40 or y0 > h - 40:
                continue
            if text.isdigit() and spans[0]["size"] > 20:
                continue
            first = next((s for s in spans if s["text"].strip() not in ("•",)), spans[0])
            out.append({
                "col": 0 if x0 < mid - 20 else 1,
                "x": x0, "y": y0,
                "cls": classify(first),
                "size": first["size"],
                "text": text,
                "spans": spans,
                "page": printed,
            })
    out.sort(key=lambda d: (d["col"], d["y"], d["x"]))
    return out


def fix(text):
    text = text.replace("‑", "-").replace("­", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def join(a, b):
    if a.endswith("-") and b[:1].islower():
        return a[:-1] + b
    return a + " " + b


def bold_label(line):
    """Return (label, rest) if the line starts with a bold label ending in ':'."""
    spans = line["spans"]
    label = ""
    i = 0
    while i < len(spans) and classify(spans[i]) == "bold":
        label += spans[i]["text"]
        i += 1
    label = label.strip()
    if not label:
        return None
    rest = "".join(s["text"] for s in spans[i:]).strip()
    if label.endswith(":") or label.upper() == "UPGRADES":
        return label.rstrip(":").strip(), rest
    # label like "Rank 5: " sometimes split as "Rank 5:" + text
    m = re.match(r"^(.*?:)\s*(.*)$", label)
    if m:
        return m.group(1).rstrip(":").strip(), (m.group(2) + " " + rest).strip()
    return None


def stream(pages):
    """Yield paragraphs over a page range."""
    paras = []
    prev = None
    for p in pages:
        for ln in page_lines(p):
            cls = ln["cls"]
            text = fix(ln["text"])
            if cls == "skip":
                continue
            if cls == "entry" and text.startswith("—"):
                continue  # pull-quote attribution
            if cls == "section" and not re.search(r"[A-Za-z]{3}", text):
                continue  # figure labels like "1 2 8"
            same_flow = prev is not None and prev["page"] == ln["page"] and prev["col"] == ln["col"]
            gap = ln["y"] - prev["y"] if same_flow else None
            cur = paras[-1] if paras else None
            if cls in ("section", "entry"):
                # multi-line headings
                if cur and cur["kind"] == cls and same_flow and gap is not None and gap < 22:
                    cur["text"] = join(cur["text"], text)
                else:
                    paras.append({"kind": cls, "text": text, "page": p})
            elif cls in ("kw", "quote"):
                if cur and cur["kind"] == cls and (gap is None or gap < PARA_GAP):
                    cur["text"] = join(cur["text"], text)
                else:
                    paras.append({"kind": cls, "text": text, "page": p})
            else:
                lab = bold_label(ln) if cls == "bold" else None
                if lab:
                    paras.append({"kind": "field", "label": lab[0], "text": fix(lab[1]), "page": p})
                elif (cur and cur["kind"] in ("text", "field")
                      and (gap is None or gap < PARA_GAP)
                      and not (gap is None and text.startswith("•") )):
                    cur["text"] = join(cur["text"], text)
                else:
                    paras.append({"kind": "text", "text": text, "page": p})
            prev = ln
    return paras


if __name__ == "__main__":
    import sys
    a, b = int(sys.argv[1]), int(sys.argv[2])
    for para in stream(range(a, b + 1)):
        lab = f"[{para['label']}] " if para.get("label") else ""
        print(f"p{para['page']} {para['kind']:7} {lab}{para['text'][:150]}")
