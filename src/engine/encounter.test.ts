import { describe, expect, it } from 'vitest'
import { MONSTERS } from '../data/monsters'
import { groupMonsters, hbTotal, pickedList, withFloor } from './encounter'

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

  it('keeps Bosses in their own groups after the Mobs', () => {
    const groups = groupMonsters(MONSTERS)
    const firstBoss = groups.findIndex((g) => g.part === 'Bosses')
    expect(firstBoss).toBeGreaterThan(0)
    expect(groups.slice(firstBoss).every((g) => g.part === 'Bosses' && g.items.every((m) => m.boss))).toBe(true)
    expect(groups.slice(0, firstBoss).every((g) => g.items.every((m) => !m.boss))).toBe(true)
  })

  it('lists picks with Bosses last', () => {
    const boss = MONSTERS.find((m) => m.boss)!
    const mob = MONSTERS.find((m) => !m.boss)!
    const list = pickedList({ name: '', floor: 0, picks: { [boss.id]: 1, [mob.id]: 3 } })
    expect(list.map((x) => [x.m.id, x.qty])).toEqual([[mob.id, 3], [boss.id, 1]])
  })
})
