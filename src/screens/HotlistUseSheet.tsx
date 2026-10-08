import { useState } from 'react'
import { findSkill } from '../data'
import { ammoKey, ammoNoun, basicCount, describeAmmo, loadedAmmo, specialAmmo } from '../engine/ammo'
import { attackCalc } from '../engine/attacks'
import { effectiveRank } from '../engine/derived'
import { entryQty } from '../engine/inventory'
import { isVirtualSkill, itemLinkLabel } from '../engine/items'
import type { HotlistEntry } from '../engine/types'
import { SpellText } from '../components/SpellText'
import { SpellEffect } from '../components/SpellEffect'
import { Sheet, signed } from '../components/ui'
import { go } from '../router'
import { hotlistAttack, hotlistScroll, hotlistSkill, hotlistWeapon, triggerHotlist } from './hotlistUse'
import type { Ctx } from './ctx'

/** "" = basic ammo; otherwise the special ammo stack's Inventory uid */
type AmmoPick = string

/**
 * Confirm before using a Hotlist slot from the HUD: shows what it does and, for weapons that
 * fire ammo, lets you pick basic or a special ammo stack (it becomes the loaded ammo).
 */
export function HotlistUseSheet(ctx: Ctx & { h: HotlistEntry; slot: number; onClose: () => void }) {
  const { c, d, up, h, slot, onClose } = ctx
  const atk = hotlistAttack(ctx, h)
  const weapon = hotlistWeapon(ctx, h)
  const spell = h.kind === 'spell' ? hotlistSkill(ctx, h) : undefined
  const scroll = hotlistScroll(ctx, h)
  const item = h.invUid ? c.inventory.find((i) => i.uid === h.invUid) : undefined
  const qty = entryQty(c, h)

  // ammo: only for Attack Skills on the sheet (loading is stored on the Skill)
  const key = atk && atk.kind !== 'spell' && !isVirtualSkill(c, atk) ? ammoKey(c, atk, weapon ?? undefined) : undefined
  const special = key ? specialAmmo(c, key) : []
  const loaded = atk && key ? loadedAmmo(c, atk, key) : undefined
  const [pick, setPick] = useState<AmmoPick>(loaded && loaded.qty > 0 ? loaded.uid : '')
  const picked = special.find((i) => i.uid === pick)

  const a = atk ? attackCalc(c, atk, d, { ...(weapon ? { weapon } : {}), ...(key ? { ammo: picked && picked.qty > 0 ? picked : null } : {}) }) : undefined
  const cost = spell ? spell.customMana ?? findSkill(spell.skillId)?.mana : undefined
  const def = findSkill((spell ?? scroll)?.skillId)

  // why it can't be used right now
  const blocked =
    h.kind === 'item' && h.consumable && qty <= 0 ? `No ${h.name} left` :
    h.kind === 'spell' && d.flags.cantCast ? "A Debuff stops you casting" :
    h.kind === 'spell' && cost !== undefined && c.mana < cost ? `Not enough Mana (${c.mana} of ${cost})` :
    atk && d.flags.cantAct ? "A Debuff stops you acting" : ''
  const verb = atk ? (atk.kind === 'spell' ? 'Cast & attack' : 'Attack') : h.kind === 'spell' ? 'Cast' : scroll ? 'Read scroll' : 'Use'

  const confirm = () => {
    // load the chosen ammo on the Skill, then use the slot as before
    if (atk && key && (loaded?.uid ?? '') !== pick) {
      up((x) => ({ ...x, skills: x.skills.map((s) => (s.uid === atk.uid ? { ...s, ammoUid: pick || undefined } : s)) }))
    }
    onClose()
    triggerHotlist(ctx, h)
  }

  return (
    <Sheet title={h.name} onClose={onClose}>
      <div className="stack">
        <div className="small muted">Hotlist slot {slot + 1}{h.gearUid ? ' · equipped' : item ? ` · ×${qty} in Inventory` : ''}</div>

        {a && (
          <div className="infobox num">
            <div>To hit <b>{signed(a.toHit.total)}</b>{a.mode !== 'normal' && <span className="muted"> ({a.mode === 'disadvantage' ? 'Disadvantage' : 'Advantage'}{a.modeReasons.length ? `: ${a.modeReasons.join(', ')}` : ''})</span>}</div>
            <div>Damage <b>{a.formula}</b> {a.types.join('/')}</div>
            {(a.range || a.area) && <div className="small muted">{[a.range, a.area].filter(Boolean).join(' · ')}</div>}
            {a.weapon && <div className="small muted">Using {a.weapon}'s own damage</div>}
            {a.mana !== undefined && atk?.kind === 'spell' && <div className="small">{a.mana} Mana (you have {c.mana})</div>}
          </div>
        )}

        {a && atk?.kind === 'spell' && def && <SpellEffect def={def} rank={effectiveRank(c, atk)} small />}

        {key && (
          <div className="stack">
            <div className="label">{ammoNoun(key)} to fire</div>
            <div className="list">
              <label className="li" style={{ gap: 10 }}>
                <input type="radio" name="ammo" checked={pick === ''} onChange={() => setPick('')} />
                <div className="main">
                  <div className="name">Basic {ammoNoun(key).toLowerCase()}</div>
                  <div className="meta">{atk!.trackBasicAmmo ? `${basicCount(c, key)} in Inventory` : 'Not counted'}</div>
                </div>
              </label>
              {special.map((i) => (
                <label key={i.uid} className="li" style={{ gap: 10, opacity: i.qty > 0 ? 1 : 0.5 }}>
                  <input type="radio" name="ammo" disabled={i.qty <= 0} checked={pick === i.uid} onChange={() => setPick(i.uid)} />
                  <div className="main">
                    <div className="name">{i.name} <span className="muted num">×{i.qty}</span>{i.uid === loaded?.uid && <span className="pill accent" style={{ marginLeft: 6 }}>Loaded</span>}</div>
                    <div className="meta">{describeAmmo(i.ammo)}</div>
                  </div>
                </label>
              ))}
            </div>
            {!special.length && <p className="small faint" style={{ margin: 0 }}>No special {ammoNoun(key).toLowerCase()} in Inventory.</p>}
            {special.length > 0 && <p className="small faint" style={{ margin: 0 }}>Your pick stays loaded for later attacks.</p>}
          </div>
        )}

        {!a && spell && (
          <div className="infobox">
            <div>{cost !== undefined ? <><b>{cost} Mana</b> (you have {c.mana})</> : 'Spell'} · Rank {spell.rank}</div>
            {def && <div style={{ marginTop: 6 }}><SpellEffect def={def} rank={effectiveRank(c, spell)} small /></div>}
            {!def && spell.notes && <SpellText text={spell.notes} lines={3} />}
          </div>
        )}
        {!a && scroll && (
          <div className="infobox small">
            Casts {scroll.name} at Rank {scroll.rank} with no Mana, then crumbles (Core p.99).
            {def && <div style={{ marginTop: 6 }}><SpellEffect def={def} rank={scroll.rank} small /></div>}
          </div>
        )}
        {!a && !spell && !scroll && (
          <div className="infobox small">
            {item ? itemLinkLabel(item) || null : null}
            {h.notes ? <SpellText text={h.notes} lines={4} /> : !item ? <span className="muted">No notes.</span> : null}
            {h.consumable && <div className="muted">Using one uses it up ({qty} left).</div>}
          </div>
        )}

        {blocked && <div className="warnbox small">{blocked}</div>}
        <button className="btn primary" disabled={!!blocked} onClick={confirm}>
          {verb}{picked ? ` with ${picked.name}` : key ? ` (basic ${ammoNoun(key).toLowerCase()})` : ''}
        </button>
        <div className="grid2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn ghost" onClick={() => { onClose(); go(`/c/${c.id}/hotlist`) }}>Edit Hotlist</button>
        </div>
      </div>
    </Sheet>
  )
}
