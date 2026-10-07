// Ammunition for ranged weapons. The book only says each Attack "requires proper ammunition"
// (Bow, Crossbow, Handgun, Shotgun: Core p.181–182), so special ammo is GM-made loot:
// a stack in Inventory that adds dice, bonuses or a Debuff, and one is spent per Attack.
// Basic ammo isn't counted unless the player turns that on for the weapon.
import { findDebuff, findSkill } from '../data'
import type { AmmoEffect, Character, CharSkill, InventoryItem } from './types'

/** Ranged weapons that shoot ammunition, and what it's called. */
export const AMMO_NOUN: Record<string, string> = {
  bow: 'Arrows',
  crossbow: 'Bolts',
  handgun: 'Rounds',
  shotgun: 'Shells',
  slingshot: 'Stones',
}
export const AMMO_WEAPONS = Object.keys(AMMO_NOUN)

export const usesAmmo = (s: Pick<CharSkill, 'skillId'>) => !!s.skillId && s.skillId in AMMO_NOUN

const hasEffect = (a?: AmmoEffect) => !!a && !!(a.dice || a.toHit || a.damage || a.debuff)

/** Ammo stacks in Inventory for this weapon; special first. */
export function ammoStacks(c: Character, skillId?: string): InventoryItem[] {
  return c.inventory.filter((i) => i.kind === 'ammo' && i.skillId === skillId)
}
export const specialAmmo = (c: Character, skillId?: string) => ammoStacks(c, skillId).filter((i) => hasEffect(i.ammo))
export const basicAmmo = (c: Character, skillId?: string) => ammoStacks(c, skillId).filter((i) => !hasEffect(i.ammo))
export const basicCount = (c: Character, skillId?: string) => basicAmmo(c, skillId).reduce((a, i) => a + i.qty, 0)

/** The special ammo loaded in this weapon, if any (even when the stack is empty). */
export const loadedAmmo = (c: Character, s: CharSkill): InventoryItem | undefined =>
  s.ammoUid ? c.inventory.find((i) => i.uid === s.ammoUid && i.kind === 'ammo') : undefined

/** The ammo the next Attack fires: loaded special ammo if any is left, else nothing (basic). */
export function firing(c: Character, s: CharSkill): InventoryItem | undefined {
  const loaded = loadedAmmo(c, s)
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
export function spendAmmo(c: Character, s: CharSkill): AmmoSpend {
  if (!usesAmmo(s)) return { c }
  const noun = AMMO_NOUN[s.skillId!]
  const loaded = loadedAmmo(c, s)
  const fired = firing(c, s)
  if (fired) {
    const next = { ...c, inventory: c.inventory.map((i) => (i.uid === fired.uid ? { ...i, qty: i.qty - 1 } : i)) }
    return { c: next, fired, note: `${fired.name}: ${fired.qty - 1} left` }
  }
  const out = loaded ? `Out of ${loaded.name}: firing basic ${noun}` : undefined
  if (!s.trackBasicAmmo) return { c, note: out }
  const stack = basicAmmo(c, s.skillId).find((i) => i.qty > 0)
  if (!stack) return { c, note: [out, `Out of basic ${noun}`].filter(Boolean).join(' · ') }
  const next = { ...c, inventory: c.inventory.map((i) => (i.uid === stack.uid ? { ...i, qty: i.qty - 1 } : i)) }
  return { c: next, note: [out, `Basic ${noun}: ${basicCount(c, s.skillId) - 1} left`].filter(Boolean).join(' · ') }
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
export const ammoName = (prefix: string, skillId: string) => `${prefix} ${AMMO_NOUN[skillId] ?? 'Ammo'}`.trim()
export const ammoWeaponName = (skillId?: string) => findSkill(skillId)?.name ?? 'weapon'

/**
 * For the printed sheet: the weapon's special ammo with counts and effects, the loaded one first,
 * e.g. "Fire Bolts ×10 (loaded): +1d6 Fire, Burned on Amazing Success; Frost Bolts ×4: …".
 */
export function ammoSummary(c: Character, s: CharSkill): string {
  if (!usesAmmo(s)) return ''
  const loaded = loadedAmmo(c, s)
  const special = specialAmmo(c, s.skillId).sort((a, b) => Number(b.uid === loaded?.uid) - Number(a.uid === loaded?.uid))
  const bits = special.map((i) => `${i.name} ×${i.qty}${i.uid === loaded?.uid ? ' (loaded)' : ''}: ${describeAmmo(i.ammo).replace(/ · /g, ', ')}`)
  if (s.trackBasicAmmo) bits.push(`Basic ${AMMO_NOUN[s.skillId!].toLowerCase()} ×${basicCount(c, s.skillId)}`)
  return bits.length ? `Ammo: ${bits.join('; ')}` : ''
}
