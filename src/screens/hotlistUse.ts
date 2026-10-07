import { signed, toast } from '../components/ui'
import { openRoll } from '../components/Roller'
import { activateHotlist, castSpell } from '../engine/actions'
import { attackCalc, isAttackSkill } from '../engine/attacks'
import { entryQty } from '../engine/inventory'
import { isVirtualSkill, scrollSkill, weaponSkill } from '../engine/items'
import type { CharSkill, HotlistEntry, InventoryItem } from '../engine/types'
import type { Ctx } from './ctx'

/** The Skill a Hotlist slot points at (older slots may only have the name). */
export function hotlistSkill({ c }: Pick<Ctx, 'c'>, h: HotlistEntry): CharSkill | undefined {
  return c.skills.find((x) => x.uid === h.skillUid) ?? (h.kind !== 'item' ? c.skills.find((x) => x.name === h.name) : undefined)
}

/** The Inventory item a slot shows (null for gear and plain entries). */
const linkedInventory = ({ c }: Pick<Ctx, 'c'>, h: HotlistEntry): InventoryItem | undefined =>
  h.invUid ? c.inventory.find((i) => i.uid === h.invUid) : undefined

/** A Spell Scroll slot: the Spell it casts at the scroll's Rank (no Mana). */
export function hotlistScroll(ctx: Pick<Ctx, 'c'>, h: HotlistEntry): CharSkill | undefined {
  const it = linkedInventory(ctx, h)
  return it?.kind === 'scroll' ? scrollSkill(it) : undefined
}

/**
 * Slots that roll an attack when used: weapons/attack Skills, Attack Spells, weapon items
 * (with their Attack Skill; untrained rolls with Disadvantage) and attack-Spell scrolls.
 */
export function hotlistAttack(ctx: Pick<Ctx, 'c'>, h: HotlistEntry): CharSkill | undefined {
  if (h.kind === 'item') {
    const gear = h.gearUid ? ctx.c.gear.find((g) => g.uid === h.gearUid) : undefined
    const it = linkedInventory(ctx, h)
    const weapon = gear?.skillId ?? (it?.kind === 'weapon' ? it.skillId : undefined)
    if (weapon) return weaponSkill(ctx.c, weapon)
    const scroll = hotlistScroll(ctx, h)
    return scroll && isAttackSkill(scroll) ? scroll : undefined
  }
  const s = hotlistSkill(ctx, h)
  return s && isAttackSkill(s) ? s : undefined
}

/** "+13 · 2d10+5" for an attack slot */
export function attackLine({ c, d }: Pick<Ctx, 'c' | 'd'>, s: CharSkill): string {
  const a = attackCalc(c, s, d)
  return `${signed(a.toHit.total)} · ${a.formula}`
}

/** A Spell Scroll casts its Spell once at its Rank, no Mana, then turns to dust (Core p.99). */
export function castScroll(ctx: Ctx, it: InventoryItem) {
  const { c, d, up } = ctx
  const scroll = scrollSkill(it)
  if (!scroll) { toast('Pick the Spell on this scroll first'); return }
  if (it.qty <= 0) { toast(`No ${it.name} left`); return }
  const r = castSpell(c, scroll, d)
  if (!r.ok) { toast(r.message); return }
  up(() => ({ ...r.c, inventory: r.c.inventory.map((i) => (i.uid === it.uid ? { ...i, qty: Math.max(0, i.qty - 1) } : i)) }))
  toast(`${it.name}: ${r.message.replace(/^Cast /, 'cast ')}`)
  if (isAttackSkill(scroll)) openRoll({ kind: 'skill', charId: c.id, skillUid: scroll.uid, attack: true, skill: scroll })
}

/**
 * Use a Hotlist slot. Attacks open the attack roll (swapping to that weapon is free
 * as part of the Attack Action, Core p.98); Attack Spells pay Mana, then roll;
 * everything else uses the item or casts the Spell.
 */
export function triggerHotlist(ctx: Ctx, h: HotlistEntry) {
  const { c, d, up } = ctx
  const it = linkedInventory(ctx, h)
  if (it?.kind === 'scroll') {
    if (entryQty(c, h) <= 0) { toast(`No ${h.name} left`); return }
    castScroll(ctx, it)
    return
  }
  const atk = hotlistAttack(ctx, h)
  if (h.kind === 'weapon' && !atk) {
    toast(`${h.name} isn't one of this crawler's attacks anymore`)
    return
  }
  if (atk && atk.kind !== 'spell') {
    const virtual = isVirtualSkill(c, atk)
    if (!atk.wielded && !virtual) {
      up((x) => ({ ...x, skills: x.skills.map((k) => (k.kind === 'attack' ? { ...k, wielded: k.uid === atk.uid } : k)) }))
    }
    if (virtual) toast(`Untrained with ${atk.name}: Disadvantage`)
    openRoll({ kind: 'skill', charId: c.id, skillUid: atk.uid, attack: true, ...(virtual ? { skill: atk } : {}) })
    return
  }
  if (atk && atk.kind === 'spell') {
    const r = castSpell(c, atk, d)
    toast(r.message)
    if (!r.ok) return
    up(() => r.c)
    openRoll({ kind: 'skill', charId: c.id, skillUid: atk.uid, attack: true })
    return
  }
  const r = activateHotlist(c, h, d)
  if (r.ok) up(() => r.c)
  toast(r.message)
}
