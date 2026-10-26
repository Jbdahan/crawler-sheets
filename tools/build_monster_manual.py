"""Lay out tools/raw/monsters.json as a printable Monster Manual and render it to PDF.

Two editions: book order (Floor › Neighborhood/Quest) and by creature Level (Table 51 bands).
Each has three parts: Mobs, NPCs & Crawlers, and Bosses, and every card carries the System AI's
flavor box. It reproduces the books' text, so it is for the GM's own table only: the HTML stays
in tools/raw/ and the PDFs land in the repo root, all gitignored.

    python3 tools/extract_monsters.py
    ../dcc-rules/.venv/bin/python tools/build_monster_manual.py   # needs PyMuPDF for page numbers
"""
import html
import json
import re
import sqlite3
import subprocess
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
EDITIONS = {
    "book": (RAW / "monster_manual.html", ROOT.parent / "DCC_Monster_Manual.pdf"),
    "level": (RAW / "monster_manual_by_level.html", ROOT.parent / "DCC_Monster_Manual_by_Level.pdf"),
}
RULES_DB = Path("/Users/judahan/Documents/Claude projects/dcc-rules/data/rules.db")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BOOK_TITLES = {"Core": "Core Rulebook", "Par": "Par for the Course", "Toolkit": "GM’s Toolkit"}
BOOK_ORDER = ["Core", "Survival", "Crawlers", "Par", "Toolkit", "Tutorial"]
FLOOR_WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"]


def part_rank(part):
    """Where a part sits in the dungeon: the stat block examples first, then Floor by Floor
    (the Toolkit's Threat Appendix after the Second Floor), Par for the Course last."""
    if part == "Running the Game":
        return 0
    if part.startswith("Threat Appendix"):
        return 2.5
    mm = re.match(r"The (\w+) Floor", part)
    if mm and mm.group(1) in FLOOR_WORDS:
        return FLOOR_WORDS.index(mm.group(1)) + 1
    return 50


def book_sort(m):
    return (part_rank(m["part"]), BOOK_ORDER.index(m["book"]), m["page"])
BOSS_TIERS = ["Quest Boss", "Neighborhood Boss", "Borough Boss", "City Boss", "Province Boss",
              "Country Boss", "Floor Boss", "Boss"]
STATS = [("str", "Str"), ("int", "Int"), ("con", "Con"), ("dex", "Dex"), ("cha", "Cha")]

e = html.escape


def is_boss(m):
    return m["tier"] in BOSS_TIERS


def tidy(s):
    s = re.sub(r"\bNeighborhoo[dD]\b", "Neighborhood", s)
    s = re.sub(r"\bAnd\b", "and", s)
    return s.strip()


def locate(db, m):
    """(part, section) from the rules index heading path at this page, e.g.
    ("Third Floor: The Over City", "Neighborhood: Heavensworth")."""
    if m["book"] == "Par":
        return "Par for the Course", "Par for the Course"
    if m.get("part"):
        return m["part"], m["section"]  # books with no rules index carry their own headings
    row = db.execute("select heading_path from chunks where book=? and page_start<=? "
                     "order by page_start desc, id desc limit 1", (m["book"], m["page"])).fetchone()
    path = row[0].split(" › ")
    chapter = re.sub(r"^Chapter \d+:\s*", "", path[0])
    if "Running the Game" in chapter:
        return "Running the Game", "Stat block example"
    return tidy(chapter), tidy(path[1])


def key(m):
    return json.dumps([m["name"], m["health"], m["core"], m["stats"], [a["line"] for a in m["attacks"]]])


def health_html(slots):
    if not slots:
        return ""
    vals = [s for s in slots if isinstance(s, int)]
    total = sum(vals)
    same = len(set(vals)) == 1
    boxes = "".join(f"<i>{v}</i>" for v in slots)
    summary = f"{len(slots)} slots × {vals[0]} = {total}" if same else f"{len(slots)} slots, {total} total"
    return f'<div class="hb"><span class="lbl">Health Bar</span><span class="boxes">{boxes}</span><span class="tot">{summary}</span></div>'


def fmt_core(v):
    return e(v).replace("+F", "<small>+F</small>").replace("+S", "<small>+S</small>")


def notes_html(notes):
    if not notes:
        return ""
    # "Fanatical—City Elves are immune… Great Leaper—…" → one item per named note
    parts = re.split(r"(?:(?<=[.!?”)])|^)\s*(?=[A-Z“][\w’'“”!,&\- ]{1,40}—)", notes)
    items = []
    for p in (x.strip() for x in parts):
        if not p:
            continue
        m = re.match(r"^([A-Z“][\w’'“”!,&\- ]{1,40})—(.*)$", p)
        items.append(f"<li><b>{e(m.group(1))}.</b> {e(m.group(2))}</li>" if m else f"<li>{e(p)}</li>")
    return f'<div class="notes"><div class="h">Notes</div><ul>{"".join(items)}</ul></div>'


def attack_html(a):
    name, _, rest = a["line"].partition(":")
    rest = rest.strip()
    rest = re.sub(r"^(\d+(?:\+F)?|None) to hit", r"<b class='hit'>\1</b> to hit", e(rest)) if rest else ""
    eff = f'<div class="eff">{e(a["effect"])}</div>' if a["effect"] else ""
    return f'<div class="atk"><span class="an">{e(name)}:</span> {rest}{eff}</div>'


def ai_html(ai):
    if not ai or not (ai.get("text") or ai.get("title")):
        return ""
    paras = "".join(f"<p>{e(x)}</p>" for x in ai["text"].split("\n") if x.strip())
    return f'<div class="ai"><div class="ai-h"><span class="ai-badge">AI</span>{e(ai["title"].strip(" “”"))}</div>{paras}</div>'


def size_hint(m):
    """Rough length of a card's text, to keep short cards in one piece."""
    return len((m.get("ai") or {}).get("text", "")) + len(m["notes"]) + sum(len(a["line"]) + len(a["effect"]) for a in m["attacks"])


def block_html(m, also, show_loc=False):
    boss = is_boss(m)
    size = f'{m["size"]} ({m["sizeN"]})' if m["size"] else ""
    sub = " · ".join(x for x in [size, m["type"]] if x)
    core = m["core"]
    cells = "".join(f'<div><span>{lbl}</span><b>{fmt_core(core.get(k, "—"))}</b></div>'
                    for k, lbl in [("level", "Level"), ("surprise", "Surprise"), ("evade", "Evade"),
                                   ("move", "Move"), ("dr", "DR")])
    stats = "".join(
        f'<div><span>{lbl}</span><b>{m["stats"][k]["score"]}</b> <small>({m["stats"][k]["mod"]:+d})</small></div>'
        if k in m["stats"] else f"<div><span>{lbl}</span><b>—</b></div>" for k, lbl in STATS)
    src = f'{BOOK_TITLES.get(m["book"], m["book"])} p.{m["page"]}'
    if also:
        src += "; also " + ", ".join(f"p.{p}" for p in also)
    loc = m["section"] if m["section"] != m["part"] else ""
    tier_cls = "boss" if boss else ("npc" if m["tier"] in ("NPC", "Crawler", "Vehicle") else "mob")
    return f'''
<article class="sb {tier_cls}" id="{m["id"]}">
  <header><h3>{e(m["name"])}</h3><span class="tier">{e(m["tier"])}</span></header>
  <div class="body"><div class="c1">
  {f'<div class="who">{e(m["character"])}</div>' if m.get("character") else ""}
  <div class="sub">{e(sub)}</div>
  {ai_html(m.get("ai"))}
  {health_html(m["health"])}
  <div class="grid core">{cells}</div>
  <div class="grid stats">{stats}</div>
  </div><div class="c2">
  <div class="atks">{"".join(attack_html(a) for a in m["attacks"])}</div>
  {notes_html(m["notes"])}
  </div></div>
  <footer>{e(src)}{(" · " + e(loc)) if loc and (boss or show_loc) else ""}</footer>
</article>'''


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def render(page, out_html, out_pdf):
    out_html.write_text(page)
    subprocess.run([CHROME, "--headless=new", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                    f"--print-to-pdf={out_pdf}", out_html.as_uri()], check=True, capture_output=True)


def anchor_pages(page, out_pdf):
    """Page number of each #anchor, from the named destinations Chrome writes into the PDF.
    Needs PyMuPDF (run this script with the dcc-rules venv)."""
    import pymupdf
    names = pymupdf.open(out_pdf).resolve_names()
    missing = set(re.findall(r'<a href="#([^"]+)"', page)) - set(names)
    if missing:
        raise SystemExit(f"no page found for {sorted(missing)[:5]}")
    return {k: v["page"] + 1 for k, v in names.items()}


CATEGORIES = [
    ("mobs", "Mobs", "Every Mob, Elite and Vehicle."),
    ("npcs", "NPCs & Crawlers", "Named NPCs, shopkeepers and helpers, and the rival crawlers you can meet (or fight)."),
    ("bosses", "Bosses", "Every Quest, Neighborhood, Borough and City Boss."),
]
LEVEL_BANDS = [(1, 4, "Floor 1"), (5, 9, "Floor 2"), (10, 29, "Floors 3–4"), (30, 59, "Floors 5–7"),
               (60, 99, "Floors 8–10"), (100, 10 ** 6, "Floor 11+")]
NUMBERS = ["One", "Two", "Three", "Four"]


def category(m):
    if is_boss(m):
        return "bosses"
    return "npcs" if m["tier"] in ("NPC", "Crawler") else "mobs"


def level(m):
    return int(re.sub(r"\D", "", m["core"].get("level", "")) or 0)


def load():
    ms = json.loads((RAW / "monsters.json").read_text())
    db = sqlite3.connect(RULES_DB)
    for m in ms:
        m["part"], m["section"] = locate(db, m)
        m["id"] = slug(f'{m["name"]}-{m["book"]}-{m["page"]}')
    ms.sort(key=book_sort)

    # identical stat blocks printed twice (e.g. Par's quick reference) are kept once,
    # preferring the printing that has the AI's flavor box
    first, also, refs = {}, {}, []
    for m in ms:
        k = key(m)
        if k in first:
            f = first[k]
            if m.get("ai") and not f.get("ai"):
                m, f = f, m
                first[k] = f
                also[f["id"]] = also.pop(m["id"], [])
            also.setdefault(f["id"], []).append(m["page"])
            if m["section"] != f["section"]:
                refs.append((m, f))
            continue
        first[k] = m
    uniq = sorted(first.values(), key=book_sort)
    return uniq, also, refs


def build_edition(edition, uniq, also, refs):
    by_level = edition == "level"
    out_html, out_pdf = EDITIONS[edition]
    body, toc = [], []
    counts = {c: sum(1 for m in uniq if category(m) == c) for c, _, _ in CATEGORIES}

    for n, (cat, title, blurb) in enumerate(CATEGORIES):
        items = [m for m in uniq if category(m) == cat]
        cid = f"part-{cat}"
        order = ("Grouped by Level band (Table 51), lowest Level first." if by_level else
                 "In the books’ order: Floor by Floor, then each Neighborhood and Quest as it appears; "
                 "alphabetical within each section." if cat != "bosses" else
                 "Floor by Floor in the books’ order, alphabetical within each Floor.")
        toc.append(f'<li class="part"><a href="#{cid}">Part {NUMBERS[n]}: {e(title)} <span class="n">({len(items)})</span>'
                   f'<span class="pg">{{pg:{cid}}}</span></a><ol>')
        body.append(f'<section class="part-title{" boss" if cat == "bosses" else " npc" if cat == "npcs" else ""}" id="{cid}">'
                    f'<div class="kicker">Part {NUMBERS[n]}</div><h1>{e(title)}</h1><p>{e(blurb)} {e(order)}</p></section>')
        h2cls = "floor boss" if cat == "bosses" else "floor npc" if cat == "npcs" else "floor"

        if by_level:
            for lo, hi, floors in LEVEL_BANDS:
                band = sorted((m for m in items if lo <= level(m) <= hi), key=lambda m: (level(m), m["name"].lower()))
                if not band:
                    continue
                bid = slug(f"{cat}-lvl-{lo}")
                label = f"Level {lo}–{hi}" if hi < 10 ** 6 else f"Level {lo}+"
                toc.append(f'<li><a href="#{bid}">{label} <span class="n">({len(band)}, {floors})</span>'
                           f'<span class="pg">{{pg:{bid}}}</span></a></li>')
                body.append(f'<h2 class="{h2cls}" id="{bid}">{label} <small>Table 51: {floors}</small></h2>'
                            + "".join(block_html(m, also.get(m["id"]), show_loc=True) for m in band))
            toc.append("</ol></li>")
            continue

        parts = OrderedDict()
        for m in items:
            parts.setdefault(m["part"], OrderedDict()).setdefault(m["section"] if cat != "bosses" else m["part"], []).append(m)
        if cat != "bosses":
            for m, f in refs:
                if category(m) == cat:
                    parts.setdefault(m["part"], OrderedDict()).setdefault(m["section"], []).append({"ref": f, "name": m["name"]})
        for part, sections in parts.items():
            pid = slug(f"{cat}-{part}")
            real_n = sum(1 for xs in sections.values() for x in xs if "ref" not in x)
            toc.append(f'<li class="floor"><a href="#{pid}">{e(part)} <span class="n">({real_n})</span><span class="pg">{{pg:{pid}}}</span></a>')
            body.append(f'<h2 class="{h2cls}" id="{pid}">{e(part)}</h2>')
            sub = []
            for sec, xs in sections.items():
                sid = slug(f"{cat}-{part}-{sec}")
                xs.sort(key=lambda x: x["name"].lower())
                cards = []
                for x in xs:
                    if "ref" in x:
                        f = x["ref"]
                        cards.append(f'<div class="xref"><b>{e(x["name"])}</b>: same stat block as '
                                     f'<a href="#{f["id"]}">{e(f["section"])}, page {{pg:{f["id"]}}}</a></div>')
                    else:
                        cards.append(block_html(x, also.get(x["id"])))
                if sec != part:
                    real = [x for x in xs if "ref" not in x]
                    sub.append(f'<li><a href="#{sid}">{e(sec)} <span class="n">({len(real)})</span><span class="pg">{{pg:{sid}}}</span></a></li>')
                    body.append(f'<h3 class="sec" id="{sid}">{e(sec)}</h3>')
                body.append("".join(cards))
            toc.append(f"<ol>{''.join(sub)}</ol></li>" if sub else "</li>")
        toc.append("</ol></li>")

    # A–Z index
    toc.append('<li class="part"><a href="#index">Index A–Z<span class="pg">{pg:index}</span></a></li>')
    letters = OrderedDict()
    for m in sorted(uniq, key=lambda m: m["name"].lower()):
        letters.setdefault(m["name"][0].upper(), []).append(m)
    rows = []
    for L, group in letters.items():
        rows.append(f'<div class="letter">{e(L)}</div>')
        for m in group:
            where = m["section"] if m["section"] != m["part"] else m["part"]
            rows.append(f'<div class="ix{" b" if is_boss(m) else " n" if category(m) == "npcs" else ""}"><a href="#{m["id"]}">{e(m["name"])}'
                        f'<span class="pg">{{pg:{m["id"]}}}</span></a>'
                        f'<span class="t">{e(m["tier"])}, Lvl {e(m["core"].get("level", "?"))}</span>'
                        f'<span class="w">{e(where)} · {e(BOOK_TITLES.get(m["book"], m["book"]))} p.{m["page"]}</span></div>')
    body = [f'<div id="flow">{"".join(body)}</div>']
    body.append(f'<section id="index"><h2 class="floor">Index A–Z</h2><div class="index">{"".join(rows)}</div></section>')

    page = TEMPLATE.format(
        css=CSS, script=PAGINATE, toc="".join(toc), body="".join(body), edition="By Level" if by_level else "Book order",
        n_mobs=counts["mobs"], n_npcs=counts["npcs"], n_boss=counts["bosses"], n_all=len(uniq))
    # render once with "00" page numbers, read where each anchor landed, then render for real
    render(re.sub(r"\{pg:[^}]+\}", "00", page), out_html, out_pdf)
    pages = anchor_pages(page, out_pdf)
    render(re.sub(r"\{pg:([^}]+)\}", lambda mm: str(pages.get(mm.group(1), "")), page), out_html, out_pdf)
    print(f"{edition}: {len(uniq)} stat blocks ({counts['mobs']} Mobs, {counts['npcs']} NPCs & Crawlers, "
          f"{counts['bosses']} Bosses) → {out_pdf}")


def build():
    uniq, also, refs = load()
    for edition in EDITIONS:
        build_edition(edition, uniq, also, refs)


CSS = """
@page { size: letter; margin: 0.42in 0.45in 0.5in;
  @bottom-center { content: counter(page); font: 700 9pt 'Oswald', sans-serif; color: #8a7a55; } }
@page :first { @bottom-center { content: none; } }
:root { --ink: #1d1a16; --muted: #6b6356; --gold: #c99a2e; --gold-soft: #f6ecd2; --red: #a3262a; --red-soft: #f7e1df;
  --teal: #2f6f6a; --teal-soft: #e0efed; --line: #d9cfbd; --paper: #fffdf8; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 8.6pt/1.32 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif; color: var(--ink); background: #fff; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, .kicker, .tier, .grid span, .hb .lbl, .notes .h, .letter { font-family: 'Oswald', 'Arial Narrow', sans-serif; }

.cover { height: 9.8in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
  background: radial-gradient(circle at 50% 38%, #3a2f1c 0, #15120d 62%); color: #f3e6c4; border-radius: 6px; padding: 0.6in; break-after: page; }
.cover .kicker { letter-spacing: 0.35em; font-size: 11pt; color: var(--gold); }
.cover h1 { font-size: 56pt; line-height: 0.95; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.02em; color: #fff3d6; }
.cover h1 span { display: block; font-size: 30pt; color: var(--gold); letter-spacing: 0.12em; }
.cover .edition { font: 600 12pt 'Oswald', sans-serif; letter-spacing: 0.3em; text-transform: uppercase; color: #d8c9a5; margin-top: 4px; }
.cover .rule { width: 2.4in; height: 3px; background: var(--gold); margin: 22px auto; }
.cover p { font-size: 11pt; max-width: 5in; color: #d8c9a5; margin: 4px 0; }
.cover .counts { display: flex; gap: 28px; margin-top: 26px; }
.cover .counts div { font-family: 'Oswald', sans-serif; font-size: 10pt; letter-spacing: 0.12em; text-transform: uppercase; color: #bfae86; }
.cover .counts b { display: block; font-size: 30pt; color: #fff3d6; letter-spacing: 0; }
.cover .fine { margin-top: auto; font-size: 8pt; color: #8f8166; }

.front { break-after: page; }
.front h2 { font-size: 20pt; text-transform: uppercase; margin: 0 0 8px; letter-spacing: 0.04em; }
.toc { columns: 2; column-gap: 0.35in; padding: 0; margin: 0 0 18px; list-style: none; font-size: 9.2pt; }
.toc li { break-inside: avoid; }
.toc .part > a { display: block; font: 600 11pt 'Oswald', sans-serif; text-transform: uppercase; border-bottom: 2px solid var(--gold); margin: 8px 0 4px; }
.toc .floor > a { font-weight: 700; display: block; margin-top: 6px; }
.toc ol { list-style: none; padding-left: 10px; margin: 2px 0 6px; }
.toc .n { color: var(--muted); font-size: 8pt; }
.toc a { display: flex; gap: 4px; }
.toc a .pg, .ix a .pg { margin-left: auto; padding-left: 6px; font-weight: 700; color: var(--ink); }
.toc .part > a .pg { color: var(--ink); }
.ix a { display: flex; }
.key { border: 1.5px solid var(--line); border-radius: 6px; padding: 10px 12px; background: var(--paper); font-size: 8.6pt; }
.key h3 { margin: 0 0 4px; font-size: 11pt; text-transform: uppercase; }
.key ul { margin: 4px 0 0; padding-left: 16px; }
.key .chips { display: flex; gap: 8px; margin-top: 6px; }

.part-title { border-left: 6px solid var(--gold); padding: 10px 0 10px 14px; margin-bottom: 10px; }
.part-title.boss { border-color: var(--red); }
.part-title .kicker { letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); font-size: 9pt; }
.part-title h1 { font-size: 30pt; margin: 0; text-transform: uppercase; line-height: 1; }
.part-title p { margin: 4px 0 0; color: var(--muted); font-size: 9.5pt; }
h2.floor { font-size: 16pt; text-transform: uppercase; margin: 0 0 6px; padding: 4px 10px; color: #fff; background: var(--ink); border-radius: 4px; break-after: avoid; }
h2.floor.boss { background: var(--red); }
#index { break-before: page; }
h3.sec { font-size: 12pt; margin: 4px 0 6px; padding-bottom: 2px; border-bottom: 2px solid var(--gold); text-transform: uppercase; break-after: avoid; }
:root { --colw: 3.7in; --gap: 0.2in; }

.sb { break-inside: avoid; border: 1.5px solid var(--line); border-radius: 6px; margin: 0 0 0.16in; background: var(--paper); overflow: hidden; }
.sb header { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; padding: 5px 8px 3px; background: var(--gold-soft); border-bottom: 1.5px solid var(--gold); }
.sb.boss { border-color: #d7a9a6; }
.sb.boss header { background: var(--red-soft); border-color: var(--red); }
.sb.npc header { background: var(--teal-soft); border-color: var(--teal); }
.sb h3 { margin: 0; font-size: 12pt; line-height: 1.1; text-transform: uppercase; letter-spacing: 0.01em; }
.tier { font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 99px; background: var(--gold); color: #fff; white-space: nowrap; }
.boss .tier { background: var(--red); }
.npc .tier { background: var(--teal); }
.who { padding: 3px 8px 0; font: 600 8.4pt 'Oswald', sans-serif; letter-spacing: 0.04em; color: var(--teal); text-transform: uppercase; }
.sub { padding: 3px 8px 0; font-style: italic; color: var(--muted); }
.hb { display: flex; align-items: center; gap: 6px; padding: 4px 8px 0; flex-wrap: wrap; }
.hb .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.hb .boxes { display: flex; flex-wrap: wrap; gap: 1.5px; }
.hb .boxes i { font-style: normal; display: inline-block; min-width: 13px; height: 13px; line-height: 12px; text-align: center; font-size: 7pt; font-weight: 700;
  border: 1px solid #b9ab8f; border-radius: 2px; background: #fff; }
.boss .hb .boxes i { border-color: #c98e8a; }
.hb .tot { font-size: 7.4pt; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(5, 1fr); margin: 5px 8px 0; border: 1px solid var(--line); border-radius: 4px; background: #fff; }
.grid > div { text-align: center; padding: 2px 0 3px; }
.grid > div + div { border-left: 1px solid var(--line); }
.grid span { display: block; font-size: 6.8pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.grid b { font-size: 10pt; }
.grid small { font-size: 7.4pt; color: var(--muted); font-weight: 600; }
.atks { padding: 5px 8px 0; }
.atk { margin-bottom: 4px; }
.atk .an { font-weight: 700; }
.atk .hit { color: var(--red); }
.atk .eff { font-style: italic; color: #4a443b; padding-left: 9px; border-left: 2px solid var(--line); margin-top: 1px; }
.notes { margin: 2px 8px 0; padding: 4px 7px; background: #f4efe4; border-radius: 4px; }
.notes .h { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.notes ul { margin: 0; padding: 0; list-style: none; }
.notes li + li { margin-top: 2px; }
.ai { margin: 5px 8px 0; padding: 5px 8px 5px 9px; border-left: 3px solid #3c7fd1; background: #eef4fb; border-radius: 0 4px 4px 0; font-size: 7.9pt; line-height: 1.3; color: #26323f; }
.ai-h { font-weight: 700; margin-bottom: 2px; display: flex; align-items: center; gap: 5px; }
.ai-badge { font: 700 6.6pt 'Oswald', sans-serif; letter-spacing: 0.08em; color: #fff; background: #3c7fd1; border-radius: 3px; padding: 0 4px; }
.ai p { margin: 0; break-inside: avoid; }
/* Pages are packed by the script in the template: whole cards, two columns, nothing split */
#flow { width: 7.6in; }
#flow > .sb, #flow > .xref { width: var(--colw); }
.pg-page { break-after: page; }
.pg-page:last-child { break-after: auto; }
.pg-region { display: flex; gap: var(--gap); align-items: flex-start; }
.pg-col { width: var(--colw); }
.sb.wide { width: 100%; }
.sb.wide .body { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.18in; }
.sb.wide .c2 { padding-top: 5px; }
.ai p + p { margin-top: 3px; }
.part-title.npc { border-color: var(--teal); }
h2.floor.npc { background: var(--teal); }
h2.floor small { font-size: 10pt; font-weight: 500; opacity: 0.8; margin-left: 6px; text-transform: none; }
.ix.n a { color: var(--teal); }
.sb footer { padding: 4px 8px 4px; margin-top: 5px; font-size: 7pt; color: var(--muted); border-top: 1px dashed var(--line); }
.xref { break-inside: avoid; margin: 0 0 0.16in; padding: 6px 8px; border: 1.5px dashed var(--line); border-radius: 6px; color: var(--muted); }
.xref b { color: var(--ink); }
.xref a { text-decoration: underline; }

.index { columns: 3; column-gap: 0.22in; font-size: 8pt; }
.letter { font-size: 13pt; font-weight: 700; color: var(--gold); border-bottom: 1.5px solid var(--gold); margin: 6px 0 2px; break-after: avoid; }
.ix { break-inside: avoid; padding: 1px 0 2px; border-bottom: 1px dotted var(--line); }
.ix a { font-weight: 700; display: block; }
.ix.b a { color: var(--red); }
.ix .t, .ix .w { display: block; color: var(--muted); font-size: 7.2pt; line-height: 1.2; }
/* compact cards: denser type so more whole cards fit per page */
body { font-size: 8pt; line-height: 1.25; }
.sb { margin-bottom: 0.11in; }
.sb header { padding: 3px 7px 2px; }
.sb h3 { font-size: 11pt; }
.sub, .who { padding: 2px 7px 0; }
.ai { margin: 3px 7px 0; padding: 3px 6px 3px 7px; font-size: 7.2pt; line-height: 1.22; }
.ai p + p { margin-top: 2px; }
.hb { padding: 3px 7px 0; }
.hb .boxes i { min-width: 12px; height: 12px; line-height: 11px; font-size: 6.6pt; }
.grid { margin: 3px 7px 0; }
.grid > div { padding: 1px 0 2px; }
.grid span { font-size: 6.2pt; }
.grid b { font-size: 9pt; }
.atks { padding: 3px 7px 0; }
.atk { margin-bottom: 2px; }
.notes { margin: 1px 7px 0; padding: 3px 6px; }
.sb footer { padding: 2px 7px; margin-top: 3px; font-size: 6.5pt; }
"""

# Lay #flow out as whole pages before printing: measure every card at column width, then fill
# two columns page by page (each card in the shorter column), so no card is ever split.
# Headings start a new band across both columns and stay with their first card; Part titles
# start a page; a card taller than a column goes full width with its halves side by side.
PAGINATE = """
(async () => {
  await document.fonts.ready
  const flow = document.getElementById('flow')
  const px = (v) => v * 96
  const LIMIT = px(11 - 0.42 - 0.5) - 6           // printable height of a Letter page (see @page), minus slack
  const outer = (el) => el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop) + parseFloat(getComputedStyle(el).marginBottom)
  const items = [...flow.children]
  for (const el of items) {
    if (el.classList.contains('sb') && outer(el) > LIMIT - px(0.6)) el.classList.add('wide')
    el.dataset.h = outer(el)
  }
  const pages = []
  let page, region, cols, used, colH
  const newPage = () => {
    page = document.createElement('div'); page.className = 'pg-page'; pages.push(page)
    used = 0; region = null
  }
  const newRegion = () => {
    if (region) used += Math.max(...colH)
    region = document.createElement('div'); region.className = 'pg-region'
    cols = [0, 1].map(() => { const c = document.createElement('div'); c.className = 'pg-col'; region.appendChild(c); return c })
    colH = [0, 0]
    page.appendChild(region)
  }
  const closeRegion = () => { if (region) { used += Math.max(...colH); region = null } }
  newPage()
  for (let i = 0; i < items.length; i++) {
    const el = items[i], h = +el.dataset.h
    const card = el.classList.contains('sb') || el.classList.contains('xref')
    if (el.classList.contains('part-title')) {
      closeRegion()
      if (used > 0 || page.children.length) newPage()
      page.appendChild(el); used += h
      continue
    }
    if (!card || el.classList.contains('wide')) {
      closeRegion()
      // keep a heading with the card after it
      let need = h
      if (!card) { const next = items[i + 1]; if (next && (next.classList.contains('sb') || next.classList.contains('xref'))) need += +next.dataset.h }
      if (used + need > LIMIT && used > 0) newPage()
      page.appendChild(el); used += h
      continue
    }
    if (!region) newRegion()
    let c = colH[0] <= colH[1] ? 0 : 1
    if (used + colH[c] + h > LIMIT) c = 1 - c
    if (used + colH[c] + h > LIMIT) { newPage(); newRegion(); c = 0 }
    cols[c].appendChild(el); colH[c] += h
  }
  flow.replaceChildren(...pages)
  document.body.dataset.paginated = '1'
})()
"""

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Crawler’s Monster Manual ({edition})</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=block" rel="stylesheet">
<style>{css}</style></head>
<body>
<section class="cover">
  <div class="kicker">Dungeon Crawler Carl RPG</div>
  <h1>Monster<span>Manual</span></h1>
  <div class="edition">{edition} edition</div>
  <div class="rule"></div>
  <p>Every Mob, NPC, rival crawler and Boss stat block from the Core Rulebook, the Game Master’s Toolkit and <i>Par for the Course</i>, gathered in one place.</p>
  <div class="counts"><div><b>{n_mobs}</b>Mobs</div><div><b>{n_npcs}</b>NPCs &amp; Crawlers</div><div><b>{n_boss}</b>Bosses</div></div>
  <div class="fine">A GM table reference compiled from your own books. Unofficial; not for distribution. Page numbers point to the source book.</div>
</section>
<section class="front">
  <h2>Contents</h2>
  <ol class="toc">{toc}</ol>
  <div class="key">
    <h3>Reading a stat block</h3>
    <ul>
      <li><b>AI box</b> (blue): the System AI’s announcement of the creature, as printed in the book.</li>
      <li><b>Health Bar:</b> each box is one Health Bar slot and shows the Health it holds.</li>
      <li><b>+F:</b> add the current Floor number. <b>Surprise</b> is the Difficulty of crawler Stealth and Ambush Checks.</li>
      <li><b>DR:</b> subtract it from every instance of damage the creature takes.</li>
      <li><b>To hit</b> (in red) is the Difficulty of the crawler’s Evade Check. Italic lines under an attack are its extra effects; they add to the usual Major Fail (+Floor damage) and Critical Fail (double damage).</li>
    </ul>
    <div class="chips"><span class="tier" style="background:var(--gold)">Mob</span><span class="tier" style="background:var(--teal)">NPC · Crawler · Vehicle</span><span class="tier" style="background:var(--red)">Boss</span></div>
  </div>
</section>
{body}
<script>{script}</script>
</body></html>
"""

if __name__ == "__main__":
    build()
