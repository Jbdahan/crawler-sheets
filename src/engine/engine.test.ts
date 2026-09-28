import { describe, expect, it } from 'vitest'
import { CLASSES, RACES, findSkill } from '../data'
import { addSkillRanks, applyRaceClass, crawlerKillLevels, levelUp, newSkill, addGrind, resolveAdvancement, eligibleForAdvancement } from './advancement'
import { attackCalc, difficulty } from './attacks'
import { blankCharacter } from './character'
import { degreeOf, formatDice, netMode, parseDice, rankDamageDice } from './dice'
import { checkBonus, derive, statMod } from './derived'
import { addInjury, applyDamage, heal, previewDamage, rest } from './health'
import type { Character } from './types'

function crawler(overrides: Partial<Character> = {}): Character {
  return { ...blankCharacter(), ...overrides }
}

describe('Stat Mods (Table 2, p.57)', () => {
  it('matches every band boundary', () => {
    const cases: [number, number][] = [[1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3], [10, 4], [19, 4], [20, 5], [49, 5],
      [50, 6], [99, 6], [100, 7], [149, 7], [150, 8], [199, 8], [200, 9], [299, 9], [300, 10]]
    for (const [score, mod] of cases) expect(statMod(score)).toBe(mod)
  })
})

describe('Checks', () => {
  it("Keisha's Engineering check: 16 + Int 2 + Rank 5 = 23 (p.62)", () => {
    let c = crawler({ base: { str: 3, int: 4, con: 3, dex: 3, cha: 3 } })
    c = addSkillRanks(c, 'Engineering', 5, 'test')
    const s = c.skills.find((x) => x.skillId === 'engineering')!
    expect(16 + checkBonus(c, s).total).toBe(23)
  })

  it('degrees of success (p.60–61)', () => {
    expect(degreeOf(20, 5, 30)).toBe('critical-hit')
    expect(degreeOf(1, 40, 10)).toBe('critical-fail')
    expect(degreeOf(12, 25, 15)).toBe('amazing')
    expect(degreeOf(12, 15, 15)).toBe('success')
    expect(degreeOf(12, 13, 15)).toBe('near-miss')
    expect(degreeOf(12, 12, 15)).toBe('fail')
    expect(degreeOf(12, 5, 15)).toBe('major-fail')
  })

  it('advantage and disadvantage cancel (p.60)', () => {
    expect(netMode(2, 1)).toBe('normal')
    expect(netMode(1, 0)).toBe('advantage')
    expect(netMode(0, 3)).toBe('disadvantage')
  })

  it('difficulties (p.59)', () => {
    expect(difficulty.unopposed(4)).toBe(18)
    expect(difficulty.stat(3)).toBe(13)
    expect(difficulty.opposed(4, 2)).toBe(16)
  })
})

describe('Attacks', () => {
  it('Warhammer at Rank 10 is 3d10+Str, crit 6d10+Str (p.91)', () => {
    let c = crawler({ base: { str: 20, int: 3, con: 3, dex: 3, cha: 3 } })
    c = { ...c, skills: [...c.skills, { ...newSkill(findSkill('warhammer'), 'Warhammer', 10) }] }
    const a = attackCalc(c, c.skills.find((s) => s.skillId === 'warhammer')!)
    expect(a.formula).toBe('3d10+5')
    expect(a.critFormula).toBe('6d10+5')
    expect(a.toHit.total).toBe(15)
  })

  it('Amazing Success adds the Floor number (p.90)', () => {
    let c = crawler({ floor: 4 })
    c = addSkillRanks(c, 'Club', 3, 'test')
    expect(attackCalc(c, c.skills.find((s) => s.skillId === 'club')!).amazingBonus).toBe(4)
  })

  it('attack numbers follow Stat changes', () => {
    let c = crawler({ base: { str: 5, int: 3, con: 3, dex: 3, cha: 3 } })
    c = addSkillRanks(c, 'Longsword', 3, 'test')
    const s = () => c.skills.find((x) => x.skillId === 'longsword')!
    expect(attackCalc(c, s()).toHit.total).toBe(5)
    c = { ...c, statPoints: { ...c.statPoints, str: 1 } }
    expect(attackCalc(c, s()).toHit.total).toBe(6)
    expect(attackCalc(c, s()).formula).toBe('1d8+3')
  })

  it('spells add Int to damage and show Mana', () => {
    let c = crawler({ base: { str: 3, int: 6, con: 3, dex: 3, cha: 3 } })
    c = addSkillRanks(c, 'Fire Fingers', 3, 'test')
    const a = attackCalc(c, c.skills.find((s) => s.skillId === 'fire-fingers')!)
    expect(a.formula).toBe('1d4+3')
    expect(a.mana).toBe(3)
  })

  it('Rank damage die is added but not doubled on a crit (Bow Rank 10)', () => {
    let c = crawler({ base: { str: 3, int: 3, con: 3, dex: 6, cha: 3 } })
    c = addSkillRanks(c, 'Bow', 10, 'test')
    const a = attackCalc(c, c.skills.find((s) => s.skillId === 'bow')!)
    expect(a.formula).toBe('3d6 + 1d10+2')
    expect(a.critFormula).toBe('6d6 + 1d10+2')
  })

  it('Woozy removes Dex from Dex attacks and Evade', () => {
    let c = crawler({ base: { str: 3, int: 3, con: 3, dex: 10, cha: 3 } })
    c = addSkillRanks(c, 'Rapier', 2, 'test')
    expect(derive(c).evade.total).toBe(4)
    c = { ...c, effects: [{ uid: 'w', kind: 'debuff', refId: 'woozy', name: 'Woozy', stacks: 1, active: true, mods: [], notes: '' }] }
    expect(derive(c).evade.total).toBe(0)
    expect(attackCalc(c, c.skills.find((s) => s.skillId === 'rapier')!).toHit.total).toBe(2)
  })
})

describe('Rank damage dice (Table 37, p.176)', () => {
  it('scales with Rank', () => {
    expect(rankDamageDice(1)).toEqual({ dice: [], flat: 1 })
    expect(formatDice(rankDamageDice(7).dice)).toBe('1d6')
    expect(formatDice(rankDamageDice(14).dice)).toBe('1d8 + 1d6')
    expect(formatDice(rankDamageDice(20).dice)).toBe('2d10')
  })
  it('parses dice expressions', () => {
    expect(parseDice('2d6+3')).toEqual({ dice: [{ count: 2, sides: 6 }], flat: 3 })
    expect(parseDice('x')).toBeNull()
  })
})

describe('Health', () => {
  it('22 damage with 4 per slot loses 5 slots (p.94)', () => {
    const c = crawler({ base: { str: 3, int: 3, con: 10, dex: 3, cha: 3 } })
    const r = previewDamage(c, { amount: 22 })
    expect(r.slotValue).toBe(4)
    expect(r.slotsLost).toBe(5)
  })

  it('applies DR, then Resistance; Debuff damage skips DR', () => {
    let c = crawler({ base: { str: 3, int: 3, con: 10, dex: 3, cha: 3 } })
    c = { ...c, gear: [{ uid: 'a', slot: 'torso', name: 'Armor', mods: [{ target: 'dr', value: 2 }, { target: 'resist:Fire', value: 1 }], notes: '' }] }
    expect(previewDamage(c, { amount: 22, type: 'Fire' }).finalDamage).toBe(10)
    expect(previewDamage(c, { amount: 22, fromDebuff: true }).finalDamage).toBe(22)
  })

  it('reaching 0% starts Dying at Con Mod; healing clears it', () => {
    let c = crawler({ base: { str: 3, int: 3, con: 6, dex: 3, cha: 3 } })
    c = applyDamage(c, previewDamage(c, { amount: 100 }))
    expect(c.health.lost).toBe(10)
    expect(c.health.dying).toBe(3)
    expect(c.effects.some((e) => e.refId === 'dying')).toBe(true)
    c = heal(c, 2)
    expect(c.health).toEqual({ lost: 8, dying: null })
    expect(c.effects.some((e) => e.refId === 'dying')).toBe(false)
  })

  it('rests heal slots and Mana (p.94)', () => {
    let c = crawler({ base: { str: 3, int: 15, con: 3, dex: 3, cha: 3 }, mana: 0, health: { lost: 8, dying: null } })
    c = rest(c, 'short')
    expect(c.health.lost).toBe(3)
    expect(c.mana).toBe(7)
    c = rest(c, 'long')
    expect(c.health.lost).toBe(0)
    expect(c.mana).toBe(15)
  })

  it('a second Minor Injury becomes Long-Term (p.96) and costs −2 on Checks', () => {
    let c = addInjury(crawler(), 'minor')
    expect(derive(c).allChecks.total).toBe(-2)
    c = addInjury(c, 'minor')
    expect(c.effects.map((e) => e.refId)).toEqual(['long-term-minor-injury'])
  })
})

describe('Advancement', () => {
  it('Level 10 has banked 27 Stat points (p.128)', () => {
    const c = levelUp(crawler(), 9, 'tutorial floors')
    expect(c.level).toBe(10)
    expect(c.pendingStatPoints).toBe(27)
  })

  it('crawler kill levels (p.169)', () => {
    expect(crawlerKillLevels(4, 10, 14)).toBe(8)
    expect(crawlerKillLevels(6, 5, 30)).toBe(15)
    expect(crawlerKillLevels(2, 20, 10)).toBe(1)
  })

  it('Race & Class Skill bonuses stop at Rank 10 (p.128)', () => {
    let c = addSkillRanks(crawler(), 'Pugilism', 9, 'test')
    const amazonian = RACES.find((r) => r.id === 'amazonian')!
    c = applyRaceClass(c, amazonian, { picks: [] })
    expect(c.skills.find((s) => s.skillId === 'pugilism')!.rank).toBe(10)
    expect(c.skills.find((s) => s.skillId === 'bow')!.rank).toBe(2)
    expect(derive(c).unenhanced.str).toBe(9)
    expect(derive(c).dr.total).toBe(2)
    expect(c.size).toBe(4)
    const fighter = CLASSES.find((x) => x.id === 'boring-ol-fighter')!
    c = applyRaceClass(c, fighter, { picks: [{ name: 'Bow', ranks: 5 }] })
    expect(c.skills.find((s) => s.skillId === 'bow')!.rank).toBe(7)
    expect(derive(c).evade.total).toBeGreaterThan(0)
  })

  it('advancement checks: Rank ≤4 every 2 hours, d20 ≥ Rank', () => {
    let c = addSkillRanks(crawler(), 'Perception', 3, 'test')
    c = { ...c, skills: c.skills.map((s) => (s.skillId === 'perception' ? { ...s, marked: true } : s)) }
    const el = eligibleForAdvancement(c, 'twoHours')
    expect(el.map((s) => s.skillId)).toEqual(['perception'])
    expect(eligibleForAdvancement(c, 'endOfFloor')).toEqual([])
    c = resolveAdvancement(c, [{ uid: el[0].uid, roll: 3 }])
    expect(c.skills.find((s) => s.skillId === 'perception')!).toMatchObject({ rank: 4, marked: false })
  })

  it('grinding hours equal to Level grant a Level (p.171)', () => {
    let c = levelUp(crawler(), 5, 'test') // level 6
    c = addSkillRanks(c, 'Club', 2, 'test')
    const club = c.skills.find((s) => s.skillId === 'club')!
    const r = addGrind(c, [{ uid: club.uid, hours: 6 }], 6)
    expect(r.levels).toBe(1)
    expect(r.c.level).toBe(7)
    expect(r.ready).toEqual([club.uid])
  })
})
