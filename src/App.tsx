import { useEffect, useState } from 'react'
import { RollHost } from './components/Roller'
import { Sheet, Toast, toast } from './components/ui'
import { go, useRoute } from './router'
import { Catalog } from './screens/Catalog'
import { CharacterView } from './screens/CharacterView'
import { CreateWizard } from './screens/CreateWizard'
import { LootBox } from './screens/LootBox'
import { LootClaimScreen } from './screens/LootClaim'
import { Print } from './screens/Print'
import { Roster } from './screens/Roster'
import { decodeImport } from './sheets/Share'
import { requestPersistentStorage, useStore } from './store/characters'

export default function App() {
  const route = useRoute()
  useEffect(requestPersistentStorage, [])

  let screen
  switch (route.name) {
    case 'new': screen = <CreateWizard />; break
    case 'char': {
      const [tab, sub] = route.tab.split('/')
      screen = <CharacterView id={route.id} tab={tab} sub={sub ?? subFromHash()} />
      break
    }
    case 'print': screen = <Print id={route.id} />; break
    case 'catalog': screen = <Catalog />; break
    case 'rolls': screen = <RollLog />; break
    case 'loot': screen = <LootBox />; break
    case 'claim': screen = <LootClaimScreen data={route.data} />; break
    case 'import': screen = <><Roster /><ImportPrompt data={route.data} /></>; break
    default: screen = <Roster />
  }
  return (
    <>
      {screen}
      <RollHost />
      <Toast />
    </>
  )
}

/** "#/c/<id>/more/stats" → "stats" */
function subFromHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/')
  return parts[3]
}

function ImportPrompt({ data }: { data: string }) {
  const importCharacter = useStore((s) => s.importCharacter)
  const [c] = useState<{ name?: string; level?: number } | null>(() => {
    try { return decodeImport(data) as { name?: string; level?: number } } catch { return null }
  })
  const close = () => go('/')
  if (!c) {
    return <Sheet title="Import" onClose={close}><p>That link is damaged or incomplete.</p></Sheet>
  }
  return (
    <Sheet title="Import crawler?" onClose={close}>
      <p>Add <b>{c.name || 'this crawler'}</b> (Level {c.level ?? 1}) to this device? It becomes a separate copy.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn grow" onClick={close}>Cancel</button>
        <button className="btn primary grow" onClick={() => { const id = importCharacter(c); toast('Imported'); go(`/c/${id}`) }}>Import</button>
      </div>
    </Sheet>
  )
}

function RollLog() {
  const rolls = useStore((s) => s.rolls)
  const clear = useStore((s) => s.clearRolls)
  return (
    <div className="app">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go('/')} aria-label="Back">‹</button>
        <div className="title"><h1>Roll log</h1><div className="sub">Last {rolls.length} rolls on this device</div></div>
        <button className="btn small" onClick={clear}>Clear</button>
      </div>
      <div className="card list">
        {!rolls.length && <div className="empty">No rolls yet.</div>}
        {rolls.map((r) => (
          <div key={r.id} className="li">
            <div className="main">
              <div className="name">{r.charName ? `${r.charName}: ` : ''}{r.label}</div>
              <div className="meta">{r.detail} · {new Date(r.at).toLocaleTimeString()}</div>
            </div>
            <span style={{ fontWeight: 900, fontSize: '1.2rem' }}>{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
