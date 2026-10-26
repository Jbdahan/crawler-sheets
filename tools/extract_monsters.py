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
BOOKS = ["Core", "Survival", "Crawlers", "Par", "Toolkit", "Tutorial"]
# printed page = pdf index - offset
PAGE_OFFSET = {"Core": 1, "Survival": 1, "Crawlers": 1, "Par": 1}  # newer dumps use the printed page labels
# books not in the rules index: Floor and section come from their own headings (see toolkit_sections)
OWN_SECTIONS = {"Toolkit", "Tutorial"}

HEADER_RE = re.compile(r"^((?:Neighborhood|Borough|City|Quest|Province|Country|Floor) Boss|Boss|Mob|Elite|NPC|Pet|Minion|Crawler|Vehicle)\s*[;,]\s*(.*)$")
SIZE_RE = re.compile(r"(Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal|Titanic)\s*\((\d+)\)", re.I)
ATTACK_RE = re.compile(r"^(?P<name>[^:]{1,60}):\s*(?P<rest>.*\bto hit\b.*)$")
STATS = ["str", "int", "con", "dex", "cha"]


def junk(line, h, book=""):
    f, s, y = line["font"], line["size"], line["y"]
    if book in OWN_SECTIONS and f.startswith("CCSmash") and s >= 19:
        return False  # the Toolkit's "NEIGHBORHOOD: BOGBRICKS" titles
    if f.startswith(("Arial", "CCSmash", "Potato", "Helvetica")):
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
        label = p.get("label") or ""
        page = int(label) if label.isdigit() else p["pdf"] - PAGE_OFFSET.get(book, 1)
        lines = [l for l in p["lines"] if not junk(l, h, book)]
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
    while k < len(body) and len(svals) < len(slabels) and re.fullmatch(r"[\d,]+\s*\([+-−]?\d+\)?|—|-", body[k]["text"].strip()):
        svals.append(body[k]["text"].strip())
        k += 1
    m["stats"] = {}
    for key, v in zip(STATS, svals):
        mm = re.match(r"([\d,]+)\s*\(([+-−]?\d+)\)?", v)
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
            m["_at"] = s
            if book in OWN_SECTIONS:
                m["part"], m["section"] = own_sections(lines, s)
            found.append(parse_body(m))
            i = j
            continue
        i += 1
    attach_ai(found, ai_boxes(lines) + (inset_boxes(lines) if book in OWN_SECTIONS else []))
    for m in found:
        m.pop("_at", None)
    return found


FLOOR_PARTS = {"the first floor": "The First Floor (Tutorial)", "the second floor": "The Second Floor (Tutorial)",
               "threat appendix": "Threat Appendix (Floors 1–2)"}


def _title(t):
    small = {"of", "and", "the", "a", "an", "in", "on", "is"}
    words = re.sub(r"\s+", " ", t).strip().split(" ")
    cap = lambda w: re.sub(r"^([^\w]*)(\w)", lambda m: m.group(1) + m.group(2).upper(), w.lower())
    return " ".join(cap(w) if i == 0 or w.lower() not in small else w.lower() for i, w in enumerate(words))


def own_sections(lines, at):
    """(part, section) for a stat block in a book with no rules index: the latest Floor chapter,
    NEIGHBORHOOD:/QUEST: title, or Threat Appendix heading above line `at`."""
    part, section = "Game Master’s Toolkit", None
    k = 0
    while k <= at:
        l = lines[k]
        t = l["text"].strip()
        if l["font"].startswith("CitrusGothic") and l["size"] >= 24 and t.lower() in FLOOR_PARTS:
            part, section = FLOOR_PARTS[t.lower()], None
        elif l["font"].startswith("CitrusGothic") and l["size"] >= 19 and t.upper() == "ADVERSARIES":
            part, section = "Running the Game", "Stat block example"
        elif l["font"].startswith("CitrusGothic") and l["size"] >= 19 and part.startswith("Threat Appendix"):
            section = _title(t.lower())
        elif l["font"].startswith("CCSmash") and l["size"] >= 19 and re.match(r"^(NEIGHBORHOOD|QUEST)\s*:", t):
            # a title can wrap onto the next display line ("QUEST:" / "PASSIVE (AGGRESSIVE) PERCEPTION")
            while k + 1 <= at and lines[k + 1]["font"].startswith("CCSmash") and lines[k + 1]["size"] >= 19 \
                    and lines[k + 1]["page"] == l["page"]:
                k += 1
                t += " " + lines[k]["text"].strip()
            kind, _, name = t.partition(":")
            section = f"{kind.strip().title()}: {_title(name.strip().lower()).replace('™', '').strip()}"
        k += 1
    return part, section or part


AI_TITLE_RE = re.compile(r"^\s*(.+?)\.\s*Level\s+([\d,]+)\.?\s*$")


def _col_offset(l):
    return l["x"] - (58 if l["x"] < 300 else 315)


def _ai_title_line(l):
    """Box titles are bold body-size lines indented ~40pt into their column."""
    t = l["text"].strip()
    if not (9.5 <= l["size"] <= 10.6 and 25 <= _col_offset(l) <= 60):
        return False
    if l["font"].startswith("TextbookNew-Regular"):
        # Par for the Course sets its titles in regular weight: “Derrick Qu. Level 7.
        return bool(re.match(r"^\W*[\w’' ]+\.\s*Level\s+\d+\.?$", t))
    return (l["font"].startswith("TextbookNew-Bold")
            and not re.match(r"^(Notes?|Level|Surprise|Evade|Move|DR)\b", t) and " to hit" not in t)


def ai_boxes(lines):
    """The System AI's flavor boxes: an indented bold title ("Brain Boiler. Level 10.", or
    "Jack Screecher. Centurion Skyfowl." + "Level 25 Neighborhood Boss!"), then its text."""
    out = []
    i = 0
    while i < len(lines):
        l = lines[i]
        if not _ai_title_line(l):
            i += 1
            continue
        title = [l["text"].strip()]
        j = i + 1
        # a title wrapped onto following bold lines
        while j < len(lines) and lines[j]["font"].startswith("TextbookNew-Bold") and lines[j]["size"] <= 10.6 \
                and 0 < lines[j]["y"] - lines[j - 1]["y"] < 20 and not re.match(r"^Notes?:", lines[j]["text"].strip()):
            title.append(lines[j]["text"].strip())
            j += 1
        paras, cur, prev_y = [], [], None
        while j < len(lines):
            x = lines[j]
            xt = x["text"].strip()
            if xt == "AI":
                j += 1
                continue  # the "AI" badge
            if not x["font"].startswith("TextbookNew") or is_name(x) or x["size"] > 10.6 or x["size"] < 9 \
                    or _ai_title_line(x) or HEADER_RE.match(xt) or xt in ("Level", "Level Surprise Evade Move DR"):
                break
            if cur and (prev_y is None or x["y"] - prev_y > 15 or x["y"] < prev_y):
                paras.append(join(cur))
                cur = []
            cur.append(xt)
            prev_y = x["y"]
            j += 1
        if cur:
            paras.append(join(cur))
        t = join(title)
        lv = re.search(r"Level\s+([\d,]+)", t)
        names = [x.strip(" “”\"") for x in re.split(r"\.\s+|\(|\)", re.sub(r"\s*Level\s+[\d,]+.*$", "", t)) if x.strip(" .“”")]
        out.append({"at": i, "names": names or [t], "level": int(lv.group(1).replace(",", "")) if lv else None,
                    "title": t, "text": "\n".join(paras)})
        i = j
    return out


def inset_boxes(lines):
    """The Toolkit's AI boxes: a run of regular 10.5pt lines inset ~5pt into the column. The title is
    its first line(s) through "Level N" ("Gobblin’ Gator, Level 2", or "The Bar Render. Former Lawyer…"
    / "Level 8 Neighborhood Boss!")."""
    inset = lambda l: (l["font"].startswith("TextbookNew-Regular") and 10.3 <= l["size"] <= 10.7
                       and 2 <= _col_offset(l) <= 12)
    out, i = [], 0
    while i < len(lines):
        if not inset(lines[i]):
            i += 1
            continue
        j = i
        while j < len(lines) and inset(lines[j]) and (j == i or lines[j]["page"] == lines[j - 1]["page"]):
            j += 1
        run = lines[i:j]
        k = next((n for n, l in enumerate(run[:3]) if re.search(r"\bLevel\s+\d+", l["text"])), None)
        if k is not None:
            title_lines, body = run[:k + 1], run[k + 1:]
            t = join([l["text"].strip() for l in title_lines])
            paras, cur, prev_y = [], [], None
            for x in body:
                if cur and (x["y"] - prev_y > 15 or x["y"] < prev_y):
                    paras.append(join(cur))
                    cur = []
                cur.append(x["text"].strip())
                prev_y = x["y"]
            if cur:
                paras.append(join(cur))
            lv = re.search(r"Level\s+([\d,]+)", t)
            head = re.sub(r"[.,]?\s*Level\s+[\d,]+.*$", "", t)
            names = [x.strip(" “”\"") for x in re.split(r"[.,—]\s*|\(|\)", head) if x.strip(" .“”")]
            out.append({"at": i, "names": [head.strip(" .,")] + names if head.strip() else [t], "level": int(lv.group(1).replace(",", "")),
                        "title": t, "text": "\n".join(paras)})
        i = j
    return out


def _norm(s):
    s = re.sub(r"[^a-z ]", "", s.lower())
    return " ".join(w[:-1] if w.endswith("s") and len(w) > 3 else w for w in s.split())


def attach_ai(monsters, boxes):
    """Give each stat block the nearest AI box with its name (or its Level) close before it."""
    used = set()
    for m in monsters:
        best, best_score = None, 0.0
        for k, b in enumerate(boxes):
            if k in used:
                continue
            gap = m["_at"] - b["at"]
            if not (-80 < gap < 1200):
                continue  # boxes sit before their stat block, sometimes pages before a Boss
            names = [m["name"]] + ([m["character"]] if m.get("character") else [])
            sim = 0.0
            for bn in b["names"]:
                for n in names:
                    x, y = _norm(bn), _norm(n)
                    if not x or not y:
                        continue
                    r = difflib.SequenceMatcher(None, x, y).ratio()
                    if x in y or y in x:
                        r = max(r, 0.9)
                    sim = max(sim, r)
            level_ok = b["level"] is not None and str(b["level"]) == re.sub(r"\D", "", m["core"].get("level", ""))
            if b["level"] is not None and not level_ok and sim < 0.95:
                continue  # a different Level needs an exact name ("Rat" is not "Mordecai—Rat Hooligan. Level 50.")
            score = sim + (0.3 if level_ok else 0) - abs(gap) / 4000
            if (sim >= 0.6 or (level_ok and sim >= 0.35 and 0 <= gap < 150)) and score > best_score:
                best, best_score = k, score
        if best is None:
            # a box set right above its stat block, titled with a character name ("Steph. Cool Kid.")
            near = [k for k, b in enumerate(boxes) if k not in used and 0 <= m["_at"] - b["at"] < 40
                    and b["text"] and "." in b["title"]]
            best = near[-1] if near else None
        if best is not None:
            used.add(best)
            m["ai"] = {"title": boxes[best]["title"], "text": boxes[best]["text"]}


if __name__ == "__main__":
    allm = []
    for b in BOOKS:
        ms = extract(b)
        print(b, len(ms))
        allm += ms
    (RAW / "monsters.json").write_text(json.dumps(allm, indent=1, ensure_ascii=False))
