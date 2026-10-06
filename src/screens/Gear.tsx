import { useState } from 'react'
import { uid } from '../engine/advancement'
import { addInventoryItems, hotlistItem, hotlistSlotOfGear, hotlistSlotOfInventory, linkGearToHotlist, linkHotlistItems, linkInventoryToHotlist, parseItemLines, removeFromHotlist, type ParsedItem } from '../engine/inventory'
import { GEAR_SLOTS, type GearItem, type GearSlot, type InventoryItem } from '../engine/types'
import { Icon, Sheet, Stepper, toast } from '../components/ui'
import { ModEditor, describeMod } from '../sheets/ModEditor'
import type { Ctx } from './ctx'

export function Gear(ctx: Ctx) {
  const { c, up } = ctx
  const [edit, setEdit] = useState<GearItem | null>(null)
  const [inv, setInv] = useState<InventoryItem | null>(null)
  const [bulk, setBulk] = useState(false)

  const addGear = (slot: GearSlot) => setEdit({ uid: uid(), slot, name: '', mods: [], notes: '' })
  const saveGear = (g: GearItem) =>
    up((x) => ({ ...x, gear: x.gear.some((y) => y.uid === g.uid) ? x.gear.map((y) => (y.uid === g.uid ? g : y)) : [...x.gear, g] }))
  /** unequip into Inventory; a Hotlist slot showing it follows it to Inventory */
  const unequip = (g: GearItem) =>
    up((x) => {
      const item = { uid: uid(), name: g.name, qty: 1, notes: [g.notes, ...g.mods.map(describeMod)].filter(Boolean).join(' · ') }
      return {
        ...x,
        gear: x.gear.filter((y) => y.uid !== g.uid),
        inventory: [...x.inventory, item],
        hotlist: x.hotlist.map((h) => (h?.gearUid === g.uid ? hotlistItem(item.name, item.notes, { invUid: item.uid }) : h)),
      }
    })
  /** Hotlist on/off for an Inventory item: it always stays in Inventory */
  const toggleInvHotlist = (it: InventoryItem) => {
    const at = hotlistSlotOfInventory(c, it.uid)
    if (at >= 0) {
      up((x) => removeFromHotlist(x, at))
      toast(`${it.name} removed from the Hotlist (still in Inventory)`)
      return
    }
    const next = linkInventoryToHotlist(c, it.uid)
    if (!next) { toast('The Hotlist is full. Clear a slot first'); return }
    up(() => next)
    toast(`${it.name} on Hotlist slot ${hotlistSlotOfInventory(next, it.uid) + 1}`)
  }
  /** Hotlist on/off for an equipped Gear item: it stays equipped */
  const toggleGearHotlist = (g: GearItem) => {
    const at = hotlistSlotOfGear(c, g.uid)
    if (at >= 0) {
      up((x) => removeFromHotlist(x, at))
      toast(`${g.name} removed from the Hotlist (still equipped)`)
      return
    }
    const next = linkGearToHotlist(c, g.uid)
    if (!next) { toast('The Hotlist is full. Clear a slot first'); return }
    up(() => next)
    toast(`${g.name} on Hotlist slot ${hotlistSlotOfGear(next, g.uid) + 1}`)
  }
  /** equipped Accessories also list in Inventory (same item, not a copy) */
  const accessories = c.gear.filter((g) => g.slot === 'accessory')
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
                      <div className="t">{g.name || 'Unnamed'} {hotlistSlotOfGear(c, g.uid) >= 0 && <span className="pill accent">Hotlist #{hotlistSlotOfGear(c, g.uid) + 1}</span>}</div>
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
            <button className="btn small" onClick={() => setBulk(true)}>+ Add a list</button>
            <button className="btn small" onClick={() => setInv({ uid: uid(), name: '', qty: 1, notes: '' })}>+ Add</button>
          </div>
          {!c.inventory.length && !accessories.length && <div className="empty">Nothing yet. Items here are weightless and give no bonuses.</div>}
          <div className="list">
            {accessories.map((g) => (
              <div key={g.uid} className="li">
                <button className="main" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEdit(g)}>
                  <div className="name">{g.name || 'Unnamed'} <span className="pill good">Equipped</span></div>
                  <div className="meta">{['Accessory', ...g.mods.map(describeMod), g.notes].filter(Boolean).join(' · ')}</div>
                </button>
              </div>
            ))}
            {c.inventory.map((it) => (
              <div key={it.uid} className="li">
                <button className="main" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setInv(it)}>
                  <div className="name">{it.name} {hotlistSlotOfInventory(c, it.uid) >= 0 && <span className="pill accent">Hotlist #{hotlistSlotOfInventory(c, it.uid) + 1}</span>}</div>
                  {it.notes && <div className="meta">{it.notes}</div>}
                </button>
                <Stepper value={it.qty} min={0} max={99999} onChange={(v) => saveInv({ ...it, qty: v })} />
                <button className={`btn small icon ${hotlistSlotOfInventory(c, it.uid) >= 0 ? 'primary' : 'ghost'}`}
                  title={hotlistSlotOfInventory(c, it.uid) >= 0 ? 'Remove from Hotlist' : 'Show on Hotlist'}
                  aria-label={`${hotlistSlotOfInventory(c, it.uid) >= 0 ? 'Remove' : 'Show'} ${it.name} ${hotlistSlotOfInventory(c, it.uid) >= 0 ? 'from' : 'on'} Hotlist`}
                  onClick={() => toggleInvHotlist(it)}><Icon name="bolt" size={18} /></button>
              </div>
            ))}
          </div>
          <p className="small faint">You can lift up to Strength × 15 lb to store it (Core p.98).</p>
        </section>
      </div>

      {bulk && (
        <BulkAdd onClose={() => setBulk(false)} onAdd={(items) => {
          up((x) => addInventoryItems(x, items))
          toast(`Added ${items.length} item${items.length === 1 ? '' : 's'} to Inventory`)
          setBulk(false)
        }} />
      )}
      {edit && (
        <Sheet title={edit.name || 'Equip item'} onClose={() => setEdit(null)}>
          <GearEditor
            item={c.gear.find((g) => g.uid === edit.uid) ?? edit}
            onSave={(g) => { saveGear(g); setEdit(null) }}
            onUnequip={c.gear.some((g) => g.uid === edit.uid) ? (g) => { unequip(g); setEdit(null) } : undefined}
            onDelete={c.gear.some((g) => g.uid === edit.uid) ? () => { up((x) => linkHotlistItems({ ...x, gear: x.gear.filter((y) => y.uid !== edit.uid) })); setEdit(null) } : undefined}
            hotlistSlot={c.gear.some((g) => g.uid === edit.uid) ? hotlistSlotOfGear(c, edit.uid) : undefined}
            onHotlist={() => { const g = c.gear.find((y) => y.uid === edit.uid); if (g) toggleGearHotlist(g) }}
          />
        </Sheet>
      )}
      {inv && (
        <Sheet title={inv.name || 'Inventory item'} onClose={() => setInv(null)}>
          <InvEditor item={c.inventory.find((i) => i.uid === inv.uid) ?? inv}
            hotlistSlot={c.inventory.some((i) => i.uid === inv.uid) ? hotlistSlotOfInventory(c, inv.uid) : undefined}
            onHotlist={() => { const cur = c.inventory.find((i) => i.uid === inv.uid); if (cur) toggleInvHotlist(cur) }}
            onSave={(it) => { saveInv(it); setInv(null) }}
            onDelete={() => { up((x) => linkHotlistItems({ ...x, inventory: x.inventory.filter((y) => y.uid !== inv.uid) })); setInv(null) }}
            onEquip={(slot) => {
              up((x) => {
                const g = { uid: uid(), slot, name: inv.name, mods: [], notes: inv.notes }
                return {
                  ...x,
                  inventory: x.inventory.filter((y) => y.uid !== inv.uid),
                  gear: [...x.gear, g],
                  hotlist: x.hotlist.map((h) => (h?.invUid === inv.uid ? hotlistItem(g.name, g.notes, { gearUid: g.uid }) : h)),
                }
              })
              setInv(null)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

function GearEditor({ item, onSave, onUnequip, onDelete, hotlistSlot, onHotlist }: {
  item: GearItem
  onSave: (g: GearItem) => void
  onUnequip?: (g: GearItem) => void
  onDelete?: () => void
  /** the Hotlist slot showing this item (-1: not on it); undefined until the item is saved */
  hotlistSlot?: number
  onHotlist: () => void
}) {
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
      {hotlistSlot !== undefined && <HotlistToggle slot={hotlistSlot} onToggle={onHotlist} where="equipped" />}
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
  /** the Hotlist slot showing this item (-1: not on it); undefined until the item is saved */
  hotlistSlot?: number
  onHotlist: () => void
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
      {hotlistSlot !== undefined && <HotlistToggle slot={hotlistSlot} onToggle={onHotlist} where="Inventory" />}
      <button className="btn danger" onClick={onDelete}>Delete</button>
    </div>
  )
}

/** Paste or type many items at once, one per line. */
function BulkAdd({ onClose, onAdd }: { onClose: () => void; onAdd: (items: ParsedItem[]) => void }) {
  const [text, setText] = useState('')
  const items = parseItemLines(text)
  return (
    <Sheet title="Add a list of items" onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          One item per line. Add a quantity like <b>3x Torch</b>, <b>Torch x3</b> or <b>Torch (3)</b>, and notes after a dash: <b>Rope - 50 feet</b>.
          Items you already have are stacked.
        </p>
        <textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'3x Torch\nRope - 50 feet\nGoblin Dynamite x2\nSnack Bar (4)'} style={{ minHeight: 160 }} />
        {items.length > 0 && (
          <div className="infobox">
            <div className="label" style={{ marginBottom: 4 }}>{items.length} item{items.length === 1 ? '' : 's'} to add</div>
            {items.map((it, i) => (
              <div key={i} className="row between small" style={{ padding: '2px 0' }}>
                <span>{it.name}{it.notes && <span className="muted"> · {it.notes}</span>}</span>
                <b className="num">×{it.qty}</b>
              </div>
            ))}
          </div>
        )}
        <button className="btn primary" disabled={!items.length} onClick={() => onAdd(items)}>
          Add {items.length || ''} item{items.length === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  )
}

/** Show/remove an item on the Hotlist; the item itself never leaves Inventory or its Gear slot. */
function HotlistToggle({ slot, onToggle, where }: { slot: number; onToggle: () => void; where: string }) {
  return (
    <div className="stack">
      <div className="label">Hotlist (use in combat)</div>
      {slot >= 0 ? (
        <div className="row between">
          <span className="small"><span className="pill accent">Hotlist #{slot + 1}</span> still {where === 'equipped' ? 'equipped' : 'in Inventory'}</span>
          <button className="btn small" onClick={onToggle}>Remove from Hotlist</button>
        </div>
      ) : (
        <button className="btn good" onClick={onToggle}>Show on Hotlist</button>
      )}
      <p className="small faint" style={{ margin: 0 }}>It stays {where === 'equipped' ? 'equipped' : 'in Inventory'}; the Hotlist slot uses the same count.</p>
    </div>
  )
}
