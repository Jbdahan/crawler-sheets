"""Extract DCC RPG Core Rulebook entries into tools/raw/*.json (full text, gitignored).

Run with the dcc-rules venv (it has PyMuPDF):
    ../dcc-rules/.venv/bin/python tools/extract_rules.py
Then build the app data (mechanics only) with tools/build_data.py.
"""
import json
import re
import sqlite3
from pathlib import Path

from pdf_stream import stream

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
RULES_DB = Path("/Users/judahan/Documents/Claude projects/dcc-rules/data/rules.db")

KNOWN_LABELS = ["Limitations", "Base Damage", "AI Favor", "Range", "Cooldown", "Mana Cost",
                "Duration", "Prerequisite", "Prerequisites", "Class Type", "Size"]


def normalize_fields(paras):
    """Turn text paragraphs that start with a known label into fields."""
    out = []
    for p in paras:
        if p["kind"] == "text":
            m = re.match(r"^(%s):\s*(.*)$" % "|".join(KNOWN_LABELS), p["text"])
            if m:
                p = {**p, "kind": "field", "label": m.group(1), "text": m.group(2)}
        out.append(p)
    return out


def group_entries(paras, sections_ok=None):
    entries, section, cur = [], None, None
    for p in paras:
        if p["kind"] == "section":
            section = p["text"]
            cur = None
            continue
        if p["kind"] == "entry":
            cur = {"name": p["text"], "section": section, "page": p["page"], "kw": "", "quote": "",
                   "fields": {}, "upgrades": {}, "text": []}
            entries.append(cur)
            continue
        if cur is None:
            continue
        if p["kind"] == "kw" and not cur.get("_body"):
            cur["kw"] = (cur["kw"] + " " + p["text"]).strip()
        elif p["kind"] == "kw":
            cur["text"].append(p["text"])  # italic cross-reference inside the body
        elif p["kind"] == "quote":
            cur["quote"] = (cur["quote"] + " " + p["text"]).strip()
        elif p["kind"] == "field":
            cur["_body"] = True
            lab = p["label"]
            m = re.match(r"Rank (\d+)", lab)
            if m:
                cur["upgrades"][m.group(1)] = p["text"]
                cur["_last"] = ("up", m.group(1))
            elif lab.upper() == "UPGRADES":
                cur["_last"] = None
            else:
                cur["fields"][lab] = (cur["fields"].get(lab, "") + " " + p["text"]).strip()
                cur["_last"] = ("f", lab)
        else:
            cur["_body"] = True
            cur["text"].append(p["text"])
    for e in entries:
        e.pop("_last", None)
        e.pop("_body", None)
    return entries


def extract_skills():
    attack = group_entries(normalize_fields(stream(range(177, 184))))
    utility = group_entries(normalize_fields(stream(range(184, 202))))
    spells = group_entries(normalize_fields(stream(range(202, 215))))
    for e in attack:
        e["category"] = "attack"
    for e in utility:
        e["category"] = "utility"
    for e in spells:
        e["category"] = "spell"
    return attack, utility, spells


def extract_races_classes():
    races = group_entries(normalize_fields(stream(range(129, 142))))
    classes = group_entries(normalize_fields(stream(range(142, 158))))
    return races, classes


def extract_deities():
    """Deity names are set as sections, so promote every section after DEITIES to an entry."""
    paras, seen = [], False
    for p in normalize_fields(stream(range(163, 169))):
        if p["kind"] == "section" and p["text"].upper() == "DEITIES":
            seen = True
            continue
        if seen and p["kind"] == "section":
            p = {**p, "kind": "entry"}
        if seen:
            paras.append(p)
    return group_entries(paras)


def table_rows(page_lo, page_hi, heading_like):
    con = sqlite3.connect(f"file:{RULES_DB}?mode=ro", uri=True)
    rows = con.execute(
        "select page_start, heading_path, text from chunks where book='Core' and kind='row' "
        "and page_start between ? and ? and heading_path like ? order by id",
        (page_lo, page_hi, f"%{heading_like}%")).fetchall()
    out = []
    for page, path, text in rows:
        rec = {"page": page}
        for part in text.split(" | "):
            k, _, v = part.partition(": ")
            rec[k.strip()] = v.strip()
        rec["_table"] = next((seg for seg in path.split(" › ") if seg.startswith("Table")), "")
        out.append(rec)
    return out


def main():
    RAW.mkdir(exist_ok=True)
    attack, utility, spells = extract_skills()
    races, classes = extract_races_classes()
    deities = extract_deities()
    data = {
        "attack": attack, "utility": utility, "spells": spells,
        "races": races, "classes": classes, "deities": deities,
        "debuffs": table_rows(97, 97, "Table 11"),
        "backgrounds": table_rows(104, 107, "Table 1"),
        "traumas": table_rows(113, 114, "Table 2"),
        "stat_mods": table_rows(57, 57, "Table 2"),
        "rank_dice": table_rows(176, 176, "Table 37"),
        "sizes": table_rows(85, 85, "Table 9"),
        "damage_types": table_rows(93, 93, "Table 10"),
    }
    for k, v in data.items():
        (RAW / f"{k}.json").write_text(json.dumps(v, indent=1, ensure_ascii=False))
        print(f"{k:13} {len(v)}")


if __name__ == "__main__":
    main()
