import { useState } from 'react'
import { STAT_ABBR, findSkill } from '../data'
import { checkBonus, skillStat } from '../engine/derived'
import type { CharSkill } from '../engine/types'
import { openRoll } from '../components/Roller'
import { Seg, signed } from '../components/ui'
import { SkillDetail, SkillPicker } from '../sheets/SkillSheets'
import { AdvancementSheet, GrindSheet } from '../sheets/Progress'
import type { AdvanceWindow } from '../engine/advancement'
import type { Ctx } from './ctx'

const GROUPS: { kind: CharSkill['kind']; label: string }[] = [
  { kind: 'attack', label: 'Attack Skills' },
  { kind: 'damageEffect', label: 'Damage Effects' },
  { kind: 'utility', label: 'Utility Skills' },
  { kind: 'spell', label: 'Spells' },
]

export function Skills(ctx: Ctx) {
  const { c, d, up } = ctx
  const [picker, setPicker] = useState(false)
  const [detail, setDetail] = useState<CharSkill | null>(null)
  const [adv, setAdv] = useState<AdvanceWindow | null>(null)
  const [grind, setGrind] = useState(false)
  const [sort, setSort] = useState<'group' | 'name' | 'rank'>('group')
  const marked = c.skills.filter((s) => s.marked).length

  const row = (s: CharSkill) => {
    const def = findSkill(s.skillId)
    const stat = skillStat(s)
    const passive = def?.passive || (!stat && !def)
    const total = checkBonus(c, s, d).total
    return (
      <div className="li" key={s.uid}>
        <input type="checkbox" aria-label="Marked for advancement" checked={s.marked} disabled={passive}
          onChange={(e) => up((x) => ({ ...x, skills: x.skills.map((k) => (k.uid === s.uid ? { ...k, marked: e.target.checked } : k)) }))} />
        <button className="main" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setDetail(s)}>
          <div className="name">{s.name} {s.max === 20 && <span className="pill accent">20</span>}</div>
          <div className="meta">
            Rank {s.rank}{d.skillBonus[s.uid] ? ` (+${d.skillBonus[s.uid].reduce((a, p) => a + p.value, 0)})` : ''}
            {stat ? ` · ${STAT_ABBR[stat]} ${signed(d.mod[stat])}` : ''}
            {' · '}{def?.checkType ?? (passive ? 'Passive' : 'Check')}
            {s.grindHours ? ` · ${s.grindHours}h ground` : ''}
          </div>
        </button>
        {!passive ? (
          <button className="btn small" style={{ minWidth: 58 }} onClick={() => openRoll({ kind: 'skill', charId: c.id, skillUid: s.uid, attack: s.kind === 'attack' || (s.kind === 'spell' && !!def?.attack) })}>
            {signed(total)} 🎲
          </button>
        ) : <span className="pill">Passive</span>}
      </div>
    )
  }

  const sorted = (list: CharSkill[]) =>
    sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name))
    : sort === 'rank' ? [...list].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    : list

  return (
    <div>
      <div className="card">
        <div className="row wrap between">
          <div className="small muted">{c.skills.length} skills · {marked} marked ✔</div>
          <div className="row wrap">
            <button className="btn small" onClick={() => setAdv('twoHours')}>2-hour checks</button>
            <button className="btn small" onClick={() => setAdv('endOfFloor')}>End-of-floor checks</button>
            <button className="btn small" onClick={() => setGrind(true)}>Grind…</button>
            <button className="btn small primary" onClick={() => setPicker(true)}>+ Add</button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <Seg value={sort} onChange={setSort} options={[{ value: 'group', label: 'By type' }, { value: 'name', label: 'A–Z' }, { value: 'rank', label: 'Rank' }]} />
        </div>
      </div>
      {sort === 'group' ? (
        <div className="cols2" style={{ marginTop: 12 }}>
          {GROUPS.map((g) => {
            const list = c.skills.filter((s) => s.kind === g.kind)
            if (!list.length) return null
            return (
              <section className="card" key={g.kind}>
                <h3>{g.label}</h3>
                <div className="list">{list.map(row)}</div>
              </section>
            )
          })}
        </div>
      ) : (
        <section className="card" style={{ marginTop: 12 }}><div className="list">{sorted(c.skills).map(row)}</div></section>
      )}
      <p className="small faint" style={{ marginTop: 10 }}>
        ✔ marks a Skill for its next Advancement Check. It's marked automatically when you roll it. Rank ≤4 checks happen every 2 hours of play; Rank 5+ at the end of each floor (Core p.169).
      </p>
      {picker && <SkillPicker {...ctx} onClose={() => setPicker(false)} />}
      {detail && <SkillDetail {...ctx} s={detail} onClose={() => setDetail(null)} />}
      {adv && <AdvancementSheet {...ctx} window={adv} onClose={() => setAdv(null)} />}
      {grind && <GrindSheet {...ctx} onClose={() => setGrind(false)} />}
    </div>
  )
}
