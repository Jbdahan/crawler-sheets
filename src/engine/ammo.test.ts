import { describe, expect, it } from 'vitest'
import { findSkill } from '../data'
import { findLoot, inferItem } from '../data/loot'
import { eligibleForAdvancement, newSkill, resolveAdvancement } from './advancement'
import { spendAmmo } from './ammo'
import { attackCalc, rollDamage } from './attacks'
import { blankCharacter } from './character'
import { addItem, lootItem, syncGearSkills } from './items'

function crossbower() {
  const c = blankCharacter()
  const xbow = newSkill(findSkill('crossbow'), 'Crossbow', 5)
  c.skills.push(xbow)
  const fire = addItem(c, lootItem(findLoot('ammo-fire')!, { weapon: 'crossbow', qty: 2 }))
  return { c: fire.c, xbow, fireUid: fire.invUid }
}

describe('Ammunition', () => {
  it('names and links ammo to its weapon', () => {
    const { c } = crossbower()
    expect(c.inventory[0]).toMatchObject({ name: 'Fire Bolts', kind: 'ammo', skillId: 'crossbow', qty: 2 })
    expect(inferItem({ uid: 'x', name: 'Silver Arrows', qty: 5, notes: '' })).toMatchObject({ kind: 'ammo', skillId: 'bow' })
  })

  it('loaded special ammo adds its dice (not doubled on a crit) and Debuff note', () => {
    const { c, xbow, fireUid } = crossbower()
    const s = { ...xbow, ammoUid: fireUid }
    const a = attackCalc(c, s)
    expect(a.formula).toContain('1d6')
    expect(a.types).toContain('Fire')
    expect(a.critFormula).toContain('1d6') // ammo die stays single
    expect(a.critFormula).not.toContain('2d6')
    expect(a.notes.at(-1)).toMatch(/Burned on an Amazing Success/)
    expect(rollDamage(a, { crit: true }, () => 1).faces.length).toBe(a.baseDice.reduce((n, d) => n + d.count * 2, 0) + 1)
  })

  it('spends one per Attack, then falls back to basic', () => {
    const { c, xbow, fireUid } = crossbower()
    const s = { ...xbow, ammoUid: fireUid }
    let x = { ...c, skills: c.skills.map((k) => (k.uid === s.uid ? s : k)) }
    let r = spendAmmo(x, s)
    expect(r.fired?.name).toBe('Fire Bolts')
    x = spendAmmo(r.c, s).c
    expect(x.inventory[0].qty).toBe(0)
    r = spendAmmo(x, s)
    expect(r.fired).toBeUndefined()
    expect(r.note).toMatch(/Out of Fire Bolts/)
    expect(attackCalc(x, s).formula).not.toContain('1d6')
  })

  it('basic ammo is only counted when tracked', () => {
    const { c, xbow } = crossbower()
    const basic = addItem(c, lootItem(findLoot('ammo-basic')!, { weapon: 'crossbow', qty: 3 }))
    expect(spendAmmo(basic.c, xbow).c).toBe(basic.c)
    const tracked = { ...xbow, trackBasicAmmo: true }
    const r = spendAmmo(basic.c, tracked)
    expect(r.c.inventory.find((i) => i.uid === basic.invUid)?.qty).toBe(2)
    expect(r.note).toBe('Basic Bolts: 2 left')
  })

  it('a crossbow that grants +3 Crossbow counts as trained while equipped', () => {
    let c = blankCharacter()
    c.gear = [{ uid: 'xb', slot: 'hands', name: 'Custom Crossbow', skillId: 'crossbow', mods: [{ target: 'skill:crossbow', value: 3 }], notes: '' }]
    c = syncGearSkills(c)
    const s = c.skills.find((k) => k.skillId === 'crossbow')!
    expect(s.rank).toBe(0)
    const a = attackCalc(c, s)
    expect(a.rank).toBe(3)
    expect(a.mode).toBe('normal')
    // using it marks it; the advancement check (d20 ≥ Rank 0) makes Rank 1 its own
    const marked = { ...c, skills: c.skills.map((k) => (k.uid === s.uid ? { ...k, marked: true } : k)) }
    expect(eligibleForAdvancement(marked, 'twoHours').map((k) => k.uid)).toEqual([s.uid])
    const trained = resolveAdvancement(marked, [{ uid: s.uid, roll: 1 }])
    expect(syncGearSkills({ ...trained, gear: [] }).skills.find((k) => k.skillId === 'crossbow')?.rank).toBe(1)
    // unequipped: the gear-only Skill goes away
    expect(syncGearSkills({ ...c, gear: [] }).skills.some((k) => k.skillId === 'crossbow')).toBe(false)
  })
})
