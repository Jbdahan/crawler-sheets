import { useState } from 'react'
import { ITEMS, findSkill, normName } from '../data'
import { isAttackSkill } from '../engine/attacks'
import { uid } from '../engine/advancement'
import { HOTLIST_STACK, moveHotlistToInventory, moveInventoryToHotlist } from '../engine/inventory'
import { HOTLIST_SIZE, type HotlistEntry } from '../engine/types'
import { PageRef, Seg, Sheet, Stepper } from '../components/ui'
import { SpellText } from '../components/SpellText'
import { attackLine, hotlistAttack, triggerHotlist } from './hotlistUse'
import type { Ctx } from './ctx'

export function Hotlist(ctx: Ctx) {
  const { c, up } = ctx
  const [edit, setEdit] = useState<number | null>(null)
  const setQty = (i: number, qty: number) =>
    up((x) => ({ ...x, hotlist: x.hotlist.map((h, j) => (j === i && h ? { ...h, qty } : h)) }))
  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        10 slots for quick access in combat: using one costs an Action (swapping weapons is free with an Attack). Up to 999 of one item per slot. Spells must be here to cast them in combat. Attacks here roll to hit and damage when tapped (Core p.98, 111, 202).
      </p>
      <div className="hot">
        {c.hotlist.slice(0, HOTLIST_SIZE).map((h, i) => {
          if (!h) {
            return (
              <button key={`e${i}`} className="hotslot emptyslot" onClick={() => setEdit(i)}>
                <span style={{ fontSize: '1.4rem' }}>+</span>
                <span className="tiny">Slot {i + 1}</span>
              </button>
            )
          }
          const atk = hotlistAttack(ctx, h)
          return (
            <div key={h.uid} className="hotslot">
              <button style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setEdit(i)}>
                <div className="n">{h.name}</div>
                {h.kind === 'spell' ? <div className="tiny muted">{spellNote(ctx, h)}</div> : null}
                {atk && <div className="small num" style={{ fontWeight: 800, color: 'var(--accent)' }}>{attackLine(ctx, atk)}</div>}
              </button>
              {h.kind === 'spell'
                ? spellNotes(ctx, h) && <SpellText text={spellNotes(ctx, h)} lines={2} />
                : h.kind === 'item' && h.notes && <SpellText text={h.notes} lines={3} />}
              <div className="grow" />
              {h.kind === 'item' && (
                <div className="row between">
                  <span className="q num" style={{ color: h.qty ? undefined : 'var(--danger)' }}>×{h.qty}</span>
                  <span className="row" style={{ gap: 2 }}>
                    <button className="btn small icon" style={{ width: 30, minHeight: 30 }} onClick={() => setQty(i, Math.max(0, h.qty - 1))}>−</button>
                    <button className="btn small icon" style={{ width: 30, minHeight: 30 }} onClick={() => setQty(i, Math.min(999, h.qty + 1))}>+</button>
                  </span>
                </div>
              )}
              <button className={`btn small ${h.kind === 'spell' ? 'mana' : atk ? 'primary' : 'good'}`} disabled={h.kind === 'item' && h.consumable && h.qty <= 0} onClick={() => triggerHotlist(ctx, h)}>
                {atk ? (h.kind === 'spell' ? 'Cast & attack 🎲' : 'Attack 🎲') : h.kind === 'spell' ? 'Cast' : h.consumable ? 'Use' : 'Use'}
              </button>
            </div>
          )
        })}
      </div>
      {edit !== null && <HotlistEditor {...ctx} index={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function spellNote({ c }: Ctx, h: HotlistEntry) {
  const s = c.skills.find((x) => x.uid === h.skillUid)
  const def = findSkill(s?.skillId)
  const cost = s?.customMana ?? def?.mana
  return [cost !== undefined ? `${cost} Mana` : '', def?.summary].filter(Boolean).join(' · ')
}

/** a custom Spell's full entry lives in its notes */
function spellNotes({ c }: Ctx, h: HotlistEntry) {
  const s = c.skills.find((x) => x.uid === h.skillUid)
  return findSkill(s?.skillId) ? '' : [s?.notes, h.notes].filter(Boolean).join(' · ')
}

function HotlistEditor(ctx: Ctx & { index: number; onClose: () => void }) {
  const { c, up, index, onClose } = ctx
  const cur = c.hotlist[index]
  const [tab, setTab] = useState<'item' | 'inventory' | 'spell' | 'weapon' | 'custom'>(cur ? (cur.kind === 'item' ? 'custom' : cur.kind) : c.inventory.length ? 'inventory' : 'item')
  const [draft, setDraft] = useState<HotlistEntry>(cur ?? { uid: uid(), name: '', qty: 1, kind: 'item', notes: '', consumable: true })
  const save = (entry: HotlistEntry | null) => {
    up((x) => ({ ...x, hotlist: x.hotlist.map((h, j) => (j === index ? entry : h)) }))
    onClose()
  }
  const spells = c.skills.filter((s) => s.kind === 'spell')
  const weapons = c.skills.filter((s) => s.kind === 'attack' && isAttackSkill(s))
  return (
    <Sheet title={cur ? `Slot ${index + 1}: ${cur.name}` : `Hotlist slot ${index + 1}`} onClose={onClose}>
      <div className="stack">
        <Seg value={tab} onChange={setTab} options={[{ value: 'inventory', label: 'Inventory' }, { value: 'item', label: 'Items' }, { value: 'spell', label: 'Spells' }, { value: 'weapon', label: 'Attacks' }, { value: 'custom', label: 'Custom / edit' }]} />
        {tab === 'item' && (
          <div className="list">
            {ITEMS.map((it) => (
              <div className="li" key={it.id}>
                <div className="main"><div className="name">{it.name}</div><div className="meta">{it.summary}</div></div>
                <PageRef page={it.page} />
                <button className="btn small good" onClick={() => save({ uid: uid(), name: it.name, qty: 1, kind: 'item', notes: it.summary, heal: it.heal, restoreMana: it.restoreMana, removesDebuff: it.removesDebuff, consumable: it.consumable })}>Put here</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'inventory' && (
          <div className="list">
            {!c.inventory.length && <div className="empty">Inventory is empty. Scrolls, potions and other loot land there first.</div>}
            {c.inventory.map((it) => {
              // this slot must be empty or already hold the same item
              const fits = !cur || (cur.kind === 'item' && normName(cur.name) === normName(it.name) && cur.qty < HOTLIST_STACK)
              const move = (qty?: number) => {
                const next = moveInventoryToHotlist(c, it.uid, qty, index)
                if (next) { up(() => next); onClose() }
              }
              return (
                <div className="li" key={it.uid}>
                  <div className="main"><div className="name">{it.name} <span className="muted num">×{it.qty}</span></div>{it.notes && <div className="meta">{it.notes}</div>}</div>
                  {it.qty > 1 && <button className="btn small" disabled={!fits} onClick={() => move(1)}>Move 1</button>}
                  <button className="btn small good" disabled={!fits || it.qty <= 0} onClick={() => move()}>{it.qty > 1 ? 'Move all' : 'Put here'}</button>
                </div>
              )
            })}
            {cur && <p className="small faint">This slot already holds {cur.name}. Only more of the same item can go here; clear the slot first to swap.</p>}
            <p className="small faint">Moving takes the items out of Inventory. Up to {HOTLIST_STACK} of one item per slot.</p>
          </div>
        )}
        {tab === 'spell' && (
          <div className="list">
            {!spells.length && <div className="empty">This crawler has no Spells yet.</div>}
            {spells.map((s) => (
              <div className="li" key={s.uid}>
                <div className="main"><div className="name">{s.name}</div><div className="meta">Rank {s.rank} · {findSkill(s.skillId)?.manaText ?? s.customMana ?? '?'} Mana</div></div>
                <button className="btn small mana" onClick={() => save({ uid: uid(), name: s.name, qty: 1, kind: 'spell', skillUid: s.uid, notes: '' })}>Put here</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'weapon' && (
          <div className="list">
            {!weapons.length && <div className="empty">No attack Skills yet. Add one on the Skills tab.</div>}
            {weapons.map((s) => (
              <div className="li" key={s.uid}>
                <div className="main"><div className="name">{s.name}</div><div className="meta num">Rank {s.rank} · {attackLine(ctx, s)}</div></div>
                <button className="btn small primary" onClick={() => save({ uid: uid(), name: s.name, qty: 1, kind: 'weapon', skillUid: s.uid, notes: '', consumable: false })}>Put here</button>
              </div>
            ))}
            <p className="small faint">Tapping an attack slot rolls to hit, then damage. Attack Spells (Fire Fingers, Magic Missile…) go under Spells and spend their Mana when cast.</p>
          </div>
        )}
        {tab === 'custom' && (
          <div className="stack">
            <label><span className="label">Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Scroll of Bang Bro (Rank 3)" /></label>
            <div className="row between"><span>Quantity</span><Stepper value={draft.qty} min={0} max={999} onChange={(qty) => setDraft({ ...draft, qty })} editable /></div>
            <label><span className="label">Notes / modifiers</span><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            <div className="grid2">
              <label><span className="label">Heals slots</span><input inputMode="numeric" value={draft.heal?.slots ?? ''} placeholder="0"
                onChange={(e) => setDraft({ ...draft, heal: e.target.value ? { slots: Number(e.target.value.replace(/\D/g, '')) } : undefined })} /></label>
              <label><span className="label">Restores Mana</span>
                <select value={draft.restoreMana === 'full' ? 'full' : draft.restoreMana ? 'some' : ''} onChange={(e) => setDraft({ ...draft, restoreMana: e.target.value === 'full' ? 'full' : e.target.value === 'some' ? 5 : undefined })}>
                  <option value="">No</option><option value="full">Full</option><option value="some">+5</option>
                </select>
              </label>
            </div>
            <label className="row small"><input type="checkbox" checked={!!draft.consumable} onChange={(e) => setDraft({ ...draft, consumable: e.target.checked })} /> Used up when used (potion, scroll, bomb)</label>
            <button className="btn primary" disabled={!draft.name.trim()} onClick={() => save({ ...draft, kind: draft.kind === 'spell' ? 'spell' : draft.kind })}>Save slot</button>
          </div>
        )}
        {cur?.kind === 'item' && cur.qty > 0 && (
          <button className="btn" onClick={() => { up((x) => moveHotlistToInventory(x, index)); onClose() }}>Move back to Inventory (×{cur.qty})</button>
        )}
        {cur && <button className="btn danger" onClick={() => save(null)}>Clear slot</button>}
      </div>
    </Sheet>
  )
}
