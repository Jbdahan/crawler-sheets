import { useMemo, useState } from 'react'
import { SPELLS, STAT_KEYS, STAT_NAMES, findSkill, normName, type StatKey } from '../data'
import { LOOT, LOOT_GROUPS, type LootDef, type LootGroup } from '../data/loot'
import { describeMod } from '../sheets/ModEditor'
import { lootItem } from '../engine/items'
import { AMMO_WEAPONS, ammoKeys, ammoNoun } from '../engine/ammo'
import { AmmoSelect } from '../components/AmmoSelect'
import { rollDie } from '../engine/dice'
import { GEAR_SLOTS, type Character, type InventoryItem } from '../engine/types'
import { Sheet, Stepper } from '../components/ui'

const SPELL_OPTIONS = [...SPELLS].sort((a, b) => a.name.localeCompare(b.name))

/** Pick standard loot (Core p.215–218) to add to Inventory, or straight to a Gear slot. */
export function LootPicker({ c, onClose, onAdd }: {
  c: Character
  onClose: () => void
  onAdd: (item: InventoryItem, equip: boolean) => void
}) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<LootGroup>('Potions')
  const [sel, setSel] = useState<LootDef | null>(null)
  const list = useMemo(() => {
    const n = normName(q)
    return n ? LOOT.filter((l) => normName(`${l.name} ${l.summary}`).includes(n)) : LOOT.filter((l) => l.group === group)
  }, [q, group])

  if (sel) return <LootDetail c={c} def={sel} onBack={() => setSel(null)} onClose={onClose} onAdd={onAdd} />
  return (
    <Sheet title="Add loot" onClose={onClose}>
      <div className="stack">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search potions, scrolls, weapons, gear…" />
        {!q && (
          <div className="chips">
            {LOOT_GROUPS.map((g) => (
              <button key={g} className={`chip${g === group ? ' on' : ''}`} onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
        )}
        <div className="list">
          {list.map((l) => (
            <button key={l.id} className="option" onClick={() => setSel(l)}>
              <div className="grow">
                <div className="t">{l.name}{l.qty ? ` ×${l.qty}` : ''}</div>
                <div className="small muted">{l.summary} <span className="faint">Core p.{l.page}</span></div>
              </div>
            </button>
          ))}
          {!list.length && <div className="empty">Nothing matches. Use + Add for a custom item.</div>}
        </div>
      </div>
    </Sheet>
  )
}

function LootDetail({ c, def, onBack, onClose, onAdd }: {
  c: Character
  def: LootDef
  onBack: () => void
  onClose: () => void
  onAdd: (item: InventoryItem, equip: boolean) => void
}) {
  const [qty, setQty] = useState(def.qty ?? 1)
  const [spellId, setSpellId] = useState('')
  const [rank, setRank] = useState(def.kind === 'scroll' ? 1 : Math.max(1, rollDie(6) - 1))
  const [stat, setStat] = useState<StatKey>('str')
  // ammo: default to a ranged weapon this crawler uses
  const [weapon, setWeapon] = useState(() => AMMO_WEAPONS.find((w) => c.skills.some((s) => s.skillId === w)) ?? 'crossbow')
  const item = lootItem(def, { qty, spellId, rank, stat, weapon })
  const ready = def.pick !== 'spell' || !!spellId
  const own = def.skillId ? c.skills.find((s) => s.skillId === def.skillId) : undefined
  const known = spellId ? c.skills.find((s) => s.skillId === spellId) : undefined
  const slotLabel = GEAR_SLOTS.find((s) => s.key === def.slot)?.label
  return (
    <Sheet title={def.name} onClose={onClose}>
      <div className="stack">
        <div><button className="btn small ghost" onClick={onBack}>‹ All loot</button></div>
        <p className="small muted" style={{ margin: 0 }}>{def.summary} <span className="faint">Core p.{def.page}</span></p>

        {def.pick === 'spell' && (
          <>
            <label><span className="label">Spell</span>
              <select value={spellId} onChange={(e) => setSpellId(e.target.value)}>
                <option value="">Choose a Spell…</option>
                {SPELL_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.name}{s.mana !== undefined ? ` (${s.mana} Mana)` : ''}</option>)}
              </select>
            </label>
            <div className="row between">
              <span>Rank {def.kind === 'book' && <button className="btn small ghost" onClick={() => setRank(Math.max(1, rollDie(6) - 1))}>Roll 1d6−1</button>}</span>
              <Stepper value={rank} min={1} max={20} onChange={setRank} />
            </div>
            {spellId && <p className="small faint" style={{ margin: 0 }}>{findSkill(spellId)?.effect ?? findSkill(spellId)?.summary}</p>}
            {def.kind === 'book' && known && <div className="infobox small">You know {known.name} at Rank {known.rank}. Reading it raises it to Rank {rank} if that's higher.</div>}
          </>
        )}
        {def.pick === 'ammoWeapon' && (
          <AmmoSelect label="Ammo type" value={weapon} custom={ammoKeys(c)} onChange={(k) => setWeapon(k ?? '')} />
        )}
        {def.kind === 'ammo' && <p className="small faint" style={{ margin: 0 }}>Load it on the attack card of a weapon that fires {ammoNoun(weapon).toLowerCase()} ({findSkill(weapon)?.name ?? 'a custom weapon'}). Each Attack fires one.</p>}
        {def.pick === 'stat' && (
          <label><span className="label">Stat (+{def.statBonus})</span>
            <select value={stat} onChange={(e) => setStat(e.target.value as StatKey)}>
              {STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_NAMES[k]}</option>)}
            </select>
          </label>
        )}
        {def.kind === 'weapon' && def.skillId && (
          <div className="infobox small">
            Linked to the <b>{findSkill(def.skillId)?.name}</b> Skill: {own ? <>you have it at <b>Rank {own.rank}</b>. Attacks use your Rank, Stats and Floor.</> : <>you're untrained, so attacks roll with Disadvantage (Core p.58).</>}
          </div>
        )}
        {item.mods && item.mods.length > 0 && <div className="small">Bonuses while equipped ({slotLabel}): <b>{item.mods.map(describeMod).join(', ')}</b></div>}
        {(def.kind === 'gear' || def.kind === 'weapon') && !item.mods?.length && slotLabel && <div className="small muted">Gear slot: {slotLabel}</div>}

        {def.kind !== 'gear' && def.kind !== 'weapon' && (
          <div className="row between"><span>Quantity</span><Stepper value={qty} min={1} max={999} editable onChange={setQty} /></div>
        )}
        <div className="small">Adds <b>{item.name}</b>{item.qty > 1 ? ` ×${item.qty}` : ''}</div>
        <button className="btn primary" disabled={!ready} onClick={() => onAdd(item, false)}>Add to Inventory</button>
        {(def.kind === 'gear' || def.kind === 'weapon') && def.slot && (
          <button className="btn" disabled={!ready} onClick={() => onAdd(item, true)}>Add & equip ({slotLabel})</button>
        )}
      </div>
    </Sheet>
  )
}
