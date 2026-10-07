// The Hotlist and Inventory/Gear: an item on the Hotlist stays in Inventory (or in its Gear slot).
// The Hotlist slot just points at it (invUid / gearUid) and the count lives on the Inventory item.
import { ITEMS, normName } from '../data'
import { inferItem } from '../data/loot'
import { uid } from './advancement'
import { HOTLIST_SIZE, type Character, type HotlistEntry, type InventoryItem, type ItemKind } from './types'

/** Up to 999 of one item per Hotlist slot (Core p.98). */
export const HOTLIST_STACK = 999

/** A Hotlist entry that points at an Inventory item; catalog items (potions, bandages…) keep their effects. */
export function hotlistItem(name: string, notes: string, link: { invUid?: string; gearUid?: string }, kind?: ItemKind): HotlistEntry {
  const def = ITEMS.find((i) => normName(i.name) === normName(name))
  // weapons and gear aren't used up; scrolls are
  const reusable = !!link.gearUid || kind === 'weapon' || kind === 'gear'
  return {
    uid: uid(),
    name,
    qty: 0, // the count lives on the linked Inventory item
    kind: 'item',
    notes: notes || def?.summary || '',
    consumable: reusable ? false : def ? def.consumable : true,
    ...link,
    ...(def?.heal ? { heal: def.heal } : {}),
    ...(def?.restoreMana ? { restoreMana: def.restoreMana } : {}),
    ...(def?.removesDebuff ? { removesDebuff: def.removesDebuff } : {}),
  }
}

/** How many of a Hotlist item there are: the linked Inventory item's count (gear counts as 1). */
export function entryQty(c: Character, h: HotlistEntry): number {
  if (h.invUid) return c.inventory.find((i) => i.uid === h.invUid)?.qty ?? 0
  if (h.gearUid) return c.gear.some((g) => g.uid === h.gearUid) ? 1 : 0
  return h.qty
}

/** The Hotlist slot (0-based) that points at this Inventory item, or -1. */
export const hotlistSlotOfInventory = (c: Character, invUid: string) =>
  c.hotlist.slice(0, HOTLIST_SIZE).findIndex((h) => h?.invUid === invUid)

/** The Hotlist slot (0-based) that points at this Gear item, or -1. */
export const hotlistSlotOfGear = (c: Character, gearUid: string) =>
  c.hotlist.slice(0, HOTLIST_SIZE).findIndex((h) => h?.gearUid === gearUid)

/** The slot an item would go to: the slot already showing it, else the first empty one. */
export function hotlistSlotFor(c: Character, name: string): number {
  const hot = c.hotlist.slice(0, HOTLIST_SIZE)
  const same = hot.findIndex((h) => h?.invUid && normName(h.name) === normName(name))
  return same >= 0 ? same : hot.findIndex((h) => !h)
}

/** Show an Inventory item on the Hotlist (it stays in Inventory). Returns null when there's no room. */
export function linkInventoryToHotlist(c: Character, invUid: string, slot?: number): Character | null {
  const it = c.inventory.find((i) => i.uid === invUid)
  if (!it) return null
  const already = hotlistSlotOfInventory(c, invUid)
  if (already >= 0 && (slot === undefined || slot === already)) return c
  const target = slot ?? c.hotlist.slice(0, HOTLIST_SIZE).findIndex((h) => !h)
  if (target < 0 || target >= HOTLIST_SIZE) return null
  const cur = c.hotlist[target]
  if (cur && cur.invUid !== invUid) return null
  const hotlist = c.hotlist.map((h, i) => (i === target ? hotlistItem(it.name, it.notes, { invUid }, it.kind) : i === already ? null : h))
  return { ...c, hotlist }
}

/** Show an equipped Gear item on the Hotlist (it stays equipped). Returns null when there's no room. */
export function linkGearToHotlist(c: Character, gearUid: string, slot?: number): Character | null {
  const g = c.gear.find((x) => x.uid === gearUid)
  if (!g) return null
  if (hotlistSlotOfGear(c, gearUid) >= 0) return c
  const target = slot ?? c.hotlist.slice(0, HOTLIST_SIZE).findIndex((h) => !h)
  if (target < 0 || target >= HOTLIST_SIZE || c.hotlist[target]) return null
  return { ...c, hotlist: c.hotlist.map((h, i) => (i === target ? hotlistItem(g.name, g.notes, { gearUid }, g.skillId ? 'weapon' : 'gear') : h)) }
}

/** Add items to Inventory (stacking by name and notes); returns the character and the item's uid. */
export function addInventory(c: Character, name: string, qty: number, notes: string): { c: Character; invUid: string } {
  const same = c.inventory.find((i) => normName(i.name) === normName(name) && i.notes === notes)
  if (same) return { c: { ...c, inventory: c.inventory.map((i) => (i === same ? { ...i, qty: i.qty + qty } : i)) }, invUid: same.uid }
  const item: InventoryItem = inferItem({ uid: uid(), name, qty, notes })
  return { c: { ...c, inventory: [...c.inventory, item] }, invUid: item.uid }
}

/** Add items to Inventory and show them on the Hotlist. Returns null when the Hotlist has no room. */
export function addToHotlist(c: Character, name: string, qty: number, notes: string, slot?: number): Character | null {
  const added = addInventory(c, name, qty, notes)
  return linkInventoryToHotlist(added.c, added.invUid, slot)
}

/** Take an item off the Hotlist; it stays in Inventory or Gear. */
export function removeFromHotlist(c: Character, slot: number): Character {
  return { ...c, hotlist: c.hotlist.map((h, i) => (i === slot ? null : h)) }
}

/** Use up `n` of a Hotlist item: comes out of the linked Inventory item. */
export function consumeHotlist(c: Character, h: HotlistEntry, n = 1): Character {
  if (h.invUid) return { ...c, inventory: c.inventory.map((i) => (i.uid === h.invUid ? { ...i, qty: Math.max(0, i.qty - n) } : i)) }
  if (h.gearUid) return c
  return { ...c, hotlist: c.hotlist.map((x) => (x && x.uid === h.uid ? { ...x, qty: Math.max(0, x.qty - n) } : x)) }
}

/** Set a Hotlist item's count (writes through to the linked Inventory item). */
export function setHotlistQty(c: Character, h: HotlistEntry, qty: number): Character {
  const q = Math.max(0, Math.min(HOTLIST_STACK, qty))
  if (h.invUid) return { ...c, inventory: c.inventory.map((i) => (i.uid === h.invUid ? { ...i, qty: q } : i)) }
  return { ...c, hotlist: c.hotlist.map((x) => (x && x.uid === h.uid ? { ...x, qty: q } : x)) }
}

/**
 * Older saves kept a separate count on Hotlist items. Put those items into Inventory and
 * point the slot at them; drop slots whose Inventory/Gear item no longer exists.
 */
export function linkHotlistItems(c: Character): Character {
  let next = c
  let changed = false
  const hotlist = [...c.hotlist]
  hotlist.forEach((h, i) => {
    if (!h || h.kind !== 'item') return
    if (h.invUid) {
      if (!next.inventory.some((x) => x.uid === h.invUid)) { hotlist[i] = null; changed = true }
      return
    }
    if (h.gearUid) {
      if (!next.gear.some((g) => g.uid === h.gearUid)) { hotlist[i] = null; changed = true }
      return
    }
    const added = addInventory(next, h.name, Math.max(0, h.qty), h.notes)
    next = added.c
    hotlist[i] = { ...h, qty: 0, invUid: added.invUid }
    changed = true
  })
  return changed ? { ...next, hotlist } : c
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
      : [...inventory, inferItem({ uid: uid(), name: it.name, qty: it.qty, notes: it.notes })]
  }
  return { ...c, inventory }
}
