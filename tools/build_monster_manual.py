"""Lay out tools/raw/monsters.json as a printable Monster Manual and render it to PDF.

The manual reproduces the books' stat blocks, so it is for the GM's own table only:
the HTML stays in tools/raw/ and the PDF lands in the repo root, both gitignored.

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
OUT_HTML = RAW / "monster_manual.html"
OUT_PDF = ROOT.parent / "DCC_Monster_Manual.pdf"
RULES_DB = Path("/Users/judahan/Documents/Claude projects/dcc-rules/data/rules.db")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BOOK_TITLES = {"Core": "Core Rulebook", "Par": "Par for the Course"}
BOOK_ORDER = ["Core", "Survival", "Crawlers", "Par"]
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


def block_html(m, also):
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
  {f'<div class="who">{e(m["character"])}</div>' if m.get("character") else ""}
  <div class="sub">{e(sub)}</div>
  {health_html(m["health"])}
  <div class="grid core">{cells}</div>
  <div class="grid stats">{stats}</div>
  <div class="atks">{"".join(attack_html(a) for a in m["attacks"])}</div>
  {notes_html(m["notes"])}
  <footer>{e(src)}{(" · " + e(loc)) if loc and boss else ""}</footer>
</article>'''


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def render(page):
    OUT_HTML.write_text(page)
    subprocess.run([CHROME, "--headless=new", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                    f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri()], check=True, capture_output=True)


def anchor_pages(page):
    """Page number of each #anchor, from the named destinations Chrome writes into the PDF.
    Needs PyMuPDF (run this script with the dcc-rules venv)."""
    import pymupdf
    names = pymupdf.open(OUT_PDF).resolve_names()
    missing = set(re.findall(r'<a href="#([^"]+)"', page)) - set(names)
    if missing:
        raise SystemExit(f"no page found for {sorted(missing)[:5]}")
    return {k: v["page"] + 1 for k, v in names.items()}


def build():
    ms = json.loads((RAW / "monsters.json").read_text())
    db = sqlite3.connect(RULES_DB)
    ms.sort(key=lambda m: (BOOK_ORDER.index(m["book"]), m["page"]))
    for m in ms:
        m["part"], m["section"] = locate(db, m)
        m["id"] = slug(f'{m["name"]}-{m["book"]}-{m["page"]}')

    # identical stat blocks printed twice (e.g. Par's quick reference) are kept once
    first, also, refs = {}, {}, []
    for m in ms:
        k = key(m)
        if k in first:
            f = first[k]
            also.setdefault(f["id"], []).append(m["page"])
            if m["section"] != f["section"]:
                refs.append((m, f))
            continue
        first[k] = m
    uniq = list(first.values())

    # Part 1: Mobs, NPCs and rival crawlers in book order; Part 2: Bosses
    parts = OrderedDict()
    for m in uniq:
        if not is_boss(m):
            parts.setdefault(m["part"], OrderedDict()).setdefault(m["section"], []).append(m)
    for m, f in refs:
        if not is_boss(m):
            parts.setdefault(m["part"], OrderedDict()).setdefault(m["section"], []).append({"ref": f, "name": m["name"]})
    boss_parts = OrderedDict()
    for m in uniq:
        if is_boss(m):
            boss_parts.setdefault(m["part"], []).append(m)

    body, toc = [], []
    n_mobs = sum(1 for m in uniq if not is_boss(m))
    n_boss = sum(1 for m in uniq if is_boss(m))

    toc.append('<li class="part"><a href="#part-mobs">Part One: Mobs, NPCs &amp; Crawlers<span class="pg">{pg:part-mobs}</span></a></li>')
    body.append('<section class="part-title" id="part-mobs"><div class="kicker">Part One</div><h1>Mobs, NPCs &amp; Crawlers</h1>'
                '<p>In the books’ order: Floor by Floor, then each Neighborhood and Quest as it appears. '
                'Entries within a section are alphabetical.</p></section>')
    for part, sections in parts.items():
        pid = slug("p-" + part)
        toc.append(f'<li class="floor"><a href="#{pid}">{e(part)}<span class="pg">{{pg:{pid}}}</span></a><ol>')
        body.append(f'<h2 class="floor" id="{pid}">{e(part)}</h2>')
        for sec, items in sections.items():
            sid = slug(f"s-{part}-{sec}")
            real = [x for x in items if "ref" not in x]
            toc.append(f'<li><a href="#{sid}">{e(sec)} <span class="n">({len(real)})</span><span class="pg">{{pg:{sid}}}</span></a></li>')
            items.sort(key=lambda x: x["name"].lower())
            cards = []
            for x in items:
                if "ref" in x:
                    f = x["ref"]
                    cards.append(f'<div class="xref"><b>{e(x["name"])}</b>: same stat block as '
                                 f'<a href="#{f["id"]}">{e(f["section"])}, page {{pg:{f["id"]}}}</a></div>')
                else:
                    cards.append(block_html(x, also.get(x["id"])))
            sec_label = "" if sec == part else f'<h3 class="sec" id="{sid}">{e(sec)}</h3>'
            if not sec_label:
                body.append(f'<a id="{sid}"></a>')
            body.append(f'{sec_label}<div class="cols">{"".join(cards)}</div>')
        toc.append("</ol></li>")

    toc.append('<li class="part"><a href="#part-bosses">Part Two: Bosses<span class="pg">{pg:part-bosses}</span></a><ol>')
    body.append('<section class="part-title boss" id="part-bosses"><div class="kicker">Part Two</div><h1>Bosses</h1>'
                '<p>Every Quest, Neighborhood, Borough and City Boss, Floor by Floor in the books’ order, '
                'alphabetical within each Floor.</p></section>')
    for part, bosses in boss_parts.items():
        pid = slug("b-" + part)
        toc.append(f'<li><a href="#{pid}">{e(part)} <span class="n">({len(bosses)})</span><span class="pg">{{pg:{pid}}}</span></a></li>')
        bosses.sort(key=lambda x: x["name"].lower())
        body.append(f'<h2 class="floor boss" id="{pid}">{e(part)}</h2><div class="cols">'
                    + "".join(block_html(b, also.get(b["id"])) for b in bosses) + "</div>")
    toc.append("</ol></li>")

    # A–Z index
    toc.append('<li class="part"><a href="#index">Index A–Z<span class="pg">{pg:index}</span></a></li>')
    idx = sorted(uniq, key=lambda m: m["name"].lower())
    letters = OrderedDict()
    for m in idx:
        letters.setdefault(m["name"][0].upper(), []).append(m)
    rows = []
    for L, group in letters.items():
        rows.append(f'<div class="letter">{e(L)}</div>')
        for m in group:
            where = m["section"] if m["section"] != m["part"] else m["part"]
            rows.append(f'<div class="ix{" b" if is_boss(m) else ""}"><a href="#{m["id"]}">{e(m["name"])}<span class="pg">{{pg:{m["id"]}}}</span></a>'
                        f'<span class="t">{e(m["tier"])}, Lvl {e(m["core"].get("level", "?"))}</span>'
                        f'<span class="w">{e(where)} · {e(BOOK_TITLES.get(m["book"], m["book"]))} p.{m["page"]}</span></div>')
    body.append(f'<section id="index"><h2 class="floor">Index A–Z</h2><div class="index">{"".join(rows)}</div></section>')

    page = TEMPLATE.format(
        css=CSS, toc="".join(toc), body="".join(body), n_mobs=n_mobs, n_boss=n_boss, n_all=len(uniq))
    # render once with "00" page numbers, read where each anchor landed, then render for real
    render(re.sub(r"\{pg:[^}]+\}", "00", page))
    pages = anchor_pages(page)
    render(re.sub(r"\{pg:([^}]+)\}", lambda mm: str(pages.get(mm.group(1), "")), page))
    print(f"{len(uniq)} stat blocks ({n_mobs} Mobs/NPCs/Crawlers, {n_boss} Bosses) → {OUT_PDF}")


CSS = """
@page { size: letter; margin: 0.55in 0.5in 0.6in;
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

.part-title { break-before: page; border-left: 6px solid var(--gold); padding: 10px 0 10px 14px; margin-bottom: 10px; }
.part-title.boss { border-color: var(--red); }
.part-title .kicker { letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); font-size: 9pt; }
.part-title h1 { font-size: 30pt; margin: 0; text-transform: uppercase; line-height: 1; }
.part-title p { margin: 4px 0 0; color: var(--muted); font-size: 9.5pt; }
h2.floor { font-size: 17pt; text-transform: uppercase; margin: 14px 0 4px; padding: 4px 10px; color: #fff; background: var(--ink); border-radius: 4px; break-after: avoid; }
h2.floor.boss { background: var(--red); }
#index { break-before: page; }
h3.sec { font-size: 12.5pt; margin: 10px 0 6px; padding-bottom: 2px; border-bottom: 2px solid var(--gold); text-transform: uppercase; break-after: avoid; }
.cols { columns: 2; column-gap: 0.22in; }

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
"""

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Crawler’s Monster Manual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=block" rel="stylesheet">
<style>{css}</style></head>
<body>
<section class="cover">
  <div class="kicker">Dungeon Crawler Carl RPG</div>
  <h1>Monster<span>Manual</span></h1>
  <div class="rule"></div>
  <p>Every Mob, NPC, rival crawler and Boss stat block from the Core Rulebook and <i>Par for the Course</i>, gathered in one place.</p>
  <div class="counts"><div><b>{n_mobs}</b>Mobs, NPCs &amp; Crawlers</div><div><b>{n_boss}</b>Bosses</div><div><b>{n_all}</b>Stat blocks</div></div>
  <div class="fine">A GM table reference compiled from your own books. Unofficial; not for distribution. Page numbers point to the source book.</div>
</section>
<section class="front">
  <h2>Contents</h2>
  <ol class="toc">{toc}</ol>
  <div class="key">
    <h3>Reading a stat block</h3>
    <ul>
      <li><b>Health Bar:</b> each box is one Health Bar slot and shows the Health it holds.</li>
      <li><b>+F:</b> add the current Floor number. <b>Surprise</b> is the Difficulty of crawler Stealth and Ambush Checks.</li>
      <li><b>DR:</b> subtract it from every instance of damage the creature takes.</li>
      <li><b>To hit</b> (in red) is the Difficulty of the crawler’s Evade Check. Italic lines under an attack are its extra effects; they add to the usual Major Fail (+Floor damage) and Critical Fail (double damage).</li>
    </ul>
    <div class="chips"><span class="tier" style="background:var(--gold)">Mob</span><span class="tier" style="background:var(--teal)">NPC · Crawler · Vehicle</span><span class="tier" style="background:var(--red)">Boss</span></div>
  </div>
</section>
{body}
</body></html>
"""

if __name__ == "__main__":
    build()
