import { useState } from 'react'
import { uid } from '../engine/advancement'
import { addInventoryItems, hotlistSlotOfGear, hotlistSlotOfInventory, linkGearToHotlist, linkHotlistItems, linkInventoryToHotlist, parseItemLines, removeFromHotlist, type ParsedItem } from '../engine/inventory'
import { addItem, drinkSkillPotion, equipItem, itemLinkLabel, readSpellbook, slotFree, unequipGear, weaponSkill } from '../engine/items'
import { GEAR_SLOTS, type Character, type GearItem, type GearSlot, type InventoryItem, type ItemKind, type AmmoEffect, type WeaponStats } from '../engine/types'
import { attackCalc, hasWeaponStats } from '../engine/attacks'
import { DAMAGE_TYPES, DEBUFFS, SKILLS, SPELLS, findSkill } from '../data'
import { AMMO_NOUN, AMMO_WEAPONS, ammoKeys, ammoNoun } from '../engine/ammo'
import { AmmoSelect } from '../components/AmmoSelect'
import { LootPicker } from './LootPicker'
import { effectiveRank } from '../engine/derived'
import { inferItem } from '../data/loot'
import { attackLine, castScroll } from './hotlistUse'
import { Icon, Sheet, Stepper, toast } from '../components/ui'
import { ModEditor, describeMod } from '../sheets/ModEditor'
import type { Ctx } from './ctx'

export function Gear(ctx: Ctx) {
  const { c, up } = ctx
  const [edit, setEdit] = useState<GearItem | null>(null)
  const [inv, setInv] = useState<InventoryItem | null>(null)
  const [bulk, setBulk] = useState(false)
  const [loot, setLoot] = useState(false)

  const addGear = (slot: GearSlot) => setEdit({ uid: uid(), slot, name: '', mods: [], notes: '' })
  const saveGear = (g: GearItem) =>
    up((x) => ({ ...x, gear: x.gear.some((y) => y.uid === g.uid) ? x.gear.map((y) => (y.uid === g.uid ? g : y)) : [...x.gear, g] }))
  /** unequip into Inventory (bonuses and weapon link kept); a Hotlist slot showing it follows it */
  const unequip = (g: GearItem) => up((x) => unequipGear(x, g.uid))
  /** "Dagger Rank 3 · +5 · 1d4+3", or untrained; a weapon with its own stats shows those (with type and range) */
  const weaponLine = (skillId?: string, item?: { name: string; weapon?: WeaponStats }) => {
    if (!skillId) return ''
    const s = weaponSkill(c, skillId)
    const rank = effectiveRank(c, s, ctx.d)
    const own = item && hasWeaponStats(item.weapon) ? { name: item.name, stats: item.weapon! } : undefined
    const extra = own ? [attackCalc(c, s, ctx.d, { weapon: own }).types.join('/'), own.stats.range?.trim()].filter(Boolean).join(' · ') : ''
    return `${rank > 0 ? `${s.name} Rank ${rank}` : `${s.name}: untrained, Disadvantage`} · ${attackLine(ctx, s, own)}${extra ? ` ${extra}` : ''}`
  }
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
  const saveInv = (raw: InventoryItem) => {
    const it = c.inventory.some((y) => y.uid === raw.uid) ? raw : inferItem(raw)
    up((x) => ({ ...x, inventory: x.inventory.some((y) => y.uid === it.uid) ? x.inventory.map((y) => (y.uid === it.uid ? it : y)) : [...x.inventory, it] }))
  }

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
                      <div className="small muted">{[weaponLine(g.skillId, g), ...g.mods.map(describeMod), g.notes].filter(Boolean).join(' · ') || 'No bonuses'}</div>
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
            <button className="btn small primary" onClick={() => setLoot(true)}>+ Loot</button>
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
                  {(it.kind || it.notes) && <div className="meta">{[it.kind === 'weapon' ? weaponLine(it.skillId, it) : itemLinkLabel(it), ...(it.mods ?? []).map(describeMod), it.notes].filter(Boolean).join(' · ')}</div>}
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

      {loot && (
        <LootPicker c={c} onClose={() => setLoot(false)} onAdd={(item, equip) => {
          const added = addItem(c, item)
          if (equip && item.slot && !slotFree(c, item.slot)) {
            up(() => added.c)
            toast(`${GEAR_SLOTS.find((x) => x.key === item.slot)?.label} is full: ${item.name} added to Inventory`)
          } else {
            up(() => (equip && item.slot ? equipItem(added.c, added.invUid, item.slot) : added.c))
            toast(equip ? `Equipped ${item.name}` : `Added ${item.name}${item.qty > 1 ? ` ×${item.qty}` : ''} to Inventory`)
          }
          setLoot(false)
        }} />
      )}
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
            c={c}
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
          <InvEditor c={c} item={c.inventory.find((i) => i.uid === inv.uid) ?? inv}
            hotlistSlot={c.inventory.some((i) => i.uid === inv.uid) ? hotlistSlotOfInventory(c, inv.uid) : undefined}
            onHotlist={() => { const cur = c.inventory.find((i) => i.uid === inv.uid); if (cur) toggleInvHotlist(cur) }}
            onSave={(it) => { saveInv(it); setInv(null) }}
            onDelete={() => { up((x) => linkHotlistItems({ ...x, inventory: x.inventory.filter((y) => y.uid !== inv.uid) })); setInv(null) }}
            onEquip={(slot) => {
              if (!slotFree(c, slot)) { toast(`${GEAR_SLOTS.find((x) => x.key === slot)?.label} is full. Unequip something first`); return }
              up((x) => equipItem(x, inv.uid, slot))
              setInv(null)
            }}
            onRead={() => { const r = readSpellbook(c, inv.uid); up(() => r.c); toast(r.message); setInv(null) }}
            onDrink={(skillUid) => { const r = drinkSkillPotion(c, inv.uid, skillUid); up(() => r.c); toast(r.message); setInv(null) }}
            onCast={() => { const cur = c.inventory.find((i) => i.uid === inv.uid); if (cur) castScroll(ctx, cur); setInv(null) }}
          />
        </Sheet>
      )}
    </div>
  )
}

function GearEditor({ c, item, onSave, onUnequip, onDelete, hotlistSlot, onHotlist }: {
  c: Character
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
      {g.slot === 'hands' && <WeaponSelect value={g.skillId} onChange={(skillId) => setG({ ...g, skillId })} />}
      {g.slot === 'hands' && g.skillId && <WeaponStatsFields c={c} skillId={g.skillId} name={g.name} value={g.weapon} onChange={(weapon) => setG({ ...g, weapon })} />}
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

const KIND_OPTIONS: { value: ItemKind | ''; label: string }[] = [
  { value: '', label: 'Item' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'gear', label: 'Armor / gear' },
  { value: 'scroll', label: 'Spell Scroll' },
  { value: 'book', label: 'Spellbook' },
  { value: 'skillPotion', label: 'Potion of +N Skill' },
  { value: 'ammo', label: 'Ammunition' },
]
const ATTACK_SKILLS = SKILLS.filter((s) => s.kind === 'attack').sort((a, b) => a.name.localeCompare(b.name))
const SPELL_LIST = [...SPELLS].sort((a, b) => a.name.localeCompare(b.name))

/** Ammunition: which weapon fires it and what each round adds (GM-made; Core p.181 has no ammo table). */
function AmmoFields({ c, it, onChange }: { c: Character; it: InventoryItem; onChange: (i: InventoryItem) => void }) {
  const a = it.ammo ?? {}
  const set = (patch: Partial<AmmoEffect>) => {
    const next = { ...a, ...patch }
    const empty = !next.dice && !next.toHit && !next.damage && !next.debuff
    onChange({ ...it, ammo: empty ? undefined : next })
  }
  return (
    <>
      <AmmoSelect label="Ammo type (fired by)" value={it.skillId ?? 'crossbow'} custom={ammoKeys(c)}
        onChange={(skillId) => onChange({ ...it, skillId: skillId ?? '' })} />
      <p className="small faint" style={{ margin: 0 }}>Weapons that fire this ammo type can load it: bows, guns, or a custom weapon set to fire it.</p>
      <div className="label">Each round adds (leave empty for basic ammo)</div>
      <div className="grid2">
        <label><span className="label">Extra dice</span><input value={a.dice ?? ''} placeholder="e.g. 1d6" onChange={(e) => set({ dice: e.target.value.trim() || undefined })} /></label>
        <label><span className="label">Damage type</span>
          <select value={a.dtype ?? ''} onChange={(e) => set({ dtype: e.target.value || undefined })}>
            <option value="">Same as weapon</option>
            {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="row between"><span>To hit</span><Stepper value={a.toHit ?? 0} min={-10} max={20} onChange={(v) => set({ toHit: v || undefined })} /></div>
      <div className="row between"><span>Damage</span><Stepper value={a.damage ?? 0} min={-10} max={50} onChange={(v) => set({ damage: v || undefined })} /></div>
      <div className="grid2">
        <label><span className="label">Debuff</span>
          <select value={a.debuff ?? ''} onChange={(e) => set({ debuff: e.target.value || undefined, debuffOn: a.debuffOn ?? 'hit' })}>
            <option value="">None</option>
            {DEBUFFS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label><span className="label">When</span>
          <select value={a.debuffOn ?? 'hit'} disabled={!a.debuff} onChange={(e) => set({ debuffOn: e.target.value as AmmoEffect['debuffOn'] })}>
            <option value="hit">On a hit</option>
            <option value="amazing">On an Amazing Success</option>
          </select>
        </label>
      </div>
    </>
  )
}

/** Which Attack Skill a weapon uses (its attacks use that Rank, your Stats and the Floor). */
function WeaponSelect({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  return (
    <label><span className="label">Weapon Skill (attacks use it)</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Not a weapon</option>
        {ATTACK_SKILLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  )
}

/**
 * A weapon's own damage and range. Blank fields use the Weapon Skill's; the Skill
 * still sets the to-hit and adds its Rank upgrade dice.
 */
function WeaponStatsFields({ c, skillId, name, value, onChange }: {
  c: Character
  skillId?: string
  name: string
  value?: WeaponStats
  onChange: (w: WeaponStats | undefined) => void
}) {
  const def = findSkill(skillId)
  const w = value ?? {}
  const set = (patch: Partial<WeaponStats>) => {
    const next = { ...w, ...patch }
    onChange(hasWeaponStats(next) ? next : undefined)
  }
  const baseDie = def?.damage ? `${def.damage.count}d${def.damage.sides}` : '1d6'
  const baseRange = def?.range ?? (def?.attackType === 'melee' ? 'Melee 5ft' : '')
  // live preview with this crawler's Skill, Stats and Floor
  const s = skillId ? weaponSkill(c, skillId) : undefined
  const a = s ? attackCalc(c, s, undefined, { weapon: hasWeaponStats(w) ? { name: name || 'Weapon', stats: w } : null }) : undefined
  return (
    <div className="stack">
      <div className="label">Weapon damage &amp; range</div>
      <p className="small muted" style={{ margin: 0 }}>
        Leave a field blank to use the {def?.name ?? 'Weapon Skill'}'s ({[baseDie, def?.damage?.types.join('/'), baseRange].filter(Boolean).join(', ')}).
        The Skill still sets the to-hit and adds its Rank upgrade dice and Stat Mod.
      </p>
      <div className="grid2">
        <label><span className="label">Damage die</span>
          <input value={w.dice ?? ''} placeholder={`e.g. ${baseDie === '1d6' ? '1d8' : baseDie}`} aria-label="Damage die"
            onChange={(e) => set({ dice: e.target.value.replace(/\s+/g, '') || undefined })} />
        </label>
        <label><span className="label">Damage type</span>
          <select value={w.dtype ?? ''} aria-label="Damage type" onChange={(e) => set({ dtype: e.target.value || undefined })}>
            <option value="">{def?.damage?.types.length ? `Same as Skill (${def.damage.types.join('/')})` : 'Same as Skill'}</option>
            {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="row between"><span>Damage modifier</span><Stepper value={w.bonus ?? 0} min={-20} max={50} onChange={(v) => set({ bonus: v || undefined })} /></div>
      <label><span className="label">Range</span>
        <input value={w.range ?? ''} placeholder={baseRange ? `${baseRange} (Skill)` : 'e.g. Melee 10ft or 120 feet'} aria-label="Range"
          onChange={(e) => set({ range: e.target.value || undefined })} />
      </label>
      <AmmoSelect label="Fires ammo" value={w.ammo} custom={ammoKeys(c)}
        none={skillId && skillId in AMMO_NOUN ? `Same as Skill (${AMMO_NOUN[skillId]})` : 'No ammo'}
        onChange={(ammo) => set({ ammo })} />
      {w.ammo?.trim() && (
        <p className="small faint" style={{ margin: 0 }}>
          Each attack fires one of the {ammoNoun(w.ammo.trim()).toLowerCase()}. Load special {ammoNoun(w.ammo.trim()).toLowerCase()} on the Attacks tab; its extra dice, to-hit, damage and Debuff add to this weapon's.
        </p>
      )}
      {a && (
        <div className="infobox small num">
          With {s!.name} {s!.rank > 0 ? `Rank ${a.rank}` : '(untrained, Disadvantage)'}: to hit <b>{a.toHit.total >= 0 ? '+' : ''}{a.toHit.total}</b> · damage <b>{a.formula}</b> {a.types.join('/')}{a.range ? ` · ${a.range}` : ''}
        </div>
      )}
    </div>
  )
}

function InvEditor({ c, item, onSave, onDelete, onEquip, hotlistSlot, onHotlist, onRead, onDrink, onCast }: {
  c: Character
  item: InventoryItem
  onSave: (i: InventoryItem) => void
  onDelete: () => void
  onEquip: (s: GearSlot) => void
  /** the Hotlist slot showing this item (-1: not on it); undefined until the item is saved */
  hotlistSlot?: number
  onHotlist: () => void
  onRead: () => void
  onDrink: (skillUid: string) => void
  onCast: () => void
}) {
  const [it, setIt] = useState(item)
  const [slot, setSlot] = useState<GearSlot>(item.slot ?? (item.kind === 'weapon' ? 'hands' : 'accessory'))
  const [potionSkill, setPotionSkill] = useState('')
  const saved = c.inventory.some((i) => i.uid === item.uid)
  // actions use the saved item; save edits first
  const dirty = JSON.stringify(it) !== JSON.stringify(item)
  const spell = findSkill(it.skillId)
  const setKind = (kind: ItemKind | '') =>
    setIt({ ...it, kind: kind || undefined, ...(kind === 'weapon' ? { slot: 'hands' as GearSlot } : {}), ...(kind === 'scroll' || kind === 'book' || kind === 'skillPotion' ? { rank: it.rank ?? 1 } : {}), ...(kind === 'ammo' ? { skillId: AMMO_WEAPONS.includes(it.skillId ?? '') ? it.skillId : 'crossbow' } : kind === 'weapon' || kind === 'scroll' || kind === 'book' ? {} : { skillId: undefined }) })
  return (
    <div className="stack">
      <label><span className="label">Name</span><input value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} /></label>
      <div className="row between"><span>Quantity</span><Stepper value={it.qty} min={0} max={99999} editable onChange={(qty) => setIt({ ...it, qty })} /></div>
      <label><span className="label">Type</span>
        <select value={it.kind ?? ''} onChange={(e) => setKind(e.target.value as ItemKind | '')}>
          {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </label>
      {it.kind === 'weapon' && <WeaponSelect value={it.skillId} onChange={(skillId) => setIt({ ...it, skillId })} />}
      {it.kind === 'weapon' && it.skillId && <WeaponStatsFields c={c} skillId={it.skillId} name={it.name} value={it.weapon} onChange={(weapon) => setIt({ ...it, weapon })} />}
      {(it.kind === 'scroll' || it.kind === 'book') && (
        <>
          <label><span className="label">Spell</span>
            <select value={it.skillId ?? ''} onChange={(e) => setIt({ ...it, skillId: e.target.value || undefined })}>
              <option value="">Choose a Spell…</option>
              {SPELL_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="row between"><span>Spell Rank</span><Stepper value={it.rank ?? 1} min={1} max={20} onChange={(rank) => setIt({ ...it, rank })} /></div>
        </>
      )}
      {it.kind === 'ammo' && <AmmoFields c={c} it={it} onChange={setIt} />}
      {it.kind === 'skillPotion' && <div className="row between"><span>Ranks gained</span><Stepper value={it.rank ?? 1} min={1} max={15} onChange={(rank) => setIt({ ...it, rank })} /></div>}
      {(it.kind === 'gear' || it.kind === 'weapon') && (
        <>
          <div className="label">Bonuses (apply while equipped)</div>
          <ModEditor mods={it.mods ?? []} onChange={(mods) => setIt({ ...it, mods })} />
        </>
      )}
      <label><span className="label">Notes</span><input value={it.notes} onChange={(e) => setIt({ ...it, notes: e.target.value })} /></label>
      <button className="btn primary" disabled={!it.name.trim()} onClick={() => onSave(it)}>Save</button>

      {saved && !dirty && it.kind === 'scroll' && (
        <button className="btn mana" disabled={!spell || it.qty <= 0} onClick={onCast}>Cast {spell?.name ?? 'scroll'} (Rank {it.rank ?? 1}, no Mana)</button>
      )}
      {saved && !dirty && it.kind === 'book' && (
        <button className="btn good" disabled={!spell || it.qty <= 0} onClick={onRead}>Read: learn {spell?.name ?? 'the Spell'} at Rank {it.rank ?? 1}</button>
      )}
      {saved && !dirty && it.kind === 'skillPotion' && (
        <div className="row">
          <select value={potionSkill} onChange={(e) => setPotionSkill(e.target.value)} style={{ flex: 1 }}>
            <option value="">Choose a Skill…</option>
            {c.skills.map((s) => <option key={s.uid} value={s.uid}>{s.name} (Rank {s.rank})</option>)}
          </select>
          <button className="btn good" disabled={!potionSkill || it.qty <= 0} onClick={() => onDrink(potionSkill)}>Drink +{it.rank ?? 1}</button>
        </div>
      )}
      {saved && dirty && it.kind && it.kind !== 'gear' && it.kind !== 'weapon' && it.kind !== 'ammo' && <p className="small faint" style={{ margin: 0 }}>Save your changes to use it.</p>}
      {saved && it.kind !== 'scroll' && it.kind !== 'book' && it.kind !== 'skillPotion' && it.kind !== 'ammo' && (
        <div className="row">
          <select value={slot} onChange={(e) => setSlot(e.target.value as GearSlot)} style={{ flex: 1 }}>
            {GEAR_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn" disabled={dirty} onClick={() => onEquip(slot)}>Equip</button>
        </div>
      )}
      {hotlistSlot !== undefined && <HotlistToggle slot={hotlistSlot} onToggle={onHotlist} where="Inventory" />}
      {saved && <button className="btn danger" onClick={onDelete}>Delete</button>}
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
