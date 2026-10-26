"""Build src/data/monsters.json (mechanics only) from tools/raw/monsters.json.

The app is published, so like build_data.py this keeps numbers, attack lines and short
condensed effect tags ("Hit: Held", "Evade MF+: Blood Trail") written here, never the
books' effect or note sentences. Anything the tags can't say is flagged with a page reference.

    python3 tools/extract_monsters.py   # needs the line dumps from tools/dump_lines.py
    python3 tools/build_monsters.py
"""
import json
import re
import sqlite3
from pathlib import Path

from build_monster_manual import RULES_DB, book_sort, is_boss, key, locate, slug

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "src" / "data" / "monsters.json"
STATS = ["str", "int", "con", "dex", "cha"]
DAMAGE_ABBR = {"Bludgeoning": "Bludg", "Piercing": "Pierc", "Slashing": "Slash", "Electric": "Elec",
               "Necrotic": "Necro", "Psychic": "Psych"}

DEBUFF_RE = re.compile(r"\b(?:the |The )?((?:The )?[A-Z][\w’'-]*(?: [A-Z][\w’'-]*)*(?: and [A-Z][\w’'-]*(?: [A-Z][\w’'-]*)*)?) Debuffs?\b")
TRIGGERS = [
    (re.compile(r"Evade Critical Fail", re.I), "Evade CF"),
    (re.compile(r"Evade Major Fail or worse", re.I), "Evade MF+"),
    (re.compile(r"fails? to Evade", re.I), "Evade fail"),
    (re.compile(r"\b(Str|Int|Con|Dex|Cha)[- ](?:Opposed )?(?:Stat )?Check", re.I), None),  # "<Stat> check fail"
    (re.compile(r"^(?:Any (?:hit )?crawlers? (?:hit )?|Hit crawlers? )", re.I), "Hit"),
]


def condense(effect):
    """→ (tags, more): short mechanical tags and whether the book says more than they do."""
    tags, more, trig = [], False, None
    for s in re.split(r"(?<=[.!])\s+", effect):
        s = s.strip()
        if not s:
            continue
        for rx, label in TRIGGERS:
            mm = rx.search(s)
            if mm:
                trig = label or f"{mm.group(1).title()} check fail"
                break
        got = []
        for d in DEBUFF_RE.findall(s) if re.search(r"\b(gains?|gaining|applies|inflicts?)\b", s) else []:
            for name in re.split(r",\s*| and ", d):
                name = re.sub(r"^The (?!Taint)", "", name.strip())
                if name and name not in ("Debuff",):
                    got.append(name)
        push = re.search(r"\b(pushed|slides?|pulled|knocked back)\s+(\d+)\s*(?:ft|feet)", s)
        if push:
            got.append(f"{push.group(1).rstrip('s')} {push.group(2)}ft")
        rounds = re.search(r"for (\d+) rounds?", s)
        if got:
            tag = " + ".join(dict.fromkeys(got))
            if rounds:
                tag += f" ({rounds.group(1)} rds)"
            tags.append(f"{trig}: {tag}" if trig else tag)
            # a colon after the Debuff explains a homebrew one, or there is a second clause
            if re.search(r"Debuffs?:\s", s) or re.search(r"\.\s|;", s.rstrip(".")):
                more = True
        elif re.search(r"\b(Stat Check|Skill Check)\.?$", s):
            continue  # the check itself; its outcome follows in the next sentence
        else:
            more = True
    return list(dict.fromkeys(tags)), more


def attack(a):
    name, _, rest = a["line"].partition(":")
    rest = rest.strip()
    hit = None
    mm = re.match(r"^((?:\d+(?:\+F)?|None)) to hit,?\s*(.*)$", rest)
    if mm:
        hit, rest = mm.group(1), mm.group(2)
    for full, short in DAMAGE_ABBR.items():
        rest = re.sub(rf"\b{full}\b", short, rest)
    rest = re.sub(r"\bNo damage\b", "no dmg", rest)
    rest = re.sub(r"(\d+)ft range", r"\1ft", rest)
    tags, more = condense(a["effect"]) if a["effect"] else ([], False)
    out = {"name": name.strip(), "hit": hit, "text": rest}
    if tags:
        out["fx"] = tags
    if more:
        out["more"] = True
    return out


def note_titles(notes):
    return [t.strip().rstrip(".") for t in re.findall(r"(?:^|(?<=[.!?”)])\s)([A-Z“][\w’'“”!,&\- ]{1,40})—", notes)]


def health(slots):
    vals = [s for s in slots if isinstance(s, int)]
    return {"slots": len(vals), "per": vals} if len(set(vals)) > 1 else {"slots": len(vals), "per": vals[0] if vals else 0}


def build():
    ms = json.loads((RAW / "monsters.json").read_text())
    db = sqlite3.connect(RULES_DB)
    for m in ms:
        m["part"], m["section"] = locate(db, m)
    ms.sort(key=book_sort)
    seen, out = {}, []
    for m in ms:
        part, section = m["part"], m["section"]
        k = key(m)
        if k in seen:
            seen[k].setdefault("alsoPages", []).append(m["page"])
            continue
        c = m["core"]
        entry = {
            "id": slug(f'{m["name"]}-{m["book"]}-{m["page"]}'),
            "name": m["name"],
            **({"character": m["character"]} if m.get("character") else {}),
            "tier": m["tier"],
            "boss": is_boss(m),
            "size": f'{m["size"]} ({m["sizeN"]})' if m["size"] else "",
            "type": m["type"],
            "level": int(re.sub(r"\D", "", c.get("level", "0")) or 0),
            "surprise": c.get("surprise", ""), "evade": c.get("evade", ""),
            "move": c.get("move", "").replace(" ", ""), "dr": c.get("dr", ""),
            "hb": health(m["health"]),
            "stats": [[m["stats"][s]["score"], m["stats"][s]["mod"]] if s in m["stats"] else None for s in STATS],
            "attacks": [attack(a) for a in m["attacks"]],
            "notes": note_titles(m["notes"]) if m["notes"] else [],
            "book": m["book"], "page": m["page"], "part": part, "section": section,
        }
        if m["notes"] and not entry["notes"]:
            entry["notes"] = ["Special rules"]
        seen[k] = entry
        out.append(entry)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out)} monsters → {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
