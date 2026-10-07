import { describe, expect, it } from 'vitest'
import { findSkill } from '../data'
import { newSkill } from './advancement'
import { attackCalc, describeWeapon, heldWeapon } from './attacks'
import { blankCharacter } from './character'
import { equipItem, unequipGear } from './items'
import { formatLootRow } from './lootbox'
import { applyClaim, planClaim } from './lootclaim'
import type { Character, WeaponStats } from './types'

const flameblade: WeaponStats = { dice: '1d12', bonus: 2, dtype: 'Fire', range: 'Melee 10ft' }

function swordsman(rank = 1, weapon?: WeaponStats): Character {
  const c = blankCharacter()
  c.skills = [...c.skills, { ...newSkill(findSkill('longsword'), 'Longsword', rank), wielded: true }]
  c.gear = [{ uid: 'g1', slot: 'hands', name: 'Flameblade', mods: [], notes: '', skillId: 'longsword', ...(weapon ? { weapon } : {}) }]
  return c
}
const longsword = (c: Character) => c.skills.find((s) => s.skillId === 'longsword')!

describe('weapon items with their own damage', () => {
  it('uses the Skill’s damage when the weapon has no stats of its own', () => {
    const c = swordsman()
    const a = attackCalc(c, longsword(c))
    expect(a.baseDice).toEqual([{ count: 1, sides: 8 }])
    expect(a.types).toEqual(['Slashing'])
    expect(a.weapon).toBeUndefined()
    expect(heldWeapon(c, longsword(c))).toBeUndefined()
  })

  it('replaces the base die, type and range, and adds the modifier; to-hit and Stat Mod still come from the Skill', () => {
    const plain = swordsman()
    const c = swordsman(1, flameblade)
    const a = attackCalc(c, longsword(c))
    expect(a.weapon).toBe('Flameblade')
    expect(a.baseDice).toEqual([{ count: 1, sides: 12 }])
    expect(a.types).toEqual(['Fire'])
    expect(a.range).toBe('Melee 10ft')
    expect(a.damageFlat.parts).toContainEqual({ label: 'Flameblade', value: 2 })
    expect(a.damageFlat.parts.some((p) => p.label === 'Str Mod')).toBe(true)
    expect(a.toHit.total).toBe(attackCalc(plain, longsword(plain)).toHit.total)
  })

  it('still adds the Skill’s Rank upgrade dice on top of the weapon’s die', () => {
    const c = swordsman(5, flameblade)
    expect(attackCalc(c, longsword(c)).baseDice).toEqual([{ count: 1, sides: 12 }, { count: 1, sides: 8 }])
  })

  it('an Inventory/Hotlist weapon can be passed in, and null ignores the held one', () => {
    const c = swordsman(1, flameblade)
    expect(attackCalc(c, longsword(c), undefined, { weapon: { name: 'Club of Ice', stats: { dice: '2d4', dtype: 'Ice' } } }).formula.startsWith('2d4')).toBe(true)
    expect(attackCalc(c, longsword(c), undefined, { weapon: null }).baseDice).toEqual([{ count: 1, sides: 8 }])
  })

  it('keeps its stats when unequipped to Inventory and equipped again', () => {
    const c = swordsman(1, flameblade)
    const off = unequipGear(c, 'g1')
    const item = off.inventory.find((i) => i.name === 'Flameblade')!
    expect(item.weapon).toEqual(flameblade)
    const on = equipItem(off, item.uid, 'hands')
    expect(on.gear.find((g) => g.name === 'Flameblade')?.weapon).toEqual(flameblade)
  })

  it('describes the stats in one line', () => {
    expect(describeWeapon(flameblade)).toBe('1d12+2 Fire · Melee 10ft')
    expect(describeWeapon({ bonus: -1 })).toBe('-1')
  })
})

describe('weapons from a loot box', () => {
  const row = { type: 'gear' as const, name: 'Flameblade', slot: 'Weapon', mods: [], condition: '', skillId: 'longsword', weapon: flameblade }

  it('shows the Skill and stats in the copy', () => {
    expect(formatLootRow(row)).toEqual({ head: 'Flameblade (Weapon)', text: ': Longsword Skill, 1d12+2 Fire · Melee 10ft' })
  })

  it('claims equipped in hand or into Inventory, keeping the Skill link and stats', () => {
    const claim = { v: 1 as const, id: 'w', name: 'Sword Fight', description: '', reward: '', rows: [row] }
    const c = blankCharacter()
    const changes = planClaim(c, claim)
    const equipped = applyClaim(c, claim, changes, { 0: { accept: true, choice: 'equip' } })
    expect(equipped.gear[0]).toMatchObject({ name: 'Flameblade', slot: 'hands', skillId: 'longsword', weapon: flameblade })
    const stored = applyClaim(c, claim, changes, { 0: { accept: true, choice: 'inventory' } })
    expect(stored.inventory[0]).toMatchObject({ name: 'Flameblade', kind: 'weapon', skillId: 'longsword', weapon: flameblade, slot: 'hands' })
  })
})
