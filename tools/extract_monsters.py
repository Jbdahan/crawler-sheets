"""Pull every Mob and Boss stat block out of the DCC books into tools/raw/monsters.json.

Reads the line dumps from tools/dump_lines.py (run that first). Keeps the stat block only:
the System AI quips and descriptive prose are left out.

    python3 tools/extract_monsters.py
"""
import difflib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
BOOKS = ["Core", "Survival", "Crawlers", "Par"]
# printed page = pdf index - offset
PAGE_OFFSET = {"Core": 1, "Survival": 1, "Crawlers": 1, "Par": 1}

HEADER_RE = re.compile(r"^((?:Neighborhood|Borough|City|Quest|Province|Country|Floor) Boss|Boss|Mob|Elite|NPC|Pet|Minion|Crawler|Vehicle)\s*[;,]\s*(.*)$")
SIZE_RE = re.compile(r"(Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal|Titanic)\s*\((\d+)\)", re.I)
ATTACK_RE = re.compile(r"^(?P<name>[^:]{1,60}):\s*(?P<rest>.*\bto hit\b.*)$")
STATS = ["str", "int", "con", "dex", "cha"]


def junk(line, h):
    f, s, y = line["font"], line["size"], line["y"]
    if f.startswith(("Arial", "CCSmash", "Potato")):
        return True
    if f.startswith("NeueKabel-Black") and (y < 30 or y > h - 60) and s <= 12:
        return True
    if f.startswith("NeueKabel-Black") and s >= 30 and y < 20:
        return True
    return False


def stream(book):
    pages = json.loads((RAW / f"lines_{book}.json").read_text())
    out = []
    for p in pages:
        w = p["w"]
        h = 792
        page = p["pdf"] - PAGE_OFFSET[book]
        lines = [l for l in p["lines"] if not junk(l, h)]
        left = sorted([l for l in lines if l["x"] < w / 2 - 10], key=lambda l: l["y"])
        right = sorted([l for l in lines if l["x"] >= w / 2 - 10], key=lambda l: l["y"])
        for l in left + right:
            out.append({**l, "page": page})
    return out


def is_heading(l):
    return l["font"].startswith(("NeueKabel", "CitrusGothic")) and l["size"] >= 14


def tb(l):
    return l["font"].startswith("TextbookNew")


def is_name(l):
    return l["font"].startswith("TextbookNew-Bold") and l["size"] >= 11.5


def parse_block(lines, i, j):
    """lines[i..j-1] are the name (TextbookNew-Bold 12), lines[j] the italic header."""
    name = " ".join(lines[k]["text"].strip() for k in range(i, j))
    hdr = lines[j]["text"].strip()
    j += 1
    while j < len(lines) and "Italic" in lines[j]["font"] and not re.match(r"^\d", lines[j]["text"].strip()):
        hdr = join([hdr, lines[j]["text"].strip()])
        j += 1
    m = HEADER_RE.match(hdr)
    tier = m.group(1).title().replace("Npc", "NPC")
    rest = m.group(2)
    sm = SIZE_RE.search(rest)
    size = sm.group(1).title() if sm else None
    size_n = int(sm.group(2)) if sm else None
    mtype = rest[sm.end():].lstrip(", ").strip() if sm else rest
    body = []
    while j < len(lines):
        l = lines[j]
        t = l["text"].strip()
        if is_heading(l) or not tb(l):
            break
        if is_name(l) and t.startswith("—"):
            j += 1
            continue  # a quote credit ("—Carl") set beside the block
        if is_name(l):
            break  # next stat block
        if l["font"].startswith("TextbookNew-Bold") and re.match(r"^[^.]{2,60}\. Level \d", t):
            break  # next System AI box
        body.append(l)
        j += 1
    return {"name": name, "tier": tier, "size": size, "sizeN": size_n, "type": mtype,
            "page": lines[i]["page"], "_hdr": hdr, "_body": body}, j


def num_tokens(lines):
    return [t for l in lines for t in l["text"].split()]


def parse_body(m):
    body = m.pop("_body")
    # Health Bar: numbers before the "10%" row
    k = 0
    slots = []
    while k < len(body) and not body[k]["text"].strip().startswith("Level"):
        t = body[k]["text"].strip()
        if "%" not in t and re.fullmatch(r"[\d\s,]+", t):
            slots += t.split()
        elif "%" not in t:
            m.setdefault("_stray", []).append(t)
        k += 1
    m["health"] = [int(s) if s.isdigit() else s for s in slots]
    # Level Surprise Evade Move DR row
    labels, vals = [], []
    while k < len(body) and body[k]["text"].strip() in ("Level", "Surprise", "Evade", "Move", "DR", "Level Surprise Evade Move DR"):
        labels += body[k]["text"].split()
        k += 1
    y0 = body[k]["y"] if k < len(body) else 0
    while k < len(body) and len(vals) < len(labels) and body[k]["text"].strip().lower() not in ("str", "int", "con", "dex", "cha"):
        vals.append(body[k]["text"].strip())
        k += 1
    m["core"] = dict(zip([x.lower() for x in labels], vals))
    # Str Int Con Dex Cha
    slabels = []
    while k < len(body) and re.fullmatch(r"(Str|Int|Con|Dex|Dec|Cha)", body[k]["text"].strip(), re.I):
        slabels.append(body[k]["text"].strip())
        k += 1
    svals = []
    while k < len(body) and len(svals) < len(slabels) and re.fullmatch(r"[\d,]+\s*\([+-−]?\d+\)|—|-", body[k]["text"].strip()):
        svals.append(body[k]["text"].strip())
        k += 1
    m["stats"] = {}
    for key, v in zip(STATS, svals):
        mm = re.match(r"([\d,]+)\s*\(([+-−]?\d+)\)", v)
        if mm:
            m["stats"][key] = {"score": int(mm.group(1).replace(",", "")), "mod": int(mm.group(2).replace("−", "-"))}
    # attacks and notes
    rest = body[k:]
    attacks, notes, cur, mode = [], [], None, None
    for l in rest:
        t = l["text"].strip()
        bold = l["font"].startswith("TextbookNew-Bold")
        if bold and re.match(r"^Notes?\s*:", t):
            mode = "notes"
            notes.append(re.sub(r"^Notes?\s*:\s*", "", t))
            continue
        bare = re.match(r"^(?P<name>[^:]{1,60}?)\s+(?P<rest>(?:\d+(?:\+F)?|None) to hit\b.*)$", t)
        if mode != "notes" and bold and bare and not ATTACK_RE.match(t):
            t = f'{bare.group("name")}: {bare.group("rest")}'  # "Bite 14+F to hit" printed without its colon
        if mode != "notes" and bold and (ATTACK_RE.match(t) or (cur is None or cur["_bold_done"])) and ":" in t:
            cur = {"line": t, "effect": [], "_bold_done": False}
            attacks.append(cur)
            continue
        if mode == "notes":
            notes.append(t)
        elif cur is not None:
            if not cur["_bold_done"] and not cur["effect"] and line_open(cur["line"], t):
                cur["line"] = join([cur["line"], t])  # attack line wrapped
            else:
                cur["_bold_done"] = True
                cur["effect"].append(t)
        else:
            m.setdefault("_stray", []).append(t)
    m["attacks"] = [{"line": join([a["line"]]), "effect": join(a["effect"])} for a in attacks]
    m["notes"] = join(notes)
    return m


DAMAGE_TYPES = r"(Acid|Bludgeoning|Electric|Fire|Force|Holy|Ice|Necrotic|Piercing|Poison|Psychic|Slashing|Sonic)\b"
REACH_RE = re.compile(r"\b(range|radius|Cone|Line|Aura|Burst|Blast|Splash|Touch|Self|sight)\b", re.I)


def line_open(line, nxt):
    """Is an attack's stat line ("Bite: 12+F to hit, 3d4+2 Piercing, 5ft range") still running onto nxt?"""
    line = line.rstrip()
    if line.endswith(("‑", "-", ",", "/")) or re.search(r"\d+ft$", line):
        return True
    if nxt[:1].islower():
        return True
    # no range yet: only a continuation if it reads like one ("(depends…)", "100ft range")
    return not REACH_RE.search(line.split(":", 1)[-1]) and bool(re.match(r"[(\d]|" + DAMAGE_TYPES, nxt))


def join(parts):
    s = " ".join(parts)
    s = re.sub(r"‑\s+", "", s)  # soft hyphen breaks: "Bludgeon‑ ing"
    s = re.sub(r"(\w)-\s+(?=[a-z])", r"\1", s)
    return re.sub(r"\s+", " ", s).strip()


def headings(lines):
    """Running context: the latest chapter / neighborhood / quest heading for each line index."""
    ctx, out = {"h": []}, []
    for l in lines:
        if is_heading(l):
            ctx["h"].append((l["font"], l["size"], l["text"].strip(), l["page"], len(out)))
            ctx["h"] = ctx["h"][-12:]
        out.append(list(ctx["h"]))
    return out


GENERIC = {"NPCS", "MINOR NPCS", "KEY NPCS", "MOBS", "AI", "CLUES", "CRAWLERS", "ELITES AND NPCS"}


def character(name, h, at):
    """A named character's heading right above the block, e.g. ANNIE HARISTON over "Cat Girl"."""
    if not h or at - h[4] > 45 or not h[0].startswith("NeueKabel") or h[1] > 17:
        return None
    t, n = h[2].upper(), name.upper()
    if t in GENERIC or t.startswith(("STAGE", "NEIGHBORHOOD", "QUEST")) or "STAT BLOCK" in t or n in t or t in n \
            or difflib.SequenceMatcher(None, t, n).ratio() > 0.75:
        return None
    def word(w):
        if len(w) <= 2 and not re.search(r"[AEIOU]", w):
            return w  # initials: "MB"
        return w[0] + w[1:].capitalize() if w[0] in "“\"" else w.capitalize()
    return " ".join(word(w) for w in h[2].split())


def extract(book):
    lines = stream(book)
    ctx = headings(lines)
    found, i = [], 0
    while i < len(lines):
        l = lines[i]
        if i and "Italic" in l["font"] and HEADER_RE.match(l["text"].strip()) and is_name(lines[i - 1]):
            s = i - 1
            # a name wrapped onto two lines (but not a "—Crawler JB" quote credit above it)
            p = lines[s - 1]
            if is_name(p) and not p["text"].strip().startswith("—") and p["page"] == lines[s]["page"] \
                    and abs(p["x"] - lines[s]["x"]) < 3 and 0 < lines[s]["y"] - p["y"] < 18 and "." not in p["text"]:
                s -= 1
            m, j = parse_block(lines, s, i)
            m["book"] = book
            m["_ctx"] = [h[2] for h in ctx[s]]
            m["character"] = character(m["name"], ctx[s][-1] if ctx[s] else None, s)
            found.append(parse_body(m))
            i = j
            continue
        i += 1
    return found


if __name__ == "__main__":
    allm = []
    for b in BOOKS:
        ms = extract(b)
        print(b, len(ms))
        allm += ms
    (RAW / "monsters.json").write_text(json.dumps(allm, indent=1, ensure_ascii=False))
