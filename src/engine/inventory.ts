// Moving items between Inventory and the Hotlist (scrolls, potions, bombs…).
import { ITEMS, normName } from '../data'
import { uid } from './advancement'
import { HOTLIST_SIZE, type Character, type HotlistEntry } from './types'

/** Up to 999 of one item per Hotlist slot (Core p.98). */
export const HOTLIST_STACK = 999

/** A Hotlist item entry; catalog items (potions, bandages…) keep their healing/Mana/cure effects. */
export function hotlistItem(name: string, qty: number, notes: string): HotlistEntry {
  const def = ITEMS.find((i) => normName(i.name) === normName(name))
  return {
    uid: uid(),
    name,
    qty,
    kind: 'item',
    notes: notes || def?.summary || '',
    consumable: def ? def.consumable : true,
    ...(def?.heal ? { heal: def.heal } : {}),
    ...(def?.restoreMana ? { restoreMana: def.restoreMana } : {}),
    ...(def?.removesDebuff ? { removesDebuff: def.removesDebuff } : {}),
  }
}

/** The slot an item would go to: a slot already holding it (with room), else the first empty one. */
export function hotlistSlotFor(c: Character, name: string): number {
  const hot = c.hotlist.slice(0, HOTLIST_SIZE)
  const same = hot.findIndex((h) => h?.kind === 'item' && normName(h.name) === normName(name) && h.qty < HOTLIST_STACK)
  return same >= 0 ? same : hot.findIndex((h) => !h)
}

/** Put items on the Hotlist, stacking onto a matching slot. Returns null when there's no room. */
export function addToHotlist(c: Character, name: string, qty: number, notes: string, slot = hotlistSlotFor(c, name)): Character | null {
  if (slot < 0 || slot >= HOTLIST_SIZE) return null
  const cur = c.hotlist[slot]
  if (cur && !(cur.kind === 'item' && normName(cur.name) === normName(name))) return null
  const entry = cur ? { ...cur, qty: Math.min(HOTLIST_STACK, cur.qty + qty) } : hotlistItem(name, Math.min(HOTLIST_STACK, qty), notes)
  return { ...c, hotlist: c.hotlist.map((h, i) => (i === slot ? entry : h)) }
}

/** Move `qty` (default: all) of an Inventory item onto the Hotlist. Returns null when there's no room. */
export function moveInventoryToHotlist(c: Character, invUid: string, qty?: number, slot?: number): Character | null {
  const it = c.inventory.find((i) => i.uid === invUid)
  if (!it || it.qty <= 0) return null
  const n = Math.min(qty ?? it.qty, it.qty, HOTLIST_STACK)
  const next = addToHotlist(c, it.name, n, it.notes, slot ?? hotlistSlotFor(c, it.name))
  if (!next) return null
  const left = it.qty - n
  return { ...next, inventory: left > 0 ? next.inventory.map((i) => (i.uid === invUid ? { ...i, qty: left } : i)) : next.inventory.filter((i) => i.uid !== invUid) }
}

/** Empty a Hotlist item slot back into Inventory (stacking onto a matching item). */
export function moveHotlistToInventory(c: Character, slot: number): Character {
  const h = c.hotlist[slot]
  if (!h || h.kind !== 'item') return c
  const hotlist = c.hotlist.map((x, i) => (i === slot ? null : x))
  if (h.qty <= 0) return { ...c, hotlist }
  const same = c.inventory.find((i) => normName(i.name) === normName(h.name))
  const inventory = same
    ? c.inventory.map((i) => (i === same ? { ...i, qty: i.qty + h.qty } : i))
    : [...c.inventory, { uid: uid(), name: h.name, qty: h.qty, notes: h.notes }]
  return { ...c, hotlist, inventory }
}

export interface ParsedItem { name: string; qty: number; notes: string }

/**
 * Turn pasted text into Inventory items, one per line. Understands
 * "3x Torch", "3 Torch", "Torch x3", "Torch (3)" and "Rope - 50 feet" (notes after a dash).
 * Bullets and numbering are ignored; repeated lines are combined.
 */
export function parseItemLines(text: string): ParsedItem[] {
  const out: ParsedItem[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^([-•*·▪◦]|\d+[.)])\s+/, '').trim()
    if (!line) continue
    let notes = ''
    const dash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/)
    if (dash) {
      line = dash[1].trim()
      notes = dash[2].trim()
    }
    let qty = 1
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(\d+)\s*[x×]\s*(.+)$/i)) || (m = line.match(/^(\d+)\s+(.+)$/))) {
      qty = Number(m[1])
      line = m[2]
    } else if ((m = line.match(/^(.+?)\s*[x×]\s*(\d+)$/i)) || (m = line.match(/^(.+?)\s*\((\d+)\)$/))) {
      line = m[1]
      qty = Number(m[2])
    }
    const name = line.trim()
    if (!name) continue
    const same = out.find((p) => normName(p.name) === normName(name) && p.notes === notes)
    if (same) same.qty += qty
    else out.push({ name, qty: Math.max(1, qty), notes })
  }
  return out
}

/** Add items to Inventory, stacking onto an existing item with the same name and notes. */
export function addInventoryItems(c: Character, items: ParsedItem[]): Character {
  let inventory = [...c.inventory]
  for (const it of items) {
    const same = inventory.find((i) => normName(i.name) === normName(it.name) && i.notes === it.notes)
    inventory = same
      ? inventory.map((i) => (i === same ? { ...i, qty: i.qty + it.qty } : i))
      : [...inventory, { uid: uid(), name: it.name, qty: it.qty, notes: it.notes }]
  }
  return { ...c, inventory }
}
