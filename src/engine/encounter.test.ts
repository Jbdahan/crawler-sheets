import { describe, expect, it } from 'vitest'
import { MONSTERS } from '../data/monsters'
import { categoryOf, groupMonsters, hbTotal, pickedList, withFloor } from './encounter'

describe('encounter sheet', () => {
  it('resolves +F for the chosen Floor', () => {
    expect(withFloor('15+F', 3)).toBe('18')
    expect(withFloor('2d6+F Acid', 4)).toBe('2d6+4 Acid')
    expect(withFloor('F', 5)).toBe('5')
    expect(withFloor('20+S', 3)).toBe('20+S')
    expect(withFloor('15+F', 0)).toBe('15+F')
  })

  it('totals the Health Bar (Bugaboo: 10 slots × 5)', () => {
    const bugaboo = MONSTERS.find((m) => m.name === 'Bugaboo')!
    expect(bugaboo.hb).toEqual({ slots: 10, per: 5 })
    expect(hbTotal(bugaboo)).toBe(50)
  })

  it('groups Mobs, then NPCs & Crawlers, then Bosses, each in its own groups', () => {
    for (const order of ['book', 'level'] as const) {
      const groups = groupMonsters(MONSTERS, order)
      const cats = groups.map((g) => g.category)
      expect(cats.indexOf('npcs')).toBeGreaterThan(cats.lastIndexOf('mobs'))
      expect(cats.indexOf('bosses')).toBeGreaterThan(cats.lastIndexOf('npcs'))
      for (const g of groups) expect(g.items.every((m) => categoryOf(m) === g.category)).toBe(true)
      expect(groups.reduce((a, g) => a + g.items.length, 0)).toBe(MONSTERS.length)
    }
    expect(MONSTERS.filter((m) => categoryOf(m) === 'npcs').every((m) => m.tier === 'NPC' || m.tier === 'Crawler')).toBe(true)
  })

  it('orders by Level inside Table 51 bands (Bugaboo, Level 22, in 10–29)', () => {
    const groups = groupMonsters(MONSTERS, 'level')
    const band = groups.find((g) => g.items.some((m) => m.name === 'Bugaboo'))!
    expect(band).toMatchObject({ category: 'mobs', title: 'Level 10–29', sub: 'Floors 3–4' })
    const levels = band.items.map((m) => m.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('lists picks with Bosses last', () => {
    const boss = MONSTERS.find((m) => m.boss)!
    const mob = MONSTERS.find((m) => !m.boss)!
    const list = pickedList({ name: '', floor: 0, picks: { [boss.id]: 1, [mob.id]: 3 } })
    expect(list.map((x) => [x.m.id, x.qty])).toEqual([[mob.id, 3], [boss.id, 1]])
  })
})
