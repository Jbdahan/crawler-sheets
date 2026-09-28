import { BUFFS, STAT_KEYS, findSkill, type SkillDef, type StatKey } from '../data'
import type { Character, CharSkill, Modifier } from './types'

/** Table 2/20: Stat Mods (Core p.57). */
export function statMod(score: number): number {
  if (score <= 2) return 1
  if (score <= 5) return 2
  if (score <= 9) return 3
  if (score <= 19) return 4
  if (score <= 49) return 5
  if (score <= 99) return 6
  if (score <= 149) return 7
  if (score <= 199) return 8
  if (score <= 299) return 9
  return 10
}

export interface Part {
  label: string
  value: number
}

export interface Total {
  total: number
  parts: Part[]
}

const sum = (parts: Part[]) => parts.reduce((a, p) => a + p.value, 0)
const total = (parts: Part[]): Total => ({ total: sum(parts), parts })

/** Debuff behaviour the engine applies automatically (Table 11, Core p.97). */
export const DEBUFF_RULES: Record<string, {
  allChecks?: number
  noDexAttackEvade?: boolean
  disAll?: boolean
  disAttack?: boolean
  disNext?: boolean
  cantCast?: boolean
  cantHeal?: boolean
  cantAct?: boolean
  halfMove?: boolean
  noMove?: boolean
  noStep?: boolean
  dot?: { dice: string; type?: string }
}> = {
  'minor-injury': { allChecks: -2 },
  'long-term-minor-injury': { allChecks: -2 },
  'major-injury': { allChecks: -5 },
  'long-term-major-injury': { allChecks: -5 },
  fatigued: { allChecks: -1, halfMove: true },
  'sore-as-shit': { allChecks: -1 },
  woozy: { noDexAttackEvade: true },
  'shit-faced': { disAll: true },
  terrified: { disAttack: true, noMove: true, noStep: true },
  staggered: { disAttack: true, noStep: true },
  stunned: { disNext: true },
  queasy: { disNext: true },
  blinded: { disAll: true },
  muted: { cantCast: true },
  'the-taint': { cantHeal: true },
  paralyzed: { cantAct: true },
  shocked: { cantAct: true },
  dying: { cantAct: true },
  'stiff-legs': { noStep: true },
  held: { noMove: true, noStep: true },
  'blood-trail': { dot: { dice: '1d6' } },
  burned: { dot: { dice: '1d10', type: 'Fire' } },
  drowning: { dot: { dice: '1d6' } },
  poisoned: { dot: { dice: '1d8', type: 'Poison' } },
  sepsis: { dot: { dice: '1d10', type: 'Poison' }, disAttack: true, noStep: true },
}

export interface Derived {
  unenhanced: Record<StatKey, number>
  enhanced: Record<StatKey, number>
  mod: Record<StatKey, number>
  statParts: Record<StatKey, Part[]>
  evade: Total
  dr: Total
  hbSlot: Total
  maxMana: Total
  move: Total
  step: number
  allChecks: Total
  toHit: Total
  damage: Total
  flags: {
    noDexAttackEvade: boolean
    disAll: boolean
    disAttack: boolean
    disNext: boolean
    cantCast: boolean
    cantHeal: boolean
    cantAct: boolean
    noStep: boolean
  }
  resist: string[]
  immune: string[]
  vuln: string[]
  /** skill Rank bonuses from gear, Buffs and traits, by skill uid */
  skillBonus: Record<string, Part[]>
  dots: { name: string; dice: string; type?: string; stacks: number }[]
  notes: string[]
}

interface Source {
  label: string
  mods: Modifier[]
  /** trait stat mods count as Unenhanced */
  unenhanced?: boolean
}

/** Structured bonuses a skill grants at its current Rank (base effects + unlocked upgrades). */
export function skillEffects(def: SkillDef | undefined, rank: number): { evade: number; move: number; dr: number } {
  const out = { evade: 0, move: 0, dr: 0 }
  if (!def || rank <= 0) return out
  out.evade += def.effects?.evade ?? 0
  out.move += def.effects?.move ?? 0
  out.dr += def.effects?.dr ?? 0
  for (const [lvl, up] of Object.entries(def.upgrades ?? {})) {
    if (Number(lvl) > rank) continue
    out.evade += up.evade ?? 0
    out.move += up.move ?? 0
    if (def.kind !== 'spell') out.dr += up.dr ?? 0
  }
  return out
}

function modSources(c: Character): Source[] {
  const sources: Source[] = []
  for (const t of c.traits) sources.push({ label: t.source, mods: t.mods, unenhanced: true })
  for (const g of c.gear) sources.push({ label: g.name || 'Gear', mods: g.mods })
  for (const e of c.effects) {
    if (!e.active) continue
    const stacks = Math.max(1, e.stacks)
    const mods: Modifier[] = []
    for (let i = 0; i < stacks; i++) mods.push(...e.mods)
    const buff = e.refId ? BUFFS.find((b) => b.id === e.refId) : undefined
    for (const t of buff?.floorMods ?? []) mods.push({ target: t, value: c.floor })
    sources.push({ label: e.name, mods })
  }
  return sources
}

export function effectiveRank(c: Character, s: CharSkill, d?: Derived): number {
  const bonus = (d ?? derive(c)).skillBonus[s.uid] ?? []
  return s.rank + sum(bonus)
}

export function derive(c: Character): Derived {
  const sources = modSources(c)
  const statParts = {} as Record<StatKey, Part[]>
  const unenhanced = {} as Record<StatKey, number>
  const enhanced = {} as Record<StatKey, number>
  for (const k of STAT_KEYS) {
    const parts: Part[] = [{ label: 'Starting', value: c.base[k] }]
    if (c.statPoints[k]) parts.push({ label: 'Level-up points', value: c.statPoints[k] })
    for (const s of sources) {
      if (!s.unenhanced) continue
      for (const m of s.mods) if (m.target === `stat:${k}` && m.value) parts.push({ label: s.label, value: m.value })
    }
    unenhanced[k] = Math.max(1, sum(parts))
    for (const s of sources) {
      if (s.unenhanced) continue
      for (const m of s.mods) if (m.target === `stat:${k}` && m.value) parts.push({ label: `${s.label} (Enhanced)`, value: m.value })
    }
    enhanced[k] = Math.max(1, sum(parts))
    statParts[k] = parts
  }
  const mod = {} as Record<StatKey, number>
  for (const k of STAT_KEYS) mod[k] = statMod(enhanced[k])

  const collect = (target: string): Part[] => {
    const parts: Part[] = []
    for (const s of sources) for (const m of s.mods) if (m.target === target && m.value) parts.push({ label: s.label, value: m.value })
    return parts
  }

  // Debuff flags and penalties
  const flags = {
    noDexAttackEvade: false, disAll: false, disAttack: false, disNext: false,
    cantCast: false, cantHeal: false, cantAct: false, noStep: false,
  }
  let halfMove = false
  let noMove = false
  const checkParts: Part[] = collect('allChecks')
  const dots: Derived['dots'] = []
  for (const e of c.effects) {
    if (!e.active || e.kind !== 'debuff' || !e.refId) continue
    const r = DEBUFF_RULES[e.refId]
    if (!r) continue
    const stacks = Math.max(1, e.stacks)
    if (r.allChecks) checkParts.push({ label: e.name + (stacks > 1 ? ` ×${stacks}` : ''), value: r.allChecks * stacks })
    if (r.noDexAttackEvade) flags.noDexAttackEvade = true
    if (r.disAll) flags.disAll = true
    if (r.disAttack) flags.disAttack = true
    if (r.disNext) flags.disNext = true
    if (r.cantCast) flags.cantCast = true
    if (r.cantHeal) flags.cantHeal = true
    if (r.cantAct) flags.cantAct = true
    if (r.noStep) flags.noStep = true
    if (r.halfMove) halfMove = true
    if (r.noMove) noMove = true
    if (r.dot) dots.push({ name: e.name, dice: r.dot.dice, type: r.dot.type, stacks })
  }

  // Skill-granted passive bonuses
  const evadeParts: Part[] = []
  const moveParts: Part[] = [{ label: 'Base Move', value: c.baseMove }]
  const drParts: Part[] = collect('dr')
  const skillBonus: Record<string, Part[]> = {}
  for (const s of c.skills) {
    const bonus: Part[] = []
    for (const src of sources) {
      for (const m of src.mods) {
        if (!m.value) continue
        if (s.skillId && m.target === `skill:${s.skillId}`) bonus.push({ label: src.label, value: m.value })
      }
    }
    if (bonus.length) skillBonus[s.uid] = bonus
    const def = findSkill(s.skillId)
    if (!def) continue
    // weapon benefits (e.g. Rapier Evade) only apply while wielding it (Core p.95)
    if (def.kind === 'attack' && !s.wielded) continue
    const rank = s.rank + sum(bonus)
    const fx = skillEffects(def, rank)
    if (fx.evade) evadeParts.push({ label: s.name, value: fx.evade })
    if (fx.move) moveParts.push({ label: s.name, value: fx.move })
    if (fx.dr) drParts.push({ label: s.name, value: fx.dr })
  }

  const dexForEvade = flags.noDexAttackEvade ? 0 : mod.dex
  const evade = total([
    { label: flags.noDexAttackEvade ? 'Dex Mod (Woozy: none)' : 'Dex Mod', value: dexForEvade },
    ...evadeParts,
    ...collect('evade'),
  ])

  const ironSkin = c.effects.some((e) => e.active && e.refId === 'iron-skin')
  let dr = total(drParts)
  if (ironSkin && dr.total > 0) dr = total([...drParts, { label: 'Iron Skin (double)', value: dr.total }])

  const hbSlot = total([{ label: 'Con Mod', value: mod.con }, ...collect('hbSlot')])
  const maxMana = total([{ label: 'Enhanced Intelligence', value: enhanced.int }, ...collect('maxMana')])
  moveParts.push(...collect('move'))
  let move = total(moveParts)
  if (halfMove) move = total([...move.parts, { label: 'Fatigued (half)', value: -Math.ceil(move.total / 2) }])
  if (noMove) move = total([...move.parts, { label: 'Cannot move', value: -move.total }])

  const resist: string[] = []
  const immune: string[] = []
  const vuln: string[] = []
  for (const s of sources) {
    for (const m of s.mods) {
      const [kind, type] = m.target.split(':')
      if (!type) continue
      if (kind === 'resist' && !resist.includes(type)) resist.push(type)
      if (kind === 'immune' && !immune.includes(type)) immune.push(type)
      if (kind === 'vuln' && !vuln.includes(type)) vuln.push(type)
    }
  }

  const notes: string[] = []
  if (flags.disAll) notes.push('Disadvantage on all Checks')
  else if (flags.disAttack) notes.push('Disadvantage on Attacks')
  if (flags.disNext) notes.push('Disadvantage on your next Check')
  if (flags.cantAct) notes.push("Can't take Actions")
  if (flags.cantCast) notes.push("Can't cast Spells (Muted)")
  if (flags.cantHeal) notes.push("Can't be healed (The Taint)")
  if (flags.noDexAttackEvade) notes.push('No Dex Mod on Attack/Evade (Woozy)')

  return {
    unenhanced, enhanced, mod, statParts,
    evade, dr, hbSlot, maxMana, move,
    step: flags.noStep ? 0 : c.step,
    allChecks: total(checkParts),
    toHit: total(collect('toHit')),
    damage: total(collect('damage')),
    flags, resist, immune, vuln, skillBonus, dots, notes,
  }
}

export function skillStat(s: CharSkill): StatKey | null {
  return s.stat ?? findSkill(s.skillId)?.stat ?? null
}

/** Total bonus added to a d20 for a Skill Check: Rank + Stat Mod + effects. */
export function checkBonus(c: Character, s: CharSkill, d: Derived = derive(c)): Total {
  const stat = skillStat(s)
  const parts: Part[] = [{ label: 'Rank', value: s.rank }, ...(d.skillBonus[s.uid] ?? [])]
  if (stat) {
    const noDex = stat === 'dex' && d.flags.noDexAttackEvade && (s.kind === 'attack' || s.kind === 'spell')
    parts.push({ label: `${stat[0].toUpperCase()}${stat.slice(1)} Mod${noDex ? ' (Woozy)' : ''}`, value: noDex ? 0 : d.mod[stat] })
  }
  parts.push(...d.allChecks.parts)
  return total(parts)
}
