// Hand-to-hand Damage Effects (Core p.179–181): passive Skills that ride on an Attack Skill's hit.
// Each one, at its own Rank, adds base dice or Rank dice, multiplies damage, or applies Debuffs.
import { findDebuff, STAT_ABBR, type Dice } from '../data'
import { formatDice, rankDamageDice, rollDie, type DicePool } from './dice'
import type { AttackCalc, DamageRoll } from './attacks'
import type { Derived } from './derived'
import type { Character, CharSkill } from './types'

/** Which Attack Skills each Damage Effect works with (the book's "X Damage Effect" keyword). */
export const DAMAGE_EFFECT_FOR: Record<string, string[]> = {
  'choke-out': ['wrasslin'],
  'dirty-fighting': ['pugilism', 'wrasslin'],
  'iron-punch': ['pugilism'],
  'powerful-strike': ['foot-soldier', 'noggin-nocker', 'pugilism'],
  skullcracker: ['noggin-nocker'],
  smush: ['foot-soldier'],
  toss: ['wrasslin'],
}

/** The crawler's Damage Effects that can ride on this Attack Skill. */
export function damageEffectsFor(c: Character, attack: CharSkill): CharSkill[] {
  if (!attack.skillId) return []
  return c.skills.filter((s) => s.kind === 'damageEffect' && s.skillId && DAMAGE_EFFECT_FOR[s.skillId]?.includes(attack.skillId!))
}

export interface DamageEffectMod {
  uid: string
  name: string
  rank: number
  /** short tag for the toggle, e.g. "×2" or "+1d2" */
  tag: string
  /** extra base dice (doubled on a Critical Hit, like all base dice) */
  extraBase: Dice[]
  /** extra Rank damage dice, rolled at the Damage Effect's own Rank */
  rankDice: number
  flat: number
  flatLabel?: string
  /** Powerful Strike: the base dice result is multiplied by this */
  baseTimes: number
  /** Smush / Choke Out: the total is multiplied by this */
  totalTimes: number
  /** when it can be used, e.g. "target at 20% Health Bar or less" */
  condition?: string
  /** Debuffs the target gains */
  debuffs: string[]
  notes: string[]
}

/** What a Damage Effect does at its current Rank (Rank bonuses from gear count). */
export function damageEffectMod(s: CharSkill, rank: number, d: Derived): DamageEffectMod {
  const m: DamageEffectMod = { uid: s.uid, name: s.name, rank, tag: '', extraBase: [], rankDice: 0, flat: 0, baseTimes: 1, totalTimes: 1, debuffs: [], notes: [] }
  const r = rank
  switch (s.skillId) {
    case 'smush':
      m.totalTimes = r >= 15 ? 4 : r >= 5 ? 3 : 2
      m.condition = `target at ${r >= 15 ? 40 : r >= 5 ? 30 : 20}% Health Bar or less`
      if (r < 10) m.notes.push('Once per round')
      break
    case 'choke-out':
      m.totalTimes = r >= 15 ? 8 : r >= 10 ? 4 : 2
      m.condition = `target at ${r >= 15 ? 80 : r >= 10 ? 40 : r >= 5 ? 20 : 10}% Health Bar or less`
      break
    case 'powerful-strike':
      m.baseTimes = Math.max(1, r)
      m.notes.push(`Cooldown ${r >= 15 ? '2 hours' : r >= 10 ? '5 hours' : r >= 5 ? '10 hours' : '30 hours'}`)
      break
    case 'iron-punch':
      m.extraBase.push({ count: 1, sides: 2 })
      m.rankDice = r >= 15 ? 2 : r >= 5 ? 1 : 0
      if (r >= 15) m.debuffs.push('stunned')
      else if (r >= 10) m.notes.push('You may Stun the target instead of rolling damage')
      break
    case 'skullcracker':
      m.extraBase.push({ count: r >= 5 ? 2 : 1, sides: 4 })
      m.rankDice = r >= 15 ? 2 : r >= 10 ? 1 : 0
      if (r >= 10) m.debuffs.push('stunned')
      if (r >= 15) m.debuffs.push('blood-trail')
      m.condition = 'target the same size as you'
      break
    case 'dirty-fighting':
      m.debuffs.push('woozy')
      if (r >= 5) m.debuffs.push('the-taint')
      if (r >= 10) m.debuffs.push('blinded')
      if (r >= 15) m.debuffs.push('minor-injury')
      if (r < 10) m.notes.push('A Critical Fail costs 1 Popularity')
      break
    case 'toss':
      m.extraBase.push({ count: r >= 15 ? 2 : 1, sides: 8 })
      m.flat = d.mod.str
      m.flatLabel = `${STAT_ABBR.str} Mod`
      m.notes.push(`Ends Held; throws the target ${Math.max(5, Math.floor(r / 5) * 5)} ft`)
      m.notes.push(r >= 15 ? 'Foes up to two sizes larger' : r >= 10 ? 'Foes up to one size larger' : r >= 5 ? 'Foes up to your size' : 'Only foes smaller than you')
      break
  }
  const bits: string[] = []
  if (m.totalTimes > 1) bits.push(`×${m.totalTimes}`)
  if (m.baseTimes > 1) bits.push(`base ×${m.baseTimes}`)
  if (m.extraBase.length) bits.push(`+${formatDice(m.extraBase)}`)
  if (m.rankDice) bits.push(`+${m.rankDice} Rank die${m.rankDice > 1 ? 's' : ''}`)
  if (!bits.length && m.debuffs.length) bits.push(m.debuffs.map((x) => findDebuff(x)?.name ?? x).join(', '))
  m.tag = bits.join(' ')
  return m
}

/** The damage formula with Damage Effects applied, e.g. "(1d6 ×3) + 1d2 + 4, ×2". */
export function effectFormula(a: AttackCalc, mods: DamageEffectMod[], crit: boolean): string {
  const dbl = (ds: Dice[]) => (crit ? ds.map((x) => ({ ...x, count: x.count * 2 })) : ds)
  const baseTimes = mods.reduce((p, m) => p * m.baseTimes, 1)
  const totalTimes = mods.reduce((p, m) => p * m.totalTimes, 1)
  const base = formatDice(dbl(a.baseDice))
  const extra = dbl(mods.flatMap((m) => m.extraBase))
  const rank = [...a.rankDice.dice, ...mods.flatMap((m) => Array.from({ length: m.rankDice }, () => rankDamageDice(m.rank).dice).flat()), ...a.ammoDice]
  const flat = a.damageFlat.total + a.rankDice.flat + mods.reduce((t, m) => t + m.flat + m.rankDice * rankDamageDice(m.rank).flat, 0)
  const head = baseTimes > 1 ? `(${base} ×${baseTimes})` : base
  const rest = extra.length || rank.length || flat ? formatDice([...extra, ...rank], flat) : ''
  const sum = [head, rest].filter(Boolean).join(' + ').replace(/\+ \+/g, '+').replace(/\+ -/g, '- ')
  return totalTimes > 1 ? `(${sum}) ×${totalTimes}` : sum
}

/** Roll damage with Damage Effects: extra base dice, Rank dice, base and total multipliers. */
export function rollDamageWithEffects(a: AttackCalc, mods: DamageEffectMod[], opts: { crit?: boolean; amazing?: boolean }, rng: (n: number) => number = rollDie): DamageRoll {
  const dbl = (ds: Dice[]) => (opts.crit ? ds.map((x) => ({ ...x, count: x.count * 2 })) : ds)
  const roll = (ds: Dice[]) => ds.flatMap((x) => Array.from({ length: x.count }, () => rng(x.sides)))
  const baseFaces = roll(dbl(a.baseDice))
  const extraFaces = roll(dbl(mods.flatMap((m) => m.extraBase)))
  const effectRank: DicePool[] = mods.flatMap((m) => Array.from({ length: m.rankDice }, () => rankDamageDice(m.rank)))
  const rankFaces = roll([...a.rankDice.dice, ...effectRank.flatMap((p) => p.dice), ...a.ammoDice])
  const baseTimes = mods.reduce((p, m) => p * m.baseTimes, 1)
  const totalTimes = mods.reduce((p, m) => p * m.totalTimes, 1)
  const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0)
  const flat = a.damageFlat.total + a.rankDice.flat + effectRank.reduce((t, p) => t + p.flat, 0)
    + mods.reduce((t, m) => t + m.flat, 0) + (opts.amazing ? a.amazingBonus : 0)
  const before = sum(baseFaces) * baseTimes + sum(extraFaces) + sum(rankFaces) + flat
  const total = Math.max(0, before * totalTimes)
  const bits = [`base [${baseFaces.join(', ')}]${baseTimes > 1 ? ` ×${baseTimes}` : ''}`]
  if (extraFaces.length) bits.push(`effects [${extraFaces.join(', ')}]`)
  if (rankFaces.length) bits.push(`rank/ammo [${rankFaces.join(', ')}]`)
  if (flat) bits.push(`${flat >= 0 ? '+' : ''}${flat} mods`)
  if (opts.amazing) bits.push(`(incl. +${a.amazingBonus} Amazing)`)
  if (totalTimes > 1) bits.push(`= ${before}, ×${totalTimes}`)
  return { total, faces: [...baseFaces, ...extraFaces, ...rankFaces], crit: !!opts.crit, amazing: !!opts.amazing, breakdown: bits.join(' · ') }
}
