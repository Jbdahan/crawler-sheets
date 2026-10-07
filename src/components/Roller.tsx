import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { attackCalc, rollDamage, type DamageRoll, type WeaponRef } from '../engine/attacks'
import { spendAmmo, usesAmmo } from '../engine/ammo'
import { canAdvance } from '../engine/advancement'
import { checkBonus, derive, effectiveRank, type Part } from '../engine/derived'
import { DEGREE_LABEL, degreeOf, isSuccess, netMode, parseDice, rollD20, rollDie, rollPool, type D20Roll } from '../engine/dice'
import { findSkill } from '../data'
import type { CharSkill } from '../engine/types'
import { useStore } from '../store/characters'
import { Breakdown, Seg, Sheet, signed } from './ui'

export type RollRequest =
  | { kind: 'skill'; charId: string; skillUid: string; attack?: boolean; /** a Skill not on the sheet: an untrained weapon or a scroll's Spell */ skill?: CharSkill; /** a weapon item with its own damage/range (default: the one held in hand) */ weapon?: WeaponRef }
  | { kind: 'custom'; charId?: string; label: string; parts: Part[]; mode?: D20Roll['mode']; note?: string }
  | { kind: 'dice'; charId?: string; label: string; expr: string }

interface RollState {
  req: RollRequest | null
  open: (r: RollRequest) => void
  close: () => void
}
export const useRoll = create<RollState>((set) => ({ req: null, open: (req) => set({ req }), close: () => set({ req: null }) }))
export const openRoll = (r: RollRequest) => useRoll.getState().open(r)

export function RollHost() {
  const req = useRoll((s) => s.req)
  const close = useRoll((s) => s.close)
  if (!req) return null
  return req.kind === 'dice' ? <DiceRoll req={req} onClose={close} /> : <CheckRoll req={req} onClose={close} />
}

function DiceRoll({ req, onClose }: { req: Extract<RollRequest, { kind: 'dice' }>; onClose: () => void }) {
  const pool = parseDice(req.expr)
  const [res, setRes] = useState(() => (pool ? rollPool(pool) : null))
  const logRoll = useStore((s) => s.logRoll)
  const charName = useStore((s) => (req.charId ? s.characters[req.charId]?.name : '') ?? '')
  useEffect(() => {
    if (res) logRoll({ charName, label: req.label, detail: `${req.expr} [${res.faces.join(', ')}]`, total: res.total })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])
  return (
    <Sheet title={req.label} onClose={onClose}>
      {res ? (
        <div className="roll-result">
          <div className="total">{res.total}</div>
          <div className="dice">{req.expr} · [{res.faces.join(', ')}]</div>
        </div>
      ) : <p className="muted">Can't read “{req.expr}”.</p>}
      <button className="btn primary" style={{ width: '100%' }} onClick={() => pool && setRes(rollPool(pool))}>Roll again</button>
    </Sheet>
  )
}

function CheckRoll({ req, onClose }: { req: Exclude<RollRequest, { kind: 'dice' }>; onClose: () => void }) {
  const store = useStore()
  const c = req.charId ? store.characters[req.charId] : undefined
  const d = useMemo(() => (c ? derive(c) : undefined), [c])
  const skill = req.kind === 'skill' && c ? req.skill ?? c.skills.find((s) => s.uid === req.skillUid) : undefined
  // a ranged Attack fires one round of ammo when the roll opens (Core p.181); work out which now
  const [shot] = useState(() => (req.kind === 'skill' && req.attack && c && skill && !req.skill && usesAmmo(skill) ? spendAmmo(c, skill) : null))
  const spent = useRef(false)
  useEffect(() => {
    if (!shot || !c || !skill || spent.current) return
    spent.current = true
    store.update(c.id, (x) => {
      const s = x.skills.find((k) => k.uid === skill.uid)
      return s ? spendAmmo(x, s).c : x
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const atk = req.kind === 'skill' && req.attack && c && skill && d ? attackCalc(c, skill, d, { ...(shot ? { ammo: shot.fired ?? null } : {}), ...(req.kind === 'skill' && req.weapon ? { weapon: req.weapon } : {}) }) : undefined

  const label = req.kind === 'skill' ? `${skill?.name ?? 'Skill'} ${atk ? 'attack' : 'check'}` : req.label
  const parts: Part[] = req.kind === 'custom' ? req.parts : atk ? atk.toHit.parts : c && skill && d ? checkBonus(c, skill, d).parts : []
  const bonus = parts.reduce((a, p) => a + p.value, 0)
  const initialMode: D20Roll['mode'] =
    req.kind === 'custom'
      ? req.mode ?? (d?.flags.disAll || d?.flags.disNext ? 'disadvantage' : 'normal')
      : atk ? atk.mode
      : skill && c && d && effectiveRank(c, skill, d) <= 0 ? 'disadvantage'
      : d?.flags.disAll || d?.flags.disNext ? 'disadvantage' : 'normal'

  const [mode, setMode] = useState<D20Roll['mode']>(initialMode)
  const [roll, setRoll] = useState<D20Roll>(() => rollD20(initialMode))
  const [extra, setExtra] = useState<{ label: string; value: number }[]>([])
  const [difficulty, setDifficulty] = useState<string>('')
  const [dmg, setDmg] = useState<DamageRoll | null>(null)
  const [rerolled, setRerolled] = useState(false)

  const extraSum = extra.reduce((a, e) => a + e.value, 0)
  const total = roll.kept + bonus + extraSum
  const diffNum = difficulty ? Number(difficulty) : NaN
  const degree = !Number.isNaN(diffNum) ? degreeOf(roll.kept, total, diffNum) : roll.kept === 20 ? 'critical-hit' : roll.kept === 1 ? 'critical-fail' : null

  // mark the Skill for advancement when it's rolled (Passive Skills never mark; Core p.169)
  useEffect(() => {
    if (!c || !skill) return
    if (skill.marked || !canAdvance(skill)) return
    if (skill.kind === 'damageEffect' || findSkill(skill.skillId)?.passive) return
    store.update(c.id, (x) => ({ ...x, skills: x.skills.map((s) => (s.uid === skill.uid ? { ...s, marked: true } : s)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    store.logRoll({
      charName: c?.name ?? '',
      label,
      detail: `d20 ${roll.rolls.join('/')}${roll.mode !== 'normal' ? ` (${roll.mode})` : ''} ${signed(bonus)}`,
      total: roll.kept + bonus,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll])

  const reroll = (m = mode) => {
    setRoll(rollD20(m))
    setExtra([])
    setDmg(null)
  }

  const spendFavor = () => {
    if (!c || c.aiFavor <= 0 || roll.kept === 1) return
    store.update(c.id, (x) => ({ ...x, aiFavor: x.aiFavor - 1 }))
    setRerolled(true)
    reroll()
  }

  const rollDmg = () => {
    if (!atk) return
    const crit = roll.kept === 20
    const amazing = !crit && !Number.isNaN(diffNum) && total - diffNum >= 10
    setDmg(rollDamage(atk, { crit, amazing }))
  }

  const canHit = atk && (roll.kept !== 1) && (Number.isNaN(diffNum) || isSuccess(degreeOf(roll.kept, total, diffNum)))

  return (
    <Sheet title={label} onClose={onClose}>
      <div className="row between wrap">
        <Seg
          value={mode}
          onChange={(m) => { setMode(m); reroll(m) }}
          options={[{ value: 'disadvantage', label: 'Disadv.' }, { value: 'normal', label: 'Normal' }, { value: 'advantage', label: 'Adv.' }]}
        />
        {atk?.modeReasons.length ? <span className="small muted">{atk.modeReasons.join(', ')}</span> : null}
      </div>

      <div className="roll-result">
        <div className="total">{total}</div>
        <div className="dice">
          d20{roll.rolls.length > 1 ? ` [${roll.rolls.join(', ')}] keep ${roll.kept}` : ` ${roll.kept}`} {signed(bonus)}
          {extra.map((e, i) => <span key={i}> {signed(e.value)} {e.label}</span>)}
        </div>
        {degree && <div className={`degree ${degree}`}>{DEGREE_LABEL[degree]}</div>}
        {!degree && roll.kept !== 20 && roll.kept !== 1 && <div className="small faint" style={{ marginTop: 6 }}>Enter the Difficulty to see the degree of success</div>}
      </div>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        <label className="grow">
          <span className="label">Difficulty (optional)</span>
          <input inputMode="numeric" value={difficulty} placeholder={c ? (atk ? `Mob Evade: 10 + its Dex + ${c.floor}` : `e.g. ${10 + c.floor * 2} unopposed`) : ''} onChange={(e) => setDifficulty(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>

      <div className="grid2">
        <button className="btn" onClick={() => reroll()}>Roll again</button>
        <button className="btn" disabled={!c || c.aiFavor <= 0 || roll.kept === 1 || rerolled} onClick={spendFavor} title="Once per Check; not on a Natural 1">
          AI Favor reroll ({c?.aiFavor ?? 0})
        </button>
        <button className="btn" onClick={() => setExtra((x) => [...x, { label: 'Intervene', value: rollDie(6) }])}>Intervene +1d6</button>
        <button className="btn" onClick={() => setExtra((x) => [...x, { label: 'Called Play', value: Math.max(rollDie(6), rollDie(6)) }])}>Called Play +2d6↑</button>
      </div>

      {atk && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row between">
            <div>
              <div className="label">Damage</div>
              <div className="num" style={{ fontWeight: 800 }}>{roll.kept === 20 ? atk.critFormula : atk.formula} {atk.types.join('/')}</div>
              {roll.kept === 20 && <div className="small" style={{ color: 'var(--accent)' }}>Critical Hit: base dice doubled</div>}
            </div>
            <button className="btn primary" disabled={!canHit} onClick={rollDmg}>Roll damage</button>
          </div>
          {dmg && (
            <div className="roll-result">
              <div className="total">{dmg.total}</div>
              <div className="dice">{dmg.breakdown}</div>
            </div>
          )}
          {!canHit && roll.kept === 1 && <div className="small muted">A Natural 1 always misses.</div>}
          {shot?.note && <div className="small" style={{ marginTop: 6 }}>{shot.note}</div>}
          {atk.ammo?.ammo?.debuff && <div className="small" style={{ color: 'var(--accent)' }}>{atk.notes[atk.notes.length - 1]}</div>}
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary className="small muted">Bonus breakdown</summary>
        <Breakdown total={{ total: bonus, parts }} />
      </details>
      {req.kind === 'custom' && req.note && <p className="small muted">{req.note}</p>}
    </Sheet>
  )
}

/** Advantage/disadvantage net mode helper for callers. */
export { netMode }
