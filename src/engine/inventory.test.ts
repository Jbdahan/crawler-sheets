import { describe, expect, it } from 'vitest'
import { blankCharacter } from './character'
import { addToHotlist, hotlistSlotFor, moveHotlistToInventory, moveInventoryToHotlist } from './inventory'
import { applyClaim, planClaim, type LootClaim } from './lootclaim'
import { HOTLIST_SIZE } from './types'

const withInventory = () => {
  const c = blankCharacter() // slot 1 holds Heal
  c.inventory = [
    { uid: 'scroll', name: 'Scroll of Fireball', qty: 2, notes: '45 Mana' },
    { uid: 'pots', name: 'Healing Potion', qty: 3, notes: '' },
  ]
  return c
}

describe('Inventory ↔ Hotlist', () => {
  it('moves some or all of an item into the first free slot', () => {
    const c = withInventory()
    expect(hotlistSlotFor(c, 'Scroll of Fireball')).toBe(1)
    const one = moveInventoryToHotlist(c, 'scroll', 1)!
    expect(one.hotlist[1]).toMatchObject({ name: 'Scroll of Fireball', qty: 1, kind: 'item', consumable: true, notes: '45 Mana' })
    expect(one.inventory.find((i) => i.uid === 'scroll')?.qty).toBe(1)
    // the rest stacks onto the same slot and leaves Inventory
    const all = moveInventoryToHotlist(one, 'scroll')!
    expect(all.hotlist[1]?.qty).toBe(2)
    expect(all.inventory.some((i) => i.uid === 'scroll')).toBe(false)
  })

  it('keeps catalog item effects so potions still heal when used', () => {
    const next = moveInventoryToHotlist(withInventory(), 'pots')!
    expect(next.hotlist[1]).toMatchObject({ name: 'Healing Potion', qty: 3, heal: { slots: 5 } })
  })

  it('refuses when the Hotlist is full or the chosen slot holds something else', () => {
    const c = withInventory()
    c.hotlist = Array.from({ length: HOTLIST_SIZE }, (_, i) => ({ uid: `h${i}`, name: `Thing ${i}`, qty: 1, kind: 'item' as const, notes: '' }))
    expect(hotlistSlotFor(c, 'Scroll of Fireball')).toBe(-1)
    expect(moveInventoryToHotlist(c, 'scroll')).toBeNull()
    expect(addToHotlist(withInventory(), 'Bomb', 1, '', 0)).toBeNull() // slot 1 is the Heal spell
  })

  it('moves a Hotlist item back into Inventory', () => {
    const on = moveInventoryToHotlist(withInventory(), 'pots', 2)!
    const back = moveHotlistToInventory(on, 1)
    expect(back.hotlist[1]).toBeNull()
    expect(back.inventory.find((i) => i.name === 'Healing Potion')?.qty).toBe(3)
  })

  it('lets a claimed scroll or potion go straight to the Hotlist', () => {
    const c = blankCharacter()
    const claim: LootClaim = { v: 1, id: 'b', name: 'Test', description: '', reward: '', rows: [
      { type: 'spell', prefix: 'Scroll', spell: 'Fireball', mana: '45' },
      { type: 'consumable', item: 'Healing Potion', qty: 2 },
    ] }
    const changes = planClaim(c, claim)
    expect(changes[0].choices?.map((x) => x.key)).toEqual(['inventory', 'hotlist'])
    const next = applyClaim(c, claim, changes, { 0: { accept: true, choice: 'hotlist' }, 1: { accept: true, choice: 'inventory' } })
    expect(next.hotlist[1]).toMatchObject({ name: 'Scroll of Fireball', qty: 1 })
    expect(next.inventory).toMatchObject([{ name: 'Healing Potion', qty: 2 }])
    expect(next.log.map((l) => l.text)).toContain('Loot: Test: Scroll of Fireball (to Hotlist)')
  })
})
