import { useState } from 'react'
import { uid } from '../engine/advancement'
import { hotlistSlotFor, moveInventoryToHotlist } from '../engine/inventory'
import { GEAR_SLOTS, type GearItem, type GearSlot, type InventoryItem } from '../engine/types'
import { Icon, Sheet, Stepper, toast } from '../components/ui'
import { ModEditor, describeMod } from '../sheets/ModEditor'
import type { Ctx } from './ctx'

export function Gear(ctx: Ctx) {
  const { c, up } = ctx
  const [edit, setEdit] = useState<GearItem | null>(null)
  const [inv, setInv] = useState<InventoryItem | null>(null)

  const addGear = (slot: GearSlot) => setEdit({ uid: uid(), slot, name: '', mods: [], notes: '' })
  const saveGear = (g: GearItem) =>
    up((x) => ({ ...x, gear: x.gear.some((y) => y.uid === g.uid) ? x.gear.map((y) => (y.uid === g.uid ? g : y)) : [...x.gear, g] }))
  const unequip = (g: GearItem) =>
    up((x) => ({ ...x, gear: x.gear.filter((y) => y.uid !== g.uid), inventory: [...x.inventory, { uid: uid(), name: g.name, qty: 1, notes: [g.notes, ...g.mods.map(describeMod)].filter(Boolean).join(' · ') }] }))
  /** move an Inventory item (all of it, or `qty`) onto the Hotlist */
  const toHotlist = (it: InventoryItem, qty?: number) => {
    const slot = hotlistSlotFor(c, it.name)
    const next = moveInventoryToHotlist(c, it.uid, qty)
    if (!next) { toast('The Hotlist is full. Clear a slot first'); return false }
    up(() => next)
    toast(`${qty ?? it.qty}× ${it.name} → Hotlist slot ${slot + 1}`)
    return true
  }
  const saveInv = (it: InventoryItem) =>
    up((x) => ({ ...x, inventory: x.inventory.some((y) => y.uid === it.uid) ? x.inventory.map((y) => (y.uid === it.uid ? it : y)) : [...x.inventory, it] }))

  return (
    <div className="cols2">
      <section className="card">
        <div className="card-head"><h2>Gear slots</h2><span className="small muted">only equipped gear gives bonuses</span></div>
        <div className="list">
          {GEAR_SLOTS.map((s) => {
            const items = c.gear.filter((g) => g.slot === s.key)
            return (
              <div key={s.key} style={{ padding: '8px 0' }}>
                <div className="row between">
                  <span className="label">{s.label}{s.max > 1 ? ` (${items.length}/${s.max})` : ''}</span>
                  {items.length < s.max && <button className="btn small ghost" onClick={() => addGear(s.key)}>+ Equip</button>}
                </div>
                {items.map((g) => (
                  <button key={g.uid} className="option" style={{ marginTop: 4 }} onClick={() => setEdit(g)}>
                    <div className="grow">
                      <div className="t">{g.name || 'Unnamed'}</div>
                      <div className="small muted">{[...g.mods.map(describeMod), g.notes].filter(Boolean).join(' · ') || 'No bonuses'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <p className="small faint">One item per slot; up to 10 Accessories plus one belt and one cape. A Shield uses a Hands slot; Two-Handed weapons use both (Core p.98).</p>
      </section>

      <div>
        <section className="card">
          <div className="card-head"><h2>Wealth</h2></div>
          <div className="row between"><span>Gold</span><Stepper value={c.gold} min={0} max={9999999} step={1} editable onChange={(v) => up((x) => ({ ...x, gold: v }))} /></div>
          <div className="row between" style={{ marginTop: 8 }}><span>Misc. Junk</span><Stepper value={c.miscJunk} min={0} max={99999} editable onChange={(v) => up((x) => ({ ...x, miscJunk: v }))} /></div>
          <p className="small faint">Misc. Junk sells for 1 gold each; spend 1 to produce a mundane odd item (Core p.99).</p>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Inventory</h2>
            <button className="btn small" onClick={() => setInv({ uid: uid(), name: '', qty: 1, notes: '' })}>+ Add</button>
          </div>
          {!c.inventory.length && <div className="empty">Nothing yet. Items here are weightless and give no bonuses.</div>}
          <div className="list">
            {c.inventory.map((it) => (
              <div key={it.uid} className="li">
                <button className="main" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setInv(it)}>
                  <div className="name">{it.name}</div>
                  {it.notes && <div className="meta">{it.notes}</div>}
                </button>
                <Stepper value={it.qty} min={0} max={99999} onChange={(v) => saveInv({ ...it, qty: v })} />
                <button className="btn small icon ghost" title="Move to Hotlist" aria-label={`Move ${it.name} to Hotlist`} disabled={it.qty <= 0} onClick={() => toHotlist(it)}><Icon name="bolt" size={18} /></button>
              </div>
            ))}
          </div>
          <p className="small faint">You can lift up to Strength × 15 lb to store it (Core p.98).</p>
        </section>
      </div>

      {edit && (
        <Sheet title={edit.name || 'Equip item'} onClose={() => setEdit(null)}>
          <GearEditor
            item={c.gear.find((g) => g.uid === edit.uid) ?? edit}
            onSave={(g) => { saveGear(g); setEdit(null) }}
            onUnequip={c.gear.some((g) => g.uid === edit.uid) ? (g) => { unequip(g); setEdit(null) } : undefined}
            onDelete={c.gear.some((g) => g.uid === edit.uid) ? () => { up((x) => ({ ...x, gear: x.gear.filter((y) => y.uid !== edit.uid) })); setEdit(null) } : undefined}
          />
        </Sheet>
      )}
      {inv && (
        <Sheet title={inv.name || 'Inventory item'} onClose={() => setInv(null)}>
          <InvEditor item={c.inventory.find((i) => i.uid === inv.uid) ?? inv}
            hotlistSlot={c.inventory.some((i) => i.uid === inv.uid) ? hotlistSlotFor(c, inv.name) : undefined}
            onHotlist={(qty) => { const cur = c.inventory.find((i) => i.uid === inv.uid); if (cur && toHotlist(cur, qty)) setInv(null) }}
            onSave={(it) => { saveInv(it); setInv(null) }}
            onDelete={() => { up((x) => ({ ...x, inventory: x.inventory.filter((y) => y.uid !== inv.uid) })); setInv(null) }}
            onEquip={(slot) => {
              up((x) => ({ ...x, inventory: x.inventory.filter((y) => y.uid !== inv.uid), gear: [...x.gear, { uid: uid(), slot, name: inv.name, mods: [], notes: inv.notes }] }))
              setInv(null)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

function GearEditor({ item, onSave, onUnequip, onDelete }: { item: GearItem; onSave: (g: GearItem) => void; onUnequip?: (g: GearItem) => void; onDelete?: () => void }) {
  const [g, setG] = useState(item)
  return (
    <div className="stack">
      <label><span className="label">Name</span><input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="e.g. Enchanted Bigboi Boxers" /></label>
      <label><span className="label">Slot</span>
        <select value={g.slot} onChange={(e) => setG({ ...g, slot: e.target.value as GearSlot })}>
          {GEAR_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <div className="label">Bonuses (apply while equipped)</div>
      <ModEditor mods={g.mods} onChange={(mods) => setG({ ...g, mods })} />
      <label><span className="label">Notes (Buffs, charges, effects)</span><input value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></label>
      <button className="btn primary" disabled={!g.name.trim()} onClick={() => onSave(g)}>Save</button>
      {onUnequip && <button className="btn" onClick={() => onUnequip(g)}>Unequip to Inventory</button>}
      {onDelete && <button className="btn danger" onClick={onDelete}>Delete item</button>}
    </div>
  )
}

function InvEditor({ item, onSave, onDelete, onEquip, hotlistSlot, onHotlist }: {
  item: InventoryItem
  onSave: (i: InventoryItem) => void
  onDelete: () => void
  onEquip: (s: GearSlot) => void
  /** where "Move to Hotlist" would put it (-1: Hotlist full; undefined: item not saved yet) */
  hotlistSlot?: number
  onHotlist: (qty?: number) => void
}) {
  const [it, setIt] = useState(item)
  const [slot, setSlot] = useState<GearSlot>('accessory')
  return (
    <div className="stack">
      <label><span className="label">Name</span><input value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} /></label>
      <div className="row between"><span>Quantity</span><Stepper value={it.qty} min={0} max={99999} editable onChange={(qty) => setIt({ ...it, qty })} /></div>
      <label><span className="label">Notes</span><input value={it.notes} onChange={(e) => setIt({ ...it, notes: e.target.value })} /></label>
      <button className="btn primary" disabled={!it.name.trim()} onClick={() => onSave(it)}>Save</button>
      <div className="row">
        <select value={slot} onChange={(e) => setSlot(e.target.value as GearSlot)} style={{ flex: 1 }}>
          {GEAR_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn" onClick={() => onEquip(slot)}>Equip</button>
      </div>
      {hotlistSlot !== undefined && (
        <div className="stack">
          <div className="label">Hotlist (use in combat)</div>
          {hotlistSlot < 0 ? (
            <p className="small muted" style={{ margin: 0 }}>The Hotlist is full. Clear a slot on the Hotlist tab first.</p>
          ) : (
            <div className={item.qty > 1 ? 'grid2' : ''}>
              {item.qty > 1 && <button className="btn" onClick={() => onHotlist(1)}>Move 1 to Hotlist</button>}
              <button className="btn good" style={{ width: '100%' }} disabled={item.qty <= 0} onClick={() => onHotlist()}>
                {item.qty > 1 ? `Move all ${item.qty}` : 'Move to Hotlist'} (slot {hotlistSlot + 1})
              </button>
            </div>
          )}
        </div>
      )}
      <button className="btn danger" onClick={onDelete}>Delete</button>
    </div>
  )
}
