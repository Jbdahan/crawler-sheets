import { signed, toast } from '../components/ui'
import { openRoll } from '../components/Roller'
import { activateHotlist, castSpell } from '../engine/actions'
import { attackCalc, isAttackSkill } from '../engine/attacks'
import type { CharSkill, HotlistEntry } from '../engine/types'
import type { Ctx } from './ctx'

/** The Skill a Hotlist slot points at (older slots may only have the name). */
export function hotlistSkill({ c }: Pick<Ctx, 'c'>, h: HotlistEntry): CharSkill | undefined {
  return c.skills.find((x) => x.uid === h.skillUid) ?? (h.kind !== 'item' ? c.skills.find((x) => x.name === h.name) : undefined)
}

/** Slots that roll an attack when used: weapons/attack Skills and Attack Spells. */
export function hotlistAttack(ctx: Pick<Ctx, 'c'>, h: HotlistEntry): CharSkill | undefined {
  if (h.kind === 'item') return undefined
  const s = hotlistSkill(ctx, h)
  return s && isAttackSkill(s) ? s : undefined
}

/** "+13 · 2d10+5" for an attack slot */
export function attackLine({ c, d }: Pick<Ctx, 'c' | 'd'>, s: CharSkill): string {
  const a = attackCalc(c, s, d)
  return `${signed(a.toHit.total)} · ${a.formula}`
}

/**
 * Use a Hotlist slot. Attacks open the attack roll (swapping to that weapon is free
 * as part of the Attack Action, Core p.98); Attack Spells pay Mana, then roll;
 * everything else uses the item or casts the Spell.
 */
export function triggerHotlist(ctx: Ctx, h: HotlistEntry) {
  const { c, d, up } = ctx
  const atk = hotlistAttack(ctx, h)
  if (h.kind === 'weapon' && !atk) {
    toast(`${h.name} isn't one of this crawler's attacks anymore`)
    return
  }
  if (atk && atk.kind !== 'spell') {
    if (!atk.wielded) {
      up((x) => ({ ...x, skills: x.skills.map((k) => (k.kind === 'attack' ? { ...k, wielded: k.uid === atk.uid } : k)) }))
    }
    openRoll({ kind: 'skill', charId: c.id, skillUid: atk.uid, attack: true })
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
