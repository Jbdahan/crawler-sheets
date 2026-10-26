import { MONSTERS, type MonsterDef } from '../data/monsters'
import { LEVEL_TABLE } from './customMob'

export interface Encounter {
  name: string
  /** Floor number for "+F" values; 0 shows them unresolved */
  floor: number
  /** monster id → how many */
  picks: Record<string, number>
}

export const emptyEncounter = (): Encounter => ({ name: '', floor: 0, picks: {} })

/** "15+F" → "18" on Floor 3; also resolves "+F" inside damage like "2d6+F". Floor 0 leaves it as is. */
export function withFloor(value: string, floor: number): string {
  if (!floor) return value
  return value
    .replace(/\b(\d+)\s*\+\s*F\b/g, (_, n: string) => String(Number(n) + floor))
    .replace(/(\d+d\d+)\+F\b/g, `$1+${floor}`)
    .replace(/^F$/, String(floor))
}

/** Health per slot for each slot of the Health Bar. */
export function hbSlots(m: MonsterDef): number[] {
  const { slots, per } = m.hb
  return Array.isArray(per) ? per : Array.from({ length: slots }, () => per)
}

export const hbTotal = (m: MonsterDef) => hbSlots(m).reduce((a, b) => a + b, 0)

/** Picked monsters, each with its count: Mobs, NPCs & Crawlers, then Bosses (custom ones first in each). */
export function pickedList(e: Encounter, custom: MonsterDef[] = []): { m: MonsterDef; qty: number }[] {
  const list = [...custom, ...MONSTERS].filter((m) => (e.picks[m.id] ?? 0) > 0).map((m) => ({ m, qty: e.picks[m.id] }))
  // Mobs, then NPCs & Crawlers, then Bosses (a stable sort keeps the order inside each)
  const rank = (m: MonsterDef) => CATEGORIES.findIndex((c) => c.value === categoryOf(m))
  return list.sort((a, b) => rank(a.m) - rank(b.m))
}

export type Category = 'mobs' | 'npcs' | 'bosses'
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'mobs', label: 'Mobs' },
  { value: 'npcs', label: 'NPCs & Crawlers' },
  { value: 'bosses', label: 'Bosses' },
]

/** Mobs (incl. Elites and Vehicles), named NPCs and rival crawlers, or Bosses. */
export function categoryOf(m: MonsterDef): Category {
  if (m.boss) return 'bosses'
  return m.tier === 'NPC' || m.tier === 'Crawler' ? 'npcs' : 'mobs'
}

export type Order = 'book' | 'level'

export interface MonsterGroup {
  key: string
  category: Category
  title: string
  sub?: string
  items: MonsterDef[]
}

const byName = (a: MonsterDef, b: MonsterDef) => a.name.localeCompare(b.name)
const byLevel = (a: MonsterDef, b: MonsterDef) => a.level - b.level || byName(a, b)

/** Mobs, then NPCs & Crawlers, then Bosses. In book order each is grouped by Floor › Neighborhood
 *  or Quest (Bosses by Floor), A–Z inside; by Level each is grouped into Table 51's Level bands. */
export function groupMonsters(list: MonsterDef[], order: Order = 'book'): MonsterGroup[] {
  const out: MonsterGroup[] = []
  for (const { value: category } of CATEGORIES) {
    const items = list.filter((m) => categoryOf(m) === category)
    if (order === 'level') {
      for (const row of LEVEL_TABLE) {
        const band = items.filter((m) => m.level >= row.min && (m.level <= row.max || row === LEVEL_TABLE[LEVEL_TABLE.length - 1]))
        if (!band.length) continue
        const last = row === LEVEL_TABLE[LEVEL_TABLE.length - 1]
        out.push({
          key: `${category}›${row.min}`, category,
          title: last ? `Level ${row.min}+` : `Level ${row.min}–${row.max}`,
          sub: row.floors[0] === row.floors[1] ? `Floor ${row.floors[0]}` : `Floors ${row.floors[0]}–${row.floors[1]}`,
          items: band.sort(byLevel),
        })
      }
      continue
    }
    const groups = new Map<string, MonsterGroup>()
    for (const m of items) {
      const section = category === 'bosses' ? m.part : m.section
      const key = `${category}›${m.part}›${section}`
      if (!groups.has(key)) {
        groups.set(key, { key, category, title: section, sub: section === m.part ? undefined : m.part, items: [] })
      }
      groups.get(key)!.items.push(m)
    }
    for (const g of groups.values()) out.push({ ...g, items: g.items.sort(byName) })
  }
  return out
}
