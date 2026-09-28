import { findSkill, type HealDef } from '../data'
import { uid } from './advancement'
import { derive, type Derived } from './derived'
import { parseDice, rankDamageDice, rollDie, rollPool } from './dice'
import { HB_SLOTS, heal, setMana } from './health'
import type { Character, CharSkill, HotlistEntry } from './types'

export interface ActionResult {
  c: Character
  message: string
  ok: boolean
}

/** Resolve a heal spec to a number of Health Bar slots. */
export function healSlots(h: HealDef, d: Derived, rank = 1): { slots: number; detail: string } {
  if (h.full) return { slots: HB_SLOTS, detail: 'full' }
  if (h.slots) return { slots: h.slots, detail: `${h.slots}` }
  if (h.statMod) return { slots: d.mod[h.statMod], detail: `${h.statMod.toUpperCase()} Mod ${d.mod[h.statMod]}` }
  if (h.rankDie) {
    const r = rollPool(rankDamageDice(rank), rollDie)
    return { slots: Math.max(1, r.total), detail: `Rank die [${r.faces.join(', ') || r.total}]` }
  }
  if (h.dice) {
    const p = parseDice(h.dice)
    if (p) {
      const r = rollPool(p, rollDie)
      return { slots: r.total, detail: `${h.dice} [${r.faces.join(', ')}]` }
    }
  }
  return { slots: 0, detail: '' }
}

/** Cast a Spell: pay Mana, then apply built-in heal or Buff effects. */
export function castSpell(c: Character, s: CharSkill, d: Derived = derive(c)): ActionResult {
  const def = findSkill(s.skillId)
  const cost = s.customMana ?? def?.mana ?? 0
  if (d.flags.cantCast) return { c, message: "You're Muted: no Spells", ok: false }
  if (c.mana < cost) return { c, message: `Not enough Mana (${c.mana}/${cost})`, ok: false }
  let next = setMana(c, c.mana - cost, d)
  let msg = `Cast ${s.name}${cost ? ` (−${cost} Mana)` : ''}`
  const selfHeal = def?.heal && (def.range?.toLowerCase().startsWith('self') ?? true)
  if (def?.heal && selfHeal) {
    if (d.flags.cantHeal) msg += ' · The Taint blocks healing'
    else {
      const h = healSlots(def.heal, d, s.rank)
      next = heal(next, h.slots)
      msg += ` · healed ${h.slots} slot${h.slots === 1 ? '' : 's'}${h.detail && h.detail !== String(h.slots) ? ` (${h.detail})` : ''}`
    }
  } else if (def?.heal) {
    const h = healSlots(def.heal, d, s.rank)
    msg += ` · target heals ${h.slots} slot${h.slots === 1 ? '' : 's'}${h.detail ? ` (${h.detail})` : ''}`
  }
  if (def?.castBuff) {
    let dr = def.castBuff.dr ?? 0
    for (const [lvl, up] of Object.entries(def.upgrades ?? {})) if (Number(lvl) <= s.rank) dr += up.dr ?? 0
    const mods = dr ? [{ target: 'dr', value: dr }] : []
    next = {
      ...next,
      effects: [...next.effects.filter((e) => e.refId !== `spell:${def.id}`), { uid: uid(), kind: 'buff', refId: `spell:${def.id}`, name: s.name, stacks: 1, active: true, mods, notes: def.duration ?? '' }],
    }
    msg += dr ? ` · +${dr} DR Buff` : ''
  }
  return { c: next, message: msg, ok: true }
}

/** Use a Hotlist entry: cast its Spell, or consume the item and apply its effect. */
export function activateHotlist(c: Character, entry: HotlistEntry, d: Derived = derive(c)): ActionResult {
  if (entry.kind === 'spell') {
    const s = c.skills.find((x) => x.uid === entry.skillUid) ?? c.skills.find((x) => x.name === entry.name)
    if (!s) return { c, message: 'Spell not found on this character', ok: false }
    return castSpell(c, s, d)
  }
  if (entry.consumable && entry.qty <= 0) return { c, message: `No ${entry.name} left`, ok: false }
  let next = c
  const bits: string[] = [`Used ${entry.name}`]
  if (entry.heal) {
    if (d.flags.cantHeal) bits.push('The Taint blocks healing')
    else {
      const h = healSlots(entry.heal, d)
      next = heal(next, h.slots)
      bits.push(`healed ${h.slots} slot${h.slots === 1 ? '' : 's'}`)
    }
  }
  if (entry.restoreMana) {
    const max = d.maxMana.total
    next = setMana(next, entry.restoreMana === 'full' ? max : next.mana + entry.restoreMana, d)
    bits.push(entry.restoreMana === 'full' ? 'Mana full' : `+${entry.restoreMana} Mana`)
  }
  if (entry.removesDebuff) {
    const had = next.effects.some((e) => e.refId === entry.removesDebuff)
    next = { ...next, effects: next.effects.filter((e) => e.refId !== entry.removesDebuff) }
    if (had) bits.push(`removed ${entry.removesDebuff.replace(/-/g, ' ')}`)
  }
  if (entry.consumable) {
    next = { ...next, hotlist: next.hotlist.map((h) => (h && h.uid === entry.uid ? { ...h, qty: Math.max(0, h.qty - 1) } : h)) }
  }
  return { c: next, message: bits.join(' · '), ok: true }
}
