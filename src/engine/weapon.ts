// A weapon item's own damage, range and ammunition (see WeaponStats).
import type { Character, CharSkill, WeaponStats } from './types'

/** Ranged weapons that shoot ammunition, and what it's called. */
export const AMMO_NOUN: Record<string, string> = {
  bow: 'Arrows',
  crossbow: 'Bolts',
  handgun: 'Rounds',
  shotgun: 'Shells',
  slingshot: 'Stones',
}

/** What an ammo key is called: a ranged Weapon Skill id ("crossbow" → "Bolts") or a custom name as-is. */
export const ammoNoun = (key?: string) => (key ? AMMO_NOUN[key] ?? key : 'Ammo')

export const hasWeaponStats = (w?: WeaponStats) =>
  !!w && (!!w.dice?.trim() || !!w.bonus || !!w.dtype || !!w.range?.trim() || !!w.ammo?.trim())

/** A weapon item with its own stats: an equipped Gear item or one from Inventory/the Hotlist. */
export interface WeaponRef { name: string; stats: WeaponStats }

/** The weapon held in hand for this Attack Skill that has its own stats, if any. */
export function heldWeapon(c: Character, s: CharSkill): WeaponRef | undefined {
  if (!s.skillId) return undefined
  const g = c.gear.find((x) => x.slot === 'hands' && x.skillId === s.skillId && hasWeaponStats(x.weapon))
  return g ? { name: g.name || 'Weapon', stats: g.weapon! } : undefined
}

/** "1d10+2 Fire · Melee 10ft · fires Bolts" for a weapon's own stats. */
export function describeWeapon(w?: WeaponStats): string {
  if (!w) return ''
  const dmg = [w.dice?.trim(), w.bonus ? (w.bonus > 0 ? `+${w.bonus}` : `${w.bonus}`) : ''].filter(Boolean).join('')
  return [[dmg, w.dtype].filter(Boolean).join(' '), w.range?.trim(), w.ammo?.trim() ? `fires ${ammoNoun(w.ammo.trim())}` : '']
    .filter(Boolean).join(' · ')
}
