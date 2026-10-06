import { useRef } from 'react'
import { blankCharacter } from '../engine/character'
import { HB_SLOTS } from '../engine/health'
import { Icon, toast } from '../components/ui'
import { useStore } from '../store/characters'
import { go } from '../router'

export function Roster() {
  const { characters, order, importCharacter, duplicate, add, lastBackup } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const list = order.map((id) => characters[id]).filter(Boolean)
  const stale = list.length > 0 && Date.now() - lastBackup > 14 * 86400000

  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const id = importCharacter(JSON.parse(await f.text()))
      toast('Crawler imported')
      go(`/c/${id}`)
    } catch {
      toast("That file isn't a crawler export")
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="title">
          <h1>Crawler Sheets</h1>
          <div className="sub">Dungeon Crawler Carl RPG · fan-made character tracker</div>
        </div>
        <button className="btn small" onClick={() => go('/catalog')}><Icon name="book" size={16} /> Rules</button>
      </div>

      {stale && <div className="warnbox" style={{ marginBottom: 12 }}>Characters live only on this device. Export a backup now and then (open a crawler → More → Export).</div>}

      {list.length === 0 && (
        <div className="card center" style={{ padding: 24 }}>
          <h2>No crawlers yet</h2>
          <p className="muted">Create a Level 1 crawler with the step-by-step builder, start from a blank sheet to copy an existing character, or import one from another player.</p>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {list.map((c) => (
          <div key={c.id} className="row" style={{ marginBottom: 10 }}>
            <button className="roster-card" onClick={() => go(`/c/${c.id}`)}>
              <div className="avatar">{c.portrait ? <img src={c.portrait} alt="" /> : (c.name || '?').slice(0, 1).toUpperCase()}</div>
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{c.name || 'Unnamed'}</div>
                <div className="small muted">Level {c.level} · Floor {c.floor}{c.raceName ? ` · ${c.raceName}` : ''}{c.className ? ` ${c.className}` : ''}</div>
                <div className="small"><span style={{ color: c.health.lost >= 7 ? 'var(--danger)' : 'var(--good)' }}>{(HB_SLOTS - c.health.lost) * 10}% HB</span> · <span style={{ color: 'var(--mana)' }}>{c.mana} Mana</span></div>
              </div>
            </button>
            <button className="btn icon ghost" title="Duplicate" aria-label="Duplicate" onClick={() => { duplicate(c.id); toast('Duplicated') }}>⧉</button>
          </div>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => go('/new')}><Icon name="plus" size={18} /> New Level 1 crawler</button>
        <div className="grid2">
          <button className="btn" onClick={() => { const c = blankCharacter(); c.name = 'New Crawler'; add(c); go(`/c/${c.id}/more`) }}>Blank sheet</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import file</button>
        </div>
        <button className="btn ghost" onClick={() => go('/rolls')}><Icon name="dice" size={18} /> Roll log</button>
        <button className="btn ghost" onClick={() => go('/loot')}><Icon name="bag" size={18} /> GM: Loot Box Maker</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <p className="small faint center" style={{ marginTop: 24 }}>
        Unofficial fan tool. Rules summaries cite the Dungeon Crawler Carl RPG Core Rulebook (Renegade Game Studios); use your book for full text.
      </p>
      <p className="small faint center" style={{ marginTop: 6 }}>
        Version {__APP_VERSION__.version} · {__APP_VERSION__.built}{__APP_VERSION__.sha ? ` · ${__APP_VERSION__.sha}` : ''}
      </p>
    </div>
  )
}
