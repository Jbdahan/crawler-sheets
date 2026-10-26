import { describe, expect, it } from 'vitest'
import { MONSTERS } from '../data/monsters'
import {
  attackLine, damageDice, distributeStats, fromMonster, healthBar, newCustomMob, statBudget, statSpent, suggestLevel, toMonster,
} from './customMob'

describe('custom Mobs (Core pp.270–273)', () => {
  it('gives a Level 6 Mob 18 stat points on a base of 1 (book example)', () => {
    expect(statBudget('Mob', 6)).toBe(18)
    const stats = distributeStats('Mob', 6, 'brute')
    expect(statSpent({ tier: 'Mob', stats })).toBe(18)
    expect(Math.min(...Object.values(stats))).toBeGreaterThanOrEqual(1)
  })

  it('gives Bosses a base of 5 and Table 50 points per Level', () => {
    const stats = distributeStats('Borough Boss', 40, 'caster')
    expect(statSpent({ tier: 'Borough Boss', stats })).toBe(160)
    expect(Math.min(...Object.values(stats))).toBeGreaterThanOrEqual(5)
  })

  it('sizes the Health Bar: Mobs one slot per Level up to 10, Bosses Table 50 + Floor, Con Mod per slot', () => {
    const stats = { str: 3, int: 1, con: 3, dex: 6, cha: 1 }
    expect(healthBar({ tier: 'Mob', level: 3, floor: 1, stats })).toEqual({ slots: 3, per: 2 }) // Bad Llama
    expect(healthBar({ tier: 'Mob', level: 22, floor: 3, stats })).toEqual({ slots: 10, per: 2 })
    expect(healthBar({ tier: 'City Boss', level: 55, floor: 3, stats })).toEqual({ slots: 23, per: 2 })
  })

  it('works out Surprise and Evade as 10 + Mod + F (book example: Int +2, Dex +4)', () => {
    const m = { ...newCustomMob(3), stats: { str: 1, int: 3, con: 1, dex: 10, cha: 1 } }
    const def = toMonster(m)
    expect(def.surprise).toBe('12+F')
    expect(def.evade).toBe('14+F')
    expect(def.dr).toBe('3')
  })

  it('uses Table 51 damage dice and the book stat blocks’ to-hit (Bugaboo Boo Hug: 15+F, 3d8+5)', () => {
    expect(damageDice(3)).toBe(1)
    expect(damageDice(11)).toBe(3)
    expect(damageDice(75)).toBe(7)
    const line = attackLine({ name: 'Boo Hug', stat: 'str', dice: 3, sides: 8, dmgType: 'Bludgeoning', reach: '5ft range', addMod: true, noDamage: false, effect: 'Hit: Held' },
      { str: 21, int: 13, con: 21, dex: 10, cha: 6 })
    expect(line).toEqual({ name: 'Boo Hug', hit: '15+F', text: '3d8+5 Bludg, 5ft', fx: ['Hit: Held'] })
  })

  it('suggests Levels from the Floor: Third Floor Mobs 10–29, its Bosses one row down (30–59)', () => {
    const mob = suggestLevel('Mob', 3)
    expect(mob).toBeGreaterThanOrEqual(10)
    expect(mob).toBeLessThanOrEqual(29)
    const hood = suggestLevel('Neighborhood Boss', 3)
    const borough = suggestLevel('Borough Boss', 3)
    const city = suggestLevel('City Boss', 3)
    expect(hood).toBeGreaterThanOrEqual(30)
    expect(hood).toBeLessThan(borough)
    expect(borough).toBeLessThan(city)
    expect(city).toBeLessThanOrEqual(59)
  })

  it('copies every book stat block into a custom Mob that prints the same', () => {
    for (const def of MONSTERS) {
      const back = toMonster(fromMonster(def))
      const pick = (m: typeof def) => [m.level, m.surprise, m.evade, m.move, m.dr, m.hb, m.stats, m.attacks.map((a) => [a.name, a.hit, a.text])]
      expect(pick(back), def.name).toEqual(pick(def))
    }
  })

  it('lets a copy be tweaked: more Str raises the Bugaboo’s to-hit and damage', () => {
    const bugaboo = MONSTERS.find((m) => m.name === 'Bugaboo')!
    const copy = fromMonster(bugaboo)
    expect(copy.attacks[0]).toMatchObject({ name: 'Boo Hug', stat: 'str', dice: 3, sides: 8, addMod: true })
    copy.stats.str = 60 // Mod +6
    expect(toMonster(copy).attacks[0]).toMatchObject({ hit: '16+F', text: '3d8+6 Bludg, 5ft' })
  })
})
