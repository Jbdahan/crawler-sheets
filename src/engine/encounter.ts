import { MONSTERS, type MonsterDef } from '../data/monsters'

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

/** Picked monsters (the GM's custom ones first, then book order), Bosses last, each with its count. */
export function pickedList(e: Encounter, custom: MonsterDef[] = []): { m: MonsterDef; qty: number }[] {
  const list = [...custom, ...MONSTERS].filter((m) => (e.picks[m.id] ?? 0) > 0).map((m) => ({ m, qty: e.picks[m.id] }))
  return [...list.filter((x) => !x.m.boss), ...list.filter((x) => x.m.boss)]
}

/** Book-order groups ("The Third Floor: The Over City" › "Neighborhood: Heavensworth"), A–Z inside,
 *  with every Boss in its own "Bosses" group per Floor at the end. */
export function groupMonsters(list: MonsterDef[]): { key: string; part: string; section: string; items: MonsterDef[] }[] {
  const groups = new Map<string, { key: string; part: string; section: string; items: MonsterDef[] }>()
  const add = (part: string, section: string, m: MonsterDef) => {
    const key = `${part}›${section}`
    if (!groups.has(key)) groups.set(key, { key, part, section, items: [] })
    groups.get(key)!.items.push(m)
  }
  for (const m of list) if (!m.boss) add(m.part, m.section, m)
  for (const m of list) if (m.boss) add('Bosses', m.part, m)
  for (const g of groups.values()) g.items.sort((a, b) => a.name.localeCompare(b.name))
  return [...groups.values()]
}
