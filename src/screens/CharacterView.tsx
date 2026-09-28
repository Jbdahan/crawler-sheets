import { useCallback, useMemo, useState } from 'react'
import { derive } from '../engine/derived'
import type { Character } from '../engine/types'
import { Icon } from '../components/ui'
import { useCharacter, useStore } from '../store/characters'
import { go } from '../router'
import { FloorSheet, LevelUpSheet, AdvancementSheet } from '../sheets/Progress'
import type { AdvanceWindow } from '../engine/advancement'
import { Hud } from './Hud'
import { Attacks } from './Attacks'
import { Hotlist } from './Hotlist'
import { Skills } from './Skills'
import { Gear } from './Gear'
import { More } from './More'

const TABS = [
  { key: 'hud', label: 'HUD', icon: 'hud' },
  { key: 'attacks', label: 'Attacks', icon: 'sword' },
  { key: 'hotlist', label: 'Hotlist', icon: 'bolt' },
  { key: 'skills', label: 'Skills', icon: 'list' },
  { key: 'gear', label: 'Gear', icon: 'bag' },
  { key: 'more', label: 'More', icon: 'more' },
] as const

export function CharacterView({ id, tab, sub }: { id: string; tab: string; sub?: string }) {
  const c = useCharacter(id)
  const update = useStore((s) => s.update)
  const up = useCallback((fn: (c: Character) => Character) => update(id, fn), [id, update])
  const d = useMemo(() => (c ? derive(c) : null), [c])
  const [quick, setQuick] = useState<null | 'level' | 'floor' | { adv: AdvanceWindow }>(null)

  if (!c || !d) {
    return (
      <div className="app">
        <div className="card empty">That crawler isn't on this device. <button className="btn small" onClick={() => go('/')}>Back to roster</button></div>
      </div>
    )
  }
  const ctx = { c, d, up }
  const current = TABS.some((t) => t.key === tab) ? tab : 'hud'

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn icon ghost" onClick={() => go('/')} aria-label="All crawlers"><Icon name="back" /></button>
        <div className="avatar" style={{ width: 38, height: 38, borderRadius: 10, fontSize: '1rem' }}>
          {c.portrait ? <img src={c.portrait} alt="" /> : (c.name || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="title">
          <h1>{c.name || 'Unnamed'}</h1>
          <div className="sub">{[c.raceName, c.className].filter(Boolean).join(' ') || (c.species === 'animal' ? c.animalType || 'Animal' : 'Human')} · #{c.crawlerNumber}</div>
        </div>
        <button className="btn small" onClick={() => setQuick('level')} title="Level up">Lvl {c.level}</button>
        <button className="btn small" onClick={() => setQuick('floor')} title="Change floor">F{c.floor}</button>
      </header>

      {current === 'hud' && <Hud {...ctx} />}
      {current === 'attacks' && <Attacks {...ctx} />}
      {current === 'hotlist' && <Hotlist {...ctx} />}
      {current === 'skills' && <Skills {...ctx} />}
      {current === 'gear' && <Gear {...ctx} />}
      {current === 'more' && <More {...ctx} sub={sub} />}

      <nav className="tabbar no-print">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.key} className={t.key === current ? 'on' : ''} onClick={() => go(`/c/${c.id}/${t.key}`)} aria-current={t.key === current ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {quick === 'level' && <LevelUpSheet {...ctx} onClose={() => setQuick(null)} onAdvance={(w) => setQuick({ adv: w })} />}
      {quick === 'floor' && <FloorSheet {...ctx} onClose={() => setQuick(null)} onAdvance={(w) => setQuick({ adv: w })} />}
      {quick && typeof quick === 'object' && <AdvancementSheet {...ctx} window={quick.adv} onClose={() => setQuick(null)} />}
    </div>
  )
}
