import { describe, expect, it } from 'vitest'
import { blankCharacter } from './character'
import { addInventoryItems, parseItemLines } from './inventory'

describe('Pasting a list into Inventory', () => {
  it('reads one item per line with quantities and notes', () => {
    const items = parseItemLines(`
      3x Torch
      Rope - 50 feet
      Goblin Dynamite x2
      • Snack Bar (4)
      12 googly eyes
      1. Lego minifig

      torch
    `)
    expect(items).toEqual([
      { name: 'Torch', qty: 4, notes: '' },
      { name: 'Rope', qty: 1, notes: '50 feet' },
      { name: 'Goblin Dynamite', qty: 2, notes: '' },
      { name: 'Snack Bar', qty: 4, notes: '' },
      { name: 'googly eyes', qty: 12, notes: '' },
      { name: 'Lego minifig', qty: 1, notes: '' },
    ])
  })

  it('stacks onto items already in Inventory', () => {
    let c = blankCharacter()
    c = addInventoryItems(c, [{ name: 'Torch', qty: 2, notes: '' }])
    c = addInventoryItems(c, parseItemLines('Torch x3\nBandage'))
    expect(c.inventory.map((i) => [i.name, i.qty])).toEqual([['Torch', 5], ['Bandage', 1]])
  })
})
