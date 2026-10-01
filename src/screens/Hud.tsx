import { useState } from 'react'
import { STAT_ABBR, STAT_KEYS, STAT_NAMES, SIZES, type StatKey } from '../data'
import { difficulty } from '../engine/attacks'
import type { Part, Total } from '../engine/derived'
import { HB_SLOTS, REST_LABEL, heal, rest, setLost, setMana, tickDying, type RestKind } from '../engine/health'
import { HOTLIST_SIZE, type ActiveEffect, type HotlistEntry } from '../engine/types'
import { attackLine, hotlistAttack, hotlistSkill, triggerHotlist } from './hotlistUse'
import { findSkill } from '../data'
import { openRoll } from '../components/Roller'
import { swapSlots, useSlotDrag } from '../components/useSlotDrag'
import { Breakdown, Sheet, signed, toast } from '../components/ui'
import { DamageSheet } from '../sheets/DamageSheet'
import { AddEffectSheet, EditEffectSheet, MAX_EXTERNAL, externalCount } from '../sheets/EffectSheets'
import { go } from '../router'
import type { Ctx } from './ctx'

/** red → green like the paper sheet's health bar */
const slotColor = (i: number) => `hsl(${Math.round((i / (HB_SLOTS - 1)) * 120)}, 70%, 52%)`

export function Hud(ctx: Ctx) {
  const { c, d, up } = ctx
  const [sheet, setSheet] = useState<null | 'damage' | 'addDebuff' | 'addBuff' | 'rest' | { stat: StatKey } | { effect: ActiveEffect } | { info: string; total: Total }>(null)
  const alive = HB_SLOTS - c.health.lost
  const pct = alive * 10
  const maxMana = d.maxMana.total

  const tapSlot = (i: number) => {
    // slot i (0 = 10%) is lost when i >= alive; tapping toggles the bar to that point
    const lost = i >= alive ? HB_SLOTS - i - 1 : HB_SLOTS - i
    up((x) => setLost(x, lost, d))
  }

  const buffs = c.effects.filter((e) => e.kind === 'buff')
  const debuffs = c.effects.filter((e) => e.kind === 'debuff')

  const evadeRoll = () => openRoll({
    kind: 'custom', charId: c.id, label: 'Evade', parts: [...d.evade.parts, ...d.allChecks.parts],
    note: 'Roll once per incoming Attack. Natural 20 or Amazing Success: Advantage on your next Attack vs that Mob. Major Fail: +Floor damage and a Minor Injury; Natural 1: double damage and a Major Injury (Core p.79).',
  })

  return (
    <div className="hud">
      {c.pendingStatPoints > 0 && (
        <div className="warnbox span2 row between">
          <span><b>{c.pendingStatPoints}</b> Stat points banked{c.floor < 3 ? ' (applied on reaching the Third Floor)' : ' (spend them in a saferoom)'}</span>
          {c.floor >= 3 && <button className="btn small primary" onClick={() => go(`/c/${c.id}/more/stats`)}>Allocate</button>}
        </div>
      )}
      {c.floor >= 3 && !c.raceId && (
        <div className="warnbox span2 row between">
          <span>You're on Floor {c.floor}: time to choose a Race and Class.</span>
          <button className="btn small primary" onClick={() => go(`/c/${c.id}/more/raceclass`)}>Choose</button>
        </div>
      )}

      <section className="card span2">
        <div className="card-head">
          <h2>Health</h2>
          <span className="num" style={{ fontWeight: 800, color: pct <= 30 ? 'var(--danger)' : undefined }}>{pct}%</span>
          <span className="small muted">· {d.hbSlot.total}/slot</span>
        </div>
        <div className="hb" role="group" aria-label="Health Bar">
          {Array.from({ length: HB_SLOTS }, (_, i) => (
            <button key={i} className={i >= alive ? 'lost' : ''} style={{ background: slotColor(i) }} onClick={() => tapSlot(i)}
              aria-label={`${(i + 1) * 10}% slot ${i >= alive ? 'lost' : 'healthy'}`}>
              {d.hbSlot.total}
              <span className="pct">{(i + 1) * 10}%</span>
            </button>
          ))}
        </div>
        {c.health.dying !== null && (
          <div className="warnbox row between" style={{ marginTop: 8 }}>
            <span><b>Dying!</b> {c.health.dying} round{c.health.dying === 1 ? '' : 's'} left. Heal at least 1 slot to survive.</span>
            <button className="btn small" onClick={() => up(tickDying)}>−1 round</button>
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn bad grow" onClick={() => setSheet('damage')}>Take damage</button>
          <button className="btn good grow" disabled={d.flags.cantHeal || c.health.lost === 0} onClick={() => up((x) => heal(x, 1))}>Heal 1 slot</button>
          <button className="btn grow" onClick={() => setSheet('rest')}>Rest…</button>
        </div>
      </section>

      <section className="card span2 mana-card">
        <div className="mana-row">
          <span className="mana-label">Mana</span>
          <div className="mana-bar" role="meter" aria-label="Mana" aria-valuemin={0} aria-valuemax={maxMana} aria-valuenow={c.mana}>
            <div style={{ width: `${maxMana ? Math.min(100, (c.mana / maxMana) * 100) : 0}%` }} />
            <span className="num">{c.mana} / {maxMana}</span>
          </div>
          {[-5, -1].map((n) => <button key={n} className="mana-btn minus" onClick={() => up((x) => setMana(x, x.mana + n, d))} aria-label={`Mana ${n}`}>{n}</button>)}
          {[1, 5].map((n) => <button key={n} className="mana-btn" onClick={() => up((x) => setMana(x, x.mana + n, d))} aria-label={`Mana +${n}`}>+{n}</button>)}
          <button className="mana-btn wide" onClick={() => up((x) => setMana(x, maxMana, d))}>Full</button>
        </div>
      </section>

      <HotlistStrip {...ctx} />

      <section className="card">
        <div className="kpis">
          <button className="kpi" onClick={evadeRoll}><div className="v">{signed(d.evade.total)}</div><div className="k">Evade 🎲</div></button>
          <button className="kpi" onClick={() => setSheet({ info: 'Damage Resistance', total: d.dr })}><div className="v">{d.dr.total}</div><div className="k">DR</div></button>
          <button className="kpi" onClick={() => setSheet({ info: 'Move (ft)', total: d.move })}><div className="v">{d.move.total}</div><div className="k">Move</div></button>
          <div className="kpi"><div className="v">{d.step}</div><div className="k">Step</div></div>
          <div className="kpi">
            <div className="v row" style={{ justifyContent: 'center', gap: 4 }}>
              <button className="btn small ghost" style={{ padding: 0, minHeight: 0, width: 22 }} onClick={() => up((x) => ({ ...x, aiFavor: Math.max(0, x.aiFavor - 1) }))}>−</button>
              {c.aiFavor}
              <button className="btn small ghost" style={{ padding: 0, minHeight: 0, width: 22 }} onClick={() => up((x) => ({ ...x, aiFavor: x.aiFavor + 1 }))}>+</button>
            </div>
            <div className="k">AI Favor</div>
          </div>
          <div className="kpi"><div className="v">{c.size}</div><div className="k">{SIZES[c.size] ?? 'Size'}</div></div>
        </div>
        {d.allChecks.total !== 0 && (
          <div className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>{signed(d.allChecks.total)} to all Checks ({d.allChecks.parts.map((p) => p.label).join(', ')})</div>
        )}
        {d.notes.map((n) => <div key={n} className="small" style={{ color: 'var(--warn)' }}>{n}</div>)}
        {(d.resist.length > 0 || d.immune.length > 0 || d.vuln.length > 0) && (
          <div className="small muted" style={{ marginTop: 6 }}>
            {d.resist.length > 0 && <>Resist: {d.resist.join(', ')} </>}
            {d.immune.length > 0 && <>· Immune: {d.immune.join(', ')} </>}
            {d.vuln.length > 0 && <>· Vulnerable: {d.vuln.join(', ')}</>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Stats</h2><span className="small muted">tap for details</span></div>
        <div className="stat-tiles">
          {STAT_KEYS.map((k) => (
            <button key={k} className="stat-tile" onClick={() => setSheet({ stat: k })}>
              <div className="abbr">{STAT_ABBR[k].toUpperCase()}</div>
              <div className="mod">{signed(d.mod[k])}</div>
              <div className="score">{d.enhanced[k]}{d.enhanced[k] !== d.unenhanced[k] ? ` / ${d.unenhanced[k]}` : ''}</div>
            </button>
          ))}
        </div>
        <div className="small faint" style={{ marginTop: 6 }}>Enhanced / Unenhanced score · Mod from Enhanced</div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Buffs &amp; Debuffs</h2>
          <span className="small muted">External {externalCount(c)}/{MAX_EXTERNAL}</span>
        </div>
        <div className="chips">
          {debuffs.map((e) => (
            <button key={e.uid} className={`chip debuff${e.active ? '' : ' off'}`} onClick={() => setSheet({ effect: e })}>
              {e.name}{e.stacks > 1 ? ` ×${e.stacks}` : ''}
            </button>
          ))}
          {buffs.map((e) => (
            <button key={e.uid} className={`chip buff${e.active ? '' : ' off'}`} onClick={() => setSheet({ effect: e })}>
              {e.external ? '★ ' : ''}{e.name}
            </button>
          ))}
          {!c.effects.length && <span className="small muted">None active</span>}
        </div>
        {d.dots.length > 0 && (
          <div className="stack" style={{ marginTop: 10 }}>
            {d.dots.map((dot) => {
              const expr = `${dot.dice}+${c.floor}`
              return (
                <div key={dot.name} className="row between small">
                  <span>{dot.name}{dot.stacks > 1 ? ` ×${dot.stacks}` : ''}: {expr}{dot.type ? ` ${dot.type}` : ''} end of round (ignores DR)</span>
                  <button className="btn small" onClick={() => openRoll({ kind: 'dice', charId: c.id, label: `${dot.name} damage`, expr })}>Roll</button>
                </div>
              )
            })}
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn bad grow" onClick={() => setSheet('addDebuff')}>+ Debuff</button>
          <button className="btn good grow" onClick={() => setSheet('addBuff')}>+ Buff</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Floor {c.floor} Difficulties</h2></div>
        <div className="grid3 center">
          <div><div className="label">Unopposed</div><div className="num" style={{ fontWeight: 800, fontSize: '1.2rem' }}>{difficulty.unopposed(c.floor)}</div></div>
          <div><div className="label">Stat Check</div><div className="num" style={{ fontWeight: 800, fontSize: '1.2rem' }}>{difficulty.stat(c.floor)}</div></div>
          <div><div className="label">Mob Evade</div><div className="num" style={{ fontWeight: 800, fontSize: '1.2rem' }}>{10 + c.floor}+Dex</div></div>
        </div>
        <div className="small faint" style={{ marginTop: 6 }}>Opposed: 10 + foe's Mod + {c.floor}. Amazing Success on an attack: +{c.floor} damage (Core p.59, 79).</div>
      </section>

      {sheet === 'damage' && <DamageSheet {...ctx} onClose={() => setSheet(null)} />}
      {sheet === 'addDebuff' && <AddEffectSheet {...ctx} initial="debuff" onClose={() => setSheet(null)} />}
      {sheet === 'addBuff' && <AddEffectSheet {...ctx} initial="buff" onClose={() => setSheet(null)} />}
      {sheet === 'rest' && (
        <Sheet title="Rest" onClose={() => setSheet(null)}>
          <div className="stack">
            {(Object.keys(REST_LABEL) as RestKind[]).map((k) => (
              <button key={k} className="option" onClick={() => { up((x) => rest(x, k)); toast(REST_LABEL[k]); setSheet(null) }}>
                <div>
                  <div className="t">{REST_LABEL[k]}</div>
                  <div className="small muted">{{
                    hour: 'Heal 1 slot and 5 Mana (outside combat).',
                    short: 'Heal 5 slots and half your Mana. Ends Minor Injury.',
                    long: 'Full Health and Mana. Ends Fatigued, Major and Long-Term Minor Injuries.',
                    fullDay: 'As a long rest, and ends Long-Term Major Injury.',
                  }[k]}</div>
                </div>
              </button>
            ))}
            <p className="small faint">Resting, Core p.94.</p>
          </div>
        </Sheet>
      )}
      {sheet && typeof sheet === 'object' && 'stat' in sheet && (
        <StatSheet {...ctx} stat={sheet.stat} onClose={() => setSheet(null)} />
      )}
      {sheet && typeof sheet === 'object' && 'effect' in sheet && (
        <EditEffectSheet {...ctx} effect={sheet.effect} onClose={() => setSheet(null)} />
      )}
      {sheet && typeof sheet === 'object' && 'info' in sheet && (
        <Sheet title={sheet.info} onClose={() => setSheet(null)}>
          <Breakdown total={sheet.total} />
        </Sheet>
      )}
    </div>
  )
}

/** Compact, use-only view of the Hotlist; editing stays on the Hotlist tab. */
function HotlistStrip(ctx: Ctx) {
  const { c, d, up } = ctx
  const { slotProps, ghost } = useSlotDrag((from, to) => up((x) => ({ ...x, hotlist: swapSlots(x.hotlist, from, to) })))
  const entries = c.hotlist.map((h, i) => ({ h, i })).filter((x): x is { h: HotlistEntry; i: number } => !!x.h)
  return (
    <section className="card span2 hotstrip-card">
      <div className="card-head">
        <h2>Hotlist</h2>
        <span className="small muted">{entries.length}/{HOTLIST_SIZE}</span>
        <button className="btn small ghost" onClick={() => go(`/c/${c.id}/hotlist`)}>Edit</button>
      </div>
      <div className="hotgrid">
        {c.hotlist.slice(0, HOTLIST_SIZE).map((h, i) => {
          if (!h) {
            const sp = slotProps(i, null)
            return (
              <button key={`e${i}`} {...sp} className={`hg-tile empty${sp.className}`} onClick={() => go(`/c/${c.id}/hotlist`)} aria-label={`Empty slot ${i + 1}: add on the Hotlist tab`}>
                <span className="hg-meta">{i + 1}</span>
              </button>
            )
          }
          const atk = hotlistAttack(ctx, h)
          const s = h.kind === 'spell' ? hotlistSkill(ctx, h) : undefined
          const cost = s ? s.customMana ?? findSkill(s.skillId)?.mana : undefined
          const out = h.kind === 'item' && h.consumable && h.qty <= 0
          const noMana = h.kind === 'spell' && (d.flags.cantCast || c.mana < (cost ?? 0))
          const verb = atk ? 'Attack' : h.kind === 'spell' ? 'Cast' : 'Use'
          const [toHit, dmg] = atk ? attackLine(ctx, atk).split(' · ') : []
          const costTag = h.kind === 'spell' && cost !== undefined
            ? <span className="hg-cost inline" aria-label={`${cost} Mana`}>{cost}M</span>
            : null
          // spells (attack or not) show their Mana cost on the first detail line, beside to-hit or "Spell"
          const meta = atk
            ? <><b>{toHit}</b>{costTag}<br />{dmg}</>
            : h.kind === 'spell' ? <>{costTag ?? <>&nbsp;</>}<br />Spell</>
            : h.kind === 'weapon' ? 'Attack' : `×${h.qty}`
          // not `disabled`: a disabled button can't be picked up and dragged
          const blocked = out || noMana || (!!atk && d.flags.cantAct)
          const sp = slotProps(i, h.name)
          return (
            <button key={h.uid} {...sp} className={`hg-tile hg-${atk ? 'attack' : h.kind}${h.kind === 'spell' ? ' hg-two' : ''}${blocked ? ' is-blocked' : ''}${sp.className}`} aria-disabled={blocked}
              onClick={() => { if (!blocked) triggerHotlist(ctx, h) }} aria-label={`${verb} ${h.name}, slot ${i + 1}`} title={`${verb} ${h.name}`}>
              <span className="hg-name">{h.name}</span>
              <span className="hg-meta num">{meta}</span>
            </button>
          )
        })}
      </div>
      {ghost}
    </section>
  )
}

function StatSheet({ c, d, stat, onClose }: Ctx & { stat: StatKey; onClose: () => void }) {
  const parts: Part[] = d.statParts[stat]
  return (
    <Sheet title={STAT_NAMES[stat]} onClose={onClose}>
      <div className="grid3 center" style={{ marginBottom: 10 }}>
        <div><div className="label">Unenhanced</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{d.unenhanced[stat]}</div></div>
        <div><div className="label">Enhanced</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{d.enhanced[stat]}</div></div>
        <div><div className="label">Mod</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{signed(d.mod[stat])}</div></div>
      </div>
      <Breakdown total={{ total: d.enhanced[stat], parts }} title="Score" />
      <button className="btn primary" style={{ width: '100%', marginTop: 12 }}
        onClick={() => openRoll({ kind: 'custom', charId: c.id, label: `${STAT_NAMES[stat]} Stat Check`, parts: [{ label: `${STAT_ABBR[stat]} Mod`, value: d.mod[stat] }, ...d.allChecks.parts], note: `Stat Check Difficulty: 10 + Floor = ${10 + c.floor} (Core p.59).` })}>
        Roll {STAT_ABBR[stat]} Stat Check
      </button>
      <p className="small faint">{stat === 'con' && 'Con Mod sets each Health Bar slot. '}{stat === 'int' && 'Enhanced Intelligence is your Max Mana. '}{stat === 'dex' && 'Dex Mod adds to Evade. '}Next Mod at {nextBand(d.enhanced[stat])}.</p>
    </Sheet>
  )
}

function nextBand(score: number) {
  const bands = [3, 6, 10, 20, 50, 100, 150, 200, 300]
  const next = bands.find((b) => b > score)
  return next ? `${next}` : 'max'
}
