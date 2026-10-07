// Standard loot for the Inventory picker: potions, scrolls, spellbooks, weapons,
// armor and the sample magic gear from the loot box lists (Core p.99, 115–118, 215–219).
import { ITEMS, findSkill, SKILLS, STAT_KEYS, STAT_NAMES, normName, type StatKey } from './index'
import type { GearSlot, InventoryItem, ItemKind, Modifier } from '../engine/types'

export const LOOT_GROUPS = ['Potions', 'Scrolls & Spellbooks', 'Weapons', 'Armor & magic gear', 'Consumables', 'Mundane'] as const
export type LootGroup = (typeof LOOT_GROUPS)[number]

export interface LootDef {
  id: string
  name: string
  group: LootGroup
  page: number
  summary: string
  /** how many come in one find, e.g. Torches ×10 */
  qty?: number
  kind?: ItemKind
  skillId?: string
  slot?: GearSlot
  mods?: Modifier[]
  /** Potion of +N Skill */
  ranks?: number
  /** the player picks this when adding: a Spell (scroll/book) or a Stat (rings) */
  pick?: 'spell' | 'stat'
  /** for pick: 'stat', the bonus */
  statBonus?: number
}

const potions: LootDef[] = ITEMS.filter((i) => /potion/i.test(i.name) && i.id !== 'mana-potion').map((i) => ({
  id: i.id, name: i.name, group: 'Potions', page: i.page, summary: i.summary,
}))

const skillPotions: LootDef[] = [1, 2, 3, 5].map((n) => ({
  id: `skill-potion-${n}`, name: `Potion of +${n} Skill`, group: 'Potions', page: n === 1 ? 216 : n === 2 ? 217 : n === 3 ? 217 : 218,
  summary: `Permanent: drink it to gain ${n} Rank${n === 1 ? '' : 's'} in a Skill you choose.`, kind: 'skillPotion', ranks: n,
}))

const magic: LootDef[] = [
  { id: 'spell-scroll', name: 'Spell Scroll', group: 'Scrolls & Spellbooks', page: 99, kind: 'scroll', pick: 'spell',
    summary: 'Casts its Spell once at the Rank written on it. No Mana. Turns to dust after use.' },
  { id: 'spellbook', name: 'Spellbook', group: 'Scrolls & Spellbooks', page: 99, kind: 'book', pick: 'spell',
    summary: 'Read it to learn its Spell at its Rank (usually 1–5: roll 1d6−1, min 1). Then it disappears.' },
  { id: 'magic-tome', name: 'Magic Tome', group: 'Scrolls & Spellbooks', page: 216, kind: 'book', pick: 'spell',
    summary: 'Bronze-box spellbook: learn a new, weak Spell.' },
  { id: 'scroll-of-upgrade', name: 'Scroll of Upgrade', group: 'Scrolls & Spellbooks', page: 116,
    summary: "Upgrades a crawler's signature weapon (roll on Table 26: an Amazing Success effect)." },
]

/** Weapons by the Attack Skill they use (natural attacks and fighting styles left out). */
const NOT_ITEMS = new Set(['back-claw', 'bite', 'slice-attack', 'foot-soldier', 'noggin-nocker', 'pugilism', 'unarmed-combat', 'wrasslin'])
const weapons: LootDef[] = SKILLS.filter((s) => s.kind === 'attack' && !NOT_ITEMS.has(s.id)).map((s) => ({
  id: `weapon-${s.id}`,
  name: s.id === 'improvised-weapons' ? 'Improvised Weapon' : s.id === 'herding-weapons' ? 'Herding Weapon' : s.name,
  group: 'Weapons', page: s.page, kind: 'weapon', skillId: s.id, slot: 'hands',
  summary: `Uses the ${s.name} Skill${s.damage ? ` · ${s.damage.count}d${s.damage.sides}${s.damage.stat ? ` + ${s.damage.stat[0].toUpperCase()}${s.damage.stat.slice(1)}` : ''} ${s.damage.types.join('/')}` : ''}.`,
}))

const dr = (value: number): Modifier => ({ target: 'dr', value })
const stat = (k: StatKey, value: number): Modifier => ({ target: `stat:${k}`, value })
const gear: LootDef[] = [
  { id: 'armor-head', name: 'Armor: Helmet (+1 DR)', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'head', mods: [dr(1)], summary: 'Bronze box: a random piece of armor with +1 Damage Resistance.' },
  { id: 'armor-torso', name: 'Armor: Chest Piece (+1 DR)', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'torso', mods: [dr(1)], summary: 'Bronze box: a random piece of armor with +1 Damage Resistance.' },
  { id: 'armor-arms', name: 'Armor: Bracers (+1 DR)', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'arms', mods: [dr(1)], summary: 'Bronze box: a random piece of armor with +1 Damage Resistance.' },
  { id: 'armor-legs', name: 'Armor: Greaves (+1 DR)', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'legs', mods: [dr(1)], summary: 'Bronze box: a random piece of armor with +1 Damage Resistance.' },
  { id: 'armor-feet', name: 'Armor: Boots (+1 DR)', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'feet', mods: [dr(1)], summary: 'Bronze box: a random piece of armor with +1 Damage Resistance.' },
  { id: 'silver-ring', name: 'Silver Ring', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'accessory', pick: 'stat', statBonus: 2, summary: '+2 to a Stat (Accessory).' },
  { id: 'golden-ring', name: 'Golden Ring', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'accessory', pick: 'stat', statBonus: 3, summary: '+3 to a Stat (Accessory).' },
  { id: 'platinum-trinket', name: 'Platinum Trinket', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'accessory', pick: 'stat', statBonus: 4, summary: 'An interesting item granting +4 to a Stat.' },
  { id: 'bitch-ass-buckler', name: 'Bitch-Ass Buckler', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'hands', mods: [{ target: 'skill:shield-block', value: 1 }, dr(3)], summary: '+1 Shield Block, +3 DR.' },
  { id: 'bernie-boots', name: 'Bernie Boots', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'feet', summary: 'While Dying you can still Move and read movement HUD messages.' },
  { id: 'big-purple-plume', name: 'Big Purple Plume', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'accessory', mods: [stat('cha', 2)], summary: '+2 Charisma.' },
  { id: 'friendship-bracelet', name: 'Friendship Bracelet of [Race]kind', group: 'Armor & magic gear', page: 216, kind: 'gear', slot: 'accessory', summary: 'Mobs/NPCs of one Race (1d10) lose automatic hostility. Take it off and they turn hostile for the Floor.' },
  { id: 'elbow-pads', name: 'Enchanted Elbow Pads of the Elbow-Walking Turkeys', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'arms', mods: [dr(2), stat('dex', 2)], summary: '+2 DR, +2 Dexterity.' },
  { id: 'skullcap-of-sucking', name: 'Skullcap of Sucking', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'head', mods: [dr(1)], summary: '+1 DR. Each Critical Fail gains 1 AI Favor.' },
  { id: 'tough-guy-tattoo', name: 'Tough Guy Tattoo', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'accessory', mods: [stat('con', 3)], summary: '+3 Constitution. Add 10 to your 100% Health Bar slot.' },
  { id: 'selfie-stick', name: 'Selfie Stick of the Self-Mutilator', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'hands', summary: '1 fewer HB slot while held. Enter combat Injured: gain Popularity and that many extra Actions each round.' },
  { id: 'chesty-cheese-grater', name: 'Chesty Cheese Grater', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'torso', mods: [dr(2)], summary: '+2 DR, +5% Constitution, Damage Reflection 3:1 vs. melee.' },
  { id: 'leggings-of-insanity', name: 'Enchanted Leggings of Insanity', group: 'Armor & magic gear', page: 217, kind: 'gear', slot: 'legs', mods: [dr(1), { target: 'skill:escape-artist', value: 3 }], summary: '+1 DR, +3 Escape Artist.' },
  { id: 'cloak-slippery-perv', name: 'Enchanted Cloak of the Slippery Perv', group: 'Armor & magic gear', page: 218, kind: 'gear', slot: 'accessory', mods: [stat('cha', 6)], summary: '+6 Charisma; situational +3 Evade Buff.' },
  { id: 'wand-of-incontinence', name: 'Enchanted Wand of Incontinence', group: 'Armor & magic gear', page: 218, kind: 'gear', slot: 'hands', summary: '+10% Constitution. Once per session, a creature within 30ft voids their bowels and gains Fatigued.' },
  { id: 'hand-grips', name: 'Hand Grips of Hella Holding', group: 'Armor & magic gear', page: 218, kind: 'gear', slot: 'hands', mods: [dr(3)], summary: '+10% Strength, +3 DR. Your grip can\'t be undone.' },
  { id: 'reset-button', name: 'Borant Corporation Reset Button', group: 'Armor & magic gear', page: 218, kind: 'gear', slot: 'accessory', summary: 'Once per floor, restart the current scene (up to 10 minutes in; first round in combat).' },
  { id: 'beret-of-divine-intervention', name: 'Beret of Divine Intervention', group: 'Armor & magic gear', page: 218, kind: 'gear', slot: 'head', summary: 'Max one Skill at Rank 15. Double personal rewards near a deity (triple near your own).' },
  { id: 'sassy-stiletto', name: 'The Sassy Stiletto', group: 'Armor & magic gear', page: 218, kind: 'weapon', skillId: 'dagger', slot: 'hands', mods: STAT_KEYS.map((k) => stat(k, 5)), summary: '+5 all Stats, Dagger Skill at Rank 15, crits on 16–20. An intelligent dagger.' },
]

const ITEM_GROUP = (name: string): LootGroup => (/potion/i.test(name) ? 'Potions' : 'Consumables')
const consumables: LootDef[] = ITEMS.filter((i) => ITEM_GROUP(i.name) === 'Consumables').map((i) => ({
  id: i.id, name: i.name, group: 'Consumables', page: i.page, summary: i.summary,
  qty: i.id === 'torch' ? 10 : i.id === 'crawler-biscuit' ? 100 : undefined,
}))

const mundane: LootDef[] = [
  { id: 'rope', name: 'Rope (50 feet)', group: 'Mundane', page: 216, summary: '50 feet of rope.' },
  { id: 'bicycle', name: 'Bicycle', group: 'Mundane', page: 216, summary: 'A bicycle.' },
  { id: 'canoe', name: 'Canoe and paddle', group: 'Mundane', page: 216, summary: 'The paddle works as a Staff.' },
  { id: 'hang-glider', name: 'Hang glider', group: 'Mundane', page: 216, summary: 'A hang glider.' },
  { id: 'lighter', name: 'Lighter', group: 'Mundane', page: 115, summary: 'Makes fire.' },
  { id: 'headphones', name: 'Headphones and music player', group: 'Mundane', page: 115, summary: 'Background item.' },
]

export const LOOT: LootDef[] = [...potions, ...skillPotions, ...magic, ...weapons, ...gear, ...consumables, ...mundane]

export const statPickName = (def: LootDef, k: StatKey) => `${def.name} of +${def.statBonus} ${STAT_NAMES[k]}`

/** The Attack Skill a weapon name points at, e.g. "Rusty Dagger" → dagger. */
const WEAPON_WORDS: [RegExp, string][] = [
  ...SKILLS.filter((s) => s.kind === 'attack' && !NOT_ITEMS.has(s.id) && s.id !== 'improvised-weapons')
    .map((s): [RegExp, string] => [new RegExp(`\\b${normName(s.name).replace(/s$/, '')}s?\\b`), s.id]),
  [/\bknife\b|\bknives\b|\bstiletto\b|\bshiv\b/, 'dagger'],
  [/\bsword\b/, 'longsword'],
  [/\bpistol\b|\brevolver\b/, 'handgun'],
  [/\bstaff\b/, 'quarterstaff'],
  [/\bhammer\b/, 'warhammer'],
]
export function weaponSkillFor(name: string): string | undefined {
  const n = normName(name)
  if (/\b(scroll|spellbook|tome|potion)\b/.test(n)) return undefined
  return WEAPON_WORDS.find(([re]) => re.test(n))?.[1]
}

export const findLoot = (id?: string) => LOOT.find((l) => l.id === id)
export const weaponSkillName = (id?: string) => findSkill(id)?.name

/** Fill in what an older or typed-in item is, from its name: "Rusty Dagger", "Scroll of Hole (Rank 3)". */
export function inferItem(it: InventoryItem): InventoryItem {
  if (it.kind) return it
  const n = normName(it.name)
  const rank = Number(it.name.match(/rank\s*(\d+)/i)?.[1] ?? 0) || undefined
  const scroll = it.name.match(/^scroll of (.+?)(\s*\(.*\))?$/i)
  if (scroll) {
    const spell = findSkill(scroll[1])
    if (spell?.kind === 'spell') return { ...it, kind: 'scroll', skillId: spell.id, rank: rank ?? 1 }
  }
  const book = it.name.match(/^(?:spellbook|spell book|magic tome|tome) of (.+?)(\s*\(.*\))?$/i)
  if (book) {
    const spell = findSkill(book[1])
    if (spell?.kind === 'spell') return { ...it, kind: 'book', skillId: spell.id, rank: rank ?? 1 }
  }
  const potion = n.match(/^potion of (\d+) skill/)
  if (potion) return { ...it, kind: 'skillPotion', rank: Number(potion[1]) }
  const weapon = weaponSkillFor(it.name)
  if (weapon) return { ...it, kind: 'weapon', skillId: weapon, slot: 'hands' }
  return it
}

