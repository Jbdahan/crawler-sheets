import { describe, expect, it } from 'vitest'
import { activateHotlist } from './actions'
import { blankCharacter, migrate } from './character'
import {
  addToHotlist, entryQty, hotlistSlotFor, hotlistSlotOfGear, hotlistSlotOfInventory,
  linkGearToHotlist, linkInventoryToHotlist, removeFromHotlist, setHotlistQty,
} from './inventory'
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

describe('Inventory items on the Hotlist', () => {
  it('stays in Inventory: the slot points at the item and shares its count', () => {
    const c = withInventory()
    expect(hotlistSlotFor(c, 'Scroll of Fireball')).toBe(1)
    const next = linkInventoryToHotlist(c, 'scroll')!
    expect(next.inventory.find((i) => i.uid === 'scroll')?.qty).toBe(2)
    expect(next.hotlist[1]).toMatchObject({ name: 'Scroll of Fireball', kind: 'item', invUid: 'scroll', consumable: true })
    expect(entryQty(next, next.hotlist[1]!)).toBe(2)
    expect(hotlistSlotOfInventory(next, 'scroll')).toBe(1)
    // linking again is a no-op
    expect(linkInventoryToHotlist(next, 'scroll')).toBe(next)
  })

  it('using it from the Hotlist uses up the Inventory item; catalog effects still apply', () => {
    let c = linkInventoryToHotlist(withInventory(), 'pots')!
    c = { ...c, health: { lost: 6, dying: null } }
    const r = activateHotlist(c, c.hotlist[1]!)
    expect(r.ok).toBe(true)
    expect(r.c.health.lost).toBe(1)
    expect(r.c.inventory.find((i) => i.uid === 'pots')?.qty).toBe(2)
    expect(entryQty(r.c, r.c.hotlist[1]!)).toBe(2)
  })

  it('changing the count on the Hotlist changes Inventory', () => {
    const c = linkInventoryToHotlist(withInventory(), 'pots')!
    expect(setHotlistQty(c, c.hotlist[1]!, 7).inventory.find((i) => i.uid === 'pots')?.qty).toBe(7)
  })

  it('removing it from the Hotlist leaves it in Inventory', () => {
    const c = removeFromHotlist(linkInventoryToHotlist(withInventory(), 'pots')!, 1)
    expect(c.hotlist[1]).toBeNull()
    expect(c.inventory.find((i) => i.uid === 'pots')?.qty).toBe(3)
  })

  it('refuses when the Hotlist is full or the chosen slot holds something else', () => {
    const c = withInventory()
    c.hotlist = Array.from({ length: HOTLIST_SIZE }, (_, i) => ({ uid: `h${i}`, name: `Thing ${i}`, qty: 1, kind: 'spell' as const, notes: '' }))
    expect(hotlistSlotFor(c, 'Scroll of Fireball')).toBe(-1)
    expect(linkInventoryToHotlist(c, 'scroll')).toBeNull()
    expect(addToHotlist(withInventory(), 'Bomb', 1, '', 0)).toBeNull() // slot 1 is the Heal spell
  })

  it('adding a new item to the Hotlist also puts it in Inventory', () => {
    const c = addToHotlist(withInventory(), 'Torch', 4, '')!
    const torch = c.inventory.find((i) => i.name === 'Torch')!
    expect(torch.qty).toBe(4)
    expect(c.hotlist[1]).toMatchObject({ invUid: torch.uid })
  })

  it('equipped gear can be shown on the Hotlist and stays equipped', () => {
    const c = withInventory()
    c.gear = [{ uid: 'shield', slot: 'hands', name: 'Riot Shield', mods: [], notes: '' }]
    const next = linkGearToHotlist(c, 'shield')!
    expect(next.gear).toHaveLength(1)
    expect(hotlistSlotOfGear(next, 'shield')).toBe(1)
    expect(next.hotlist[1]).toMatchObject({ gearUid: 'shield', consumable: false })
  })

  it('older saves: Hotlist items that left Inventory are put back and linked', () => {
    const old = withInventory()
    old.hotlist[2] = { uid: 'old', name: 'Healing Potion', qty: 2, kind: 'item', notes: '', consumable: true, heal: { slots: 5 } }
    old.hotlist[3] = { uid: 'old2', name: 'Lucky Coin', qty: 1, kind: 'item', notes: '', consumable: false }
    const c = migrate(old)
    expect(c.inventory.find((i) => i.uid === 'pots')?.qty).toBe(5)
    expect(c.hotlist[2]).toMatchObject({ invUid: 'pots', heal: { slots: 5 } })
    const coin = c.inventory.find((i) => i.name === 'Lucky Coin')!
    expect(c.hotlist[3]).toMatchObject({ invUid: coin.uid })
  })

  it('lets a claimed scroll or potion go straight to the Hotlist (and Inventory)', () => {
    const c = blankCharacter()
    const claim: LootClaim = { v: 1, id: 'b', name: 'Test', description: '', reward: '', rows: [
      { type: 'spell', prefix: 'Scroll', spell: 'Fireball', mana: '45' },
      { type: 'consumable', item: 'Healing Potion', qty: 2 },
    ] }
    const changes = planClaim(c, claim)
    expect(changes[0].choices?.map((x) => x.key)).toEqual(['inventory', 'hotlist'])
    const next = applyClaim(c, claim, changes, { 0: { accept: true, choice: 'hotlist' }, 1: { accept: true, choice: 'inventory' } })
    expect(next.hotlist[1]).toMatchObject({ name: 'Scroll of Fireball' })
    expect(entryQty(next, next.hotlist[1]!)).toBe(1)
    expect(next.inventory).toMatchObject([{ name: 'Scroll of Fireball', qty: 1 }, { name: 'Healing Potion', qty: 2 }])
    expect(next.log.map((l) => l.text)).toContain('Loot: Test: Scroll of Fireball (to Hotlist)')
  })
})
