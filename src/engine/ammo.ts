// Ammunition for ranged weapons. The book only says each Attack "requires proper ammunition"
// (Bow, Crossbow, Handgun, Shotgun: Core p.181–182), so special ammo is GM-made loot:
// a stack in Inventory that adds dice, bonuses or a Debuff, and one is spent per Attack.
// Basic ammo isn't counted unless the player turns that on for the weapon.
//
// Ammo is matched by an "ammo key": a ranged Weapon Skill id for its standard ammo
// ("crossbow" = Bolts) or a custom name ("Plasma Cells"). A custom weapon can fire any
// ammo (WeaponStats.ammo); otherwise the Attack Skill's own ammo is used.
import { findDebuff, findSkill } from '../data'
import type { AmmoEffect, Character, CharSkill, InventoryItem } from './types'
import { AMMO_NOUN, ammoNoun, heldWeapon, type WeaponRef } from './weapon'

export { AMMO_NOUN, ammoNoun }
export const AMMO_WEAPONS = Object.keys(AMMO_NOUN)

/**
 * The ammo an Attack fires: the weapon's own ammo (the one passed in, else the one held
 * for this Skill), else the Skill's standard ammo. `weapon: null` means no weapon item.
 */
export function ammoKey(c: Character, s: CharSkill, weapon?: WeaponRef | null): string | undefined {
  const w = weapon === undefined ? heldWeapon(c, s) : weapon ?? undefined
  const own = w?.stats.ammo?.trim()
  if (own) return own
  return s.skillId && s.skillId in AMMO_NOUN ? s.skillId : undefined
}

export const usesAmmo = (c: Character, s: CharSkill, weapon?: WeaponRef | null) => !!ammoKey(c, s, weapon)

/** Every ammo key in play: the standard ones plus custom ammo named by weapons or ammo stacks. */
export function ammoKeys(c: Character): string[] {
  const custom = new Set<string>()
  for (const x of [...c.gear, ...c.inventory]) {
    const k = 'weapon' in x ? x.weapon?.ammo?.trim() : undefined
    if (k && !(k in AMMO_NOUN)) custom.add(k)
  }
  for (const i of c.inventory) if (i.kind === 'ammo' && i.skillId?.trim() && !(i.skillId in AMMO_NOUN)) custom.add(i.skillId.trim())
  return [...AMMO_WEAPONS, ...[...custom].sort()]
}

const hasEffect = (a?: AmmoEffect) => !!a && !!(a.dice || a.toHit || a.damage || a.debuff)

/** Ammo stacks in Inventory of this ammo key (stored in the item's skillId); special first. */
export function ammoStacks(c: Character, key?: string): InventoryItem[] {
  return c.inventory.filter((i) => i.kind === 'ammo' && !!key && i.skillId?.trim() === key.trim())
}
export const specialAmmo = (c: Character, key?: string) => ammoStacks(c, key).filter((i) => hasEffect(i.ammo))
export const basicAmmo = (c: Character, key?: string) => ammoStacks(c, key).filter((i) => !hasEffect(i.ammo))
export const basicCount = (c: Character, key?: string) => basicAmmo(c, key).reduce((a, i) => a + i.qty, 0)

/** The special ammo loaded for this Attack Skill, if it fits the ammo it fires (even when the stack is empty). */
export const loadedAmmo = (c: Character, s: CharSkill, key = ammoKey(c, s)): InventoryItem | undefined =>
  s.ammoUid && key ? c.inventory.find((i) => i.uid === s.ammoUid && i.kind === 'ammo' && i.skillId?.trim() === key.trim()) : undefined

/** The ammo the next Attack fires: loaded special ammo if any is left, else nothing (basic). */
export function firing(c: Character, s: CharSkill, key = ammoKey(c, s)): InventoryItem | undefined {
  const loaded = loadedAmmo(c, s, key)
  return loaded && loaded.qty > 0 ? loaded : undefined
}

export interface AmmoSpend {
  c: Character
  /** the special ammo fired (its effect applies to this Attack) */
  fired?: InventoryItem
  /** short note for the roll, e.g. "Explosive Bolts: 11 left" or "Out of basic Bolts" */
  note?: string
}

/** One Attack: spend one loaded special round, or one basic round when basic ammo is tracked. */
export function spendAmmo(c: Character, s: CharSkill, weapon?: WeaponRef | null): AmmoSpend {
  const key = ammoKey(c, s, weapon)
  if (!key) return { c }
  const noun = ammoNoun(key)
  const loaded = loadedAmmo(c, s, key)
  const fired = firing(c, s, key)
  if (fired) {
    const next = { ...c, inventory: c.inventory.map((i) => (i.uid === fired.uid ? { ...i, qty: i.qty - 1 } : i)) }
    return { c: next, fired, note: `${fired.name}: ${fired.qty - 1} left` }
  }
  const out = loaded ? `Out of ${loaded.name}: firing basic ${noun}` : undefined
  if (!s.trackBasicAmmo) return { c, note: out }
  const stack = basicAmmo(c, key).find((i) => i.qty > 0)
  if (!stack) return { c, note: [out, `Out of basic ${noun}`].filter(Boolean).join(' · ') }
  const next = { ...c, inventory: c.inventory.map((i) => (i.uid === stack.uid ? { ...i, qty: i.qty - 1 } : i)) }
  return { c: next, note: [out, `Basic ${noun}: ${basicCount(c, key) - 1} left`].filter(Boolean).join(' · ') }
}

/** "+1d6 Fire · +1 to hit · Burned on hit" */
export function describeAmmo(a?: AmmoEffect): string {
  if (!hasEffect(a)) return 'Basic ammo'
  const bits: string[] = []
  if (a!.dice) bits.push(`+${a!.dice}${a!.dtype ? ` ${a!.dtype}` : ''}`)
  if (a!.toHit) bits.push(`${a!.toHit > 0 ? '+' : ''}${a!.toHit} to hit`)
  if (a!.damage) bits.push(`${a!.damage > 0 ? '+' : ''}${a!.damage} damage`)
  if (a!.debuff) bits.push(`${findDebuff(a!.debuff)?.name ?? a!.debuff} on ${a!.debuffOn === 'amazing' ? 'Amazing Success' : 'hit'}`)
  return bits.join(' · ')
}

/** "Explosive Bolts" for a Crossbow */
export const ammoName = (prefix: string, key: string) => `${prefix} ${ammoNoun(key)}`.trim()
/** "Crossbow" for standard ammo; a custom ammo name is shown as-is */
export const ammoWeaponName = (key?: string) => findSkill(key)?.name ?? key ?? 'weapon'

/**
 * For the printed sheet: the weapon's special ammo with counts and effects, the loaded one first,
 * e.g. "Fire Bolts ×10 (loaded): +1d6 Fire, Burned on Amazing Success; Frost Bolts ×4: …".
 */
export function ammoSummary(c: Character, s: CharSkill): string {
  const key = ammoKey(c, s)
  if (!key) return ''
  const loaded = loadedAmmo(c, s, key)
  const special = specialAmmo(c, key).sort((a, b) => Number(b.uid === loaded?.uid) - Number(a.uid === loaded?.uid))
  const bits = special.map((i) => `${i.name} ×${i.qty}${i.uid === loaded?.uid ? ' (loaded)' : ''}: ${describeAmmo(i.ammo).replace(/ · /g, ', ')}`)
  if (s.trackBasicAmmo) bits.push(`Basic ${ammoNoun(key).toLowerCase()} ×${basicCount(c, key)}`)
  return bits.length ? `Ammo: ${bits.join('; ')}` : ''
}
