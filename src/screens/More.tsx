import { useEffect, useState } from 'react'
import { DEITIES, STAT_KEYS, STAT_NAMES, SIZES, findClass, findDeity, findRace } from '../data'
import type { AdvanceWindow } from '../engine/advancement'
import { Confirm, PageRef, Sheet, Stepper, toast } from '../components/ui'
import { AdvancementSheet, FloorSheet, GrindSheet, LevelUpSheet, StatAllocSheet } from '../sheets/Progress'
import { RaceClassWizard } from '../sheets/RaceClass'
import { ShareSheet } from '../sheets/Share'
import { useStore } from '../store/characters'
import { go } from '../router'
import type { Ctx } from './ctx'

type Open = null | 'level' | 'floor' | 'stats' | 'grind' | 'raceclass' | 'identity' | 'share' | 'delete' | { adv: AdvanceWindow }

export function More(ctx: Ctx & { sub?: string }) {
  const { c, up, sub } = ctx
  const [open, setOpen] = useState<Open>(null)
  const remove = useStore((s) => s.remove)
  const race = findRace(c.raceId)
  const klass = findClass(c.classId)

  useEffect(() => {
    if (sub === 'stats') setOpen('stats')
    if (sub === 'raceclass') setOpen('raceclass')
    if (sub === 'level') setOpen('level')
    if (sub) go(`/c/${c.id}/more`)
  }, [sub, c.id])

  const onAdvance = (w: AdvanceWindow) => setOpen({ adv: w })

  return (
    <div className="cols2">
      <div>
        <section className="card">
          <div className="card-head"><h2>Progress</h2><span className="small muted">Level {c.level} · Floor {c.floor}</span></div>
          <div className="grid2">
            <button className="btn primary" onClick={() => setOpen('level')}>Level up</button>
            <button className="btn" onClick={() => setOpen('floor')}>Change floor</button>
            <button className="btn" onClick={() => setOpen('stats')}>Stat points ({c.pendingStatPoints})</button>
            <button className="btn" onClick={() => setOpen('grind')}>Grind</button>
          </div>
          <div className="divider" />
          <div className="row between">
            <div>
              <div className="label">Race &amp; Class</div>
              <div>{c.raceName ?? '—'} {race && <PageRef page={race.page} />}</div>
              <div>{c.className ?? '—'} {klass && <PageRef page={klass.page} />}</div>
            </div>
            <button className="btn small" onClick={() => setOpen('raceclass')}>{c.raceId ? 'Change' : 'Choose'}</button>
          </div>
          {c.floor < 3 && !c.raceId && <p className="small faint">Race & Class are chosen on reaching the Third Floor (Core p.128).</p>}
          {(race || klass) && (
            <details style={{ marginTop: 8 }}>
              <summary className="small muted">Race & Class benefits</summary>
              {[race, klass].filter(Boolean).map((rc) => (
                <div key={rc!.id} style={{ marginTop: 6 }}>
                  <b>{rc!.name}</b>
                  <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {rc!.benefits.map((b) => <li key={b}>{b}</li>)}
                    {rc!.rank20.map((b) => <li key={b}>{b}</li>)}
                    {rc!.choices.map((b) => <li key={b.text}>{b.text}</li>)}
                    {rc!.earthBox && <li>Silver Earth Box with a guaranteed Earth Hobby Potion (+3 Ranks in a hobby Skill)</li>}
                  </ul>
                </div>
              ))}
            </details>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Popularity &amp; favor</h2></div>
          <div className="row between"><span>Popularity</span><Stepper value={c.popularity} min={0} max={9999999} editable onChange={(v) => up((x) => ({ ...x, popularity: v }))} /></div>
          <div className="row between" style={{ marginTop: 8 }}><span>AI Favor</span><Stepper value={c.aiFavor} min={0} max={99} onChange={(v) => up((x) => ({ ...x, aiFavor: v }))} /></div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span className="label">Deity</span>
            <select value={c.deityId ?? ''} onChange={(e) => up((x) => ({ ...x, deityId: e.target.value || undefined }))}>
              <option value="">None</option>
              {DEITIES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          {c.deityId && (() => {
            const g = findDeity(c.deityId)
            return g ? (
              <div className="small muted" style={{ marginTop: 6 }}>
                Signature: {g.signatureSkills} · {g.signatureStat}. Offering: {g.offering}. Rival: {g.rival}. <PageRef page={g.page} />
                <select style={{ marginTop: 6 }} value={c.worshipTier ?? ''} onChange={(e) => up((x) => ({ ...x, worshipTier: e.target.value || undefined }))}>
                  <option value="">Not a worshipper</option><option>Acolyte (Tier 1)</option><option>Devotee (Tier 2)</option><option>Zealot (Tier 3)</option>
                </select>
              </div>
            ) : null
          })()}
        </section>

        <section className="card">
          <div className="card-head"><h2>Crawler</h2><button className="btn small" onClick={() => setOpen('identity')}>Edit</button></div>
          <div className="small">
            <div>{c.name || 'Unnamed'}{c.pronouns ? ` (${c.pronouns})` : ''} · Crawler #{c.crawlerNumber}</div>
            <div className="muted">{c.species === 'animal' ? `Animal${c.animalType ? `: ${c.animalType}` : ''}` : 'Human'} · {SIZES[c.size]} ({c.size}) · Move {c.baseMove} · Step {c.step}</div>
          </div>
        </section>
      </div>

      <div>
        <section className="card">
          <div className="card-head"><h2>Story</h2></div>
          <div className="stack">
            {([['trauma', 'Past Trauma'], ['looseEnds', 'Loose Ends'], ['regrets', 'Regrets'], ['notes', 'Notes']] as const).map(([k, label]) => (
              <label key={k}>
                <span className="label">{label}</span>
                <textarea value={c.story[k]} onChange={(e) => up((x) => ({ ...x, story: { ...x.story, [k]: e.target.value } }))} />
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Share &amp; print</h2></div>
          <div className="grid2">
            <button className="btn" onClick={() => setOpen('share')}>Export / share</button>
            <button className="btn" onClick={() => go(`/print/${c.id}`)}>Printable sheet</button>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>History</h2></div>
          {!c.log.length && <div className="empty">Level-ups, Rank gains and floor changes show up here.</div>}
          <div className="list small">
            {c.log.slice(0, 40).map((l, i) => (
              <div key={i} className="li" style={{ padding: '6px 0' }}>
                <span className="faint" style={{ minWidth: 72 }}>{new Date(l.at).toLocaleDateString()}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </section>

        <button className="btn danger" style={{ width: '100%', marginTop: 12 }} onClick={() => setOpen('delete')}>Delete crawler</button>
      </div>

      {open === 'level' && <LevelUpSheet {...ctx} onClose={() => setOpen(null)} onAdvance={onAdvance} />}
      {open === 'floor' && <FloorSheet {...ctx} onClose={() => setOpen(null)} onAdvance={onAdvance} />}
      {open === 'stats' && <StatAllocSheet {...ctx} onClose={() => setOpen(null)} />}
      {open === 'grind' && <GrindSheet {...ctx} onClose={() => setOpen(null)} />}
      {open === 'raceclass' && <RaceClassWizard {...ctx} onClose={() => setOpen(null)} />}
      {open === 'share' && <ShareSheet c={c} onClose={() => setOpen(null)} />}
      {open === 'identity' && <IdentitySheet {...ctx} onClose={() => setOpen(null)} />}
      {open && typeof open === 'object' && 'adv' in open && (
        <AdvancementSheet {...ctx} window={open.adv} onClose={() => {
          setOpen(null)
          if (open.adv === 'endOfFloor' && c.floor >= 3 && !c.raceId) setOpen('raceclass')
        }} />
      )}
      {open === 'delete' && (
        <Confirm text={`Delete ${c.name || 'this crawler'}? Export a backup first if you might want them back.`}
          onNo={() => setOpen(null)} onYes={() => { remove(c.id); toast('Crawler deleted'); go('/') }} />
      )}
    </div>
  )
}

function IdentitySheet({ c, up, onClose }: Ctx & { onClose: () => void }) {
  const onPortrait = (f?: File) => {
    if (!f) return
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        const size = 256
        const cv = document.createElement('canvas')
        cv.width = size
        cv.height = size
        const g = cv.getContext('2d')!
        const s = Math.min(img.width, img.height)
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
        up((x) => ({ ...x, portrait: cv.toDataURL('image/jpeg', 0.8) }))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(f)
  }
  return (
    <Sheet title="Edit crawler" onClose={onClose}>
      <div className="stack">
        <div className="grid2">
          <label><span className="label">Name</span><input value={c.name} onChange={(e) => up((x) => ({ ...x, name: e.target.value }))} /></label>
          <label><span className="label">Pronouns</span><input value={c.pronouns} onChange={(e) => up((x) => ({ ...x, pronouns: e.target.value }))} /></label>
          <label><span className="label">Crawler number</span><input value={c.crawlerNumber} onChange={(e) => up((x) => ({ ...x, crawlerNumber: e.target.value }))} /></label>
          <label><span className="label">Portrait</span><input type="file" accept="image/*" onChange={(e) => onPortrait(e.target.files?.[0])} /></label>
        </div>
        <div className="grid2">
          <label><span className="label">Level</span><div><Stepper value={c.level} min={1} max={250} editable onChange={(v) => up((x) => ({ ...x, level: v }))} /></div></label>
          <label><span className="label">Size</span>
            <select value={c.size} onChange={(e) => up((x) => ({ ...x, size: Number(e.target.value) }))}>
              {SIZES.map((s, i) => i > 0 && <option key={i} value={i}>{i} · {s}</option>)}
            </select>
          </label>
          <label><span className="label">Base Move (ft)</span><div><Stepper value={c.baseMove} min={0} max={500} step={5} onChange={(v) => up((x) => ({ ...x, baseMove: v }))} /></div></label>
          <label><span className="label">Step (ft)</span><div><Stepper value={c.step} min={0} max={100} step={5} onChange={(v) => up((x) => ({ ...x, step: v }))} /></div></label>
        </div>
        <div className="label">Starting Stats (before level-ups, Race and Class)</div>
        <div className="grid3">
          {STAT_KEYS.map((k) => (
            <label key={k}><span className="small">{STAT_NAMES[k]}</span><div><Stepper value={c.base[k]} min={1} max={999} editable onChange={(v) => up((x) => ({ ...x, base: { ...x.base, [k]: v } }))} /></div></label>
          ))}
        </div>
        <details>
          <summary className="small muted">Level-up points already spent (for copying a paper sheet)</summary>
          <div className="grid3" style={{ marginTop: 6 }}>
            {STAT_KEYS.map((k) => (
              <label key={k}><span className="small">{STAT_NAMES[k]}</span><div><Stepper value={c.statPoints[k]} min={0} max={999} editable onChange={(v) => up((x) => ({ ...x, statPoints: { ...x.statPoints, [k]: v } }))} /></div></label>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 6 }}><span className="small">Banked points</span><Stepper value={c.pendingStatPoints} min={0} max={999} editable onChange={(v) => up((x) => ({ ...x, pendingStatPoints: v }))} /></div>
        </details>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  )
}
