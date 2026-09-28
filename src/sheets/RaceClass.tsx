import { useMemo, useState } from 'react'
import { ALL_SKILLS, CLASSES, RACES, STAT_ABBR, STAT_KEYS, type ChoiceDef, type RaceClassDef, type StatKey } from '../data'
import { applyRaceClass, type RaceClassChoice } from '../engine/advancement'
import { PageRef, Sheet, Stepper, signed, toast } from '../components/ui'
import { StatAllocSheet } from './Progress'
import type { Ctx } from '../screens/ctx'

function statLine(rc: RaceClassDef) {
  const bits = STAT_KEYS.filter((k) => rc.stats[k]).map((k) => `${signed(rc.stats[k]!)} ${STAT_ABBR[k]}`)
  if (rc.allStats) bits.unshift(`${signed(rc.allStats)} all Stats`)
  if (rc.statSplit) bits.push(`+${rc.statSplit.points} split (${rc.statSplit.among.map((k) => STAT_ABBR[k]).join('/')})`)
  if (rc.dr) bits.push(`+${rc.dr} DR`)
  return bits.join(', ')
}

function RcCard({ rc, on, onPick }: { rc: RaceClassDef; on: boolean; onPick: () => void }) {
  return (
    <button className={`option${on ? ' on' : ''}`} onClick={onPick}>
      <div className="grow">
        <div className="row between"><span className="t">{rc.name}</span><PageRef page={rc.page} /></div>
        <div className="small">{statLine(rc)}{rc.size ? ` · ${rc.size}` : ''}</div>
        {rc.skills.length > 0 && <div className="small muted">{rc.skills.map((s) => `+${s.ranks} ${s.name}`).join(', ')}</div>}
        {rc.prerequisite && <div className="small" style={{ color: 'var(--warn)' }}>Requires: {rc.prerequisite}</div>}
        {on && (
          <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {rc.choices.map((c) => <li key={c.text}>{c.text}</li>)}
            {rc.rank20.map((b) => <li key={b}>{b}</li>)}
            {rc.benefits.map((b) => <li key={b}>{b}</li>)}
            {rc.earthBox && <li>Silver Earth Box (Earth Hobby Potion: +3 Ranks in a hobby Skill)</li>}
          </ul>
        )}
      </div>
    </button>
  )
}

/** Pick Skills for "of your choice" bullets and split points. */
function ChoicesEditor({ rc, value, onChange }: { rc: RaceClassDef; value: RaceClassChoice; onChange: (v: RaceClassChoice) => void }) {
  const skillNames = useMemo(() => ALL_SKILLS.map((s) => s.name), [])
  if (!rc.choices.length && !rc.statSplit) return null
  const picksFor = (i: number) => value.picks.filter((p) => (p as { from?: number }).from === i)
  const setPicks = (i: number, names: string[], ch: ChoiceDef) => {
    const others = value.picks.filter((p) => (p as { from?: number }).from !== i)
    onChange({ ...value, picks: [...others, ...names.map((n) => ({ name: n, ranks: ch.ranks, from: i }))] })
  }
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <datalist id="skill-names">{skillNames.map((n) => <option key={n} value={n} />)}</datalist>
      {rc.statSplit && (
        <div className="infobox">
          <div className="small" style={{ marginBottom: 6 }}>Split {rc.statSplit.points} points between {rc.statSplit.among.map((k) => STAT_ABBR[k]).join(', ')}</div>
          <div className="row wrap">
            {rc.statSplit.among.map((k: StatKey) => {
              const used = rc.statSplit!.among.reduce((a, x) => a + (value.split?.[x] ?? 0), 0)
              const cur = value.split?.[k] ?? 0
              return (
                <label key={k} className="row small">{STAT_ABBR[k]}
                  <Stepper value={cur} min={0} max={cur + rc.statSplit!.points - used} onChange={(v) => onChange({ ...value, split: { ...value.split, [k]: v } })} />
                </label>
              )
            })}
          </div>
        </div>
      )}
      {rc.choices.map((ch, i) => {
        const picks = picksFor(i).map((p) => p.name)
        if (ch.options) {
          return (
            <div key={i} className="infobox">
              <div className="small" style={{ marginBottom: 6 }}>{ch.text}</div>
              <div className="chips">
                {ch.options.map((o) => {
                  const on = picks.includes(o)
                  return (
                    <button key={o} className={`chip${on ? ' buff' : ''}`} onClick={() => {
                      const next = on ? picks.filter((p) => p !== o) : picks.length < ch.count ? [...picks, o] : picks
                      setPicks(i, next, ch)
                    }}>{o}</button>
                  )
                })}
              </div>
            </div>
          )
        }
        const count = ch.count || 1
        return (
          <div key={i} className="infobox">
            <div className="small" style={{ marginBottom: 6 }}>{ch.text}{ch.count === 0 && ' (enter each Skill it covers)'}</div>
            {Array.from({ length: ch.count === 0 ? Math.max(1, picks.length + 1) : count }, (_, j) => (
              <input key={j} list="skill-names" placeholder={`Skill ${j + 1} (+${ch.ranks})`} style={{ marginTop: j ? 6 : 0 }}
                value={picks[j] ?? ''}
                onChange={(e) => {
                  const next = [...picks]
                  next[j] = e.target.value
                  setPicks(i, next.filter((x, idx) => x || idx < next.length - 1), ch)
                }} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function RaceClassWizard(ctx: Ctx & { onClose: () => void }) {
  const { c, up, onClose } = ctx
  const [step, setStep] = useState(0)
  const [raceId, setRaceId] = useState<string | undefined>(c.raceId)
  const [classId, setClassId] = useState<string | undefined>(c.classId)
  const [raceChoice, setRaceChoice] = useState<RaceClassChoice>({ picks: [] })
  const [classChoice, setClassChoice] = useState<RaceClassChoice>({ picks: [] })
  const [keepRace, setKeepRace] = useState(!!c.raceId)
  const [keepClass, setKeepClass] = useState(!!c.classId)
  const [q, setQ] = useState('')
  const [alloc, setAlloc] = useState(false)
  const race = RACES.find((r) => r.id === raceId)
  const klass = CLASSES.find((r) => r.id === classId)
  const classes = CLASSES.filter((k) => !(race?.alien && k.earthBox))
  const match = (rc: RaceClassDef) => !q || rc.name.toLowerCase().includes(q.toLowerCase()) || (rc.group ?? '').toLowerCase().includes(q.toLowerCase())

  const apply = () => {
    up((x) => {
      let n = x
      if (race && !(keepRace && x.raceId === race.id)) n = applyRaceClass(n, race, raceChoice)
      if (klass && !(keepClass && x.classId === klass.id)) n = applyRaceClass(n, klass, classChoice)
      return n
    })
    toast('Race & Class applied')
    onClose()
  }

  const steps = ['Stats', 'Race', 'Class', 'Review']
  return (
    <Sheet title={`Race & Class · ${steps[step]}`} onClose={onClose} wide>
      <div className="wizard-steps">{steps.map((s, i) => <div key={s} className={i <= step ? 'done' : ''} />)}</div>
      {step === 0 && (
        <div className="stack">
          <p>On arriving at the Third Floor you apply the Stat points from your Tutorial Floor levels, then pick a Race and Class. The System AI offers options based on your Skills; talk it over with your GM (Core p.128).</p>
          <div className="infobox">Banked Stat points: <b>{c.pendingStatPoints}</b>. Some Races and Classes have Stat or Skill prerequisites.</div>
          <button className="btn" disabled={!c.pendingStatPoints} onClick={() => setAlloc(true)}>Allocate banked points now</button>
          <div className="warnbox small">Race & Class Skill bonuses stop at Rank 10 while choosing; after that your cap is 15, or 20 where a Race or Class allows it.</div>
          {c.raceId && <div className="warnbox small">This crawler already has {c.raceName}{c.className ? ` / ${c.className}` : ''}. Changing replaces the Stat and DR bonuses, but Skill Ranks already added stay; adjust them by hand if needed.</div>}
          <button className="btn primary" onClick={() => setStep(1)}>Next: Race</button>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          {c.raceId && <label className="row small"><input type="checkbox" checked={keepRace} onChange={(e) => { setKeepRace(e.target.checked); if (e.target.checked) setRaceId(c.raceId) }} /> Keep current Race ({c.raceName})</label>}
          <input placeholder="Search races…" value={q} onChange={(e) => setQ(e.target.value)} />
          {!keepRace && ['Earth-based Races', 'Alien Races'].map((g) => (
            <div key={g}>
              <div className="label" style={{ margin: '8px 0 4px' }}>{g}{g.startsWith('Alien') ? ' (no Earth Classes)' : ''}</div>
              {RACES.filter((r) => r.group === g && match(r)).map((r) => (
                <div key={r.id}>
                  <RcCard rc={r} on={r.id === raceId} onPick={() => { setRaceId(r.id); setRaceChoice({ picks: [] }) }} />
                  {r.id === raceId && <ChoicesEditor rc={r} value={raceChoice} onChange={setRaceChoice} />}
                </div>
              ))}
            </div>
          ))}
          <div className="row">
            <button className="btn grow" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary grow" disabled={!raceId} onClick={() => { setQ(''); setStep(2) }}>Next: Class</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          {c.classId && <label className="row small"><input type="checkbox" checked={keepClass} onChange={(e) => { setKeepClass(e.target.checked); if (e.target.checked) setClassId(c.classId) }} /> Keep current Class ({c.className})</label>}
          <input placeholder="Search classes or types (Fighter, Mage…)" value={q} onChange={(e) => setQ(e.target.value)} />
          {!keepClass && [...new Set(classes.map((k) => k.group))].map((g) => (
            <div key={g}>
              <div className="label" style={{ margin: '8px 0 4px' }}>{g}</div>
              {classes.filter((k) => k.group === g && match(k)).map((k) => (
                <div key={k.id}>
                  <RcCard rc={k} on={k.id === classId} onPick={() => { setClassId(k.id); setClassChoice({ picks: [] }) }} />
                  {k.id === classId && <ChoicesEditor rc={k} value={classChoice} onChange={setClassChoice} />}
                </div>
              ))}
            </div>
          ))}
          <div className="row">
            <button className="btn grow" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary grow" disabled={!classId} onClick={() => setStep(3)}>Review</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          {[{ rc: race, ch: raceChoice, keep: keepRace }, { rc: klass, ch: classChoice, keep: keepClass }].map(({ rc, ch, keep }) => rc && (
            <div key={rc.id} className="card">
              <h3>{rc.kind === 'race' ? 'Race' : 'Class'}: {rc.name} {keep && <span className="pill">kept</span>}</h3>
              <div className="small">{statLine(rc)}</div>
              <div className="small muted">{[...rc.skills.map((s) => `+${s.ranks} ${s.name}`), ...ch.picks.filter((p) => p.name).map((p) => `+${p.ranks} ${p.name}`)].join(', ')}</div>
            </div>
          ))}
          <div className="row">
            <button className="btn grow" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary grow" onClick={apply}>Apply</button>
          </div>
        </div>
      )}
      {alloc && <StatAllocSheet {...ctx} onClose={() => setAlloc(false)} />}
    </Sheet>
  )
}
