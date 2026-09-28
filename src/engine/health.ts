import { derive, type Derived } from './derived'
import type { Character } from './types'

export const HB_SLOTS = 10

export interface DamageInput {
  amount: number
  type?: string
  /** Debuff damage bypasses DR (Core p.96) */
  fromDebuff?: boolean
  /** Armor-Piercing ignores DR */
  armorPiercing?: boolean
  /** Evaded an Area Attack: half damage; Splash + Evade: quarter */
  areaEvaded?: boolean
  splash?: boolean
}

export interface DamageResult {
  steps: string[]
  finalDamage: number
  slotValue: number
  slotsLost: number
  newLost: number
  dying: boolean
}

/**
 * Damage pipeline (Core p.83, 92–94): DR first, then Resistance (½), Vulnerability (×2),
 * Immunity (0). Each full slot value of remaining damage removes one slot; the remainder is lost.
 */
export function previewDamage(c: Character, input: DamageInput, d: Derived = derive(c)): DamageResult {
  const steps: string[] = []
  let dmg = Math.max(0, Math.floor(input.amount))
  steps.push(`${dmg} incoming`)
  if (input.splash) {
    dmg = Math.floor(dmg / 2)
    steps.push(`Splash zone ½ → ${dmg}`)
  }
  if (input.areaEvaded) {
    dmg = Math.floor(dmg / 2)
    steps.push(`Evaded area ½ → ${dmg}`)
  }
  if (!input.fromDebuff && !input.armorPiercing && d.dr.total > 0) {
    dmg = Math.max(0, dmg - d.dr.total)
    steps.push(`− DR ${d.dr.total} → ${dmg}`)
  } else if (input.fromDebuff) {
    steps.push('Debuff damage ignores DR')
  } else if (input.armorPiercing) {
    steps.push('Armor-Piercing ignores DR')
  }
  const t = input.type
  if (t && d.immune.includes(t)) {
    dmg = 0
    steps.push(`Immune to ${t} → 0`)
  } else if (t) {
    if (d.resist.includes(t)) {
      dmg = Math.floor(dmg / 2)
      steps.push(`${t} Resistance ½ → ${dmg}`)
    }
    if (d.vuln.includes(t)) {
      dmg *= 2
      steps.push(`${t} Vulnerability ×2 → ${dmg}`)
    }
  }
  const slotValue = Math.max(1, d.hbSlot.total)
  const remaining = HB_SLOTS - c.health.lost
  const raw = Math.floor(dmg / slotValue)
  const slotsLost = Math.min(remaining, raw)
  if (dmg > 0 && raw === 0) steps.push(`${dmg} is less than one slot (${slotValue}): no damage`)
  else steps.push(`${dmg} ÷ ${slotValue} per slot → ${raw} slot${raw === 1 ? '' : 's'}`)
  const newLost = c.health.lost + slotsLost
  return { steps, finalDamage: dmg, slotValue, slotsLost, newLost, dying: newLost >= HB_SLOTS && remaining > 0 }
}

/** Apply a damage preview. At 0% the crawler gains Dying with Con Mod rounds (Core p.94). */
export function applyDamage(c: Character, r: DamageResult, d: Derived = derive(c)): Character {
  let health = { ...c.health, lost: r.newLost }
  if (r.newLost >= HB_SLOTS) {
    if (c.health.dying === null) health = { ...health, dying: d.mod.con }
    else if (r.finalDamage > 0) health = { ...health, dying: Math.max(0, c.health.dying - 1) }
  }
  return syncDying({ ...c, health })
}

/** Healing is always by slots, up to 100% (Core p.94). Healing ends Dying. */
export function heal(c: Character, slots: number): Character {
  const lost = Math.max(0, c.health.lost - Math.max(0, Math.floor(slots)))
  return syncDying({ ...c, health: { lost, dying: lost >= HB_SLOTS ? c.health.dying : null } })
}

export function setLost(c: Character, lost: number, d: Derived = derive(c)): Character {
  const l = Math.min(HB_SLOTS, Math.max(0, lost))
  const dying = l >= HB_SLOTS ? (c.health.dying ?? d.mod.con) : null
  return syncDying({ ...c, health: { lost: l, dying } })
}

/** Keep the Dying Debuff chip in step with the Health Bar. */
function syncDying(c: Character): Character {
  const has = c.effects.some((e) => e.refId === 'dying')
  const need = c.health.dying !== null
  if (need && !has) {
    return {
      ...c,
      effects: [...c.effects, { uid: `dying-${Date.now()}`, kind: 'debuff', refId: 'dying', name: 'Dying', stacks: 1, active: true, mods: [], notes: '' }],
    }
  }
  if (!need && has) return { ...c, effects: c.effects.filter((e) => e.refId !== 'dying') }
  return c
}

export function tickDying(c: Character): Character {
  if (c.health.dying === null) return c
  return { ...c, health: { ...c.health, dying: Math.max(0, c.health.dying - 1) } }
}

export function spendMana(c: Character, amount: number): Character {
  return { ...c, mana: Math.max(0, c.mana - amount) }
}

export function setMana(c: Character, mana: number, d: Derived = derive(c)): Character {
  return { ...c, mana: Math.min(d.maxMana.total, Math.max(0, Math.floor(mana))) }
}

export type RestKind = 'hour' | 'short' | 'long' | 'fullDay'

export const REST_LABEL: Record<RestKind, string> = {
  hour: '1 hour mending',
  short: 'Short rest (2 h)',
  long: 'Long rest (8 h)',
  fullDay: "Full day's rest (30 h)",
}

/** Resting (Core p.94): hour = 1 slot + 5 Mana; short = 5 slots + ½ Mana; long/full day = full. */
export function rest(c: Character, kind: RestKind, d: Derived = derive(c)): Character {
  const max = d.maxMana.total
  let next = c
  let removeIds: string[] = []
  switch (kind) {
    case 'hour':
      next = heal(next, 1)
      next = { ...next, mana: Math.min(max, next.mana + 5) }
      break
    case 'short':
      next = heal(next, 5)
      next = { ...next, mana: Math.min(max, next.mana + Math.floor(max / 2)) }
      removeIds = ['minor-injury']
      break
    case 'long':
      next = heal(next, HB_SLOTS)
      next = { ...next, mana: max }
      removeIds = ['fatigued', 'minor-injury', 'major-injury', 'long-term-minor-injury']
      break
    case 'fullDay':
      next = heal(next, HB_SLOTS)
      next = { ...next, mana: max }
      removeIds = ['fatigued', 'minor-injury', 'major-injury', 'long-term-minor-injury', 'long-term-major-injury']
      break
  }
  if (removeIds.length) next = { ...next, effects: next.effects.filter((e) => !(e.refId && removeIds.includes(e.refId))) }
  return next
}

/** A second Minor/Major Injury becomes the Long-Term version (Core p.96). */
export function addInjury(c: Character, severity: 'minor' | 'major'): Character {
  const id = `${severity}-injury`
  const longId = `long-term-${severity}-injury`
  const name = severity === 'minor' ? 'Minor Injury' : 'Major Injury'
  const has = c.effects.find((e) => e.refId === id)
  if (has) {
    return {
      ...c,
      effects: [
        ...c.effects.filter((e) => e.uid !== has.uid && e.refId !== longId),
        { uid: `${longId}-${Date.now()}`, kind: 'debuff', refId: longId, name: `Long-Term ${name}`, stacks: 1, active: true, mods: [], notes: '' },
      ],
    }
  }
  if (c.effects.some((e) => e.refId === longId)) return c
  return {
    ...c,
    effects: [...c.effects, { uid: `${id}-${Date.now()}`, kind: 'debuff', refId: id, name, stacks: 1, active: true, mods: [], notes: '' }],
  }
}
