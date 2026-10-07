import { useEffect, useState } from 'react'
import { blankCharacter } from '../engine/character'
import { HB_SLOTS } from '../engine/health'
import { Icon, Sheet, toast } from '../components/ui'
import { useStore } from '../store/characters'
import { go } from '../router'
import { decodeImport } from '../sheets/Share'

export function Roster() {
  const { characters, order, importCharacter, duplicate, add, lastBackup } = useStore()
  const list = order.map((id) => characters[id]).filter(Boolean)
  const stale = list.length > 0 && Date.now() - lastBackup > 14 * 86400000

  const [paste, setPaste] = useState(false)
  const [dragging, setDragging] = useState(false)

  /** Import crawler files (from the picker or dropped on the page). */
  const importFiles = async (files: File[]) => {
    let lastId = ''
    for (const f of files) {
      try {
        lastId = importCharacter(readExport(await f.text()))
      } catch {
        toast(`Couldn't read ${f.name} as a crawler export`)
      }
    }
    if (!lastId) return
    toast(files.length > 1 ? 'Crawlers imported' : 'Crawler imported')
    go(files.length > 1 ? '/' : `/c/${lastId}`)
  }

  const onFile = (input: HTMLInputElement) => {
    // no accept filter on the input: iPhone greys out .json files it saved from Messages/AirDrop as another type
    const files = [...(input.files ?? [])]
    // clear it so picking the same file again still fires
    input.value = ''
    void importFiles(files)
  }

  // drop a .dcc.json anywhere on the home screen (for browsers that won't open a file picker)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void importFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          {/* a label opens the file picker natively: more reliable than a scripted click on iPhone/iPad home-screen apps */}
          <label className="btn" role="button">
            Import file
            <input type="file" multiple className="visually-hidden" onChange={(e) => onFile(e.currentTarget)} />
          </label>
        </div>
        <button className="btn ghost" onClick={() => setPaste(true)}>Paste an import link</button>
        <p className="small faint center" style={{ margin: 0 }}>On a computer you can also drag a <b>.dcc.json</b> file onto this page.</p>
        <button className="btn ghost" onClick={() => go('/rolls')}><Icon name="dice" size={18} /> Roll log</button>
        <button className="btn ghost" onClick={() => go('/loot')}><Icon name="bag" size={18} /> GM: Loot Box Maker</button>
      </div>
      <p className="small faint center" style={{ marginTop: 24 }}>
        Unofficial fan tool. Rules summaries cite the Dungeon Crawler Carl RPG Core Rulebook (Renegade Game Studios); use your book for full text.
      </p>
      <p className="small faint center" style={{ marginTop: 6 }}>
        Version {__APP_VERSION__.version} · {__APP_VERSION__.built}{__APP_VERSION__.sha ? ` · ${__APP_VERSION__.sha}` : ''}
      </p>
      {dragging && <div className="drop-overlay"><div>Drop a crawler file to import it</div></div>}
      {paste && <PasteImport onClose={() => setPaste(false)} onImport={(raw) => {
        try {
          const id = importCharacter(raw)
          toast('Crawler imported')
          setPaste(false)
          go(`/c/${id}`)
        } catch {
          toast("That isn't a crawler")
        }
      }} />}
    </div>
  )
}

/** A crawler export: the .dcc.json file, or text holding a share link (#import=…). */
function readExport(text: string): unknown {
  const t = text.replace(/^\uFEFF/, '').trim()
  const link = t.match(/#import=([A-Za-z0-9+\-$_]+)/)
  const raw = link ? decodeImport(link[1]) : JSON.parse(t)
  if (!raw || typeof raw !== 'object' || !('skills' in raw)) throw new Error('not a crawler')
  return raw
}

/**
 * Paste a crawler's import link (More → Share → Copy import link), a GM's loot claim link,
 * or the text of a .dcc.json file.
 */
function PasteImport({ onClose, onImport }: { onClose: () => void; onImport: (raw: unknown) => void }) {
  const [text, setText] = useState('')
  const t = text.trim()
  const loot = t.match(/#loot=\S+/)
  const submit = () => {
    if (loot) {
      onClose()
      location.hash = loot[0]
      return
    }
    try {
      onImport(readExport(t))
    } catch {
      toast("Couldn't read that. Paste the whole import link or file text")
    }
  }
  return (
    <Sheet title="Paste an import link" onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          On the other device, open the crawler, then <b>More → Share → Copy import link</b>, and paste it here.
          The text of a <b>.dcc.json</b> file or a GM's loot claim link works too.
        </p>
        <textarea autoFocus rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…#import=…" style={{ minHeight: 120 }} />
        <button className="btn primary" disabled={!t} onClick={submit}>{loot ? 'Open loot claim' : 'Import crawler'}</button>
      </div>
    </Sheet>
  )
}
