import { ALL_SKILLS, DAMAGE_TYPES, STAT_KEYS, STAT_NAMES, findSkill } from '../data'
import type { Modifier } from '../engine/types'
import { signed } from '../components/ui'

const TARGETS: { value: string; label: string }[] = [
  ...STAT_KEYS.map((k) => ({ value: `stat:${k}`, label: STAT_NAMES[k] })),
  { value: 'dr', label: 'Damage Resistance' },
  { value: 'evade', label: 'Evade' },
  { value: 'toHit', label: 'To-hit (all attacks)' },
  { value: 'damage', label: 'Damage (all attacks)' },
  { value: 'allChecks', label: 'All Checks' },
  { value: 'move', label: 'Move (ft)' },
  { value: 'hbSlot', label: 'Health Bar slot value' },
  { value: 'maxMana', label: 'Max Mana' },
  { value: 'skill', label: 'Skill Rank…' },
  { value: 'resist', label: 'Resistance to…' },
  { value: 'immune', label: 'Immunity to…' },
  { value: 'vuln', label: 'Vulnerability to…' },
]

export function describeMod(m: Modifier): string {
  const [kind, arg] = m.target.split(':')
  if (kind === 'stat') return `${signed(m.value)} ${STAT_NAMES[arg as keyof typeof STAT_NAMES] ?? arg}`
  if (kind === 'skill') return `${signed(m.value)} ${findSkill(arg)?.name ?? arg}`
  if (kind === 'resist') return `Resist ${arg}`
  if (kind === 'immune') return `Immune ${arg}`
  if (kind === 'vuln') return `Vulnerable ${arg}`
  const names: Record<string, string> = { dr: 'DR', evade: 'Evade', toHit: 'to hit', damage: 'damage', allChecks: 'all Checks', move: 'ft Move', hbSlot: 'HB slot value', maxMana: 'Max Mana' }
  return `${signed(m.value)} ${names[kind] ?? kind}`
}

/** Edit a list of modifiers (gear bonuses, custom Buffs). */
export function ModEditor({ mods, onChange }: { mods: Modifier[]; onChange: (m: Modifier[]) => void }) {
  const set = (i: number, m: Modifier) => onChange(mods.map((x, j) => (j === i ? m : x)))
  return (
    <div className="stack">
      {mods.map((m, i) => {
        const [kind, arg] = m.target.split(':')
        const base = kind === 'stat' ? m.target : kind
        const needsType = ['resist', 'immune', 'vuln'].includes(kind)
        return (
          <div key={i} className="row wrap" style={{ gap: 6 }}>
            <select
              style={{ flex: '1 1 150px' }}
              value={base}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'skill') set(i, { target: 'skill:', value: m.value || 1 })
                else if (['resist', 'immune', 'vuln'].includes(v)) set(i, { target: `${v}:Fire`, value: 1 })
                else set(i, { target: v, value: m.value || 1 })
              }}
            >
              {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {kind === 'skill' && (
              <select style={{ flex: '1 1 150px' }} value={arg ?? ''} onChange={(e) => set(i, { ...m, target: `skill:${e.target.value}` })}>
                <option value="">Choose skill…</option>
                {ALL_SKILLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {needsType ? (
              <select style={{ flex: '1 1 120px' }} value={arg} onChange={(e) => set(i, { ...m, target: `${kind}:${e.target.value}` })}>
                {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            ) : (
              <input style={{ width: 70, flex: '0 0 70px' }} inputMode="numeric" value={String(m.value)}
                onChange={(e) => set(i, { ...m, value: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} />
            )}
            <button className="btn small ghost" onClick={() => onChange(mods.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </div>
        )
      })}
      <button className="btn small" onClick={() => onChange([...mods, { target: 'stat:str', value: 1 }])}>+ Add bonus</button>
    </div>
  )
}
