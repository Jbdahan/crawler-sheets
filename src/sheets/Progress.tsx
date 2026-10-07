import { useMemo, useState } from 'react'
import { BOSS_TIERS } from '../data/extras'
import { STAT_KEYS, STAT_NAMES } from '../data'
import {
  addGrind, allocateStats, canAdvance, canAllocateStats, changeFloor, crawlerKillLevels, eligibleForAdvancement,
  levelUp, resolveAdvancement, resolveGrindCheck, MAX_LEVEL, type AdvanceWindow,
} from '../engine/advancement'
import { derive, statMod } from '../engine/derived'
import { rollDie } from '../engine/dice'
import type { Character } from '../engine/types'
import { Seg, Sheet, Stepper, signed, toast } from '../components/ui'
import { go } from '../router'
import type { Ctx } from '../screens/ctx'

type Reason = 'play' | 'quest' | 'boss' | 'kill' | 'other'

export function LevelUpSheet({ c, up, onClose, onAdvance }: Ctx & { onClose: () => void; onAdvance: (w: AdvanceWindow) => void }) {
  const [reason, setReason] = useState<Reason>('play')
  const [quest, setQuest] = useState(1)
  const [tier, setTier] = useState(0)
  const [victim, setVictim] = useState(c.level)
  const [killRoll, setKillRoll] = useState<number | null>(null)
  const [other, setOther] = useState(1)

  const levels =
    reason === 'play' ? 1
    : reason === 'quest' ? quest
    : reason === 'boss' ? BOSS_TIERS[tier].levels
    : reason === 'kill' ? (killRoll ? crawlerKillLevels(killRoll, c.level, victim) : 0)
    : other
  const label = {
    play: '2 hours of play', quest: 'Quest complete', boss: BOSS_TIERS[tier].name,
    kill: `Crawler kill (Lvl ${victim})`, other: 'GM award',
  }[reason]
  const newLevel = Math.min(MAX_LEVEL, c.level + levels)

  const apply = () => {
    up((x) => levelUp(x, levels, label))
    toast(`Level ${newLevel}! +${levels * 3} Stat points banked`)
    if (reason === 'play' && eligibleForAdvancement(c, 'twoHours').length) onAdvance('twoHours')
    else onClose()
  }

  return (
    <Sheet title="Level up" onClose={onClose}>
      <div className="stack">
        <Seg value={reason} onChange={setReason} options={[
          { value: 'play', label: '2 hrs play' }, { value: 'quest', label: 'Quest' }, { value: 'boss', label: 'Boss' },
          { value: 'kill', label: 'Crawler kill' }, { value: 'other', label: 'Other' },
        ]} />
        {reason === 'play' && <p className="small muted">Every 2 hours of play, each party member gains 1 Level. Marked Skills at Rank 4 or lower also roll for advancement (Core p.169).</p>}
        {reason === 'quest' && <div className="row between"><span>Levels from the Quest</span><Stepper value={quest} min={1} max={20} onChange={setQuest} /></div>}
        {reason === 'boss' && (
          <div>
            {BOSS_TIERS.map((b, i) => (
              <button key={b.name} className={`option${i === tier ? ' on' : ''}`} onClick={() => setTier(i)}>
                <div className="grow t">{b.name}</div><span className="pill accent">+{b.levels}</span>
              </button>
            ))}
            <p className="small faint">Whoever lands the killing blow gets better loot, not extra Levels (Core p.170).</p>
          </div>
        )}
        {reason === 'kill' && (
          <div className="stack">
            <div className="row between"><span>Victim's Level</span><Stepper value={victim} min={1} max={MAX_LEVEL} onChange={setVictim} editable /></div>
            <div className="row between">
              <button className="btn" onClick={() => setKillRoll(rollDie(6))}>Roll 1d6</button>
              <span>{killRoll ? <>Rolled <b>{killRoll}</b> {victim > c.level ? `+ ${victim - c.level}` : c.level > victim ? `− ${c.level - victim}` : ''} → <b>{levels}</b> Level{levels === 1 ? '' : 's'}</> : <span className="muted">1d6 ± Level difference, max 15, min 1</span>}</span>
            </div>
            <p className="small faint">Only the killing blow earns the Player Killer skull (Core p.87, 169).</p>
          </div>
        )}
        {reason === 'other' && <div className="row between"><span>Levels</span><Stepper value={other} min={1} max={50} onChange={setOther} /></div>}
        <div className="infobox">
          Level {c.level} → <b>{newLevel}</b> · +{levels * 3} Stat points{c.floor < 3 ? ' (banked until the Third Floor)' : ' (spend in a saferoom)'}
          {c.raceId === 'human' && levels > 0 && <> · +{levels} AI Favor (Human)</>}
        </div>
        <button className="btn primary" disabled={!levels || c.level >= MAX_LEVEL} onClick={apply}>Gain {levels} Level{levels === 1 ? '' : 's'}</button>
      </div>
    </Sheet>
  )
}

export function StatAllocSheet({ c, up, onClose }: Ctx & { onClose: () => void }) {
  const [alloc, setAlloc] = useState<Record<string, number>>({})
  const [override, setOverride] = useState(false)
  const d = useMemo(() => derive(c), [c])
  const spent = STAT_KEYS.reduce((a, k) => a + (alloc[k] ?? 0), 0)
  const left = c.pendingStatPoints - spent
  const allowed = canAllocateStats(c) || override
  return (
    <Sheet title="Allocate Stat points" onClose={onClose}>
      <div className="stack">
        <div className="infobox">{c.pendingStatPoints} banked · <b>{left}</b> left to assign. Level-up points raise both Unenhanced and Enhanced scores (Core p.169).</div>
        {!canAllocateStats(c) && (
          <div className="warnbox">
            On the Tutorial Floors, points are applied when you reach the Third Floor, before choosing a Race and Class.
            <label className="row small" style={{ marginTop: 6 }}><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Apply now anyway (GM ruling)</label>
          </div>
        )}
        {STAT_KEYS.map((k) => {
          const add = alloc[k] ?? 0
          const now = d.enhanced[k]
          return (
            <div key={k} className="row between">
              <div>
                <div style={{ fontWeight: 700 }}>{STAT_NAMES[k]}</div>
                <div className="small muted">{now}{add ? ` → ${now + add}` : ''} · Mod {signed(statMod(now + add))}{statMod(now + add) > statMod(now) ? ' ⬆' : ''}</div>
              </div>
              <Stepper value={add} min={0} max={add + left} onChange={(v) => setAlloc({ ...alloc, [k]: v })} />
            </div>
          )
        })}
        <button className="btn primary" disabled={!spent || !allowed} onClick={() => { up((x) => allocateStats(x, alloc)); toast(`Spent ${spent} points`); onClose() }}>
          Spend {spent} point{spent === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  )
}

export function AdvancementSheet({ c, up, window: when, onClose }: Ctx & { window: AdvanceWindow; onClose: () => void }) {
  const eligible = useMemo(() => eligibleForAdvancement(c, when), [c, when])
  const [rolls, setRolls] = useState<Record<string, number>>({})
  const [bonus, setBonus] = useState(0)
  const [humanAdv, setHumanAdv] = useState<string>('')
  const isHuman = c.raceId === 'human'
  const roll = (uidKey: string) => {
    const r = humanAdv === uidKey ? Math.max(rollDie(20), rollDie(20)) : rollDie(20)
    setRolls((x) => ({ ...x, [uidKey]: r }))
  }
  const rollAll = () => eligible.forEach((s) => roll(s.uid))
  const done = eligible.every((s) => rolls[s.uid])
  const apply = () => {
    up((x) => resolveAdvancement(x, eligible.map((s) => ({ uid: s.uid, roll: rolls[s.uid], bonus }))))
    onClose()
  }
  return (
    <Sheet title={when === 'twoHours' ? 'Skill advancement (2 hours)' : 'Skill advancement (end of floor)'} onClose={onClose}>
      <div className="stack">
        <p className="small muted">
          {when === 'twoHours' ? 'Marked Skills at Rank 4 or lower' : 'Marked Skills at Rank 5 or higher'} roll a d20; meeting or beating the current Rank gains 1 Rank (max {15}, or 20 if allowed). Marks are then cleared (Core p.169).
        </p>
        {!eligible.length && <div className="empty">No marked Skills in this range. Skills get marked when you roll them.</div>}
        {eligible.map((s) => {
          const r = rolls[s.uid]
          const ok = r !== undefined && r + bonus >= s.rank
          return (
            <div key={s.uid} className="row between">
              <div>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div className="small muted">Rank {s.rank} · need {s.rank}+</div>
              </div>
              <div className="row">
                {r !== undefined && <span className={`pill ${ok ? 'good' : 'bad'}`}>{r}{bonus ? `+${bonus}` : ''} {ok ? `→ ${s.rank + 1}` : '✗'}</span>}
                <button className="btn small" onClick={() => roll(s.uid)}>{r ? 'Reroll' : 'Roll'}</button>
              </div>
            </div>
          )
        })}
        {eligible.length > 0 && (
          <>
            {isHuman && when === 'endOfFloor' && (
              <label><span className="label">Human: roll one Skill (Rank 9 or less) with Advantage</span>
                <select value={humanAdv} onChange={(e) => setHumanAdv(e.target.value)}>
                  <option value="">None</option>
                  {eligible.filter((s) => s.rank <= 9).map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                </select>
              </label>
            )}
            <div className="row between"><span className="small">Bonus to these checks (Race/Class)</span><Stepper value={bonus} min={0} max={5} onChange={setBonus} /></div>
            <div className="row">
              <button className="btn grow" onClick={rollAll}>Roll all</button>
              <button className="btn primary grow" disabled={!done} onClick={apply}>Apply results</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

export function GrindSheet({ c, up, onClose }: Ctx & { onClose: () => void }) {
  const [hours, setHours] = useState(5)
  const [map, setMap] = useState<'none' | 'map' | 'guide'>('none')
  const [perSkill, setPerSkill] = useState<Record<string, number>>({})
  const [ready, setReady] = useState<string[] | null>(null)
  const [results, setResults] = useState<Record<string, number>>({})
  const credited = hours + (hours >= 5 ? (map === 'map' ? 1 : map === 'guide' ? 2 : 0) : 0)
  const assigned = Object.values(perSkill).reduce((a, b) => a + b, 0)
  const skills = c.skills.filter(canAdvance)

  const apply = () => {
    const r = addGrind(c, Object.entries(perSkill).filter(([, h]) => h > 0).map(([uid, h]) => ({ uid, hours: h })), credited)
    up(() => r.c)
    if (r.levels) toast(`Grinding earned ${r.levels} Level${r.levels === 1 ? '' : 's'}`)
    setReady(r.ready)
  }

  if (ready) {
    return (
      <Sheet title="Grinding: advancement checks" onClose={onClose}>
        <div className="stack">
          {!ready.length && <p className="muted">No Skill reached its grind hours yet. Hours carry over.</p>}
          {ready.map((uidKey) => {
            const s = c.skills.find((x) => x.uid === uidKey)
            if (!s) return null
            const r = results[uidKey]
            return (
              <div key={uidKey} className="row between">
                <div><b>{s.name}</b> <span className="small muted">Rank {s.rank}</span></div>
                {r === undefined ? (
                  <button className="btn small primary" onClick={() => {
                    const roll = rollDie(20)
                    setResults((x) => ({ ...x, [uidKey]: roll }))
                    up((x) => resolveGrindCheck(x, uidKey, roll))
                  }}>Roll d20</button>
                ) : <span className={`pill ${r >= s.rank ? 'good' : 'bad'}`}>{r} {r >= s.rank ? '✓ +1 Rank' : '✗'}</span>}
              </div>
            )
          })}
          <p className="small faint">A Skill can only be ground once per day. Debuff penalties (e.g. Fatigued) apply to these checks (Core p.170).</p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Grind" onClose={onClose}>
      <div className="stack">
        <div className="row between"><span>Hours grinding</span><Stepper value={hours} min={1} max={24} onChange={setHours} /></div>
        {hours > 5 && <div className="warnbox">Each hour past 5 in a day needs an Unopposed Endurance Check, or it isn't productive and you gain Fatigued.</div>}
        <Seg value={map} onChange={setMap} options={[{ value: 'none', label: 'No map' }, { value: 'map', label: 'Neighborhood Map +1' }, { value: 'guide', label: 'Field Guide +2' }]} />
        <div className="infobox">Credited: <b>{credited} h</b> · level progress {c.grindHoursTotal}/{c.level} h · assigned to Skills {assigned}/{credited}</div>
        <div className="list">
          {skills.map((s) => (
            <div key={s.uid} className="li">
              <div className="main">
                <div className="name">{s.name}</div>
                <div className="meta">Rank {s.rank} · {s.grindHours}/{Math.max(1, s.rank)} h banked</div>
              </div>
              <Stepper value={perSkill[s.uid] ?? 0} min={0} max={(perSkill[s.uid] ?? 0) + (credited - assigned)} onChange={(v) => setPerSkill({ ...perSkill, [s.uid]: v })} />
            </div>
          ))}
        </div>
        <button className="btn primary" onClick={apply}>Grind {credited} hours</button>
      </div>
    </Sheet>
  )
}

export function FloorSheet({ c, up, onClose, onAdvance }: Ctx & { onClose: () => void; onAdvance: (w: AdvanceWindow) => void }) {
  const [floor, setFloor] = useState(c.floor + 1)
  const descending = floor > c.floor
  const eligible = eligibleForAdvancement(c, 'endOfFloor')
  const apply = () => {
    up((x: Character) => changeFloor(x, floor))
    if (descending && eligible.length) onAdvance('endOfFloor')
    else if (floor >= 3 && !c.raceId) { onClose(); go(`/c/${c.id}/more/raceclass`) }
    else onClose()
  }
  return (
    <Sheet title="Change floor" onClose={onClose}>
      <div className="stack">
        <div className="row between"><span>Floor</span><Stepper value={floor} min={1} max={18} onChange={setFloor} /></div>
        {descending && (
          <div className="infobox">
            End of Floor {c.floor}: {eligible.length ? `${eligible.length} marked Skill${eligible.length === 1 ? '' : 's'} at Rank 5+ will roll for advancement.` : 'no Rank 5+ Skills are marked.'}
          </div>
        )}
        {floor >= 3 && !c.raceId && <div className="warnbox">Arriving on the Third Floor: apply your banked Stat points and choose a Race & Class.</div>}
        <p className="small faint">Floor number feeds Difficulties, Mob Evade, Amazing Success damage and Debuff damage (Core p.59, 79, 97).</p>
        <button className="btn primary" disabled={floor === c.floor} onClick={apply}>Go to Floor {floor}</button>
      </div>
    </Sheet>
  )
}
