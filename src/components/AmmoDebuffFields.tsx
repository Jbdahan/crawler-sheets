import { DEBUFFS, STAT_KEYS, STAT_NAMES } from '../data'
import type { AmmoEffect } from '../engine/types'

type DebuffPart = Pick<AmmoEffect, 'debuff' | 'debuffOn' | 'checkStat' | 'extra'>

/**
 * Special ammo's Debuff (on a hit, an Amazing Success, or a failed Stat Check the target makes)
 * plus an optional additional effect, e.g. "everyone within a 10 ft radius".
 */
export function AmmoDebuffFields({ value: a, onChange, floor }: {
  value: DebuffPart
  onChange: (patch: Partial<DebuffPart>) => void
  /** shows the Stat Check Difficulty (10 + Floor) when known */
  floor?: number
}) {
  const when = a.debuffOn ?? 'hit'
  return (
    <>
      <div className="grid2">
        <label><span className="label">Debuff</span>
          <select aria-label="Debuff" value={a.debuff ?? ''} onChange={(e) => onChange({ debuff: e.target.value || undefined, debuffOn: when })}>
            <option value="">None</option>
            {DEBUFFS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label><span className="label">When</span>
          <select aria-label="When" value={when} disabled={!a.debuff}
            onChange={(e) => {
              const debuffOn = e.target.value as NonNullable<AmmoEffect['debuffOn']>
              onChange({ debuffOn, checkStat: debuffOn === 'check' ? a.checkStat ?? 'dex' : undefined })
            }}>
            <option value="hit">On a hit</option>
            <option value="amazing">On an Amazing Success</option>
            <option value="check">On a failed Stat Check</option>
          </select>
        </label>
      </div>
      {a.debuff && when === 'check' && (
        <label><span className="label">Target's Stat Check{floor !== undefined ? ` (Difficulty ${10 + floor})` : ' (Difficulty 10 + Floor)'}</span>
          <select aria-label="Check Stat" value={a.checkStat ?? 'dex'} onChange={(e) => onChange({ checkStat: e.target.value as AmmoEffect['checkStat'] })}>
            {STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_NAMES[k]}</option>)}
          </select>
        </label>
      )}
      <label><span className="label">Additional effect (optional)</span>
        <input aria-label="Additional effect" value={a.extra ?? ''} placeholder="e.g. everyone within a 10 ft radius"
          onChange={(e) => onChange({ extra: e.target.value || undefined })} />
      </label>
    </>
  )
}
