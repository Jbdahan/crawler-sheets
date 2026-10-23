import { describe, expect, it } from 'vitest'
import { findSkill } from '../data'
import { newSkill } from './advancement'
import { attackCalc } from './attacks'
import { blankCharacter } from './character'
import { damageEffectMod, damageEffectsFor, effectFormula, rollDamageWithEffects } from './damageEffects'
import { derive } from './derived'

function kicker(smushRank = 1) {
  const c = blankCharacter()
  const fs = newSkill(findSkill('foot-soldier'), 'Foot Soldier', 3)
  const smush = newSkill(findSkill('smush'), 'Smush', smushRank)
  const ps = newSkill(findSkill('powerful-strike'), 'Powerful Strike', 4)
  const iron = newSkill(findSkill('iron-punch'), 'Iron Punch', 1)
  c.skills.push(fs, smush, ps, iron)
  return { c, fs, smush, ps }
}

describe('Damage Effects on an attack', () => {
  it('Foot Soldier offers Smush and Powerful Strike, not Iron Punch', () => {
    const { c, fs } = kicker()
    expect(damageEffectsFor(c, fs).map((s) => s.name).sort()).toEqual(['Powerful Strike', 'Smush'])
  })

  it('Smush doubles the total at Rank 1 and triples it at Rank 5', () => {
    const { c, smush } = kicker()
    const d = derive(c)
    expect(damageEffectMod(smush, 1, d)).toMatchObject({ totalTimes: 2, condition: 'target at 20% Health Bar or less', tag: '×2' })
    expect(damageEffectMod(smush, 5, d)).toMatchObject({ totalTimes: 3, condition: 'target at 30% Health Bar or less' })
  })

  it('rolls (base + mods) × 2 with Smush, and multiplies base dice by Rank with Powerful Strike', () => {
    const { c, fs, smush, ps } = kicker()
    const d = derive(c)
    const a = attackCalc(c, fs, d)
    const ones = () => 1
    const plain = a.baseDice.reduce((t, x) => t + x.count, 0) + a.rankDice.dice.reduce((t, x) => t + x.count, 0) + a.damageFlat.total + a.rankDice.flat
    expect(rollDamageWithEffects(a, [damageEffectMod(smush, 1, d)], {}, ones).total).toBe(plain * 2)
    const base = a.baseDice.reduce((t, x) => t + x.count, 0)
    expect(rollDamageWithEffects(a, [damageEffectMod(ps, 4, d)], {}, ones).total).toBe(plain - base + base * 4)
    expect(effectFormula(a, [damageEffectMod(smush, 1, d)], false)).toMatch(/^\(.+\) ×2$/)
  })
})
