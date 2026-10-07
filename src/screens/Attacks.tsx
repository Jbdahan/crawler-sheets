import { useState } from 'react'
import { STAT_ABBR, findSkill, normName } from '../data'
import { castSpell } from '../engine/actions'
import { effectiveRank } from '../engine/derived'
import { attackCalc, isAttackSkill } from '../engine/attacks'
import { AMMO_NOUN, basicCount, describeAmmo, loadedAmmo, specialAmmo, usesAmmo } from '../engine/ammo'
import type { CharSkill } from '../engine/types'
import { openRoll } from '../components/Roller'
import { Breakdown, PageRef, Sheet, signed, toast } from '../components/ui'
import { SkillPicker } from '../sheets/SkillSheets'
import { SpellText } from '../components/SpellText'
import type { Ctx } from './ctx'

export function Attacks(ctx: Ctx) {
  const { c, d, up } = ctx
  const [picker, setPicker] = useState(false)
  const [info, setInfo] = useState<CharSkill | null>(null)
  const attacks = c.skills.filter((s) => isAttackSkill(s))
  const otherSpells = c.skills.filter((s) => s.kind === 'spell' && !isAttackSkill(s))
  const effects = c.skills.filter((s) => s.kind === 'damageEffect')

  const cast = (s: CharSkill) => {
    const r = castSpell(c, s, d)
    if (r.ok) up(() => r.c)
    toast(r.message)
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="small muted">Mob Evade on Floor {c.floor}: <b>10 + Dex + {c.floor}</b> · Amazing Success +{c.floor} dmg</div>
        <button className="btn small" onClick={() => setPicker(true)}>+ Add</button>
      </div>
      <div className="cols2">
        <div>
          {attacks.length === 0 && <div className="card empty">No attacks yet. Add a weapon Skill or Attack Spell.</div>}
          {attacks.map((s) => {
            const a = attackCalc(c, s, d)
            const def = a.def
            const isSpell = s.kind === 'spell'
            const myEffects = effects.filter((e) => {
              const ed = findSkill(e.skillId)
              return !!ed?.damageEffectOf && !!def && normName(ed.damageEffectOf).includes(normName(def.name))
            })
            return (
              <article className="attack" key={s.uid}>
                <div className="row between">
                  <div className="grow">
                    <h3>{s.name} <span className="pill accent">Rank {a.rank}</span></h3>
                    <div className="small muted">
                      {def?.group ?? (isSpell ? 'Spell' : 'Attack')}
                      {a.range ? ` · ${a.range}` : def?.attackType === 'melee' ? ' · Melee 5ft' : ''}
                      {a.area ? ` · ${a.area}` : ''}
                    </div>
                    {s.skillId && (() => {
                      // weapons in Gear or Inventory that use this Skill
                      const held = c.gear.filter((g) => g.skillId === s.skillId).map((g) => g.name)
                      const carried = c.inventory.filter((i) => i.kind === 'weapon' && i.skillId === s.skillId && i.qty > 0).map((i) => i.name)
                      return held.length || carried.length
                        ? <div className="small">{held.length > 0 && <>Equipped: <b>{held.join(', ')}</b></>}{held.length > 0 && carried.length > 0 && ' · '}{carried.length > 0 && <span className="muted">In Inventory: {carried.join(', ')}</span>}</div>
                        : null
                    })()}
                  </div>
                  {def && <PageRef page={def.page} />}
                </div>
                <div className="big">
                  <button className="tohit" onClick={() => openRoll({ kind: 'skill', charId: c.id, skillUid: s.uid, attack: true })} disabled={d.flags.cantAct}>
                    <div className="k">To hit 🎲</div>
                    <div className="v">{signed(a.toHit.total)}</div>
                    {a.mode !== 'normal' && <div className="k">{a.mode === 'disadvantage' ? 'Disadv.' : 'Adv.'}</div>}
                  </button>
                  <button className="dmg" onClick={() => openRoll({ kind: 'dice', charId: c.id, label: `${s.name} damage`, expr: a.formula.replace(/ /g, '') })}>
                    <div className="k">Damage {a.damageStat ? `(+${STAT_ABBR[a.damageStat]})` : ''}</div>
                    <div className="v num">{a.formula} <span className="small muted">{a.types.join('/')}</span></div>
                    <div className="k">Crit {a.critFormula}</div>
                  </button>
                </div>
                <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                  {a.mana !== undefined && (
                    <button className="btn small mana" onClick={() => cast(s)} disabled={c.mana < (a.mana ?? 0)}>
                      Cast · {a.mana} Mana
                    </button>
                  )}
                  {s.kind === 'attack' && (
                    <label className="row small" style={{ gap: 6 }}>
                      <input type="checkbox" checked={!!s.wielded}
                        onChange={(e) => up((x) => ({ ...x, skills: x.skills.map((k) => (k.uid === s.uid ? { ...k, wielded: e.target.checked } : k)) }))} />
                      In hand
                    </label>
                  )}
                  {myEffects.map((e) => (
                    <span key={e.uid} className="pill">{e.name} R{e.rank}</span>
                  ))}
                  <button className="btn small ghost" onClick={() => setInfo(s)}>Details</button>
                </div>
                {usesAmmo(s) && <AmmoBar {...ctx} s={s} />}
                {a.unlocked.length > 0 && (
                  <ul className="upgrades">
                    {a.unlocked.map((u) => <li key={u.rank}><span className="r">R{u.rank}</span><span>{u.text}</span></li>)}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
        <div>
          {effects.length > 0 && (
            <section className="card">
              <h3>Damage Effects</h3>
              <div className="list">
                {effects.map((e) => {
                  const def = findSkill(e.skillId)
                  return (
                    <div key={e.uid} className="li">
                      <div className="main">
                        <div className="name">{e.name} <span className="pill">R{e.rank}</span></div>
                        <div className="meta">{def?.summary} {def?.damageEffectOf && <>· with {def.damageEffectOf}</>}</div>
                      </div>
                      <button className="btn small ghost" onClick={() => setInfo(e)}>Details</button>
                    </div>
                  )
                })}
              </div>
              <p className="small faint">Choose one before rolling to hit. Mark the Effect or the attack for advancement, not both (Core p.169).</p>
            </section>
          )}
          {otherSpells.length > 0 && (
            <section className="card">
              <h3>Other Spells</h3>
              <div className="list">
                {otherSpells.map((s) => {
                  const def = findSkill(s.skillId)
                  const cost = s.customMana ?? def?.mana
                  return (
                    <div key={s.uid} className="li">
                      <div className="main">
                        <div className="name">{s.name} <span className="pill">R{effectiveRank(c, s, d)}</span></div>
                        {def?.summary && <div className="meta">{def.summary}</div>}
                        <div className="meta faint">{[def?.range, def?.duration, def?.cooldown && `Cooldown ${def.cooldown}`].filter(Boolean).join(' · ')}</div>
                        {!def && s.notes && <SpellText text={s.notes} lines={2} />}
                      </div>
                      <div className="stack" style={{ alignSelf: 'flex-start' }}>
                        <button className="btn small mana" disabled={d.flags.cantCast || c.mana < (cost ?? 0)} onClick={() => cast(s)}>
                          Cast{cost !== undefined ? ` · ${cost}` : ''}
                        </button>
                        <button className="btn small ghost" onClick={() => setInfo(s)}>Details</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      {picker && <SkillPicker {...ctx} onClose={() => setPicker(false)} filter="attacks" />}
      {info && <AttackInfo {...ctx} s={info} onClose={() => setInfo(null)} />}
    </div>
  )
}

function AttackInfo({ c, d, s, onClose }: Ctx & { s: CharSkill; onClose: () => void }) {
  const def = findSkill(s.skillId)
  const a = isAttackSkill(s) ? attackCalc(c, s, d) : undefined
  return (
    <Sheet title={s.name} onClose={onClose}>
      <div className="stack">
        {def?.summary && <p>{def.summary}</p>}
        {!def && s.notes && <SpellText text={s.notes} startOpen lines={99} />}
        {def && s.notes && <p className="small">{s.notes}</p>}
        <div className="small muted">{def?.keywords?.join(', ')} <PageRef page={def?.page} /></div>
        {[['Range', def?.range], ['Mana', def?.manaText], ['Cooldown', def?.cooldown], ['Duration', def?.duration], ['AI Favor', def?.aiFavor], ['Limitations', def?.limitations]]
          .filter(([, v]) => v)
          .map(([k, v]) => <div key={k} className="small"><b>{k}:</b> {v}</div>)}
        {a && <Breakdown total={a.toHit} title="To hit" />}
        {a && <Breakdown total={a.damageFlat} title="Damage bonus" />}
        {a && (
          <ul className="upgrades">
            {[...a.unlocked, ...a.locked].sort((x, y) => x.rank - y.rank).map((u) => (
              <li key={u.rank} className={u.rank > a.rank ? 'locked' : ''}><span className="r">R{u.rank}</span><span>{u.text}</span></li>
            ))}
          </ul>
        )}
        {!a && def?.upgrades && (
          <ul className="upgrades">
            {Object.entries(def.upgrades).map(([r, u]) => (
              <li key={r} className={Number(r) > effectiveRank(c, s, d) ? 'locked' : ''}><span className="r">R{r}</span><span>{u.text}</span></li>
            ))}
          </ul>
        )}
        {a?.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
      </div>
    </Sheet>
  )
}

/** Which ammo the next Attack fires; one round is spent per Attack. Basic ammo is only counted when tracked. */
function AmmoBar({ c, up, s }: Ctx & { s: CharSkill }) {
  const noun = AMMO_NOUN[s.skillId!]
  const special = specialAmmo(c, s.skillId)
  const loaded = loadedAmmo(c, s)
  const set = (patch: Partial<CharSkill>) => up((x) => ({ ...x, skills: x.skills.map((k) => (k.uid === s.uid ? { ...k, ...patch } : k)) }))
  const basic = basicCount(c, s.skillId)
  return (
    <div className="ammo-bar">
      <label className="row small" style={{ gap: 6 }}>
        <span className="label" style={{ margin: 0 }}>{noun}</span>
        <select value={loaded?.uid ?? ''} onChange={(e) => set({ ammoUid: e.target.value || undefined })} style={{ flex: 1, minWidth: 0 }}>
          <option value="">Basic {noun.toLowerCase()}{s.trackBasicAmmo ? ` (${basic})` : ''}</option>
          {special.map((i) => <option key={i.uid} value={i.uid}>{i.name} ({i.qty}){i.ammo ? ` · ${describeAmmo(i.ammo)}` : ''}</option>)}
        </select>
      </label>
      {loaded && loaded.qty <= 0 && <div className="small" style={{ color: 'var(--danger)' }}>Out of {loaded.name}: attacks fire basic {noun.toLowerCase()}</div>}
      {!special.length && <div className="small faint">No special {noun.toLowerCase()} in Inventory. Add some with + Loot.</div>}
      <label className="row small" style={{ gap: 6 }}>
        <input type="checkbox" checked={!!s.trackBasicAmmo} onChange={(e) => set({ trackBasicAmmo: e.target.checked })} />
        Count basic {noun.toLowerCase()}{s.trackBasicAmmo ? `: ${basic} in Inventory` : ''}
      </label>
    </div>
  )
}
