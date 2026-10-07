import { useState } from 'react'
import { ITEMS, findSkill } from '../data'
import { isAttackSkill } from '../engine/attacks'
import { uid } from '../engine/advancement'
import { HOTLIST_STACK, addToHotlist, entryQty, hotlistSlotOfInventory, linkInventoryToHotlist, removeFromHotlist, setHotlistQty } from '../engine/inventory'
import { HOTLIST_SIZE, type HotlistEntry } from '../engine/types'
import { PageRef, Seg, Sheet, Stepper } from '../components/ui'
import { SpellText } from '../components/SpellText'
import { swapSlots, useSlotDrag } from '../components/useSlotDrag'
import { attackLine, hotlistAttack, triggerHotlist } from './hotlistUse'
import { AMMO_NOUN, basicCount, loadedAmmo, usesAmmo } from '../engine/ammo'
import type { Ctx } from './ctx'

export function Hotlist(ctx: Ctx) {
  const { c, up } = ctx
  const [edit, setEdit] = useState<number | null>(null)
  /** counts live on the linked Inventory item */
  const setQty = (i: number, qty: number) =>
    up((x) => (x.hotlist[i] ? setHotlistQty(x, x.hotlist[i]!, qty) : x))
  const { slotProps, ghost } = useSlotDrag((from, to) => up((x) => ({ ...x, hotlist: swapSlots(x.hotlist, from, to) })))
  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        10 slots for quick access in combat: using one costs an Action (swapping weapons is free with an Attack). Up to 999 of one item per slot. Spells must be here to cast them in combat. Attacks here roll to hit and damage when tapped (Core p.98, 111, 202).
      </p>
      <p className="small muted">Press and hold a slot, then drag it onto another slot to rearrange.</p>
      <div className="hot">
        {c.hotlist.slice(0, HOTLIST_SIZE).map((h, i) => {
          if (!h) {
            const sp = slotProps(i, null)
            return (
              <button key={`e${i}`} {...sp} className={`hotslot emptyslot${sp.className}`} onClick={() => setEdit(i)}>
                <span style={{ fontSize: '1.4rem' }}>+</span>
                <span className="tiny">Slot {i + 1}</span>
              </button>
            )
          }
          const atk = hotlistAttack(ctx, h)
          const qty = entryQty(c, h)
          const sp = slotProps(i, h.name)
          return (
            <div key={h.uid} {...sp} className={`hotslot${sp.className}`}>
              <button style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setEdit(i)}>
                <div className="n">{h.name}</div>
                {h.kind === 'spell' ? <div className="tiny muted">{spellNote(ctx, h)}</div> : null}
                {atk && <div className="small num" style={{ fontWeight: 800, color: 'var(--accent)' }}>{attackLine(ctx, atk)}</div>}
                {atk && usesAmmo(atk) && (() => {
                  const l = loadedAmmo(c, atk)
                  return <div className="tiny muted">{l ? `${l.name} ×${l.qty}` : `Basic ${AMMO_NOUN[atk.skillId!].toLowerCase()}${atk.trackBasicAmmo ? ` ×${basicCount(c, atk.skillId)}` : ''}`}</div>
                })()}
              </button>
              {h.kind === 'spell'
                ? spellNotes(ctx, h) && <SpellText text={spellNotes(ctx, h)} lines={2} />
                : h.kind === 'item' && h.notes && <SpellText text={h.notes} lines={3} />}
              <div className="grow" />
              {h.kind === 'item' && h.gearUid && <div className="tiny muted">Equipped gear</div>}
              {h.kind === 'item' && !h.gearUid && (
                <div className="row between">
                  <span className="q num" style={{ color: qty ? undefined : 'var(--danger)' }}>×{qty}</span>
                  <span className="row" style={{ gap: 2 }}>
                    <button className="btn small icon" style={{ width: 30, minHeight: 30 }} onClick={() => setQty(i, qty - 1)}>−</button>
                    <button className="btn small icon" style={{ width: 30, minHeight: 30 }} onClick={() => setQty(i, qty + 1)}>+</button>
                  </span>
                </div>
              )}
              {h.invUid && <div className="tiny faint">In Inventory</div>}
              <button className={`btn small ${h.kind === 'spell' ? 'mana' : atk ? 'primary' : 'good'}`} disabled={h.kind === 'item' && h.consumable && qty <= 0} onClick={() => triggerHotlist(ctx, h)}>
                {atk ? (h.kind === 'spell' ? 'Cast & attack' : 'Attack') : h.kind === 'spell' ? 'Cast' : 'Use'}
              </button>
            </div>
          )
        })}
      </div>
      {ghost}
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
  const curInv = cur?.invUid ? c.inventory.find((i) => i.uid === cur.invUid) : undefined
  const [draft, setDraft] = useState<HotlistEntry>(cur ? { ...cur, qty: entryQty(c, cur) } : { uid: uid(), name: '', qty: 1, kind: 'item', notes: '', consumable: true })
  const save = (entry: HotlistEntry | null) => {
    up((x) => ({ ...x, hotlist: x.hotlist.map((h, j) => (j === index ? entry : h)) }))
    onClose()
  }
  /** items go into Inventory and this slot shows them; `extra` keeps custom effects (heal, Mana…) */
  const placeItem = (name: string, qty: number, notes: string, extra: Partial<HotlistEntry> = {}) => {
    up((x) => {
      const next = addToHotlist(removeFromHotlist(x, index), name, qty, notes, index)
      if (!next) return x
      return { ...next, hotlist: next.hotlist.map((h, j) => (j === index && h ? { ...h, ...extra } : h)) }
    })
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
                <button className="btn small good" onClick={() => placeItem(it.name, 1, '')}>Put here</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'inventory' && (
          <div className="list">
            {!c.inventory.length && <div className="empty">Inventory is empty. Scrolls, potions and other loot land there first.</div>}
            {c.inventory.map((it) => {
              const at = hotlistSlotOfInventory(c, it.uid)
              const link = () => {
                up((x) => linkInventoryToHotlist(at === index ? x : removeFromHotlist(x, index), it.uid, index) ?? x)
                onClose()
              }
              return (
                <div className="li" key={it.uid}>
                  <div className="main">
                    <div className="name">{it.name} <span className="muted num">×{it.qty}</span> {at >= 0 && <span className="pill accent">Hotlist #{at + 1}</span>}</div>
                    {it.notes && <div className="meta">{it.notes}</div>}
                  </div>
                  <button className="btn small good" disabled={at === index} onClick={link}>{at === index ? 'Here' : at >= 0 ? 'Move here' : 'Put here'}</button>
                </div>
              )
            })}
            <p className="small faint">Items stay in Inventory; this slot shows them and uses the same count (up to {HOTLIST_STACK} per slot).</p>
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
            <button className="btn primary" disabled={!draft.name.trim()} onClick={() => {
              const extra = { heal: draft.heal, restoreMana: draft.restoreMana, consumable: draft.consumable }
              if (draft.kind !== 'item') { save({ ...draft }); return }
              if (curInv) {
                // editing an item already shown here: update the Inventory item it points at
                up((x) => ({
                  ...x,
                  inventory: x.inventory.map((i) => (i.uid === curInv.uid ? { ...i, name: draft.name.trim(), qty: draft.qty, notes: draft.notes } : i)),
                  hotlist: x.hotlist.map((h, j) => (j === index && h ? { ...h, ...extra, name: draft.name.trim(), notes: draft.notes } : h)),
                }))
                onClose()
                return
              }
              placeItem(draft.name.trim(), draft.qty, draft.notes, extra)
            }}>Save slot</button>
          </div>
        )}
        {cur && (
          <button className="btn danger" onClick={() => save(null)}>
            {cur.invUid ? 'Remove from Hotlist (stays in Inventory)' : cur.gearUid ? 'Remove from Hotlist (stays equipped)' : 'Clear slot'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
