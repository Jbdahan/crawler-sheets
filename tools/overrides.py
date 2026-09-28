"""Hand fixes merged over the parsed data. Keys are "<kind>:<id>"; None deletes an entry."""
OVERRIDES = {
    # Racial weapon skill (Core p.130): chain used like a Club with 10ft reach
    "skill:creepy-chains": {
        "_new": True, "id": "creepy-chains", "name": "Creepy Chains", "kind": "attack",
        "group": "Racial (Changbi Demon)", "page": 130, "keywords": ["Melee Attack", "Str"],
        "stat": "str", "passive": False, "attack": True, "attackType": "melee", "checkType": "Evade",
        "range": "10 feet", "damage": {"count": 1, "sides": 6, "stat": "str", "types": ["Bludgeoning"], "area": ""},
        "upgrades": {"5": {"text": "+1d6 base damage", "dice": {"count": 1, "sides": 6}},
                      "10": {"text": "+1d6 base damage, and the target gains the Woozy Debuff.", "dice": {"count": 1, "sides": 6}},
                      "15": {"text": "+1d6 base damage, and if the target loses at least 3 Health Bar slots, they gain the Take Down Debuff.", "dice": {"count": 1, "sides": 6}}},
    },
    "class:physicker": {"name": "Physicker"},
    # Structured effects the engine applies automatically
    "skill:dodge": {"effects": {"evade": 1}},
    "skill:cat-like-reflexes": {"effects": {"move": 10}},
    "spell:heal": {"heal": {"slots": 2}},
    "spell:heal-self": {"heal": {"dice": "1d4"}},
    "spell:heal-others": {"heal": {"dice": "1d4"}},
    "spell:heal-critter": {"heal": {"full": True}},
    "spell:intimate-touches": {"heal": {"statMod": "cha"}},
    "spell:natures-breath": {"heal": {"rankDie": True}},
    "spell:oakhide": {"castBuff": {"dr": 2}},
    "spell:rise-dead-minion": {"damage": {"count": 1, "sides": 8, "stat": "int", "types": ["Necrotic"], "area": ""}},
    "race:the-world-dungeon-on-hard-mode-primals": None,
}
