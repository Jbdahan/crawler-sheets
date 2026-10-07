// A weapon item's own damage and range (see WeaponStats).
import type { WeaponStats } from './types'

export const hasWeaponStats = (w?: WeaponStats) => !!w && (!!w.dice?.trim() || !!w.bonus || !!w.dtype || !!w.range?.trim())

/** "1d10+2 Fire · Melee 10ft" for a weapon's own stats. */
export function describeWeapon(w?: WeaponStats): string {
  if (!w) return ''
  const dmg = [w.dice?.trim(), w.bonus ? (w.bonus > 0 ? `+${w.bonus}` : `${w.bonus}`) : ''].filter(Boolean).join('')
  return [[dmg, w.dtype].filter(Boolean).join(' '), w.range?.trim()].filter(Boolean).join(' · ')
}
