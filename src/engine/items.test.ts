import { describe, expect, it } from 'vitest'
import { findLoot, inferItem, weaponSkillFor } from '../data/loot'
import { attackCalc } from './attacks'
import { blankCharacter, migrate } from './character'
import { newSkill } from './advancement'
import { findSkill } from '../data'
import { addItem, drinkSkillPotion, equipItem, lootItem, readSpellbook, scrollSkill, unequipGear, weaponSkill } from './items'
import { derive } from './derived'

describe('Inventory loot', () => {
  it('links weapon names to their Attack Skill', () => {
    expect(weaponSkillFor('Rusty Dagger')).toBe('dagger')
    expect(weaponSkillFor('Kitchen knife')).toBe('dagger')
    expect(weaponSkillFor('Scroll of Fireball')).toBeUndefined()
    expect(inferItem({ uid: 'a', name: 'Scroll of Magic Missile (Rank 5)', qty: 1, notes: '' })).toMatchObject({ kind: 'scroll', skillId: 'magic-missile', rank: 5 })
    expect(inferItem({ uid: 'b', name: 'Spellbook of Hole (Rank 2)', qty: 1, notes: '' })).toMatchObject({ kind: 'book', skillId: 'hole', rank: 2 })
  })

  it('a dagger uses the Dagger Skill; untrained rolls with Disadvantage', () => {
    const c = blankCharacter()
    expect(weaponSkill(c, 'dagger').rank).toBe(0)
    expect(attackCalc(c, weaponSkill(c, 'dagger')).mode).toBe('disadvantage')
    c.skills.push(newSkill(findSkill('dagger'), 'Dagger', 4))
    expect(weaponSkill(c, 'dagger').rank).toBe(4)
  })

  it('equipping keeps bonuses and the weapon link, and unequipping keeps them too', () => {
    let c = blankCharacter()
    c.skills.push(newSkill(findSkill('dagger'), 'Dagger', 3))
    const added = addItem(c, lootItem(findLoot('sassy-stiletto')!))
    c = equipItem(added.c, added.invUid, 'hands')
    expect(c.inventory).toHaveLength(0)
    expect(c.gear[0]).toMatchObject({ skillId: 'dagger', slot: 'hands' })
    expect(c.skills.find((s) => s.skillId === 'dagger')?.wielded).toBe(true)
    expect(derive(c).enhanced.dex).toBe(c.base.dex + 5)
    c = unequipGear(c, c.gear[0].uid)
    expect(c.inventory[0]).toMatchObject({ kind: 'weapon', skillId: 'dagger' })
    expect(c.inventory[0].mods).toHaveLength(5)
  })

  it('a ring gives its Stat bonus only while equipped', () => {
    let c = blankCharacter()
    const added = addItem(c, lootItem(findLoot('silver-ring')!, { stat: 'cha' }))
    expect(added.c.inventory[0].name).toBe('Silver Ring of +2 Charisma')
    expect(derive(added.c).enhanced.cha).toBe(c.base.cha)
    c = equipItem(added.c, added.invUid, 'accessory')
    expect(derive(c).enhanced.cha).toBe(c.base.cha + 2)
  })

  it('reading a Spellbook learns the Spell and uses up the book', () => {
    const added = addItem(blankCharacter(), lootItem(findLoot('spellbook')!, { spellId: 'hole', rank: 3 }))
    const r = readSpellbook(added.c, added.invUid)
    expect(r.c.skills.find((s) => s.skillId === 'hole')?.rank).toBe(3)
    expect(r.c.inventory).toHaveLength(0)
  })

  it('a scroll casts at its Rank with no Mana', () => {
    const it = lootItem(findLoot('spell-scroll')!, { spellId: 'magic-missile', rank: 5 })
    expect(it.name).toBe('Scroll of Magic Missile (Rank 5)')
    expect(scrollSkill(it)).toMatchObject({ rank: 5, customMana: 0 })
  })

  it('a Potion of +2 Skill adds 2 Ranks', () => {
    const base = blankCharacter()
    const added = addItem(base, lootItem(findLoot('skill-potion-2')!))
    const heal = base.skills[0]
    const r = drinkSkillPotion(added.c, added.invUid, heal.uid)
    expect(r.c.skills[0].rank).toBe(Math.min(heal.max, heal.rank + 2))
    expect(r.c.inventory).toHaveLength(0)
  })

  it('older saves get their weapons linked', () => {
    const old = blankCharacter()
    old.inventory = [{ uid: 'k', name: 'Dagger', qty: 1, notes: '' }]
    old.gear = [{ uid: 'g', slot: 'hands', name: 'Fire Axe', mods: [], notes: '' }]
    const c = migrate(old)
    expect(c.inventory[0]).toMatchObject({ kind: 'weapon', skillId: 'dagger' })
    expect(c.gear[0].skillId).toBe('axe')
  })
})
