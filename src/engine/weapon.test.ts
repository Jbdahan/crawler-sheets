import { describe, expect, it } from 'vitest'
import { findSkill } from '../data'
import { newSkill } from './advancement'
import { attackCalc, describeWeapon, heldWeapon } from './attacks'
import { blankCharacter } from './character'
import { ammoKey, ammoKeys, ammoSummary, spendAmmo, usesAmmo } from './ammo'
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

describe('custom weapons that fire ammo', () => {
  const plasma = { name: 'Plasma Cells', qty: 10, notes: '', kind: 'ammo' as const, skillId: 'Plasma Cells', ammo: { dice: '1d6', dtype: 'Electric', toHit: 1 } }
  function gunner(ammo: string): Character {
    const c = swordsman(1, { dice: '2d6', dtype: 'Force', range: '60 feet', ammo })
    c.inventory = [{ uid: 'cells', ...plasma }, { uid: 'bolts', name: 'Fire Bolts', qty: 3, notes: '', kind: 'ammo', skillId: 'crossbow', ammo: { dice: '1d4', dtype: 'Fire' } }]
    c.skills = c.skills.map((s) => (s.skillId === 'longsword' ? { ...s, ammoUid: ammo === 'crossbow' ? 'bolts' : 'cells' } : s))
    return c
  }

  it('a weapon on a non-ranged Skill can fire custom ammo; the loaded round adds its effect', () => {
    const c = gunner('Plasma Cells')
    const s = longsword(c)
    expect(ammoKey(c, s)).toBe('Plasma Cells')
    expect(usesAmmo(c, s)).toBe(true)
    expect(ammoKey(c, s, null)).toBeUndefined() // no weapon item: a Longsword fires nothing
    const a = attackCalc(c, s)
    expect(a.ammo?.name).toBe('Plasma Cells')
    expect(a.ammoDice).toEqual([{ count: 1, sides: 6 }])
    expect(a.types).toEqual(['Force', 'Electric'])
    expect(a.toHit.parts).toContainEqual({ label: 'Plasma Cells', value: 1 })
    expect(ammoKeys(c)).toContain('Plasma Cells')
    expect(ammoSummary(c, s)).toContain('Plasma Cells ×10 (loaded)')
  })

  it('spends one round per attack', () => {
    const c = gunner('Plasma Cells')
    const shot = spendAmmo(c, longsword(c))
    expect(shot.fired?.name).toBe('Plasma Cells')
    expect(shot.c.inventory.find((i) => i.uid === 'cells')?.qty).toBe(9)
  })

  it('can fire standard ammo too (a custom weapon that shoots Bolts uses Crossbow bolts)', () => {
    const c = gunner('crossbow')
    const a = attackCalc(c, longsword(c))
    expect(a.ammo?.name).toBe('Fire Bolts')
    // ammo loaded for a different ammo type isn't fired
    const wrong = { ...c, skills: c.skills.map((s) => (s.skillId === 'longsword' ? { ...s, ammoUid: 'cells' } : s)) }
    expect(attackCalc(wrong, longsword(wrong)).ammo).toBeUndefined()
  })

  it('describes the ammo it fires', () => {
    expect(describeWeapon({ dice: '2d6', ammo: 'crossbow' })).toBe('2d6 · fires Bolts')
    expect(describeWeapon({ ammo: 'Plasma Cells' })).toBe('fires Plasma Cells')
  })
})
