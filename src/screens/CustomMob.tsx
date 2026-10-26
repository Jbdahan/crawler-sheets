import { useMemo, useState } from 'react'
import { DAMAGE_TYPES, SIZES, STAT_ABBR, STAT_KEYS, type StatKey } from '../data'
import {
  DIE_SIDES, LEVEL_TABLE, ROLES, TIERS, damageDice, distributeStats, fromMonster, healthBar, isBossTier, levelRow, loadCustomMobs,
  newCustomMob, randomName, saveCustomMobs, statBase, statBudget, statSpent, suggestAttacks, suggestLevel, toMonster,
  type CustomAttack, type CustomMob, type Role,
} from '../engine/customMob'
import { statMod } from '../engine/derived'
import { uid } from '../engine/advancement'
import { findMonster } from '../data/monsters'
import { PageRef, Seg, signed, toast } from '../components/ui'
import { go } from '../router'
import { StatCard } from './Encounter'

const num = (v: string, min = 0) => Math.max(min, Number(v.replace(/[^\d-]/g, '')) || 0)

/** The Mob to start from: a saved custom Mob, a copy of a book or custom one (from), or a fresh one. */
function initial(id: string, from?: string): CustomMob {
  const saved = loadCustomMobs()
  if (from) {
    const mine = saved.find((x) => x.id === from)
    if (mine) return { ...structuredClone(mine), id: `custom-${uid()}`, name: `${mine.name} (copy)`, basedOn: mine.basedOn ?? mine.name }
    const book = findMonster(from)
    if (book) return fromMonster(book)
  }
  return saved.find((x) => x.id === id) ?? newCustomMob()
}

/** Build a Mob or Boss with the Core Rulebook's creation rules (pp.270–273), from scratch or from a copy
 *  of an existing stat block; every number can be overridden. */
export function CustomMobEditor({ id, from }: { id: string; from?: string }) {
  const [m, setM] = useState<CustomMob>(() => initial(id, from))
  const [role, setRole] = useState<Role>('brute')
  const isNew = !loadCustomMobs().some((x) => x.id === m.id)
  const def = useMemo(() => toMonster(m), [m])
  const set = (patch: Partial<CustomMob>) => setM((cur) => ({ ...cur, ...patch }))
  const budget = statBudget(m.tier, m.level)
  const spent = statSpent(m)
  const row = levelRow(m.level)
  const fullDice = damageDice(m.level)
  const hb = healthBar(m)

  const generate = () => setM((cur) => ({
    ...cur,
    stats: distributeStats(cur.tier, cur.level, role),
    attacks: suggestAttacks(role, cur.tier, cur.level),
  }))
  const setAttack = (i: number, patch: Partial<CustomAttack>) =>
    setM((cur) => ({ ...cur, attacks: cur.attacks.map((a, k) => (k === i ? { ...a, ...patch } : a)) }))

  const save = (andAdd: boolean) => {
    const list = loadCustomMobs()
    const named = { ...m, name: m.name.trim() || randomName() }
    saveCustomMobs(list.some((x) => x.id === named.id) ? list.map((x) => (x.id === named.id ? named : x)) : [named, ...list])
    if (andAdd) {
      try {
        const e = JSON.parse(localStorage.getItem('encounter.draft') ?? '{}')
        const picks = { ...(e.picks ?? {}), [named.id]: Math.max(1, e.picks?.[named.id] ?? 0) }
        localStorage.setItem('encounter.draft', JSON.stringify({ name: '', floor: 0, ...e, picks }))
      } catch { /* the Mob is still saved */ }
    }
    toast(andAdd ? 'Saved and added to the encounter' : 'Saved')
    go('/encounter')
  }
  const remove = () => {
    saveCustomMobs(loadCustomMobs().filter((x) => x.id !== m.id))
    toast('Deleted')
    go('/encounter')
  }

  return (
    <div className="app enc-custom">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go('/encounter')} aria-label="Back">‹</button>
        <div className="title">
          <h1>{isNew ? (m.basedOn ? 'Customize a copy' : 'New custom Mob') : 'Edit custom Mob'}</h1>
          <div className="sub">{m.basedOn ? <>Based on {m.basedOn}</> : <>Built with the book’s Mob and Boss rules <PageRef page={270} /></>}</div>
        </div>
      </div>
      <div className="enc-custom-grid">
        <div className="stack">
          <div className="card stack">
            <label className="fld">Name
              <div className="row">
                <input value={m.name} placeholder="The Regret Collector" onChange={(ev) => set({ name: ev.target.value })} />
                <button className="btn" onClick={() => set({ name: randomName() })} aria-label="Random name">🎲</button>
              </div>
            </label>
            <div className="grid2">
              <label className="fld">Tier
                <select value={m.tier} onChange={(ev) => set({ tier: ev.target.value })}>
                  {(TIERS.includes(m.tier) ? TIERS : [m.tier, ...TIERS]).map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="fld">Floor
                <select value={m.floor} onChange={(ev) => set({ floor: Number(ev.target.value) })}>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="fld">Level
                <div className="row">
                  <input inputMode="numeric" value={m.level} onChange={(ev) => set({ level: num(ev.target.value, 1) })} />
                  <button className="btn small" onClick={() => set({ level: suggestLevel(m.tier, m.floor) })}>Suggest</button>
                </div>
              </label>
              <label className="fld">Size
                <select value={m.size} onChange={(ev) => set({ size: Number(ev.target.value) })}>
                  {SIZES.map((s, i) => i > 0 && <option key={s} value={i}>{s} ({i})</option>)}
                </select>
              </label>
              <label className="fld">Type
                <input value={m.type} placeholder="Beastly, Undead, Ooze…" onChange={(ev) => set({ type: ev.target.value })} />
              </label>
              <label className="fld">Move
                <input value={m.move} onChange={(ev) => set({ move: ev.target.value })} />
              </label>
            </div>
            <label className="fld"><span>DR: Floor {m.floor}{m.drAdj ? ` ${signed(m.drAdj)}` : ''} = <b>{Math.max(0, m.floor + m.drAdj)}</b></span>
              <Seg value={String(m.drAdj)} onChange={(v) => set({ drAdj: Number(v) })} options={[
                { value: '-2', label: '−2' }, { value: '-1', label: '−1 Caster' }, { value: '0', label: 'Base' },
                { value: '1', label: '+1 Armor' }, { value: '2', label: '+2' },
              ]} />
            </label>
            <p className="small muted" style={{ margin: 0 }}>
              Level {m.level} is in the {row.min}–{row.max} row of Table 51 (Floors {row.floors[0]}{row.floors[1] !== row.floors[0] ? `–${row.floors[1]}` : ''}): main attacks roll <b>{fullDice}d</b>.
              {' '}Health Bar: {hb.slots} slots of Con Mod {hb.per}{isBossTier(m.tier) ? ` (Table 50 + Floor)` : ' (one per Level, max 10)'}.
            </p>
          </div>

          {m.book && (
            <div className="card stack enc-kept">
              <div><b>Kept from the book</b>: {[
                m.book.surprise && `Surprise ${m.book.surprise}`,
                m.book.evade && `Evade ${m.book.evade}`,
                m.book.dr && `DR ${m.book.dr}`,
                m.book.hb && `Health Bar ${m.book.hb.slots} slots`,
                m.book.mods && `printed Mods for ${Object.keys(m.book.mods).map((k) => STAT_ABBR[k as StatKey]).join(', ')}`,
              ].filter(Boolean).join(' · ')}</div>
              <p className="small muted" style={{ margin: 0 }}>The original stat block doesn’t follow the creation formulas here, so the copy prints it as written. Changing Level, Floor or Stats won’t update these until you switch to the rules.</p>
              <button className="btn small" onClick={() => set({ book: undefined })}>Use the rules instead</button>
            </div>
          )}

          <div className="card stack">
            <div className="row wrap between">
              <b>Generate</b>
              <Seg value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
            </div>
            <button className="btn primary" onClick={generate}>Fill Stats and attacks for a {ROLES.find((r) => r.value === role)!.label}</button>
            <p className="small muted" style={{ margin: 0 }}>Replaces the Stats and attacks below; tweak anything after.</p>
          </div>

          <div className="card stack">
            <div className="row between">
              <b>Stats</b>
              <span className={`small ${spent === budget ? 'muted' : spent > budget ? 'bad-text' : 'warn-text'}`}>
                {spent} / {budget} points (base {statBase(m.tier)}{isBossTier(m.tier) ? ', Table 50' : ', 3 per Level'})
              </span>
            </div>
            <div className="enc-stat-grid">
              {STAT_KEYS.map((k) => (
                <label key={k} className="fld center">{STAT_ABBR[k]}
                  <input inputMode="numeric" className="center" value={m.stats[k]}
                    onChange={(ev) => set({ stats: { ...m.stats, [k]: num(ev.target.value, 1) } as Record<StatKey, number> })} />
                  <span className="small muted">{signed(statMod(m.stats[k]))}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card stack">
            <div className="row between"><b>Attacks</b><span className="small muted">To hit = 10 + Stat Mod + F</span></div>
            {m.attacks.map((a, i) => (
              <div key={i} className="enc-atk-edit stack">
                <div className="row">
                  <input value={a.name} placeholder="Attack name" onChange={(ev) => setAttack(i, { name: ev.target.value })} />
                  <button className="btn small danger" onClick={() => set({ attacks: m.attacks.filter((_, k) => k !== i) })} aria-label={`Remove ${a.name}`}>✕</button>
                </div>
                {a.raw ? (
                  <div className="stack">
                    <div className="row">
                      <label className="fld" style={{ width: 90 }}>To hit
                        <input value={a.raw.hit ?? ''} placeholder="None" onChange={(ev) => setAttack(i, { raw: { ...a.raw!, hit: ev.target.value.trim() || null } })} />
                      </label>
                      <label className="fld grow">Damage and range, as printed
                        <input value={a.raw.text} onChange={(ev) => setAttack(i, { raw: { ...a.raw!, text: ev.target.value } })} />
                      </label>
                    </div>
                    <button className="btn small" onClick={() => setAttack(i, { raw: undefined, dice: fullDice, reach: '5ft range' })}>Switch to dice and Stat</button>
                  </div>
                ) : <>
                <div className="enc-atk-row">
                  <select value={a.stat} onChange={(ev) => setAttack(i, { stat: ev.target.value as StatKey })} aria-label="Stat">
                    {STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_ABBR[k]}</option>)}
                  </select>
                  <input inputMode="numeric" value={a.dice} disabled={a.noDamage} onChange={(ev) => setAttack(i, { dice: num(ev.target.value, 1) })} aria-label="Dice" />
                  <select value={a.sides} disabled={a.noDamage} onChange={(ev) => setAttack(i, { sides: Number(ev.target.value) })} aria-label="Die">
                    {DIE_SIDES.map((d) => <option key={d} value={d}>d{d}</option>)}
                  </select>
                  <select value={a.dmgType} disabled={a.noDamage} onChange={(ev) => setAttack(i, { dmgType: ev.target.value })} aria-label="Damage type">
                    {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="row wrap small">
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={a.addMod} disabled={a.noDamage} onChange={(ev) => setAttack(i, { addMod: ev.target.checked })} /> + Stat Mod</label>
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={a.noDamage} onChange={(ev) => setAttack(i, { noDamage: ev.target.checked })} /> No damage (Debuff only)</label>
                  <span className="muted">Full dice {fullDice}d; area or on-fail effect usually {Math.max(1, fullDice - 1)}d</span>
                </div>
                <input value={a.reach} placeholder="5ft range · 60ft range, 15ft Blast radius" onChange={(ev) => setAttack(i, { reach: ev.target.value })} aria-label="Range" />
                <div className="row wrap small">
                  <label className="row" style={{ gap: 4 }}>To-hit adj
                    <input style={{ width: 56, minHeight: 32 }} inputMode="numeric" value={a.hitAdj ?? 0} onChange={(ev) => setAttack(i, { hitAdj: Number(ev.target.value.replace(/[^\d-]/g, '')) || 0 })} />
                  </label>
                  <label className="row" style={{ gap: 4 }}>Flat damage
                    <input style={{ width: 56, minHeight: 32 }} inputMode="numeric" value={a.flat ?? 0} disabled={a.noDamage} onChange={(ev) => setAttack(i, { flat: Number(ev.target.value.replace(/[^\d-]/g, '')) || 0 })} />
                  </label>
                  <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={!!a.autoHit} onChange={(ev) => setAttack(i, { autoHit: ev.target.checked })} /> Auto-hits</label>
                </div>
                </>}
                <input value={a.effect} placeholder="Effect, e.g. Hit: Held · Evade MF+: Blood Trail" onChange={(ev) => setAttack(i, { effect: ev.target.value })} aria-label="Effect" />
              </div>
            ))}
            <button className="btn" onClick={() => set({ attacks: [...m.attacks, { name: '', stat: 'str', dice: fullDice, sides: 6, dmgType: 'Bludgeoning', reach: '5ft range', addMod: true, noDamage: false, effect: '' }] })}>+ Attack</button>
          </div>

          <div className="card">
            <label className="fld">Notes
              <textarea value={m.notes} placeholder="Special rules, immunities, behavior…" onChange={(ev) => set({ notes: ev.target.value })} />
            </label>
          </div>
        </div>

        <div className="enc-custom-side">
          <div className="small muted" style={{ marginBottom: 6 }}>Preview</div>
          <div className="enc-page enc-preview-page"><StatCard m={def} floor={0} trackers /></div>
          <div className="stack" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => save(true)}>Save and add to encounter</button>
            <button className="btn" onClick={() => save(false)}>Save</button>
            {!isNew && <button className="btn danger" onClick={remove}>Delete</button>}
          </div>
          <details className="small muted" style={{ marginTop: 12 }}>
            <summary>Table 51 at a glance</summary>
            <table className="enc-t51"><tbody>
              {LEVEL_TABLE.map((r) => <tr key={r.min} className={r === row ? 'on' : ''}><td>Lvl {r.min}–{r.max}</td><td>{r.dice}d</td><td>Floor {r.floors[0]}{r.floors[1] !== r.floors[0] ? `–${r.floors[1]}` : ''}</td></tr>)}
            </tbody></table>
          </details>
        </div>
      </div>
    </div>
  )
}
