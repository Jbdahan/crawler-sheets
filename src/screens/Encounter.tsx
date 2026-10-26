import { useEffect, useMemo, useState } from 'react'
import { MONSTERS, type MonsterDef } from '../data/monsters'
import { emptyEncounter, groupMonsters, hbSlots, hbTotal, pickedList, withFloor, type Encounter } from '../engine/encounter'
import { loadCustomMobs, toMonster } from '../engine/customMob'
import { PageRef, Seg, signed } from '../components/ui'
import { go } from '../router'
import './encounter.css'

const KEY = 'encounter.draft'
const STAT_ABBR = ['Str', 'Int', 'Con', 'Dex', 'Cha']
const BOOK_ABBR: Record<string, string> = { Core: 'Core', Par: 'Par' }

function load(): Encounter {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyEncounter(), ...JSON.parse(raw) }
  } catch { /* private mode or bad JSON */ }
  return emptyEncounter()
}

function useEncounter() {
  const [e, setE] = useState(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(e)) } catch { /* quota: the draft just isn't saved */ }
  }, [e])
  const setQty = (id: string, qty: number) => setE((cur) => {
    const picks = { ...cur.picks }
    if (qty > 0) picks[id] = Math.min(qty, 99)
    else delete picks[id]
    return { ...cur, picks }
  })
  return { e, setE, setQty }
}

/** The GM's custom Mobs as stat blocks. */
function useCustomDefs(): MonsterDef[] {
  return useMemo(() => loadCustomMobs().map(toMonster), [])
}

type Filter = 'all' | 'mobs' | 'bosses' | 'picked'

/** GM tool: pick Mobs and Bosses, then print them all on one condensed sheet. */
export function EncounterBuilder() {
  const { e, setE, setQty } = useEncounter()
  const custom = useCustomDefs()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [part, setPart] = useState('')
  const parts = useMemo(() => [...new Set([...custom, ...MONSTERS].map((m) => m.part))], [custom])
  const n = q.trim().toLowerCase()
  const list = [...custom, ...MONSTERS].filter((m) =>
    (filter === 'all' || (filter === 'mobs' && !m.boss) || (filter === 'bosses' && m.boss) || (filter === 'picked' && e.picks[m.id]))
    && (!part || m.part === part)
    && (!n || [m.name, m.character, m.type, m.section, m.tier].some((s) => s?.toLowerCase().includes(n))))
  // the GM's own Mobs and Bosses stay together at the top
  const mine = list.filter((m) => m.book === 'Custom')
  const groups = [
    ...(mine.length ? [{ key: 'custom', part: 'Custom', section: 'Custom', items: mine }] : []),
    ...groupMonsters(list.filter((m) => m.book !== 'Custom')),
  ]
  const picked = pickedList(e, custom)
  const creatures = picked.reduce((a, x) => a + x.qty, 0)

  return (
    <div className="app enc-builder">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go('/')} aria-label="Back">‹</button>
        <div className="title"><h1>Encounter builder</h1><div className="sub">Pick Mobs and Bosses, then print one condensed sheet</div></div>
      </div>
      <div className="stack">
        <input placeholder="Search name, type, Neighborhood…" value={q} onChange={(ev) => setQ(ev.target.value)} />
        <div className="row wrap">
          <Seg value={filter} onChange={setFilter} options={[
            { value: 'all', label: `All (${MONSTERS.length + custom.length})` },
            { value: 'mobs', label: 'Mobs & NPCs' },
            { value: 'bosses', label: 'Bosses' },
            { value: 'picked', label: `Picked (${picked.length})` },
          ]} />
          <select value={part} onChange={(ev) => setPart(ev.target.value)} style={{ width: 'auto', flex: 1, minWidth: 180 }} aria-label="Floor">
            <option value="">Every Floor</option>
            {parts.map((p) => <option key={p} value={p}>{p === 'Custom' ? 'Custom Mobs' : p}</option>)}
          </select>
          <button className="btn" onClick={() => go('/encounter/custom/new')}>+ Custom Mob</button>
        </div>
        {!groups.length && <div className="empty">{filter === 'picked' ? 'Nothing picked yet.' : 'No matches.'}</div>}
        {groups.map((g) => (
          <div key={g.key} className="card list">
            <div className="enc-group">
              <b>{g.key === 'custom' ? 'Your custom Mobs' : g.part === 'Bosses' ? `Bosses · ${g.section}` : g.section === g.part ? g.part : g.section}</b>
              {g.part !== 'Bosses' && g.section !== g.part && <span className="small muted"> {g.part}</span>}
            </div>
            {g.items.map((m) => (
              <PickRow key={m.id} m={m} qty={e.picks[m.id] ?? 0} setQty={(v) => setQty(m.id, v)}
                onEdit={m.book === 'Custom' ? () => go(`/encounter/custom/${m.id}`) : undefined} />
            ))}
          </div>
        ))}
      </div>
      <div className="enc-bar">
        <div className="grow small">
          <b>{picked.length}</b> stat block{picked.length === 1 ? '' : 's'} · <b>{creatures}</b> creature{creatures === 1 ? '' : 's'}
        </div>
        {picked.length > 0 && <button className="btn small ghost" onClick={() => setE({ ...e, picks: {} })}>Clear</button>}
        <button className="btn primary" disabled={!picked.length} onClick={() => go('/encounter/sheet')}>Encounter sheet</button>
      </div>
    </div>
  )
}

function PickRow({ m, qty, setQty, onEdit }: { m: MonsterDef; qty: number; setQty: (n: number) => void; onEdit?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`enc-pick${qty ? ' on' : ''}`}>
      <div className="li">
        <button className="main enc-name" onClick={() => setOpen(!open)} aria-expanded={open}>
          <div className="name">{m.name}{m.character && <span className="muted"> · {m.character}</span>}</div>
          <div className="meta">
            <span className={`pill${m.boss ? ' bad' : m.tier === 'Mob' ? ' accent' : ' good'}`}>{m.tier}</span>{' '}
            Lvl {m.level} · {m.size} {m.type} · HB {hbTotal(m)}
          </div>
        </button>
        <div className="enc-step">
          {onEdit && <button className="btn small ghost" onClick={onEdit}>Edit</button>}
          {qty > 0 && <button className="btn small" onClick={() => setQty(qty - 1)} aria-label={`One fewer ${m.name}`}>−</button>}
          {qty > 0 && <b>{qty}</b>}
          <button className={`btn small${qty ? '' : ' primary'}`} onClick={() => setQty(qty + 1)} aria-label={`Add ${m.name}`}>{qty ? '+' : 'Add'}</button>
        </div>
      </div>
      {open && (
        <div className="enc-preview">
          <StatCard m={m} floor={0} trackers={false} />
          <button className="btn small" style={{ marginTop: 6 }} onClick={() => go(`/encounter/custom/from/${m.id}`)}>
            {m.book === 'Custom' ? 'Duplicate' : 'Customize a copy'}
          </button>
        </div>
      )}
    </div>
  )
}

/** One-page-wide printable sheet with every picked stat block and Health Bar trackers. */
export function EncounterSheet() {
  const { e, setE } = useEncounter()
  const picked = pickedList(e, useCustomDefs())
  const creatures = picked.reduce((a, x) => a + x.qty, 0)
  useEffect(() => {
    document.documentElement.classList.add('printing')
    return () => document.documentElement.classList.remove('printing')
  }, [])
  return (
    <div className="enc-root">
      <div className="enc-printbar no-print">
        <button className="btn" onClick={() => go('/encounter')}>‹ Edit</button>
        <input className="enc-name-input" placeholder="Encounter name" value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
        <label className="row small" style={{ gap: 6 }}>Floor
          <select value={e.floor} onChange={(ev) => setE({ ...e, floor: Number(ev.target.value) })} style={{ width: 'auto' }}>
            <option value={0}>+F</option>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <div className="enc-page">
        <header className="enc-head">
          <div>
            <div className="enc-title">{e.name || 'Encounter'}</div>
            <div className="enc-meta">
              {e.floor ? `Floor ${e.floor} (+F applied)` : '+F = add the Floor number'} · {picked.length} stat block{picked.length === 1 ? '' : 's'} · {creatures} creature{creatures === 1 ? '' : 's'}
            </div>
          </div>
          <div className="enc-key">To hit = Evade Difficulty · MF+ = Major Fail or worse · CF = Critical Fail · Subtract DR from damage taken · ▸ more in the book</div>
        </header>
        {!picked.length && <p>Nothing picked. Go back and add some Mobs.</p>}
        <div className="enc-cols">
          {/* one card per creature, so each has its own Health Bar to tick off */}
          {picked.flatMap(({ m, qty }) => Array.from({ length: qty }, (_, k) => (
            <StatCard key={`${m.id}-${k}`} m={m} n={qty > 1 ? k + 1 : undefined} floor={e.floor} trackers />
          )))}
        </div>
      </div>
    </div>
  )
}

/** n numbers the creature when several of the same Mob are in the encounter (Bugaboo 1, Bugaboo 2…). */
export function StatCard({ m, n, floor, trackers }: { m: MonsterDef; n?: number; floor: number; trackers: boolean }) {
  const f = (v: string) => withFloor(v, floor)
  const slots = hbSlots(m)
  const uniform = slots.every((s) => s === slots[0])
  return (
    <article className={`enc-card${m.boss ? ' boss' : ''}`}>
      <div className="enc-c-head">
        <b className="enc-c-name">{m.name}{n && <span className="enc-qty"> {n}</span>}</b>
        <span className="enc-c-tier">{m.tier} · Lvl {m.level}</span>
      </div>
      <div className="enc-c-sub">
        {m.character && <><b>{m.character}</b> · </>}{m.size} {m.type} · {m.book === 'Custom' ? 'Custom' : <PageRef book={BOOK_ABBR[m.book] ?? m.book} page={m.page} />}
      </div>
      <div className="enc-c-core">
        <span>Surp <b>{f(m.surprise)}</b></span>
        <span>Evade <b>{f(m.evade)}</b></span>
        <span>Move <b>{m.move}</b></span>
        <span>DR <b>{f(m.dr)}</b></span>
        <span>HB <b>{uniform ? `${slots.length}×${slots[0]}` : `${slots.length} slots`}</b>={hbTotal(m)}</span>
      </div>
      <div className="enc-c-stats">
        {m.stats.map((s, i) => <span key={i}>{STAT_ABBR[i]} <b>{s ? signed(s[1]) : '—'}</b>{s && <small>{s[0]}</small>}</span>)}
      </div>
      <ul className="enc-c-atks">
        {m.attacks.map((a, i) => (
          <li key={i}>
            <b>{a.name}</b>{a.hit && <> <span className="enc-hit">{f(a.hit)}</span></>} · {f(a.text)}
            {a.fx && <span className="enc-fx"> — {a.fx.join('; ')}</span>}
            {a.more && <span className="enc-more" title={`More in the book, p.${m.page}`}> ▸</span>}
          </li>
        ))}
      </ul>
      {m.notes.length > 0 && <div className="enc-c-notes"><b>Notes:</b> {m.notes.join(' · ')}{m.page > 0 && <span className="enc-more"> ▸ p.{m.page}</span>}</div>}
      {trackers && (
        <div className="enc-hb">
          <div className="enc-hb-row">{slots.map((v, i) => <i key={i}>{v}</i>)}</div>
        </div>
      )}
    </article>
  )
}
