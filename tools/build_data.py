"""Build the app's rules data (src/data/*.json) from tools/raw/*.json.

Only mechanics go into the app: names, stats, dice, ranges, costs, upgrade effects,
race/class bonus bullets, and page references. Flavour text and full descriptions
stay in tools/raw (gitignored). One-line summaries come from tools/summaries.py.

    python3 tools/build_data.py
"""
import json
import re
from pathlib import Path

from summaries import EFFECTS, SUMMARIES
from overrides import OVERRIDES

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "src" / "data"

STATS = {"strength": "str", "intelligence": "int", "constitution": "con", "dexterity": "dex",
         "charisma": "cha", "str": "str", "int": "int", "con": "con", "dex": "dex", "cha": "cha"}
DAMAGE_TYPES = ["Acid", "Bludgeoning", "Electric", "Fire", "Force", "Holy", "Ice", "Necrotic",
                "Piercing", "Poison", "Psychic", "Slashing", "Sonic"]
SMALL = {"of", "and", "the", "on", "in", "a", "an", "to", "for", "your", "or"}
problems = []


def raw(name):
    return json.loads((RAW / f"{name}.json").read_text())


def title(name):
    words = name.strip().lower().split()
    out = []
    for i, w in enumerate(words):
        if i and w in SMALL and w != "your":
            out.append(w)
        else:
            out.append(re.sub(r"^([(“\"']?)(\w)", lambda m: m.group(1) + m.group(2).upper(), w))
    s = " ".join(out)
    return s.replace("’S", "’s").replace("'S", "'s")


def slug(name):
    s = name.lower().replace("’", "").replace("'", "")
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean_upgrade(text):
    # stray text from page furniture sometimes trails an upgrade
    return re.sub(r"\s+", " ", text).strip()


def parse_damage(text):
    if not text:
        return None
    m = re.match(r"^(\d+)d(\d+)\s*(?:\+\s*(Str|Dex|Int|Con|Cha)(?![a-z]))?\s*(.*)$", text.strip())
    if not m:
        problems.append(f"damage unparsed: {text!r}")
        return None
    count, sides, stat, rest = m.groups()
    types = [t for t in DAMAGE_TYPES if re.search(rf"\b{t}\b", rest.split(",")[0])]
    area = rest.split(",", 1)[1].strip() if "," in rest else ""
    if not types:
        # "StrSlashing" glued together
        types = [t for t in DAMAGE_TYPES if rest.startswith(t)]
    return {"count": int(count), "sides": int(sides), "stat": stat.lower() if stat else None,
            "types": types, "area": area}


def parse_upgrade(text):
    up = {"text": clean_upgrade(text)}
    m = re.match(r"^\+(\d+)d(\d+)\b(?: base damage)?", up["text"])
    if m:
        up["dice"] = {"count": int(m.group(1)), "sides": int(m.group(2))}
    if re.search(r"add (?:1|one) Rank damage die", up["text"], re.I):
        up["rankDie"] = True
    m = re.search(r"\+(\d+) Evade Buff", up["text"])
    if m:
        up["evade"] = int(m.group(1))
    m = re.match(r"^\+(\d+) DR\b", up["text"])
    if m:
        up["dr"] = int(m.group(1))
    m = re.search(r"\+(\d+)ft Move\b", up["text"])
    if m:
        up["move"] = int(m.group(1))
    return up


def first_sentences(text, limit=180):
    """Keep mechanical fields short; the full text is in the book."""
    if not text or len(text) <= limit:
        return text
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = parts[0]
    return out if len(out) <= limit + 60 else out[:limit].rsplit(" ", 1)[0] + "…"


def check_type(entry, passive, is_attack):
    if passive:
        return "Passive"
    if is_attack:
        return "Evade"
    body = " ".join(entry["text"])
    kinds = []
    if re.search(r"\bUnopposed\b", body):
        kinds.append("Unopposed")
    if re.search(r"(?<!Un)Opposed\b", body):
        kinds.append("Opposed")
    return "/".join(kinds) if kinds else "Varies"


def skill_record(e, category):
    name = title(e["name"])
    kw = e["kw"]
    kws = [k.strip() for k in re.split(r",\s*", kw) if k.strip()]
    passive = any(k.lower().startswith("passive") for k in kws)
    attack_type = None
    stat = None
    favored = []
    dmg_types = []
    is_attack = False
    effect_of = None
    for k in kws:
        kl = k.lower()
        m = re.match(r"(melee|ranged) attack", kl)
        if m:
            attack_type = m.group(1)
            is_attack = True
            continue
        if kl == "attack":
            is_attack = True
            continue
        if kl in STATS:
            stat = STATS[kl]
            continue
        if kl.startswith("favored"):
            favored.append(k.split(":", 1)[1].strip() if ":" in k else "")
            continue
        m = re.match(r"(.+) damage effect", kl)
        if m:
            effect_of = title(m.group(1))
            continue
        if k in DAMAGE_TYPES:
            dmg_types.append(k)
    # "Favored: Cleric" can wrap onto the next line and lose its comma
    favored = [f for f in favored if f]
    if not favored:
        m = re.search(r"Favored:\s*([A-Za-z ,]+)", kw)
        if m:
            favored = [x.strip() for x in m.group(1).split(",") if x.strip()]
    kind = category
    if category == "attack" and effect_of:
        kind = "damageEffect"
    if category == "spell" and stat is None and is_attack:
        stat = "int"
    f = e["fields"]
    damage = parse_damage(f.get("Base Damage"))
    rec = {
        "id": slug(name),
        "name": name,
        "kind": kind,
        "group": title(e["section"]) if e.get("section") and category == "attack" else None,
        "page": e["page"],
        "keywords": kws,
        "stat": stat,
        "passive": passive,
        "attack": is_attack,
        "attackType": attack_type or ("ranged" if is_attack and category == "spell" and f.get("Range") and "melee" not in f.get("Range", "").lower() else ("melee" if is_attack else None)),
        "checkType": check_type(e, passive, is_attack),
        "range": f.get("Range"),
        "aiFavor": f.get("AI Favor"),
        "limitations": first_sentences(f.get("Limitations")),
        "cooldown": f.get("Cooldown"),
        "duration": first_sentences(f.get("Duration")),
        "mana": int(re.match(r"\d+", f["Mana Cost"]).group()) if f.get("Mana Cost") and re.match(r"\d+", f["Mana Cost"]) else None,
        "manaText": f.get("Mana Cost"),
        "damage": damage,
        "damageEffectOf": effect_of,
        "favored": favored,
        "upgrades": {k: parse_upgrade(v) for k, v in sorted(e["upgrades"].items(), key=lambda kv: int(kv[0]))},
    }
    if damage and not damage["types"] and dmg_types:
        damage["types"] = dmg_types
    if is_attack and not damage and kind != "damageEffect" and category != "utility":
        problems.append(f"attack without damage: {name} p{e['page']}")
    return {k: v for k, v in rec.items() if v not in (None, [], {}, "")} | {"passive": passive, "attack": is_attack}


STAT_WORDS = r"(Strength|Intelligence|Constitution|Dexterity|Charisma)"


def split_list(s):
    s = re.sub(r"\s*\(.*?\)", "", s)
    parts = re.split(r",\s*and\s+|,\s*or\s+|,\s*|\s+and\s+|\s+or\s+", s)
    return [p.strip() for p in parts if p.strip()]


ALIASES = {"intimidation": "Intimidate", "smite": "Paladin’s Smite", "heal other": "Heal Others"}
PROTECTED = ["Rise, Dead Minion!"]
COUNT_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "either": 1}


def canon(name):
    return ALIASES.get(name.lower(), name)


def split_names(s):
    keep = {}
    for i, n in enumerate(PROTECTED):
        if n in s:
            s = s.replace(n, f"@{i}@")
            keep[f"@{i}@"] = n
    return [keep.get(x, canon(x)) for x in split_list(s)]


def parse_bullets(bullets):
    out = {"stats": {}, "skills": [], "choices": [], "dr": 0, "rank20": [], "benefits": [],
           "size": None, "earthBox": False, "allStats": 0, "statSplit": None}
    for b in bullets:
        t = b.lstrip("•").strip().replace("−", "-").replace("–", "-")
        if not t:
            continue
        if t.startswith("Size:"):
            out["size"] = t.split(":", 1)[1].strip()
            continue
        if "Silver Earth Box" in t:
            out["earthBox"] = True
            continue
        m = re.match(r"^([+-]\d+) (?:to )?all Stats$", t)
        if m:
            out["allStats"] = int(m.group(1))
            continue
        m = re.match(rf"^\+(\d+) to split as you please between (.+)$", t)
        if m:
            out["statSplit"] = {"points": int(m.group(1)),
                                "among": [STATS[w.lower()] for w in split_list(m.group(2))]}
            continue
        m = re.match(rf"^([+-]\d+) (?:to )?({STAT_WORDS}(?:(?:,\s*and\s+|,\s*|\s+and\s+){STAT_WORDS})*)$", t)
        if m:
            for w in split_list(m.group(2)):
                out["stats"][STATS[w.lower()]] = out["stats"].get(STATS[w.lower()], 0) + int(m.group(1))
            continue
        m = re.match(r"^\+(\d+) DR(?: Buff)?$", t)
        if m:
            out["dr"] += int(m.group(1))
            continue
        m = re.match(r"^\+(\d+) to your choice of (one|two|three|four) of the following (?:Skills|Spells): (.+?)(?: Skills| Spells)?$", t, re.I)
        if m:
            out["choices"].append({"ranks": int(m.group(1)), "count": COUNT_WORDS[m.group(2).lower()],
                                   "options": split_names(m.group(3)), "text": t})
            continue
        m = re.match(r"^\+(\d+) in either (.+?) or (.+?) Skills?$", t)
        if m:
            out["choices"].append({"ranks": int(m.group(1)), "count": 1,
                                   "options": [canon(m.group(2)), canon(m.group(3))], "text": t})
            continue
        m = re.match(r"^\+(\d+) in all (.+)$", t)
        if m:
            out["choices"].append({"ranks": int(m.group(1)), "count": 0, "group": m.group(2), "text": t})
            continue
        m = re.match(r"^\+(\d+) in (a|an|one|two) (.+)$", t)
        if m:
            rest = m.group(3)
            n = COUNT_WORDS[m.group(2)]
            if re.search(r"\band one\b", rest):
                n = 2
            out["choices"].append({"ranks": int(m.group(1)), "count": n,
                                   "kind": "spell" if "Spell" in rest else "skill", "text": t})
            continue
        m = re.match(r"^\+(\d+) (?:in )?(.+?) (Skills?|Spells?)(?:[,;] (.*))?$", t)
        if m and not re.search(r"your choice|of choice|-based|\ball\b", m.group(2), re.I):
            kind = "spell" if m.group(3).startswith("Spell") else "skill"
            for nm in split_names(m.group(2)):
                out["skills"].append({"name": nm, "ranks": int(m.group(1)), "kind": kind})
            if m.group(4):
                out["benefits"].append(t)
            continue
        if re.search(r"raised to Rank 20", t):
            out["rank20"].append(t)
            continue
        out["benefits"].append(t)
    return out


def race_class_record(e, kind):
    name = e["name"].strip()
    if name.isupper():
        name = title(name)
    bullets = [t for t in e["text"] if t.startswith("•")]
    parsed = parse_bullets(bullets)
    rec = {
        "id": slug(name),
        "name": name,
        "kind": kind,
        "group": title(e["section"]) if e.get("section") else None,
        "classType": e["fields"].get("Class Type"),
        "page": e["page"],
        "prerequisite": e["fields"].get("Prerequisites") or e["fields"].get("Prerequisite"),
        **parsed,
    }
    if kind == "race":
        rec["alien"] = (e.get("section") or "").upper().startswith("ALIEN")
    return rec


def build_skills():
    out = []
    for e in raw("attack"):
        out.append(skill_record(e, "attack"))
    for e in raw("utility"):
        out.append(skill_record(e, "utility"))
    spells = [skill_record(e, "spell") for e in raw("spells")]
    return out, spells


def build_debuffs():
    out = []
    for r in raw("debuffs"):
        name = r["Debuff Name"]
        eff = r["Effect"]
        rec = {"id": slug(name), "name": name, "effect": eff, "duration": r["Duration"], "page": 97,
               "stackable": "Stackable" in eff}
        m = re.search(r"(\d+d\d+)\+F", eff)
        if m:
            rec["dot"] = m.group(1)
        m = re.search(r"([-−]\d+) (?:penalty )?(?:on|to) all (?:Checks|rolls)", eff)
        if m:
            rec["allChecks"] = int(m.group(1).replace("−", "-"))
        out.append(rec)
    return out


def build_backgrounds():
    out = []
    names = {
        "Table 12": ("childhood", 1), "Table 13": ("adolescence", 1), "Table 14": ("career", 3),
        "Table 15": ("hobby", 2), "Table 16": ("animalYouth", 1), "Table 17": ("animalTraining", 1),
        "Table 18": ("animalQuirk", 2), "Table 19": ("animalAdult", 3),
    }
    for r in raw("backgrounds"):
        tab = r["_table"].split(":")[0].strip()
        if tab not in names:
            continue
        stage, rank = names[tab]
        skills = []
        for part in split_skills(r.get("Skills", "")):
            m = re.match(r"^(.*?)\s*\((\w+)\)$", part)
            if m:
                skills.append({"name": m.group(1).strip(), "stat": m.group(2).lower() if m.group(2) != "None" else None})
            else:
                skills.append({"name": part, "stat": None})
        out.append({"stage": stage, "roll": r.get("Roll Or Choose"), "name": r.get("Description"),
                    "rank": rank, "skills": skills, "page": r["page"]})
    return out


def split_skills(s):
    # "Streetwise (Cha), Perception (Int), Stealth (Dex)"
    return [p.strip() for p in re.split(r",\s*(?![^()]*\))", s) if p.strip()]


def build_traumas():
    out = {"trauma": [], "looseEnd": [], "regret": []}
    for r in raw("traumas"):
        tab = r["_table"]
        val = r.get("Past Trauma") or r.get("Loose End") or r.get("Regret")
        key = "trauma" if "22" in tab else "looseEnd" if "23" in tab else "regret"
        out[key].append(val)
    return out


def build_deities():
    out = []
    for e in raw("deities"):
        f = e["fields"]
        out.append({"id": slug(e["name"].split(",")[0]), "name": title(e["name"]), "page": e["page"],
                    "signatureSkills": f.get("Signature Skills"), "signatureStat": f.get("Signature Stat"),
                    "rival": f.get("Rival") or f.get("Opposed To"), "sponsor": f.get("Likely Sponsor"),
                    "offering": f.get("Daily Offering"), "symbol": f.get("Symbol")})
    return out


def apply_overrides(kind, records):
    by_id = {r["id"]: r for r in records}
    for key, patch in OVERRIDES.items():
        k, _, rid = key.partition(":")
        if k != kind:
            continue
        if patch is None:
            by_id.pop(rid, None)
            continue
        if rid not in by_id:
            if patch.get("_new"):
                rec = {k2: v for k2, v in patch.items() if k2 != "_new"}
                by_id[rec.get("id", rid)] = rec
                continue
            problems.append(f"override for unknown {key}")
            continue
        by_id[rid].update(patch)
    for rid, rec in by_id.items():
        s = SUMMARIES.get(f"{kind}:{rid}")
        if s:
            rec["summary"] = s
        e = EFFECTS.get(f"{kind}:{rid}")
        if e:
            rec["effect"] = e
    return list(by_id.values())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    skills, spells = build_skills()
    skills = apply_overrides("skill", skills)
    spells = apply_overrides("spell", spells)
    for s in spells:
        s["kind"] = "spell"
    races = apply_overrides("race", [race_class_record(e, "race") for e in raw("races")])
    classes = apply_overrides("class", [race_class_record(e, "class") for e in raw("classes")])
    data = {
        "skills": skills, "spells": spells, "races": races, "classes": classes,
        "debuffs": apply_overrides("debuff", build_debuffs()),
        "backgrounds": build_backgrounds(),
        "stories": build_traumas(),
        "deities": build_deities(),
    }
    known = {s["name"].lower() for s in skills + spells}
    known |= {s["id"] for s in skills + spells}
    for rc in races + classes:
        for sk in rc.get("skills", []):
            if sk["name"].lower() not in known and slug(sk["name"]) not in known:
                problems.append(f"{rc['kind']} {rc['name']}: unknown {sk['kind']} {sk['name']!r}")
    for b in data["backgrounds"]:
        for sk in b["skills"]:
            if canon(sk["name"]).lower() not in known and slug(sk["name"]) not in known:
                problems.append(f"background {b['name']}: unknown skill {sk['name']!r}")
    for k, v in data.items():
        (OUT / f"{k}.json").write_text(json.dumps(v, indent=1, ensure_ascii=False) + "\n")
        print(f"{k:12} {len(v)}")
    missing = [f"{s['kind']}:{s['id']}" for s in skills + spells if not s.get("summary")]
    print(f"missing summaries: {len(missing)}")
    if problems:
        print("\n".join(sorted(set(problems))))


if __name__ == "__main__":
    main()
