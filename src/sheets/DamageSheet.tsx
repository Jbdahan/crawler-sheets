import { useMemo, useState } from 'react'
import { DAMAGE_TYPES } from '../data'
import { applyDamage, previewDamage } from '../engine/health'
import { Sheet, toast } from '../components/ui'
import type { Ctx } from '../screens/ctx'

/** Enter incoming damage; shows the DR → Resistance → slots pipeline before applying. */
export function DamageSheet({ c, d, up, onClose }: Ctx & { onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<string>('')
  const [fromDebuff, setFromDebuff] = useState(false)
  const [ap, setAp] = useState(false)
  const [evadedArea, setEvadedArea] = useState(false)
  const [splash, setSplash] = useState(false)
  const n = Number(amount || 0)
  const preview = useMemo(
    () => previewDamage(c, { amount: n, type: type || undefined, fromDebuff, armorPiercing: ap, areaEvaded: evadedArea, splash }, d),
    [c, d, n, type, fromDebuff, ap, evadedArea, splash],
  )
  const press = (k: string) => {
    if (k === '⌫') setAmount((a) => a.slice(0, -1))
    else if (k === 'C') setAmount('')
    else setAmount((a) => (a + k).replace(/^0+/, '').slice(0, 4))
  }
  const apply = () => {
    up((x) => applyDamage(x, preview))
    toast(preview.slotsLost ? `Lost ${preview.slotsLost} slot${preview.slotsLost === 1 ? '' : 's'}` : 'No slots lost')
    onClose()
  }
  return (
    <Sheet title="Take damage" onClose={onClose}>
      <div className="display">{amount || '0'}</div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
      <div className="label" style={{ marginTop: 12 }}>Damage type</div>
      <div className="chips" style={{ marginTop: 4 }}>
        <button className={`chip${!type ? ' buff' : ''}`} onClick={() => setType('')}>Untyped</button>
        {DAMAGE_TYPES.map((t) => (
          <button key={t} className={`chip${type === t ? ' buff' : ''}`} onClick={() => setType(t)}>
            {t}{d.resist.includes(t) ? ' ½' : ''}{d.immune.includes(t) ? ' ∅' : ''}{d.vuln.includes(t) ? ' ×2' : ''}
          </button>
        ))}
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <label className="row small"><input type="checkbox" checked={fromDebuff} onChange={(e) => setFromDebuff(e.target.checked)} /> From a Debuff (no DR)</label>
        <label className="row small"><input type="checkbox" checked={ap} onChange={(e) => setAp(e.target.checked)} /> Armor-Piercing</label>
        <label className="row small"><input type="checkbox" checked={evadedArea} onChange={(e) => setEvadedArea(e.target.checked)} /> Evaded an Area Attack (½)</label>
        <label className="row small"><input type="checkbox" checked={splash} onChange={(e) => setSplash(e.target.checked)} /> In the Splash zone (½)</label>
      </div>
      <div className="infobox" style={{ marginTop: 10 }}>
        {preview.steps.map((s, i) => <div key={i}>{s}</div>)}
        <div style={{ marginTop: 4, fontWeight: 800 }}>
          Health Bar: {10 - c.health.lost} → {10 - preview.newLost} slots {preview.dying && <span className="pill bad">Dying</span>}
        </div>
      </div>
      <button className="btn bad" style={{ width: '100%', marginTop: 12 }} disabled={!n} onClick={apply}>
        Apply {preview.slotsLost} slot{preview.slotsLost === 1 ? '' : 's'} of damage
      </button>
      <p className="small faint">Resistance halves, Vulnerability doubles, Immunity negates, after DR (Core p.92–94).</p>
    </Sheet>
  )
}
