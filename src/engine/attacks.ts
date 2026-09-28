import { findSkill, STAT_ABBR, type Dice, type SkillDef, type StatKey } from '../data'
import { addDice, formatDice, parseDice, rankDamageDice, rollDie, type DicePool } from './dice'
import { checkBonus, derive, type Derived, type Part } from './derived'
import type { Character, CharSkill } from './types'

export interface AttackCalc {
  skill: CharSkill
  def?: SkillDef
  rank: number
  toHit: { total: number; parts: Part[] }
  /** base dice (doubled on a Critical Hit) */
  baseDice: Dice[]
  /** Rank damage dice: never doubled on a crit (Core p.176) */
  rankDice: DicePool
  damageStat: StatKey | null
  damageFlat: { total: number; parts: Part[] }
  types: string[]
  formula: string
  critFormula: string
  amazingBonus: number
  mode: 'normal' | 'advantage' | 'disadvantage'
  modeReasons: string[]
  mana?: number
  unlocked: { rank: number; text: string }[]
  locked: { rank: number; text: string }[]
  range?: string
  area?: string
  notes: string[]
}

export const isAttackSkill = (s: CharSkill) => {
  if (s.customDamage) return true
  const def = findSkill(s.skillId)
  return !!def && (def.attack || !!def.damage) && def.kind !== 'damageEffect'
}

/** Attack Skill Check and damage for the current Stats, Rank and Floor (Core p.82–85, 175–176). */
export function attackCalc(c: Character, s: CharSkill, d: Derived = derive(c)): AttackCalc {
  const def = findSkill(s.skillId)
  const bonus = d.skillBonus[s.uid] ?? []
  const rank = s.rank + bonus.reduce((a, p) => a + p.value, 0)
  const toHitParts = [...checkBonus(c, s, d).parts, ...d.toHit.parts]
  const toHitTotal = toHitParts.reduce((a, p) => a + p.value, 0)

  let baseDice: Dice[] = []
  let damageStat: StatKey | null = null
  let types: string[] = []
  const flatParts: Part[] = []
  let rankDie = false
  const unlocked: AttackCalc['unlocked'] = []
  const locked: AttackCalc['locked'] = []

  if (def?.damage) {
    baseDice = [{ count: def.damage.count, sides: def.damage.sides }]
    damageStat = def.damage.stat ?? (def.kind === 'spell' ? (def.stat ?? 'int') : null)
    types = def.damage.types
  }
  if (s.customDamage) {
    const p = parseDice(s.customDamage)
    if (p) {
      baseDice = p.dice
      if (p.flat) flatParts.push({ label: 'Weapon', value: p.flat })
    }
    damageStat = s.customDamageStat ?? damageStat
    if (s.customDamageType) types = [s.customDamageType]
  }
  for (const [lvl, up] of Object.entries(def?.upgrades ?? {})) {
    const r = Number(lvl)
    if (r <= rank) {
      unlocked.push({ rank: r, text: up.text })
      if (up.dice) baseDice = addDice(baseDice, up.dice)
      if (up.rankDie) rankDie = true
    } else {
      locked.push({ rank: r, text: up.text })
    }
  }
  if (damageStat) flatParts.push({ label: `${STAT_ABBR[damageStat]} Mod`, value: d.mod[damageStat] })
  flatParts.push(...d.damage.parts)
  const flat = flatParts.reduce((a, p) => a + p.value, 0)
  const rankDice = rankDie ? rankDamageDice(rank) : { dice: [], flat: 0 }

  // base dice first, then the Rank damage die, then flat modifiers
  const withRank = (dice: Dice[]) => formatDice([...dice, ...rankDice.dice], flat + rankDice.flat)

  const modeReasons: string[] = []
  let adv = 0
  let dis = 0
  if (rank <= 0) { dis++; modeReasons.push('Untrained') }
  if (d.flags.disAll) { dis++; modeReasons.push('Debuff') }
  else if (d.flags.disAttack) { dis++; modeReasons.push('Debuff') }
  if (d.flags.disNext) { dis++; modeReasons.push('Next Check') }
  if (def?.id === 'fireball') { dis++; modeReasons.push('Fireball is slow') }
  const mode = adv && !dis ? 'advantage' : dis && !adv ? 'disadvantage' : 'normal'

  const notes: string[] = []
  if (def?.attackType === 'ranged' || def?.kind === 'spell') notes.push('Ranged/Spell attacks within melee reach of a foe have Disadvantage.')
  if (def?.aiFavor) notes.push(`AI Favor: ${def.aiFavor}`)
  if (def?.limitations) notes.push(def.limitations)

  return {
    skill: s,
    def,
    rank,
    toHit: { total: toHitTotal, parts: toHitParts },
    baseDice,
    rankDice,
    damageStat,
    damageFlat: { total: flat, parts: flatParts },
    types,
    formula: withRank(baseDice),
    critFormula: withRank(baseDice.map((x) => ({ ...x, count: x.count * 2 }))),
    amazingBonus: c.floor,
    mode,
    modeReasons,
    mana: s.customMana ?? def?.mana,
    unlocked,
    locked,
    range: def?.range,
    area: def?.damage?.area || undefined,
    notes,
  }
}

/** Difficulty helpers (Core p.59). */
export const difficulty = {
  unopposed: (floor: number) => 10 + floor * 2,
  opposed: (floor: number, foeMod: number) => 10 + foeMod + floor,
  stat: (floor: number) => 10 + floor,
  /** a Mob's Evade: 10 + Dex Mod + Floor */
  mobEvade: (floor: number, dexMod: number) => 10 + dexMod + floor,
}

export interface DamageRoll {
  total: number
  faces: number[]
  crit: boolean
  amazing: boolean
  breakdown: string
}

export function rollDamage(a: AttackCalc, opts: { crit?: boolean; amazing?: boolean; extraFlat?: number }, rng?: (n: number) => number): DamageRoll {
  const base: DicePool = {
    dice: opts.crit ? a.baseDice.map((x) => ({ ...x, count: x.count * 2 })) : a.baseDice,
    flat: 0,
  }
  const pool: DicePool = {
    dice: [...base.dice, ...a.rankDice.dice],
    flat: a.damageFlat.total + a.rankDice.flat + (opts.amazing ? a.amazingBonus : 0) + (opts.extraFlat ?? 0),
  }
  const faces: number[] = []
  let total = pool.flat
  for (const dd of pool.dice) {
    for (let i = 0; i < dd.count; i++) {
      const f = (rng ?? rollDie)(dd.sides)
      faces.push(f)
      total += f
    }
  }
  const bits = [`dice [${faces.join(', ')}]`]
  if (a.damageFlat.total) bits.push(`${a.damageFlat.total >= 0 ? '+' : ''}${a.damageFlat.total} mods`)
  if (a.rankDice.flat) bits.push(`+${a.rankDice.flat} rank`)
  if (opts.amazing) bits.push(`+${a.amazingBonus} Amazing (Floor)`)
  if (opts.extraFlat) bits.push(`+${opts.extraFlat}`)
  return { total: Math.max(0, total), faces, crit: !!opts.crit, amazing: !!opts.amazing, breakdown: bits.join(' ') }
}
