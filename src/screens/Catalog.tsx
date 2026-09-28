import { useMemo, useState } from 'react'
import { ALL_SKILLS, BUFFS, CLASSES, DEBUFFS, DEITIES, RACES, STAT_ABBR, STAT_KEYS, type RaceClassDef } from '../data'
import { PageRef, Seg, signed } from '../components/ui'
import { go } from '../router'

type Tab = 'skills' | 'spells' | 'races' | 'classes' | 'buffs' | 'debuffs' | 'deities'

export function Catalog() {
  const [tab, setTab] = useState<Tab>('skills')
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const hit = (...s: (string | undefined)[]) => !n || s.some((x) => x?.toLowerCase().includes(n))

  const skills = useMemo(() => ALL_SKILLS.filter((s) => (tab === 'spells' ? s.kind === 'spell' : s.kind !== 'spell') && hit(s.name, s.summary, s.group)), [tab, n]) // eslint-disable-line react-hooks/exhaustive-deps

  const rc = (list: RaceClassDef[]) => list.filter((r) => hit(r.name, r.group, r.benefits.join(' '))).map((r) => (
    <details key={r.id} className="card">
      <summary className="row between" style={{ cursor: 'pointer' }}>
        <span><b>{r.name}</b> <span className="small muted">{r.group}</span></span>
        <PageRef page={r.page} />
      </summary>
      <div className="small" style={{ marginTop: 6 }}>
        {r.size && <div>Size: {r.size}</div>}
        <div>{[r.allStats ? `${signed(r.allStats)} all Stats` : '', ...STAT_KEYS.filter((k) => r.stats[k]).map((k) => `${signed(r.stats[k]!)} ${STAT_ABBR[k]}`), r.dr ? `+${r.dr} DR` : ''].filter(Boolean).join(', ')}</div>
        {r.skills.length > 0 && <div>{r.skills.map((s) => `+${s.ranks} ${s.name}`).join(', ')}</div>}
        {r.prerequisite && <div style={{ color: 'var(--warn)' }}>Prerequisite: {r.prerequisite}</div>}
        <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
          {[...r.choices.map((c) => c.text), ...r.rank20, ...r.benefits].map((b) => <li key={b}>{b}</li>)}
          {r.earthBox && <li>Silver Earth Box</li>}
        </ul>
      </div>
    </details>
  ))

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => history.length > 1 ? history.back() : go('/')} aria-label="Back">‹</button>
        <div className="title"><h1>Rules catalog</h1><div className="sub">Mechanics summaries with page references</div></div>
      </div>
      <div className="stack">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs-inline">
          <Seg value={tab} onChange={setTab} options={[
            { value: 'skills', label: `Skills (${ALL_SKILLS.filter((s) => s.kind !== 'spell').length})` },
            { value: 'spells', label: `Spells (${ALL_SKILLS.filter((s) => s.kind === 'spell').length})` },
            { value: 'races', label: `Races (${RACES.length})` },
            { value: 'classes', label: `Classes (${CLASSES.length})` },
            { value: 'buffs', label: 'Buffs' },
            { value: 'debuffs', label: `Debuffs (${DEBUFFS.length})` },
            { value: 'deities', label: 'Deities' },
          ]} />
        </div>
        {(tab === 'skills' || tab === 'spells') && skills.map((s) => (
          <details key={s.id} className="card">
            <summary className="row between" style={{ cursor: 'pointer' }}>
              <span>
                <b>{s.name}</b>{' '}
                <span className="small muted">{s.kind === 'damageEffect' ? 'Damage Effect' : s.group ?? s.kind}{s.stat ? ` · ${STAT_ABBR[s.stat]}` : ''}{s.passive ? ' · Passive' : ''}{s.mana !== undefined ? ` · ${s.mana} Mana` : ''}</span>
              </span>
              <PageRef page={s.page} />
            </summary>
            <div className="small" style={{ marginTop: 6 }}>
              <p>{s.summary}</p>
              {s.damage && <div><b>Base damage:</b> {s.damage.count}d{s.damage.sides}{s.damage.stat ? ` + ${STAT_ABBR[s.damage.stat]}` : ''} {s.damage.types.join('/')} {s.damage.area}</div>}
              {[['Check', s.checkType], ['Range', s.range], ['Cooldown', s.cooldown], ['Duration', s.duration], ['AI Favor', s.aiFavor], ['Limitations', s.limitations], ['Favored', s.favored?.join(', ')]]
                .filter(([, v]) => v).map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
              {s.upgrades && (
                <ul className="upgrades">
                  {Object.entries(s.upgrades).map(([r, u]) => <li key={r}><span className="r">R{r}</span><span>{u.text}</span></li>)}
                </ul>
              )}
            </div>
          </details>
        ))}
        {tab === 'races' && rc(RACES)}
        {tab === 'classes' && rc(CLASSES)}
        {tab === 'debuffs' && DEBUFFS.filter((x) => hit(x.name, x.effect)).map((x) => (
          <div key={x.id} className="card">
            <div className="row between"><b>{x.name}</b><PageRef page={x.page} /></div>
            <div className="small">{x.effect.replace(/\+F/g, ' + Floor')}</div>
            <div className="small muted">Ends: {x.duration}</div>
          </div>
        ))}
        {tab === 'buffs' && BUFFS.filter((x) => hit(x.name, x.summary)).map((x) => (
          <div key={x.id} className="card">
            <div className="row between"><b>{x.name} {x.external && <span className="pill accent">External</span>}</b><PageRef page={x.page} /></div>
            <div className="small">{x.summary}</div>
          </div>
        ))}
        {tab === 'deities' && DEITIES.filter((x) => hit(x.name, x.signatureSkills)).map((x) => (
          <div key={x.id} className="card">
            <div className="row between"><b>{x.name}</b><PageRef page={x.page} /></div>
            <div className="small">Signature: {x.signatureSkills} · {x.signatureStat}</div>
            <div className="small muted">Rival: {x.rival} · Sponsor: {x.sponsor} · Offering: {x.offering}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
