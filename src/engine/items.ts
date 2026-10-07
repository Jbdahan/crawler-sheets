// What Inventory items do: weapons use their Attack Skill, Spell Scrolls cast once at their
// Rank with no Mana, Spellbooks teach their Spell, Potions of +N Skill add Ranks (Core p.99, 215–218).
import { findSkill, type StatKey } from '../data'
import { inferItem, statPickName, weaponSkillFor, type LootDef } from '../data/loot'
import { GEAR_SKILL_SOURCE, log, newSkill, uid } from './advancement'
import { ammoName, describeAmmo } from './ammo'
import { hotlistItem, linkHotlistItems } from './inventory'
import { GEAR_SLOTS, type Character, type CharSkill, type GearItem, type GearSlot, type InventoryItem } from './types'

export const scrollName = (spell: string, rank: number) => `Scroll of ${spell} (Rank ${rank})`
export const bookName = (spell: string, rank: number) => `Spellbook of ${spell} (Rank ${rank})`

/** Build an Inventory item from the loot catalog. */
export function lootItem(def: LootDef, opts: { qty?: number; spellId?: string; rank?: number; stat?: StatKey; weapon?: string } = {}): InventoryItem {
  const qty = Math.max(1, opts.qty ?? def.qty ?? 1)
  const base: InventoryItem = { uid: uid(), name: def.name, qty, notes: def.summary }
  if (def.kind === 'ammo') {
    const skillId = opts.weapon ?? 'crossbow'
    return { ...base, name: ammoName(def.ammoPrefix ?? '', skillId), notes: '', kind: 'ammo', skillId, ...(def.ammo ? { ammo: def.ammo } : {}) }
  }
  if (def.pick === 'spell') {
    const spell = findSkill(opts.spellId)
    const rank = Math.max(1, opts.rank ?? 1)
    const name = spell ? (def.kind === 'scroll' ? scrollName(spell.name, rank) : bookName(spell.name, rank)) : def.name
    const notes = def.kind === 'scroll' ? 'Cast once at this Rank, no Mana (Core p.99)' : 'Read to learn this Spell at this Rank (Core p.99)'
    return { ...base, name, notes, kind: def.kind, skillId: spell?.id, rank }
  }
  if (def.pick === 'stat' && opts.stat) {
    return { ...base, name: statPickName(def, opts.stat), notes: '', kind: 'gear', slot: def.slot, mods: [{ target: `stat:${opts.stat}`, value: def.statBonus ?? 0 }] }
  }
  if (def.kind === 'skillPotion') return { ...base, kind: 'skillPotion', rank: def.ranks }
  if (def.kind === 'weapon' || def.kind === 'gear') {
    // a plain weapon's line already shows its Skill and damage; magic gear keeps its effect text
    const notes = def.id.startsWith('weapon-') ? '' : def.summary
    return { ...base, notes, kind: def.kind, skillId: def.skillId, slot: def.slot, mods: def.mods ?? [] }
  }
  return base
}

/** Older saves: give Inventory items and held weapons their links. */
export function inferItems(c: Character): Character {
  const inventory = c.inventory.map(inferItem)
  const gear = c.gear.map((g) => (g.skillId || g.slot !== 'hands' ? g : { ...g, skillId: weaponSkillFor(g.name) }))
  const changed = inventory.some((x, i) => x !== c.inventory[i]) || gear.some((x, i) => x.skillId !== c.gear[i].skillId)
  return changed ? { ...c, inventory, gear } : c
}

/** The crawler's Skill for a weapon, or an untrained stand-in (Rank 0 rolls with Disadvantage, Core p.58). */
export function weaponSkill(c: Character, skillId: string): CharSkill {
  const own = c.skills.find((s) => s.skillId === skillId)
  if (own) return own
  const def = findSkill(skillId)
  return { ...newSkill(def, def?.name ?? skillId, 0), uid: `untrained:${skillId}` }
}

export const isVirtualSkill = (c: Character, s: CharSkill) => !c.skills.some((x) => x.uid === s.uid)

/** The Spell a scroll casts, at the scroll's Rank and with no Mana cost. */
export function scrollSkill(it: Pick<InventoryItem, 'skillId' | 'rank' | 'uid'>): CharSkill | undefined {
  const def = findSkill(it.skillId)
  if (!def) return undefined
  return { ...newSkill(def, def.name, Math.max(1, it.rank ?? 1)), uid: `scroll:${it.uid}`, customMana: 0 }
}

/** Short line describing what an item is linked to. */
export function itemLinkLabel(it: Pick<InventoryItem, 'kind' | 'skillId' | 'rank' | 'ammo'>): string {
  const name = findSkill(it.skillId)?.name
  switch (it.kind) {
    case 'weapon': return name ? `${name} Skill` : 'Weapon'
    case 'scroll': return name ? `Scroll · ${name} Rank ${it.rank ?? 1} · no Mana` : 'Scroll'
    case 'book': return name ? `Spellbook · learn ${name} at Rank ${it.rank ?? 1}` : 'Spellbook'
    case 'ammo': return `${name ?? 'Ammo'} ammo · ${describeAmmo(it.ammo)}`
    case 'skillPotion': return `Potion · +${it.rank ?? 1} Skill Rank${(it.rank ?? 1) === 1 ? '' : 's'} (permanent)`
    default: return ''
  }
}

/** Use up `n` of an Inventory item; gone at 0 (Hotlist slots showing it are cleared). */
function spend(c: Character, invUid: string, n = 1): Character {
  const inventory = c.inventory
    .map((i) => (i.uid === invUid ? { ...i, qty: i.qty - n } : i))
    .filter((i) => i.uid !== invUid || i.qty > 0)
  return linkHotlistItems({ ...c, inventory })
}

/** Read a Spellbook: learn its Spell at its Rank (a known Spell rises to that Rank if lower). */
export function readSpellbook(c: Character, invUid: string): { c: Character; message: string } {
  const it = c.inventory.find((i) => i.uid === invUid)
  const def = findSkill(it?.skillId)
  if (!it || !def) return { c, message: 'Pick the Spell this book teaches first' }
  const rank = Math.max(1, it.rank ?? 1)
  const known = c.skills.find((s) => s.skillId === def.id)
  let next = spend(c, invUid)
  let message: string
  if (known) {
    const to = Math.max(known.rank, Math.min(known.max, rank))
    next = { ...next, skills: next.skills.map((s) => (s.uid === known.uid ? { ...s, rank: to } : s)) }
    message = to > known.rank ? `${def.name} is now Rank ${to}` : `You already know ${def.name} at Rank ${known.rank}; the book is used up`
  } else {
    next = { ...next, skills: [...next.skills, newSkill(def, def.name, rank, it.name)] }
    message = `Learned ${def.name} at Rank ${rank}`
  }
  return { c: log(next, `Read ${it.name}: ${message}`), message }
}

/** Drink a Potion of +N Skill: permanent Ranks in one Skill (up to its cap). */
export function drinkSkillPotion(c: Character, invUid: string, skillUid: string): { c: Character; message: string } {
  const it = c.inventory.find((i) => i.uid === invUid)
  const s = c.skills.find((x) => x.uid === skillUid)
  if (!it || !s) return { c, message: 'Pick a Skill' }
  const to = Math.min(s.max, s.rank + (it.rank ?? 1))
  const spent = spend(c, invUid)
  const next = { ...spent, skills: spent.skills.map((x) => (x.uid === s.uid ? { ...x, rank: to } : x)) }
  const message = `${s.name} Rank ${s.rank} → ${to}`
  return { c: log(next, `Drank ${it.name}: ${message}`), message }
}

/** Equip an Inventory item: it moves to a Gear slot with its bonuses; a weapon becomes the wielded one. */
export function equipItem(c: Character, invUid: string, slot: GearSlot): Character {
  const it = c.inventory.find((i) => i.uid === invUid)
  if (!it) return c
  const one = it.qty > 1
  const g: GearItem = { uid: uid(), slot, name: it.name, mods: it.mods ?? [], notes: it.notes, ...(it.skillId && it.kind === 'weapon' ? { skillId: it.skillId } : {}) }
  const inventory = one ? c.inventory.map((i) => (i.uid === invUid ? { ...i, qty: i.qty - 1 } : i)) : c.inventory.filter((i) => i.uid !== invUid)
  const hotlist = one ? c.hotlist : c.hotlist.map((h) => (h?.invUid === invUid ? hotlistItem(g.name, g.notes, { gearUid: g.uid }, it.kind) : h))
  const skills = g.skillId && c.skills.some((s) => s.skillId === g.skillId)
    ? c.skills.map((s) => (s.kind === 'attack' ? { ...s, wielded: s.skillId === g.skillId } : s))
    : c.skills
  return { ...c, inventory, gear: [...c.gear, g], hotlist, skills }
}

/** Unequip into Inventory, keeping its bonuses and weapon link for next time. */
export function unequipGear(c: Character, gearUid: string): Character {
  const g = c.gear.find((x) => x.uid === gearUid)
  if (!g) return c
  const kind = g.skillId ? 'weapon' : 'gear'
  const item: InventoryItem = { uid: uid(), name: g.name, qty: 1, notes: g.notes, kind, slot: g.slot, mods: g.mods, ...(g.skillId ? { skillId: g.skillId } : {}) }
  const skills = g.skillId ? c.skills.map((s) => (s.skillId === g.skillId ? { ...s, wielded: false } : s)) : c.skills
  return {
    ...c,
    gear: c.gear.filter((y) => y.uid !== g.uid),
    inventory: [...c.inventory, item],
    hotlist: c.hotlist.map((h) => (h?.gearUid === g.uid ? hotlistItem(item.name, item.notes, { invUid: item.uid }, kind) : h)),
    skills,
  }
}

/** Add a catalog item to Inventory, stacking onto the same item (same name and link). */
export function addItem(c: Character, item: InventoryItem): { c: Character; invUid: string } {
  const same = c.inventory.find((i) => i.name === item.name && i.kind === item.kind && i.skillId === item.skillId && i.rank === item.rank && !item.mods?.length && !i.mods?.length)
  if (same) return { c: { ...c, inventory: c.inventory.map((i) => (i === same ? { ...i, qty: i.qty + item.qty } : i)) }, invUid: same.uid }
  return { c: { ...c, inventory: [...c.inventory, item] }, invUid: item.uid }
}

/** Is there room in this Gear slot? */
export const slotFree = (c: Character, slot: GearSlot) =>
  c.gear.filter((g) => g.slot === slot).length < (GEAR_SLOTS.find((s) => s.key === slot)?.max ?? 1)


/**
 * Equipped gear that grants Ranks in a Skill you don't have gives you that Skill while you
 * hold or wear it (Core p.116): add it at Rank 0 so the gear's bonus applies; drop it again
 * once nothing equipped grants it (unless you've since trained it up).
 */
export function syncGearSkills(c: Character): Character {
  const granted = new Set<string>()
  for (const g of c.gear) for (const m of g.mods) if (m.target.startsWith('skill:') && m.value > 0) granted.add(m.target.slice(6))
  const add = [...granted].filter((id) => findSkill(id) && !c.skills.some((s) => s.skillId === id))
  const stale = (s: CharSkill) => s.source === GEAR_SKILL_SOURCE && s.rank <= 0 && !granted.has(s.skillId ?? '')
  if (!add.length && !c.skills.some(stale)) return c
  const skills = [...c.skills.filter((s) => !stale(s)), ...add.map((id) => ({ ...newSkill(findSkill(id), id, 0, GEAR_SKILL_SOURCE), wielded: c.gear.some((g) => g.slot === 'hands' && g.skillId === id) }))]
  return { ...c, skills }
}
