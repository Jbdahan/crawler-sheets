// Custom Mobs and Bosses, built with the Core Rulebook's "Create Your Own Mobs and Bosses"
// rules (Core pp.270–273, Tables 50 and 51).
import { SIZES, STAT_KEYS, type StatKey } from '../data'
import type { MonsterAttack, MonsterDef } from '../data/monsters'
import { uid } from './advancement'
import { statMod } from './derived'

export const MOB_TIER = 'Mob'

/** Table 50: Boss Severity. Stat points per Level and Health Bar slots (+ Floor). */
export const BOSS_TIERS = [
  { tier: 'Neighborhood Boss', perLevel: 3, slots: 10 },
  { tier: 'Borough Boss', perLevel: 4, slots: 15 },
  { tier: 'City Boss', perLevel: 5, slots: 20 },
  { tier: 'Province Boss', perLevel: 6, slots: 25 },
  { tier: 'Country Boss', perLevel: 8, slots: 30 },
  { tier: 'Floor Boss', perLevel: 10, slots: 40 },
] as const

export const TIERS = [MOB_TIER, ...BOSS_TIERS.map((b) => b.tier)]

/** Table 51: Mob Level, Floor & Damage Dice. Each row: Level range, damage dice, Floors. */
export const LEVEL_TABLE = [
  { min: 1, max: 4, dice: 1, floors: [1, 1] },
  { min: 5, max: 9, dice: 2, floors: [2, 2] },
  { min: 10, max: 29, dice: 3, floors: [3, 4] },
  { min: 30, max: 59, dice: 5, floors: [5, 7] },
  { min: 60, max: 99, dice: 7, floors: [8, 10] },
  { min: 100, max: 159, dice: 9, floors: [11, 13] },
  { min: 160, max: 249, dice: 12, floors: [14, 16] },
  { min: 250, max: 349, dice: 15, floors: [17, 18] },
] as const

export const DIE_SIDES = [4, 6, 8, 10, 12]

export interface CustomAttack {
  name: string
  stat: StatKey
  dice: number
  sides: number
  dmgType: string
  /** e.g. "5ft range", "60ft range, 15ft Blast radius" */
  reach: string
  /** add the Stat Mod to damage (most Mob attacks do) */
  addMod: boolean
  /** a Debuff-only attack: "No damage" */
  noDamage: boolean
  /** extra effect, e.g. "Hit: Held" */
  effect: string
  /** a book attack whose to-hit isn't 10 + Mod: the difference */
  hitAdj?: number
  /** a flat damage bonus on top of (or instead of) the Stat Mod */
  flat?: number
  /** hits without an Evade roll ("None" to hit) */
  autoHit?: boolean
  /** a book attack line that doesn't fit dice + type + range, printed as is */
  raw?: { hit: string | null; text: string }
}

export interface CustomMob {
  id: string
  name: string
  tier: string
  /** 1 Tiny … 8 Gargantuan */
  size: number
  type: string
  level: number
  /** home Floor: sets DR, and a Boss's Health Bar slots */
  floor: number
  /** extra DR for armor or hide (+1/+2), less for spellcasters (−1/−2) */
  drAdj: number
  move: string
  stats: Record<StatKey, number>
  attacks: CustomAttack[]
  notes: string
  /** values kept from a book stat block where it differs from the creation rules */
  book?: {
    hb?: { slots: number; per: number | number[] }
    surprise?: string
    evade?: string
    dr?: string
    /** a printed [score, Mod] that isn't the Mod table's; used while the score is unchanged */
    mods?: Partial<Record<StatKey, [number, number]>>
  }
  /** where a copy came from, e.g. "Bugaboo, Core p.333" */
  basedOn?: string
}

const bossTier = (tier: string) => BOSS_TIERS.find((b) => b.tier === tier)
export const isBossTier = (tier: string) => !!bossTier(tier) || /\bBoss\b/.test(tier)

/** Mobs start with 1 in each Stat and get 3 points per Level; Bosses start at 5 (Table 50 for points). */
export function statBase(tier: string): number {
  return bossTier(tier) ? 5 : 1
}
export function statBudget(tier: string, level: number): number {
  return (bossTier(tier)?.perLevel ?? 3) * Math.max(1, level)
}
export function statSpent(m: Pick<CustomMob, 'tier' | 'stats'>): number {
  const base = statBase(m.tier)
  return STAT_KEYS.reduce((a, k) => a + Math.max(0, m.stats[k] - base), 0)
}

/** Mobs: one slot per Level (max 10). Bosses: Table 50 slots + Floor. Each slot holds the Con Mod. */
export function healthBar(m: Pick<CustomMob, 'tier' | 'level' | 'floor' | 'stats'>): { slots: number; per: number } {
  const b = bossTier(m.tier)
  const slots = b ? b.slots + Math.max(1, m.floor) : Math.min(Math.max(1, m.level), 10)
  return { slots, per: statMod(m.stats.con) }
}

export function levelRow(level: number) {
  return LEVEL_TABLE.find((r) => level <= r.max) ?? LEVEL_TABLE[LEVEL_TABLE.length - 1]
}

/** Table 51 damage dice for a Level ("the Mob's main Attack gets the full damage dice"). */
export const damageDice = (level: number) => levelRow(level).dice

function floorRow(floor: number): number {
  const i = LEVEL_TABLE.findIndex((r) => floor <= r.floors[1])
  return i < 0 ? LEVEL_TABLE.length - 1 : i
}

/** Typical Level for this tier on this Floor. Mobs: the Floor's row of Table 51. Bosses use the next
 *  row down: Neighborhood the low end, Borough the middle, City the high end; Province and up go further. */
export function suggestLevel(tier: string, floor: number): number {
  const at = (row: number, f: number) => {
    const r = LEVEL_TABLE[Math.min(row, LEVEL_TABLE.length - 1)]
    return Math.round(r.min + (r.max - r.min) * f)
  }
  const row = floorRow(floor)
  switch (tier) {
    case 'Neighborhood Boss': return at(row + 1, 0.1)
    case 'Borough Boss': return at(row + 1, 0.4)
    case 'City Boss': return at(row + 1, 0.85)
    case 'Province Boss': return at(row + 2, 0.1)
    case 'Country Boss': return at(row + 2, 0.5)
    case 'Floor Boss': return at(row + 2, 0.9)
    default: return at(row, 0.3)
  }
}

export type Role = 'brute' | 'skirmisher' | 'caster' | 'balanced'

export const ROLES: { value: Role; label: string; weights: Record<StatKey, number> }[] = [
  { value: 'brute', label: 'Brute', weights: { str: 4, int: 0.5, con: 3.5, dex: 1.5, cha: 0.5 } },
  { value: 'skirmisher', label: 'Skirmisher', weights: { str: 2, int: 1, con: 2, dex: 4, cha: 1 } },
  { value: 'caster', label: 'Caster', weights: { str: 0.5, int: 4, con: 2, dex: 2, cha: 1.5 } },
  { value: 'balanced', label: 'Balanced', weights: { str: 1, int: 1, con: 1, dex: 1, cha: 1 } },
]

/** Spread the stat points by the role's weights, largest remainders first. */
export function distributeStats(tier: string, level: number, role: Role): Record<StatKey, number> {
  const w = ROLES.find((r) => r.value === role)!.weights
  const budget = statBudget(tier, level)
  const sum = STAT_KEYS.reduce((a, k) => a + w[k], 0)
  const raw = STAT_KEYS.map((k) => ({ k, v: (budget * w[k]) / sum }))
  const out = Object.fromEntries(raw.map(({ k, v }) => [k, Math.floor(v)])) as Record<StatKey, number>
  let left = budget - STAT_KEYS.reduce((a, k) => a + out[k], 0)
  for (const { k } of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1) || w[b.k] - w[a.k])) {
    if (left <= 0) break
    out[k]++
    left--
  }
  const base = statBase(tier)
  return Object.fromEntries(STAT_KEYS.map((k) => [k, base + out[k]])) as Record<StatKey, number>
}

/** Starter attacks for a role: the main Attack gets the full Table 51 dice; an area or
 *  effect-on-fail Attack loses 1d (Core p.272). */
export function suggestAttacks(role: Role, tier: string, level: number): CustomAttack[] {
  const full = damageDice(level)
  const less = Math.max(1, full - 1)
  const atk = (a: Partial<CustomAttack> & Pick<CustomAttack, 'name' | 'stat' | 'dmgType' | 'reach'>): CustomAttack =>
    ({ dice: full, sides: 6, addMod: true, noDamage: false, effect: '', ...a })
  const list: CustomAttack[] = {
    brute: [
      atk({ name: 'Slam', stat: 'str', dmgType: 'Bludgeoning', reach: '5ft range' }),
      atk({ name: 'Crushing Grab', stat: 'str', dmgType: 'Bludgeoning', reach: '5ft range', dice: less, effect: 'Evade MF+: Held' }),
    ],
    skirmisher: [
      atk({ name: 'Claws', stat: 'dex', dmgType: 'Slashing', reach: '5ft range' }),
      atk({ name: 'Thrown Blade', stat: 'dex', dmgType: 'Piercing', reach: '30ft range', dice: less, effect: 'Evade MF+: Blood Trail' }),
    ],
    caster: [
      atk({ name: 'Bolt Spell', stat: 'int', dmgType: 'Fire', reach: '60ft range' }),
      atk({ name: 'Blast Spell', stat: 'int', dmgType: 'Ice', reach: '60ft range, 15ft Blast radius', dice: less }),
    ],
    balanced: [
      atk({ name: 'Strike', stat: 'str', dmgType: 'Slashing', reach: '5ft range' }),
      atk({ name: 'Shot', stat: 'dex', dmgType: 'Piercing', reach: '50ft range' }),
    ],
  }[role]
  // low-Level trash gets one Attack; Bosses get a third
  if (level < 5 && !isBossTier(tier)) return list.slice(0, 1)
  if (isBossTier(tier)) list.push(atk({ name: 'Signature Move', stat: list[0].stat, dmgType: 'Force', reach: '20ft Cone', dice: less, effect: 'Hit: Stunned' }))
  return list
}

export function newCustomMob(floor = 3): CustomMob {
  const tier = MOB_TIER
  const level = suggestLevel(tier, floor)
  return {
    id: `custom-${uid()}`, name: '', tier, size: 4, type: 'Humanoid', level, floor, drAdj: 0, move: '20+S',
    stats: distributeStats(tier, level, 'brute'), attacks: suggestAttacks('brute', tier, level), notes: '',
  }
}

const DAMAGE_ABBR: Record<string, string> = { Bludgeoning: 'Bludg', Piercing: 'Pierc', Slashing: 'Slash', Electric: 'Elec', Necrotic: 'Necro', Psychic: 'Psych' }
const signedNum = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export function attackLine(a: CustomAttack, stats: Record<StatKey, number>): MonsterAttack {
  if (a.raw) return { name: a.name || 'Attack', hit: a.raw.hit, text: a.raw.text, ...(a.effect.trim() ? { fx: [a.effect.trim()] } : {}) }
  const mod = statMod(stats[a.stat])
  const bonus = (a.addMod ? mod : 0) + (a.flat ?? 0)
  const dmg = a.noDamage ? 'no dmg' : `${a.dice}d${a.sides}${bonus ? signedNum(bonus) : ''} ${DAMAGE_ABBR[a.dmgType] ?? a.dmgType}`
  const reach = a.reach.replace(/(\d+)ft range/, '$1ft')
  return {
    name: a.name || 'Attack',
    hit: a.autoHit ? null : `${10 + mod + (a.hitAdj ?? 0)}+F`,
    text: [dmg, reach].filter(Boolean).join(', '),
    ...(a.effect.trim() ? { fx: [a.effect.trim()] } : {}),
  }
}

/** The stat block, in the same shape as the books' Mobs so the encounter sheet can print it. */
export function toMonster(m: CustomMob): MonsterDef {
  const mod = (k: StatKey) => statMod(m.stats[k])
  return {
    id: m.id,
    name: m.name.trim() || 'Unnamed Mob',
    tier: m.tier,
    boss: isBossTier(m.tier),
    size: SIZES[m.size] ? `${SIZES[m.size]} (${m.size})` : '',
    type: m.type,
    level: m.level,
    surprise: m.book?.surprise ?? `${10 + mod('int')}+F`,
    evade: m.book?.evade ?? `${10 + mod('dex')}+F`,
    move: m.move,
    dr: m.book?.dr ?? String(Math.max(0, m.floor + m.drAdj)),
    hb: m.book?.hb ?? healthBar(m),
    stats: STAT_KEYS.map((k) => {
      const printed = m.book?.mods?.[k]
      return [m.stats[k], printed && printed[0] === m.stats[k] ? printed[1] : mod(k)] as [number, number]
    }),
    attacks: m.attacks.map((a) => attackLine(a, m.stats)),
    notes: m.notes.trim() ? [m.notes.trim()] : [],
    book: 'Custom',
    page: 0,
    part: 'Custom',
    section: 'Custom Mobs',
  }
}

const NAME_A = ['Gristle', 'Sulking', 'Feral', 'Bloated', 'Weeping', 'Rabid', 'Chrome', 'Gutter', 'Tax', 'Sponsored', 'Haunted', 'Discount', 'Velvet', 'Screaming', 'Moist']
const NAME_B = ['Lurker', 'Mauler', 'Goblin', 'Hag', 'Crawler-Eater', 'Grub', 'Collector', 'Shambler', 'Influencer', 'Mimic', 'Hound', 'Gremlin', 'Tongue Lasher', 'Regret', 'Choir Boy']

export function randomName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  return `${pick(NAME_A)} ${pick(NAME_B)}`
}

const UNABBR = Object.fromEntries(Object.entries(DAMAGE_ABBR).map(([full, short]) => [short, full]))
const FLOOR_WORDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']

/** The stat a book attack most likely rolls: the one whose Mod makes its to-hit 10 + Mod, else its damage bonus. */
function attackStat(hit: number | null, bonus: number | null, stats: Record<StatKey, number>): StatKey {
  const order: StatKey[] = ['str', 'dex', 'int', 'cha', 'con']
  return order.find((k) => hit !== null && 10 + statMod(stats[k]) === hit)
    ?? order.find((k) => bonus !== null && statMod(stats[k]) === bonus)
    ?? 'str'
}

/** A book attack ("3d8+5 Bludg, 5ft") as an editable custom attack that prints the same line. */
export function fromBookAttack(a: MonsterAttack, stats: Record<StatKey, number>): CustomAttack {
  const hit = a.hit && /^\d+/.test(a.hit) ? parseInt(a.hit, 10) : null
  const effect = a.fx?.join('; ') ?? ''
  const dm = a.text.match(/^(\d+)d(\d+)(?:([+-]\d+))?\s+([^,]+?)(?:,\s*(.*))?$/)
  const plainHit = a.hit === null || /^\d+\+F$/.test(a.hit)
  if ((!dm && !/^no dmg/.test(a.text)) || !plainHit) {
    const stat = attackStat(hit, null, stats)
    return { name: a.name, stat, dice: 1, sides: 6, dmgType: 'Bludgeoning', reach: '', addMod: true, noDamage: false, effect, raw: { hit: a.hit, text: a.text } }
  }
  if (!dm) {
    const reach = a.text.replace(/^no dmg,?\s*/, '')
    const stat = attackStat(hit, null, stats)
    const mod = statMod(stats[stat])
    return {
      name: a.name, stat, dice: 1, sides: 6, dmgType: 'Bludgeoning', reach, addMod: false, noDamage: true, effect,
      ...(hit === null ? { autoHit: true } : hit !== 10 + mod ? { hitAdj: hit - 10 - mod } : {}),
    }
  }
  const [, n, sides, plus, type, reach = ''] = dm
  const bonus = plus ? Number(plus) : null
  const stat = attackStat(hit, bonus, stats)
  const mod = statMod(stats[stat])
  const addMod = bonus !== null && bonus >= mod
  const flat = (bonus ?? 0) - (addMod ? mod : 0)
  return {
    name: a.name, stat, dice: Number(n), sides: Number(sides), dmgType: UNABBR[type.trim()] ?? type.trim(),
    reach: reach.replace(/^(\d+ft)$/, '$1 range'), addMod, noDamage: false, effect,
    ...(flat ? { flat } : {}),
    ...(hit === null ? { autoHit: true } : hit !== 10 + mod ? { hitAdj: hit - 10 - mod } : {}),
  }
}

/** Start a custom Mob from a book stat block: same numbers, ready to tweak. */
export function fromMonster(def: MonsterDef): CustomMob {
  const stats = Object.fromEntries(STAT_KEYS.map((k, i) => [k, def.stats[i]?.[0] ?? 1])) as Record<StatKey, number>
  const sizeN = Number(def.size.match(/\((\d+)\)/)?.[1] ?? 4)
  const word = def.part.match(/The (\w+) Floor/)?.[1]
  const dr = parseInt(def.dr, 10)
  const floor = word && FLOOR_WORDS.includes(word) ? FLOOR_WORDS.indexOf(word) + 1 : Number.isFinite(dr) ? dr : 3
  const m: CustomMob = {
    id: `custom-${uid()}`,
    name: def.name,
    tier: def.tier,
    size: sizeN,
    type: def.type,
    level: def.level,
    floor,
    drAdj: Number.isFinite(dr) ? dr - floor : 0,
    move: def.move,
    stats,
    attacks: def.attacks.map((a) => fromBookAttack(a, stats)),
    notes: def.notes.length ? `${def.notes.join(' · ')} (see ${def.book} p.${def.page})` : '',
    basedOn: def.book === 'Custom' ? def.name : `${def.name}, ${def.book} p.${def.page}`,
  }
  // keep the book's numbers wherever they aren't what the creation rules give
  const rules = toMonster(m)
  const book: NonNullable<CustomMob['book']> = {}
  if (JSON.stringify(rules.hb) !== JSON.stringify(def.hb)) book.hb = def.hb
  if (rules.surprise !== def.surprise) book.surprise = def.surprise
  if (rules.evade !== def.evade) book.evade = def.evade
  if (rules.dr !== def.dr) book.dr = def.dr
  STAT_KEYS.forEach((k, i) => {
    const s = def.stats[i]
    if (s && s[1] !== statMod(s[0])) book.mods = { ...book.mods, [k]: s }
  })
  if (Object.keys(book).length) m.book = book
  return m
}

const STORE = 'encounter.custom'

/** The GM's custom Mobs, saved on this device. */
export function loadCustomMobs(): CustomMob[] {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as CustomMob[]
  } catch { /* private mode or bad JSON */ }
  return []
}

export function saveCustomMobs(list: CustomMob[]) {
  try { localStorage.setItem(STORE, JSON.stringify(list)) } catch { /* quota: not saved */ }
}
