import { useState } from 'react'
import { BUFFS, DAMAGE_TYPES, DEBUFFS, findDebuff } from '../data'
import { uid } from '../engine/advancement'
import { addInjury } from '../engine/health'
import type { ActiveEffect, Character, Modifier } from '../engine/types'
import { PageRef, Seg, Sheet, Stepper, toast } from '../components/ui'
import { ModEditor, describeMod } from './ModEditor'
import type { Ctx } from '../screens/ctx'

export const MAX_EXTERNAL = 3

export function externalCount(c: Character) {
  return c.effects.filter((e) => e.kind === 'buff' && e.external && e.active).length
}

export function addDebuff(c: Character, id: string): Character {
  if (id === 'minor-injury') return addInjury(c, 'minor')
  if (id === 'major-injury') return addInjury(c, 'major')
  const def = findDebuff(id)
  if (!def) return c
  const has = c.effects.find((e) => e.refId === id)
  if (has) {
    if (!def.stackable) return c
    return { ...c, effects: c.effects.map((e) => (e.uid === has.uid ? { ...e, stacks: e.stacks + 1, active: true } : e)) }
  }
  return { ...c, effects: [...c.effects, { uid: uid(), kind: 'debuff', refId: id, name: def.name, stacks: 1, active: true, mods: [], notes: '' }] }
}

export function AddEffectSheet({ c, up, onClose, initial = 'debuff' }: Ctx & { onClose: () => void; initial?: 'debuff' | 'buff' }) {
  const [tab, setTab] = useState<'debuff' | 'buff'>(initial)
  const [pending, setPending] = useState<{ id: string; name: string; external: boolean; mods: Modifier[]; type?: string; typeKind?: string } | null>(null)

  const addBuff = (p: NonNullable<typeof pending>) => {
    const mods = p.typeKind ? [{ target: `${p.typeKind}:${p.type ?? 'Fire'}`, value: 1 }] : p.mods
    const name = p.typeKind ? `${p.typeKind === 'resist' ? 'Resistance' : 'Immunity'}: ${p.type ?? 'Fire'}` : p.name
    const tooMany = p.external && externalCount(c) >= MAX_EXTERNAL
    up((x) => ({ ...x, effects: [...x.effects, { uid: uid(), kind: 'buff', refId: p.id, name, stacks: 1, external: p.external, active: !tooMany, mods, notes: '' }] }))
    toast(tooMany ? 'Added inactive: only 3 External Buffs can be active' : `Added ${name}`)
    onClose()
  }

  return (
    <Sheet title="Add Buff or Debuff" onClose={onClose}>
      <Seg value={tab} onChange={setTab} options={[{ value: 'debuff', label: 'Debuffs' }, { value: 'buff', label: 'Buffs' }]} />
      {tab === 'debuff' && (
        <div className="list" style={{ marginTop: 8 }}>
          {DEBUFFS.map((db) => {
            const has = c.effects.find((e) => e.refId === db.id)
            return (
              <div className="li" key={db.id}>
                <div className="main">
                  <div className="name">{db.name} {db.stackable && <span className="pill">Stackable</span>} {has && <span className="pill bad">Active{has.stacks > 1 ? ` ×${has.stacks}` : ''}</span>}</div>
                  <div className="meta">{db.effect.replace(/\+F/g, `+${c.floor}`)}</div>
                  <div className="meta faint">Ends: {db.duration}</div>
                </div>
                <button className="btn small bad" disabled={!!has && !db.stackable && !db.id.includes('injury')}
                  onClick={() => { up((x) => addDebuff(x, db.id)); toast(`${db.name} added`) }}>Add</button>
              </div>
            )
          })}
          <div className="pageref" style={{ padding: 8 }}>Table 11, Core p.97</div>
        </div>
      )}
      {tab === 'buff' && !pending && (
        <div className="list" style={{ marginTop: 8 }}>
          <div className="small muted" style={{ padding: '4px 2px' }}>External Buffs active: {externalCount(c)}/{MAX_EXTERNAL} (Rule of Three)</div>
          {BUFFS.map((b) => (
            <div className="li" key={b.id}>
              <div className="main">
                <div className="name">{b.name} {b.external && <span className="pill accent">External</span>}</div>
                <div className="meta">{b.summary}</div>
              </div>
              <PageRef page={b.page} />
              <button className="btn small good" onClick={() => {
                const typeKind = b.id === 'resistance' ? 'resist' : b.id === 'immunity' ? 'immune' : undefined
                const needsEdit = !!typeKind || ['dr-buff', 'evade-buff', 'stat-buff', 'damage-buff', 'tactics', 'custom'].includes(b.id)
                const p = { id: b.id, name: b.name, external: !!b.external, mods: b.mods ?? [], typeKind, type: typeKind ? 'Fire' : undefined }
                if (needsEdit) setPending(p)
                else addBuff(p)
              }}>Add</button>
            </div>
          ))}
        </div>
      )}
      {tab === 'buff' && pending && (
        <div className="stack" style={{ marginTop: 10 }}>
          <label>
            <span className="label">Name</span>
            <input value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value })} />
          </label>
          {pending.typeKind ? (
            <label>
              <span className="label">Damage type</span>
              <select value={pending.type} onChange={(e) => setPending({ ...pending, type: e.target.value })}>
                {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          ) : (
            <ModEditor mods={pending.mods} onChange={(mods) => setPending({ ...pending, mods })} />
          )}
          <label className="row small"><input type="checkbox" checked={pending.external} onChange={(e) => setPending({ ...pending, external: e.target.checked })} /> External Buff (counts toward the 3 active)</label>
          <div className="row">
            <button className="btn grow" onClick={() => setPending(null)}>Back</button>
            <button className="btn primary grow" onClick={() => addBuff(pending)}>Add Buff</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

export function EditEffectSheet({ c, up, effect, onClose }: Ctx & { effect: ActiveEffect; onClose: () => void }) {
  const def = effect.kind === 'debuff' ? findDebuff(effect.refId) : undefined
  const buff = effect.kind === 'buff' ? BUFFS.find((b) => b.id === effect.refId) : undefined
  const set = (patch: Partial<ActiveEffect>) =>
    up((x) => ({ ...x, effects: x.effects.map((e) => (e.uid === effect.uid ? { ...e, ...patch } : e)) }))
  const cur = c.effects.find((e) => e.uid === effect.uid) ?? effect
  const remove = () => {
    up((x) => ({ ...x, effects: x.effects.filter((e) => e.uid !== effect.uid) }))
    onClose()
  }
  const canActivate = !cur.external || cur.active || externalCount(c) < MAX_EXTERNAL
  return (
    <Sheet title={cur.name} onClose={onClose}>
      <div className="stack">
        {def && (
          <div className="infobox">
            <div>{def.effect.replace(/\+F/g, `+${c.floor}`)}</div>
            <div className="muted small" style={{ marginTop: 4 }}>Ends: {def.duration}</div>
            <PageRef page={def.page} />
          </div>
        )}
        {buff && <div className="infobox">{buff.summary} <PageRef page={buff.page} /></div>}
        {cur.mods.length > 0 && <div className="small">{cur.mods.map(describeMod).join(' · ')}</div>}
        <div className="row between">
          <label className="row"><input type="checkbox" checked={cur.active} disabled={!canActivate} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
          {(def?.stackable || cur.stacks > 1) && (
            <div className="row"><span className="label">Stacks</span><Stepper value={cur.stacks} min={1} max={20} onChange={(v) => set({ stacks: v })} /></div>
          )}
        </div>
        {cur.kind === 'buff' && (
          <label className="row small"><input type="checkbox" checked={!!cur.external} onChange={(e) => set({ external: e.target.checked, active: e.target.checked ? cur.active && canActivate : cur.active })} /> External Buff</label>
        )}
        {!canActivate && <div className="warnbox">3 External Buffs are already active. Switch one off first (you can swap them during a short rest).</div>}
        {cur.kind === 'buff' && (
          <details>
            <summary className="small muted">Edit bonuses</summary>
            <div style={{ marginTop: 8 }}><ModEditor mods={cur.mods} onChange={(mods) => set({ mods })} /></div>
          </details>
        )}
        <label>
          <span className="label">Notes (duration, source…)</span>
          <input value={cur.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <button className="btn danger" onClick={remove}>Remove {cur.kind === 'buff' ? 'Buff' : 'Debuff'}</button>
      </div>
    </Sheet>
  )
}
