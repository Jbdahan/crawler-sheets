import { STAT_ABBR, STAT_NAMES, SIZES, findDeity, findSkill, type StatKey } from '../data'
import { attackCalc, isAttackSkill } from '../engine/attacks'
import { checkBonus, derive, skillStat } from '../engine/derived'
import { HB_SLOTS } from '../engine/health'
import { GEAR_SLOTS, HOTLIST_SIZE, type Character } from '../engine/types'
import { signed } from '../components/ui'
import { entryQty } from '../engine/inventory'
import { describeMod } from '../sheets/ModEditor'
import './print-portrait.css'

const SKILL_ROWS = 16
const INV_ROWS = 18
const OTHER_CRAWLERS = 8
/** the portrait paper sheet lists Stats in this order */
const PORTRAIT_STAT_ORDER: StatKey[] = ['str', 'dex', 'con', 'int', 'cha']

/** Portrait US Letter: sheet, skills + inventory, story, other crawlers. */
export function PortraitPages({ c }: { c: Character }) {
  const d = derive(c)
  const attacks = c.skills.filter((s) => isAttackSkill(s))
  const debuffs = c.effects.filter((e) => e.kind === 'debuff' && e.active)
  const external = c.effects.filter((e) => e.kind === 'buff' && e.external && e.active)
  const alive = HB_SLOTS - c.health.lost
  const armor = c.gear.reduce((a, g) => a + g.mods.filter((m) => m.target === 'dr').reduce((x, m) => x + m.value, 0), 0)
  const dexForEvade = d.flags.noDexAttackEvade ? 0 : d.mod.dex
  const pages = Math.max(1, Math.ceil(c.skills.length / SKILL_ROWS), Math.ceil(c.inventory.length / INV_ROWS))
  const attackPages = Math.max(1, Math.ceil(attacks.length / 5))
  const deity = findDeity(c.deityId)

  return (
    <>
      {/* Page 1: the sheet */}
      <section className="pt">
        <div className="pt-h">Health Bar</div>
        <div className="pt-hb">
          {Array.from({ length: HB_SLOTS }, (_, i) => (
            <div key={i} className={`s${i >= alive ? ' lost' : ''}`}><b>{d.hbSlot.total}</b><span>{(i + 1) * 10}%</span></div>
          ))}
        </div>

        <div className="pt-idrow">
          <div className="pt-ids">
            <div className="ir"><L k="Name" v={c.name} w={4} /><L k="Race" v={c.raceName ?? (c.species === 'animal' ? c.animalType || 'Animal' : 'Human')} w={3} /><L k="Gender" v={c.pronouns} w={2} /></div>
            <div className="ir"><L k="Crawler #" v={c.crawlerNumber} w={3} /><L k="Class" v={c.className ?? ''} w={3} /><L k="Floor" v={c.floor} w={1.5} /><L k="Level" v={c.level} w={1.5} /></div>
          </div>
          <div className="pt-mana">
            <div className="t">Mana</div>
            <div className="mc"><div><span>Max</span><b>{d.maxMana.total}</b></div><div><span>Current</span><b>{c.mana}</b></div></div>
          </div>
        </div>

        <div className="pt-statrow">
          {PORTRAIT_STAT_ORDER.map((k) => (
            <div key={k} className="pt-stat">
              <div className="t">{STAT_NAMES[k]}</div>
              <div className="r"><span>Enhanced</span><b>{d.enhanced[k]}</b></div>
              <div className="r"><span>Unenhanced</span><b>{d.unenhanced[k]}</b></div>
              <div className="r"><span>{STAT_ABBR[k].toUpperCase()} Mod</span><b>{signed(d.mod[k])}</b></div>
            </div>
          ))}
          <div className="pt-killed">
            <div className="t">Crawlers Killed</div>
            <div className="skull" aria-hidden="true">☠</div>
          </div>
        </div>

        <div className="pt-line">
          <span className="big">Evade: d20 +</span>
          <Bx v={signed(dexForEvade)} l="Dex Mod" /><span>+</span>
          <Bx v={signed(d.evade.total - dexForEvade)} l="Buffs" w /><span>=</span>
          <Bx v={signed(d.evade.total)} l="Evade Total" w />
          <span className="gap" />
          <Bx v={d.move.total} l="Move" /><Bx v={d.step} l="Step" />
        </div>
        <div className="pt-line">
          <span className="big">Damage<br />Resistance</span>
          <Bx v={armor} l="Armor" /><span>+</span>
          <Bx v={d.dr.total - armor} l="Buffs" w /><span>=</span>
          <Bx v={d.dr.total} l="DR Total" w />
          <span className="gap" />
          <Bx v={c.aiFavor} l="AI Favor" /><Bx v={`${c.size} ${SIZES[c.size] ?? ''}`} l="Size" />
        </div>

        <div className="pt-h">Attacks</div>
        <table className="pt-atk">
          <thead><tr><th>Name</th><th>To hit (Rank + Stat Mod)</th><th>Damage (Dice + Stat Mod)</th><th>Effects</th></tr></thead>
          <tbody>
            {Array.from({ length: 5 }, (_, i) => {
              const s = attacks[i]
              if (!s) return <tr key={i}><td /><td className="c">+</td><td className="c">+</td><td /></tr>
              const a = attackCalc(c, s, d)
              const stat = skillStat(s)
              const statMod = stat ? (stat === 'dex' && d.flags.noDexAttackEvade ? 0 : d.mod[stat]) : 0
              return (
                <tr key={s.uid}>
                  <td><b>{s.name}</b>{a.mana !== undefined ? ` (${a.mana} Mana)` : ''}</td>
                  <td className="c">{a.rank} + {signed(statMod)} = <b>{signed(a.toHit.total)}</b></td>
                  <td className="c"><b>{a.formula}</b> {a.types.join('/')}</td>
                  <td className="tiny">{[a.range, ...a.unlocked.map((u) => `R${u.rank}: ${u.text}`), `AS +${c.floor}`].filter(Boolean).join(' · ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="pt-bottom">
          <div>
            <div className="pt-h">Hotlist</div>
            <div className="pt-hot">
              {c.hotlist.slice(0, HOTLIST_SIZE).map((h, i) => (
                <div key={i} className="hs">
                  {h && <>
                    <b>{h.name}</b>{h.kind === 'item' && !h.gearUid && <span> ×{entryQty(c, h)}</span>}
                    <div className="tiny">{h.kind === 'spell'
                      ? `${findSkill(c.skills.find((s) => s.uid === h.skillUid)?.skillId)?.manaText ?? c.skills.find((s) => s.uid === h.skillUid)?.customMana ?? ''} Mana`
                      : h.notes}</div>
                  </>}
                </div>
              ))}
            </div>
          </div>
          <div className="pt-right">
            <div className="pt-h c">External Buffs (Max 3)</div>
            {[0, 1, 2].map((i) => <div key={i} className="ul">{i + 1}. {external[i]?.name ?? ''}</div>)}
            <div className="pt-h c" style={{ marginTop: '0.08in' }}>Debuffs</div>
            <div className="ul">{debuffs.map((e) => e.name + (e.stacks > 1 ? ` ×${e.stacks}` : '')).join(', ')}</div>
            <div className="pt-gear">
              <div className="pt-h c u">Gear/Tattoos/Patches</div>
              {GEAR_SLOTS.filter((s) => !['belt', 'cape'].includes(s.key)).map((s) => {
                const items = c.gear.filter((g) => g.slot === s.key || (s.key === 'accessory' && (g.slot === 'belt' || g.slot === 'cape')))
                return (
                  <div key={s.key} className={`gs${s.key === 'accessory' ? ' acc' : ''}`}>
                    <span className="k">{s.key === 'accessory' ? 'Accessories (Max 10)' : s.label}</span>{' '}
                    <span className="tiny">{items.map((g) => `${g.name}${g.mods.length ? ` (${g.mods.map(describeMod).join(', ')})` : ''}`).join('; ')}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* extra attacks beyond the 5 rows */}
      {attackPages > 1 && (
        <section className="pt">
          <div className="pt-h">Attacks (continued)</div>
          <table className="pt-atk">
            <thead><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Effects</th></tr></thead>
            <tbody>
              {attacks.slice(5).map((s) => {
                const a = attackCalc(c, s, d)
                return (
                  <tr key={s.uid}>
                    <td><b>{s.name}</b></td><td className="c"><b>{signed(a.toHit.total)}</b></td>
                    <td className="c"><b>{a.formula}</b> {a.types.join('/')}</td>
                    <td className="tiny">{a.unlocked.map((u) => `R${u.rank}: ${u.text}`).join(' · ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Page 2: skills + inventory */}
      {Array.from({ length: pages }, (_, p) => (
        <section className="pt" key={`si${p}`}>
          <div className="pt-h c">Skills</div>
          <table className="pt-tbl">
            <thead><tr><th style={{ width: '23%' }}>Name</th><th>Rank</th><th>Stat &amp; Mod</th><th>Check Type</th><th style={{ width: '36%' }}>Notes &amp; Upgrades</th><th>✓</th></tr></thead>
            <tbody>
              {Array.from({ length: SKILL_ROWS }, (_, i) => {
                const s = c.skills[p * SKILL_ROWS + i]
                if (!s) return <tr key={i}><td /><td /><td /><td /><td /><td /></tr>
                const def = findSkill(s.skillId)
                const stat = skillStat(s)
                const ups = Object.keys(def?.upgrades ?? {}).filter((r) => Number(r) <= s.rank).map((r) => `R${r}`)
                return (
                  <tr key={s.uid}>
                    <td><b>{s.name}</b></td>
                    <td className="c">{s.rank}</td>
                    <td>{stat ? `${STAT_ABBR[stat]} ${signed(d.mod[stat])}` : 'None'} <span className="tiny">(d20 {signed(checkBonus(c, s, d).total)})</span></td>
                    <td>{def?.checkType ?? (stat ? '' : 'Passive')}</td>
                    <td className="tiny">{[ups.length ? `Upgrades ${ups.join(', ')}` : '', s.notes.slice(0, 90), def ? `p.${def.page}` : ''].filter(Boolean).join(' · ')}</td>
                    <td className="c">{s.marked ? '✓' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="pt-h c" style={{ marginTop: '0.12in' }}>Inventory</div>
          <table className="pt-tbl">
            <thead><tr><th style={{ width: '38%' }}>Item</th><th style={{ width: '9%' }}>Quantity</th><th>Notes</th></tr></thead>
            <tbody>
              {Array.from({ length: INV_ROWS }, (_, i) => {
                const it = c.inventory[p * INV_ROWS + i]
                return <tr key={i}><td>{it?.name}</td><td className="c">{it?.qty}</td><td className="tiny">{it?.notes}</td></tr>
              })}
            </tbody>
          </table>
        </section>
      ))}

      {/* Page 3: story */}
      <section className="pt">
        <div className="pt-h">Before the Dungeon</div>
        <Area t="Past Trauma" v={c.story.trauma} h={0.6} />
        <Area t="Loose Ends" v={c.story.looseEnds} h={0.6} />
        <Area t="Regrets" v={c.story.regrets} h={0.6} />
        <Area t="Other Details/Notes" v={c.story.notes} h={1.2} />
        <div className="pt-h" style={{ marginTop: '0.1in' }}>Dungeon World (In the Dungeon)</div>
        <Area t="Popularity" v={c.popularity ? c.popularity.toLocaleString('en-US') : ''} h={0.6} />
        <Area t="Clubs, Societies, and Guilds" v="" h={0.9} />
        <Area t="Deities/Gods" v={deity ? `${deity.name}${c.worshipTier ? `: ${c.worshipTier}` : ''}` : ''} h={1.2} />
        <Area t="Sponsors" v="" h={1.7} />
      </section>

      {/* Page 4: other crawlers, to fill in by hand */}
      <section className="pt">
        <div className="pt-h c">Other Crawlers</div>
        <div className="pt-others">
          {Array.from({ length: OTHER_CRAWLERS }, (_, i) => (
            <div key={i} className="oc">
              <div className="n">{i + 1}</div>
              <div className="g">
                <div className="r3"><span>Name:</span><span>Crawler Number:</span><span>Gender/Pronouns:</span></div>
                <div className="r2"><span>Race:</span><span>Class:</span><span>Level:</span></div>
                <div className="r1"><span>Notes:</span></div>
                <div className="r1" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function L({ k, v, w = 1 }: { k: string; v: string | number; w?: number }) {
  return <div className="l" style={{ flex: w }}><span className="k">{k}:</span><span className="v">{v}</span></div>
}
function Bx({ v, l, w }: { v: string | number; l: string; w?: boolean }) {
  return <div className={`bx${w ? ' w' : ''}`}><div className="bv">{v}</div><div className="bl">{l}</div></div>
}
function Area({ t, v, h }: { t: string; v: string; h: number }) {
  return <div className="pt-area" style={{ minHeight: `${h}in` }}><div className="at">{t}</div><div className="av">{v}</div></div>
}
