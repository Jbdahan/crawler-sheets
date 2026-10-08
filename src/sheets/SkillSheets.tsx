import { useMemo, useState } from 'react'
import { ALL_SKILLS, STAT_ABBR, STAT_KEYS, findSkill, type SkillDef, type SkillKind, type StatKey } from '../data'
import { newSkill } from '../engine/advancement'
import { checkBonus, effectiveRank, skillStat } from '../engine/derived'
import type { CharSkill } from '../engine/types'
import { openRoll } from '../components/Roller'
import { PageRef, Seg, Sheet, Stepper, signed, toast } from '../components/ui'
import { SpellText } from '../components/SpellText'
import { SpellEffect } from '../components/SpellEffect'
import type { Ctx } from '../screens/ctx'

const KIND_LABEL: Record<SkillKind, string> = { attack: 'Attack', damageEffect: 'Damage Effect', utility: 'Utility', spell: 'Spell' }

export function SkillPicker({ c, up, onClose, filter }: Ctx & { onClose: () => void; filter?: 'attacks' }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | SkillKind>(filter === 'attacks' ? 'attack' : 'all')
  const [custom, setCustom] = useState(false)
  const has = new Set(c.skills.map((s) => s.skillId).filter(Boolean))
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return ALL_SKILLS.filter((s) => (kind === 'all' || s.kind === kind) && (!n || s.name.toLowerCase().includes(n) || s.summary?.toLowerCase().includes(n)))
  }, [q, kind])

  const add = (def: SkillDef) => {
    up((x) => ({ ...x, skills: [...x.skills, newSkill(def, def.name, 1, 'Added')] }))
    toast(`${def.name} added at Rank 1`)
  }

  if (custom) return <CustomSkill {...{ c, up }} onClose={onClose} onBack={() => setCustom(false)} />

  return (
    <Sheet title="Add Skill or Spell" onClose={onClose} wide>
      <div className="stack">
        <input placeholder="Search skills and spells…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Seg value={kind} onChange={setKind} options={[
          { value: 'all', label: 'All' }, { value: 'attack', label: 'Attacks' }, { value: 'utility', label: 'Utility' },
          { value: 'spell', label: 'Spells' }, { value: 'damageEffect', label: 'Dmg Effects' },
        ]} />
        <div className="list">
          {list.map((s) => (
            <div className="li" key={s.id}>
              <div className="main">
                <div className="name">
                  {s.name} <span className="pill">{KIND_LABEL[s.kind]}</span>{' '}
                  {s.stat && <span className="pill">{STAT_ABBR[s.stat]}</span>}{' '}
                  {s.passive && <span className="pill">Passive</span>}{' '}
                  {s.mana !== undefined && <span className="pill mana">{s.mana} Mana</span>}
                </div>
                <div className="meta">{s.summary}</div>
                {s.damage && <div className="meta faint">{s.damage.count}d{s.damage.sides}{s.damage.stat ? ` + ${STAT_ABBR[s.damage.stat]}` : ''} {s.damage.types.join('/')}{s.range ? ` · ${s.range}` : ''}</div>}
              </div>
              <PageRef page={s.page} />
              <button className="btn small good" disabled={has.has(s.id)} onClick={() => add(s)}>{has.has(s.id) ? 'Have' : 'Add'}</button>
            </div>
          ))}
          {!list.length && <div className="empty">No matches.</div>}
        </div>
        <button className="btn" onClick={() => setCustom(true)}>Create a custom Skill…</button>
        <p className="small faint">Passive Skills and Spells can't be used untrained and only rise through magic, training, Race or Class (Core p.58, 173).</p>
      </div>
    </Sheet>
  )
}

function CustomSkill({ up, onClose, onBack }: Pick<Ctx, 'c' | 'up'> & { onClose: () => void; onBack: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SkillKind>('utility')
  const [stat, setStat] = useState<StatKey | ''>('dex')
  const [rank, setRank] = useState(1)
  const [damage, setDamage] = useState('1d6')
  const [dmgStat, setDmgStat] = useState<StatKey | ''>('str')
  const [dmgType, setDmgType] = useState('Bludgeoning')
  const [mana, setMana] = useState(0)
  const isAtk = kind === 'attack' || kind === 'spell'
  const save = () => {
    const s: CharSkill = {
      ...newSkill(undefined, name.trim(), rank, 'Custom'),
      kind,
      stat: stat || null,
      ...(isAtk && damage ? { customDamage: damage, customDamageStat: dmgStat || null, customDamageType: dmgType } : {}),
      ...(kind === 'spell' ? { customMana: mana } : {}),
    }
    up((x) => ({ ...x, skills: [...x.skills, s] }))
    toast(`${s.name} added`)
    onClose()
  }
  return (
    <Sheet title="Custom Skill" onClose={onClose}>
      <div className="stack">
        <label><span className="label">Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tire Iron (Club), Yarn Wrangler" /></label>
        <Seg value={kind} onChange={setKind} options={[{ value: 'utility', label: 'Utility' }, { value: 'attack', label: 'Attack' }, { value: 'spell', label: 'Spell' }]} />
        <div className="grid2">
          <label><span className="label">Stat</span>
            <select value={stat} onChange={(e) => setStat(e.target.value as StatKey | '')}>
              <option value="">None (Passive)</option>
              {STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_ABBR[k]}</option>)}
            </select>
          </label>
          <label><span className="label">Rank</span><div><Stepper value={rank} min={0} max={20} onChange={setRank} /></div></label>
        </div>
        {isAtk && (
          <div className="grid3">
            <label><span className="label">Base dice</span><input value={damage} onChange={(e) => setDamage(e.target.value)} /></label>
            <label><span className="label">+ Stat</span>
              <select value={dmgStat} onChange={(e) => setDmgStat(e.target.value as StatKey | '')}>
                <option value="">None</option>
                {STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_ABBR[k]}</option>)}
              </select>
            </label>
            <label><span className="label">Type</span><input value={dmgType} onChange={(e) => setDmgType(e.target.value)} /></label>
          </div>
        )}
        {kind === 'spell' && <label><span className="label">Mana cost</span><div><Stepper value={mana} min={0} max={999} onChange={setMana} editable /></div></label>}
        <p className="small faint">Custom Skills: keep them narrow, and don't make them better than Evade (Core p.174–175).</p>
        <div className="row">
          <button className="btn grow" onClick={onBack}>Back</button>
          <button className="btn primary grow" disabled={!name.trim()} onClick={save}>Add</button>
        </div>
      </div>
    </Sheet>
  )
}

export function SkillDetail({ c, d, up, s, onClose }: Ctx & { s: CharSkill; onClose: () => void }) {
  const cur = c.skills.find((x) => x.uid === s.uid) ?? s
  const def = findSkill(cur.skillId)
  const set = (patch: Partial<CharSkill>) => up((x) => ({ ...x, skills: x.skills.map((k) => (k.uid === s.uid ? { ...k, ...patch } : k)) }))
  const stat = skillStat(cur)
  const bonus = checkBonus(c, cur, d)
  const remove = () => {
    up((x) => ({ ...x, skills: x.skills.filter((k) => k.uid !== s.uid), hotlist: x.hotlist.map((h) => (h?.skillUid === s.uid ? null : h)) }))
    onClose()
  }
  return (
    <Sheet title={cur.name} onClose={onClose}>
      <div className="stack">
        {def && <SpellEffect def={def} />}
        {!def && cur.notes && <div className="infobox"><SpellText text={cur.notes} startOpen lines={99} /></div>}
        <div className="small muted">
          {def ? KIND_LABEL[def.kind] : 'Custom'} · {def?.checkType ?? (stat ? 'Check' : 'Passive')}{def?.keywords?.length ? ` · ${def.keywords.join(', ')}` : ''} <PageRef page={def?.page} />
        </div>
        <div className="grid2">
          <label><span className="label">Your Rank</span><div><Stepper value={cur.rank} min={0} max={cur.max} onChange={(v) => set({ rank: v })} /></div></label>
          <label><span className="label">Rank cap</span>
            <select value={cur.max} onChange={(e) => set({ max: Number(e.target.value) })}>
              {cur.max === 1 && <option value={1}>1 (max)</option>}
              <option value={15}>15 (normal)</option>
              <option value={20}>20 (Race/Class)</option>
            </select>
          </label>
        </div>
        {(d.skillBonus[cur.uid] ?? []).length > 0 && (
          <div className="infobox small">
            <b>Rank {effectiveRank(c, cur, d)}</b> with bonuses: {cur.rank} yours{(d.skillBonus[cur.uid] ?? []).map((p) => ` ${p.value >= 0 ? '+' : '−'} ${Math.abs(p.value)} ${p.label}`).join('')}.
            {cur.source === 'Equipped gear' && cur.rank === 0 && ' You have this Skill only while that gear is equipped; using it can train it.'}
          </div>
        )}
        {effectiveRank(c, cur, d) >= 16 && c.floor < 6 && <div className="warnbox">Rank 16+ benefits don't come online until the Sixth Floor (Core p.57).</div>}
        {stat && (
          <div className="row between">
            <div className="small">Check: d20 {signed(bonus.total)} <span className="muted">({bonus.parts.map((p) => `${p.label} ${signed(p.value)}`).join(', ')})</span></div>
            <button className="btn small primary" onClick={() => openRoll({ kind: 'skill', charId: c.id, skillUid: cur.uid })}>Roll</button>
          </div>
        )}
        <div className="grid2">
          <label className="row small"><input type="checkbox" checked={cur.marked} onChange={(e) => set({ marked: e.target.checked })} /> Marked for advancement ✔</label>
          <label className="row small">Grind hours <Stepper value={cur.grindHours} min={0} max={999} onChange={(v) => set({ grindHours: v })} /></label>
        </div>
        {def?.upgrades && (
          <ul className="upgrades">
            {Object.entries(def.upgrades).map(([r, u]) => (
              <li key={r} className={Number(r) > effectiveRank(c, cur, d) ? 'locked' : ''}><span className="r">R{r}</span><span>{u.text}</span></li>
            ))}
          </ul>
        )}
        {[['Range', def?.range], ['Mana', def?.manaText], ['Cooldown', def?.cooldown], ['Duration', def?.duration], ['Limitations', def?.limitations]]
          .filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><b>{k}:</b> {v}</div>)}
        <label><span className="label">Notes</span><textarea rows={Math.min(10, Math.max(2, Math.ceil(cur.notes.length / 40)))} value={cur.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="specialty, source, reminders…" /></label>
        {cur.source && <div className="small faint">From: {cur.source}</div>}
        <button className="btn danger" onClick={remove}>Remove skill</button>
      </div>
    </Sheet>
  )
}
