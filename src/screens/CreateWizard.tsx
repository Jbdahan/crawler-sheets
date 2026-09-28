import { useMemo, useState } from 'react'
import { ALL_SKILLS, BACKGROUNDS, STAT_ABBR, STAT_KEYS, STAT_NAMES, STORIES, SIZES, findSkill, type StatKey } from '../data'
import { STARTING_HAND_TO_HAND, STARTING_SPELLS, STARTING_WEAPONS } from '../data/extras'
import { newSkill, uid, log } from '../engine/advancement'
import { blankCharacter } from '../engine/character'
import { derive, statMod } from '../engine/derived'
import { rollDie } from '../engine/dice'
import type { Character, CharSkill } from '../engine/types'
import { PageRef, Seg, signed, toast } from '../components/ui'
import { useStore } from '../store/characters'
import { go } from '../router'

const HUMAN_STAGES = [
  { key: 'childhood', label: 'Childhood', table: 'Table 12' },
  { key: 'adolescence', label: 'Adolescence', table: 'Table 13' },
  { key: 'career', label: 'Career', table: 'Table 14' },
  { key: 'hobby', label: 'Hobby', table: 'Table 15' },
]
const ANIMAL_STAGES = [
  { key: 'animalYouth', label: 'Youth', table: 'Table 16' },
  { key: 'animalTraining', label: 'Training', table: 'Table 17' },
  { key: 'animalQuirk', label: 'Quirk', table: 'Table 18' },
  { key: 'animalAdult', label: 'Adult', table: 'Table 19' },
]
const GEAR_PRESETS = [
  { name: 'Athlete', clothing: 'Jogging attire', weapon: 'Barbell (Club)', item: 'Headphones, music player', weird: 'A 3-pack of condoms' },
  { name: 'Gaming Geek', clothing: 'T-shirt, hoodie, and jeans', weapon: 'Boffer sword (Longsword, d4 base damage)', item: 'Game book or novel', weird: '12 googly eyes and a Lego minifig' },
  { name: 'Militant', clothing: 'Military fatigues', weapon: 'Handgun', item: '2 snack bars', weird: 'Morale patch: “No Plan Survives First Contact”' },
  { name: 'Outdoorsy', clothing: 'Climate-appropriate gear and an orange safety jacket', weapon: 'Bow and arrow', item: 'Lighter', weird: 'A duck call on a leather cord' },
]
const ARRAY = [2, 3, 4, 5, 6]
const CUSTOM = '__custom'
const SKILL_GROUPS = [
  { label: 'Attack Skills', kinds: ['attack'] },
  { label: 'Damage Effects', kinds: ['damageEffect'] },
  { label: 'Utility Skills', kinds: ['utility'] },
  { label: 'Spells', kinds: ['spell'] },
].map((g) => ({ ...g, skills: ALL_SKILLS.filter((x) => g.kinds.includes(x.kind)).sort((a, b) => a.name.localeCompare(b.name)) }))

type Combat = { mode: 'weapon'; skill: string; label: string } | { mode: 'spell'; skill: string } | { mode: 'hand'; attack: string; effect: string } | null

export function CreateWizard() {
  const add = useStore((s) => s.add)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [number, setNumber] = useState(() => String(500000 + rollDie(12400000)))
  const [species, setSpecies] = useState<'human' | 'animal'>('human')
  const [animalType, setAnimalType] = useState('')
  const [animalSize, setAnimalSize] = useState(2)
  const stages = species === 'human' ? HUMAN_STAGES : ANIMAL_STAGES
  const [bg, setBg] = useState<Record<string, { name: string; skills: string[]; label?: string }>>({})
  const [combat, setCombat] = useState<Combat>(null)
  const [statMode, setStatMode] = useState<'array' | 'roll' | 'manual'>('array')
  const [stats, setStats] = useState<Record<StatKey, number>>({ str: 3, int: 4, con: 5, dex: 6, cha: 2 })
  const [story, setStory] = useState({ trauma: '', looseEnds: '', regrets: '' })
  const [gear, setGear] = useState({ clothing: '', weapon: '', item: '', weird: '' })

  const chosenSkills = Object.values(bg).flatMap((b) => b.skills)
  const bgDone = stages.every((s) => bg[s.key]?.skills.length === 2)
  const arrayOk = statMode !== 'array' || [...Object.values(stats)].sort().join() === [...ARRAY].sort().join()

  const rollStats = () => {
    const next = {} as Record<StatKey, number>
    for (const k of STAT_KEYS) {
      let r = rollDie(6)
      while (r === 1) r = rollDie(6)
      next[k] = r
    }
    setStats(next)
  }

  const build = (): Character => {
    let c = blankCharacter()
    const skills: CharSkill[] = [...c.skills]
    const addSk = (skillName: string, rank: number, source: string, stat?: StatKey | null) => {
      const def = findSkill(skillName)
      const existing = skills.find((s) => (def && s.skillId === def.id) || s.name === skillName)
      if (existing) { existing.rank = Math.max(existing.rank, rank); return existing }
      const s = newSkill(def, skillName, rank, source)
      if (!def && stat !== undefined) s.stat = stat
      skills.push(s)
      return s
    }
    for (const st of stages) {
      const b = bg[st.key]
      const def = BACKGROUNDS.find((x) => x.stage === st.key && x.name === b?.name)
      const rank = BACKGROUNDS.find((x) => x.stage === st.key)?.rank ?? 1
      const bgName = b?.name === CUSTOM ? b.label?.trim() || 'Custom' : b?.name
      for (const sk of b?.skills ?? []) addSk(sk, rank, `${st.label}: ${bgName}`, def?.skills.find((x) => x.name === sk)?.stat)
    }
    addSk(species === 'human' ? 'Unarmed Combat' : 'Slice Attack', 3, 'Everyone')
    const hot = [...c.hotlist]
    if (combat?.mode === 'weapon') {
      const s = addSk(combat.skill, 3, 'Starting weapon')
      s.wielded = true
      if (combat.label && combat.label !== s.name) s.notes = combat.label
    }
    if (combat?.mode === 'spell') {
      const s = addSk(combat.skill, 3, 'Starting spell')
      hot[1] = { uid: uid(), name: s.name, qty: 1, kind: 'spell', skillUid: s.uid, notes: '' }
      hot[2] = { uid: uid(), name: 'Standard Mana Potion', qty: 5, kind: 'item', notes: 'Fully restores Mana', restoreMana: 'full', consumable: true }
    }
    if (combat?.mode === 'hand') {
      addSk(combat.attack, 3, 'Hand-to-hand')
      addSk(combat.effect, 3, 'Hand-to-hand')
    }
    c = {
      ...c,
      name: name.trim() || 'New Crawler',
      pronouns,
      crawlerNumber: number,
      species,
      animalType: species === 'animal' ? animalType : undefined,
      size: species === 'animal' ? animalSize : 4,
      aiFavor: species === 'human' ? 1 : 0,
      base: { ...stats },
      skills,
      hotlist: hot,
      story: { ...story, notes: '' },
      gear: gear.clothing ? [{ uid: uid(), slot: 'torso', name: gear.clothing, mods: [], notes: '' }] : [],
      inventory: [gear.item, gear.weird].filter(Boolean).map((n) => ({ uid: uid(), name: n, qty: 1, notes: '' })),
    }
    if (gear.weapon) c.gear.push({ uid: uid(), slot: 'hands', name: gear.weapon, mods: [], notes: '' })
    c = { ...c, mana: derive(c).maxMana.total }
    return log(c, 'Entered the World Dungeon')
  }

  const preview = useMemo(() => (step === 6 ? build() : null), [step]) // eslint-disable-line react-hooks/exhaustive-deps
  const create = () => {
    const c = build()
    add(c)
    toast(`Welcome to the dungeon, Crawler ${c.name}`)
    go(`/c/${c.id}`)
  }

  const steps = ['Crawler', 'Background', 'Weapon', 'Stats', 'Story', 'Gear', 'Review']
  const canNext = [true, bgDone, !!combat, arrayOk, true, true, true][step]

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => (step ? setStep(step - 1) : go('/'))} aria-label="Back">‹</button>
        <div className="title"><h1>New crawler</h1><div className="sub">Level 1 · Floor 1 · {steps[step]} ({step + 1}/{steps.length})</div></div>
      </div>
      <div className="wizard-steps">{steps.map((s, i) => <div key={s} className={i <= step ? 'done' : ''} />)}</div>

      {step === 0 && (
        <div className="card stack">
          <label><span className="label">Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your crawler name" /></label>
          <div className="grid2">
            <label><span className="label">Gender / pronouns</span><input value={pronouns} onChange={(e) => setPronouns(e.target.value)} /></label>
            <label><span className="label">Crawler number</span><input value={number} onChange={(e) => setNumber(e.target.value)} /></label>
          </div>
          <Seg value={species} onChange={(v) => { setSpecies(v); setBg({}); setCombat(null) }} options={[{ value: 'human', label: 'Human' }, { value: 'animal', label: 'Animal (Enhanced Pet Biscuit)' }]} />
          {species === 'animal' && (
            <div className="stack">
              <div className="warnbox small">With the GM's OK, one crawler can be an animal. It gives up its starting AI Favor (Core p.102).</div>
              <div className="grid2">
                <label><span className="label">Animal</span><input value={animalType} onChange={(e) => setAnimalType(e.target.value)} placeholder="Cat, dog, goat…" /></label>
                <label><span className="label">Size</span>
                  <select value={animalSize} onChange={(e) => setAnimalSize(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i} · {SIZES[i]}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}
          <p className="small faint">Starting on the Third Floor? Build at Level 1 here, then use Level up (+9 Levels) and Change floor; the app walks you through Stat points and Race & Class.</p>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p className="small muted">Pick a background for each stage of life and choose 2 of its 3 Skills, or choose Custom to pick any 2 Skills (with your GM's OK). No Skill twice (Core p.103–107).</p>
          {stages.map((st) => {
            const opts = BACKGROUNDS.filter((b) => b.stage === st.key)
            const cur = bg[st.key]
            const def = opts.find((o) => o.name === cur?.name)
            return (
              <section className="card" key={st.key}>
                <div className="card-head">
                  <h3>{st.label} <span className="pill">Rank {opts[0]?.rank}</span></h3>
                  <button className="btn small" onClick={() => { const o = opts[rollDie(opts.length) - 1]; setBg({ ...bg, [st.key]: { name: o.name, skills: [] } }) }}>🎲 Roll</button>
                  <PageRef page={opts[0]?.page} />
                </div>
                <select value={cur?.name ?? ''} onChange={(e) => setBg({ ...bg, [st.key]: { name: e.target.value, skills: [] } })}>
                  <option value="">Choose…</option>
                  {opts.map((o) => <option key={o.name} value={o.name}>{o.roll}. {o.name}: {o.skills.map((s) => s.name).join(', ')}</option>)}
                  <option value={CUSTOM}>Custom: choose any 2 Skills…</option>
                </select>
                {cur?.name === CUSTOM && (
                  <div className="stack" style={{ marginTop: 8 }}>
                    <input value={cur.label ?? ''} placeholder="Describe the background (optional), e.g. Roller Derby" onChange={(e) => setBg({ ...bg, [st.key]: { ...cur, label: e.target.value } })} />
                    {[0, 1].map((j) => (
                      <select key={j} value={cur.skills[j] ?? ''} onChange={(e) => {
                        const next = [...cur.skills]
                        next[j] = e.target.value
                        setBg({ ...bg, [st.key]: { ...cur, skills: next.filter(Boolean) } })
                      }}>
                        <option value="">Skill {j + 1}…</option>
                        {SKILL_GROUPS.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.skills.map((x) => {
                              const taken = x.name !== cur.skills[j] && chosenSkills.includes(x.name)
                              return <option key={x.id} value={x.name} disabled={taken}>{x.name} ({x.stat ? STAT_ABBR[x.stat] : 'Passive'}){taken ? ' – taken' : ''}</option>
                            })}
                          </optgroup>
                        ))}
                      </select>
                    ))}
                    {cur.skills.map((n) => findSkill(n)).filter(Boolean).map((d) => (
                      <div key={d!.id} className="small muted">{d!.name}: {d!.summary} <PageRef page={d!.page} /></div>
                    ))}
                  </div>
                )}
                {def && (
                  <div className="chips" style={{ marginTop: 8 }}>
                    {def.skills.map((s) => {
                      const on = cur.skills.includes(s.name)
                      const taken = !on && chosenSkills.includes(s.name)
                      return (
                        <button key={s.name} className={`chip${on ? ' buff' : ''}`} disabled={taken || (!on && cur.skills.length >= 2)} style={taken ? { opacity: 0.4 } : undefined}
                          onClick={() => setBg({ ...bg, [st.key]: { ...cur, skills: on ? cur.skills.filter((x) => x !== s.name) : [...cur.skills, s.name] } })}>
                          {on ? '✓ ' : ''}{s.name} {s.stat ? `(${STAT_ABBR[s.stat]})` : '(Passive)'}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="infobox">{species === 'human' ? 'Unarmed Combat' : 'Slice Attack'} at Rank 3 is automatic. Now choose your second combat Skill at Rank 3 (Core p.108–109).</div>
          <section className="card">
            <h3>Weapon</h3>
            {(species === 'animal' ? [{ group: 'Animal strikes', skills: ['bite', 'back-claw'] }, ...STARTING_WEAPONS] : STARTING_WEAPONS).map((g) => (
              <div key={g.group} style={{ marginTop: 6 }}>
                <div className="label">{g.group}</div>
                <div className="chips" style={{ marginTop: 4 }}>
                  {g.skills.map((id) => {
                    const def = findSkill(id)!
                    const on = combat?.mode === 'weapon' && combat.skill === id
                    return <button key={id} className={`chip${on ? ' buff' : ''}`} onClick={() => setCombat({ mode: 'weapon', skill: id, label: def.name })}>{def.name} <span className="faint">{def.damage ? `${def.damage.count}d${def.damage.sides}` : ''}</span></button>
                  })}
                </div>
              </div>
            ))}
            {combat?.mode === 'weapon' && (
              <label style={{ display: 'block', marginTop: 8 }}><span className="label">What is it really? (optional)</span>
                <input value={combat.label} onChange={(e) => setCombat({ ...combat, label: e.target.value })} placeholder="e.g. Tire Iron (Club)" />
              </label>
            )}
          </section>
          <section className="card">
            <h3>…or an Attack Spell <span className="small muted">(+5 Mana Potions; set Int to 4+)</span></h3>
            <div className="chips" style={{ marginTop: 6 }}>
              {STARTING_SPELLS.map((id) => {
                const def = findSkill(id)!
                const on = combat?.mode === 'spell' && combat.skill === id
                return <button key={id} className={`chip${on ? ' buff' : ''}`} onClick={() => setCombat({ mode: 'spell', skill: id })}>{def.name} <span className="faint">{def.mana} Mana</span></button>
              })}
            </div>
          </section>
          {species === 'human' && (
            <section className="card">
              <h3>…or Hand-to-hand <span className="small muted">(attack + Damage Effect, both Rank 3)</span></h3>
              <div className="chips" style={{ marginTop: 6 }}>
                {STARTING_HAND_TO_HAND.map((h) => {
                  const on = combat?.mode === 'hand' && combat.attack === h.attack
                  return <button key={h.attack} className={`chip${on ? ' buff' : ''}`} onClick={() => setCombat({ mode: 'hand', ...h })}>{findSkill(h.attack)?.name} + {findSkill(h.effect)?.name}</button>
                })}
              </div>
              <p className="small faint">Showing up without a weapon earns an achievement and a Bronze Weapon Box (Core p.109).</p>
            </section>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <Seg value={statMode} onChange={(m) => { setStatMode(m); if (m === 'roll') rollStats(); if (m === 'array') setStats({ str: 3, int: 4, con: 5, dex: 6, cha: 2 }) }}
            options={[{ value: 'array', label: 'Standard array 2–6' }, { value: 'roll', label: 'Roll 1d6 each' }, { value: 'manual', label: 'Manual' }]} />
          {STAT_KEYS.map((k) => (
            <div key={k} className="row between">
              <div>
                <div style={{ fontWeight: 700 }}>{STAT_NAMES[k]}</div>
                <div className="small muted">Mod {signed(statMod(stats[k]))}{k === 'con' ? ` · ${statMod(stats[k])} per Health slot` : ''}{k === 'int' ? ` · ${stats[k]} Mana` : ''}{k === 'dex' ? ' · Evade' : ''}</div>
              </div>
              {statMode === 'array' ? (
                <select style={{ width: 90 }} value={stats[k]} onChange={(e) => {
                  const v = Number(e.target.value)
                  const other = STAT_KEYS.find((o) => o !== k && stats[o] === v)
                  setStats({ ...stats, [k]: v, ...(other ? { [other]: stats[k] } : {}) })
                }}>
                  {ARRAY.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : statMode === 'roll' ? (
                <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats[k]}</span>
              ) : (
                <input style={{ width: 80 }} inputMode="numeric" value={stats[k]} onChange={(e) => setStats({ ...stats, [k]: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} />
              )}
            </div>
          ))}
          {statMode === 'roll' && <button className="btn" onClick={rollStats}>Reroll (GM permitting)</button>}
          {combat?.mode === 'spell' && stats.int < 4 && <div className="warnbox">Your starting Spell needs Intelligence 4 or higher to cast (Core p.108).</div>}
          <p className="small faint">Standard array: place 2, 3, 4, 5 and 6 once each. Rolling: 1d6 in order, rerolling 1s (Core p.109).</p>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          {([['trauma', 'Past Trauma', STORIES.trauma], ['looseEnds', 'Loose End', STORIES.looseEnd], ['regrets', 'Regret', STORIES.regret]] as const).map(([k, label, opts]) => (
            <section key={k} className="card">
              <div className="card-head"><h3>{label}</h3><button className="btn small" onClick={() => setStory({ ...story, [k]: opts[rollDie(opts.length) - 1] })}>🎲 Roll</button></div>
              <select value="" onChange={(e) => e.target.value && setStory({ ...story, [k]: e.target.value })}>
                <option value="">Pick an idea…</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <textarea style={{ marginTop: 6 }} value={story[k]} onChange={(e) => setStory({ ...story, [k]: e.target.value })} placeholder="Or write your own" />
            </section>
          ))}
          <p className="small faint">These tell your GM what stories you want (and don't want) at the table (Core p.113).</p>
        </div>
      )}

      {step === 5 && (
        <div className="card stack">
          <div className="label">Quick presets</div>
          <div className="chips">{GEAR_PRESETS.map((p) => <button key={p.name} className="chip" onClick={() => setGear({ clothing: p.clothing, weapon: p.weapon, item: p.item, weird: p.weird })}>{p.name}</button>)}</div>
          <label><span className="label">Clothes you're wearing</span><input value={gear.clothing} onChange={(e) => setGear({ ...gear, clothing: e.target.value })} /></label>
          <label><span className="label">Weapon in hand</span><input value={gear.weapon} onChange={(e) => setGear({ ...gear, weapon: e.target.value })} placeholder={combat?.mode === 'weapon' ? combat.label : 'none'} /></label>
          <label><span className="label">One interesting or useful item</span><input value={gear.item} onChange={(e) => setGear({ ...gear, item: e.target.value })} /></label>
          <label><span className="label">Weird stuff</span><input value={gear.weird} onChange={(e) => setGear({ ...gear, weird: e.target.value })} /></label>
          <p className="small faint">Whatever you had on you when the world ended; negotiate with your GM (Core p.113–115).</p>
        </div>
      )}

      {step === 6 && preview && <Review c={preview} />}

      <div className="row" style={{ marginTop: 14 }}>
        {step > 0 && <button className="btn grow" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1
          ? <button className="btn primary grow" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="btn primary grow" onClick={create}>Enter the dungeon</button>}
      </div>
    </div>
  )
}

function Review({ c }: { c: Character }) {
  const d = derive(c)
  return (
    <div className="stack">
      <section className="card">
        <h2>{c.name}</h2>
        <div className="small muted">Level 1 · Floor 1 · Crawler #{c.crawlerNumber} · {c.species === 'animal' ? c.animalType || 'Animal' : 'Human'}</div>
        <div className="stat-tiles" style={{ marginTop: 10 }}>
          {STAT_KEYS.map((k) => (
            <div key={k} className="stat-tile"><div className="abbr">{STAT_ABBR[k].toUpperCase()}</div><div className="mod">{signed(d.mod[k])}</div><div className="score">{d.enhanced[k]}</div></div>
          ))}
        </div>
        <div className="kpis" style={{ marginTop: 8 }}>
          <div className="kpi"><div className="v">{d.hbSlot.total}×10</div><div className="k">Health</div></div>
          <div className="kpi"><div className="v">{d.maxMana.total}</div><div className="k">Mana</div></div>
          <div className="kpi"><div className="v">{signed(d.evade.total)}</div><div className="k">Evade</div></div>
          <div className="kpi"><div className="v">{d.move.total}</div><div className="k">Move</div></div>
          <div className="kpi"><div className="v">{c.aiFavor}</div><div className="k">AI Favor</div></div>
          <div className="kpi"><div className="v">{c.size}</div><div className="k">Size</div></div>
        </div>
      </section>
      <section className="card">
        <h3>Skills</h3>
        <div className="list">
          {c.skills.map((s) => (
            <div key={s.uid} className="li"><div className="main"><div className="name">{s.name}</div><div className="meta">{s.source}</div></div><span className="pill accent">Rank {s.rank}</span></div>
          ))}
        </div>
      </section>
    </div>
  )
}
