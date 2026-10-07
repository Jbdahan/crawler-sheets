import { useState } from 'react'
import { findSkill } from '../data'
import { AMMO_NOUN, AMMO_WEAPONS } from '../engine/ammo'

const NEW = '__new'

/**
 * Pick an ammo key: the standard ammo of a ranged weapon ("crossbow" = Bolts) or a custom
 * ammo name typed in (e.g. "Plasma Cells"). `none` adds a blank first option (e.g. "Skill's own ammo").
 */
export function AmmoSelect({ value, onChange, custom = [], none, label = 'Ammo' }: {
  value?: string
  onChange: (key: string | undefined) => void
  /** custom ammo names already in use, offered in the list */
  custom?: string[]
  none?: string
  label?: string
}) {
  const known = !value || value in AMMO_NOUN || custom.includes(value)
  const [typing, setTyping] = useState(!known)
  const options = [...AMMO_WEAPONS.map((w) => ({ value: w, label: `${AMMO_NOUN[w]} (${findSkill(w)?.name ?? w})` })),
    ...custom.filter((k) => !(k in AMMO_NOUN)).map((k) => ({ value: k, label: k }))]
  return (
    <label><span className="label">{label}</span>
      <select aria-label={label} value={typing ? NEW : value ?? ''} onChange={(e) => {
        const v = e.target.value
        setTyping(v === NEW)
        onChange(v === NEW ? undefined : v || undefined)
      }}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={NEW}>Custom ammo…</option>
      </select>
      {typing && (
        <input style={{ marginTop: 6 }} aria-label="Custom ammo name" placeholder="e.g. Plasma Cells, Darts, Goblin Nails" autoFocus
          value={value && !(value in AMMO_NOUN) ? value : ''} onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)} />
      )}
    </label>
  )
}
