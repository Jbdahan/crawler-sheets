import { useEffect, useState } from 'react'
import { STAT_ABBR, STAT_KEYS, STAT_NAMES, SIZES, findSkill } from '../data'
import { attackCalc, isAttackSkill } from '../engine/attacks'
import { checkBonus, derive, skillStat } from '../engine/derived'
import { HB_SLOTS } from '../engine/health'
import { GEAR_SLOTS, HOTLIST_SIZE, type Character } from '../engine/types'
import { signed } from '../components/ui'
import { describeMod } from '../sheets/ModEditor'
import { useCharacter } from '../store/characters'
import { go } from '../router'
import { Seg } from '../components/ui'
import { PortraitPages } from './PrintPortrait'
import './print.css'

type Layout = 'landscape' | 'portrait'

/** US Letter, laid out like the paper character sheets: landscape (4 pages) or portrait (4 pages). */
export function Print({ id, layout = 'landscape' }: { id: string; layout?: Layout }) {
  const c = useCharacter(id)
  const [scale, setScale] = useState(() => fitScale(layout))
  useEffect(() => {
    document.documentElement.classList.add('printing')
    const onResize = () => setScale(fitScale(layout))
    onResize()
    window.addEventListener('resize', onResize)
    // the paper orientation has to match the layout when printing or saving a PDF
    const page = document.createElement('style')
    page.textContent = `@media print { @page { size: letter ${layout}; margin: 0; } }`
    document.head.appendChild(page)
    return () => {
      document.documentElement.classList.remove('printing')
      window.removeEventListener('resize', onResize)
      page.remove()
    }
  }, [layout])
  if (!c) return <div className="app"><p>Crawler not found.</p></div>
  return (
    <div className="print-root" style={{ ['--pp-zoom' as string]: scale }}>
      <div className="print-bar no-print">
        <button className="btn" onClick={() => go(`/c/${id}/more`)}>‹ Back</button>
        <Seg value={layout} onChange={(v) => go(`/print/${id}${v === 'portrait' ? '/portrait' : ''}`)}
          options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} />
        <span className="grow small">US Letter, 100% scale. On iPhone: Share → Print, or pinch out on the preview to save a PDF.</span>
        <button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      {layout === 'portrait' ? <PortraitPages c={c} /> : <PrintPages c={c} />}
    </div>
  )
}

function PrintPages({ c }: { c: Character }) {
  const d = derive(c)
  const attacks = c.skills.filter((s) => isAttackSkill(s)).slice(0, 8)
  const debuffs = c.effects.filter((e) => e.kind === 'debuff' && e.active)
  const external = c.effects.filter((e) => e.kind === 'buff' && e.external && e.active)
  const skills = c.skills
  const inv = c.inventory
  const skillPages = Math.max(1, Math.ceil(skills.length / 20))
  const invPages = Math.max(1, Math.ceil(inv.length / 20))
  const alive = HB_SLOTS - c.health.lost
  return (
    <>
      <section className="pp">
        <div className="pp-head">
          <div className="brand">CRAWLER<br />SHEET</div>
          <div className="fields">
            <F k="Name" v={c.name} w={3} /><F k="Race" v={c.raceName ?? (c.species === 'animal' ? c.animalType || 'Animal' : 'Human')} w={2} /><F k="Gender/Pronouns" v={c.pronouns} w={2} />
            <F k="Level" v={c.level} /><F k="Crawler Number" v={c.crawlerNumber} w={2} /><F k="Class" v={c.className ?? ''} w={2} /><F k="Floor" v={c.floor} />
          </div>
        </div>
        <div className="pp-main">
          <div className="pp-stats">
            {STAT_KEYS.map((k) => (
              <div className="pp-stat" key={k}>
                <div className="t">{STAT_NAMES[k]}</div>
                <div className="sv"><span>{d.enhanced[k]}</span><span className="slash">/</span><span>{d.unenhanced[k]}</span></div>
                <div className="sl"><span>Enhanced</span><span>Unenhanced</span></div>
                <div className="mod">{STAT_ABBR[k].toUpperCase()} MOD <b>{signed(d.mod[k])}</b></div>
              </div>
            ))}
          </div>
          <div className="pp-center">
            <div className="pp-hb">
              {Array.from({ length: HB_SLOTS }, (_, i) => (
                <div key={i} className={`slot${i >= alive ? ' lost' : ''}`}><b>{d.hbSlot.total}</b><span>{(i + 1) * 10}%</span></div>
              ))}
            </div>
            <div className="pp-line">
              <span className="big">EVADE</span><span className="big">d20 +</span><Box v={signed(d.flags.noDexAttackEvade ? 0 : d.mod.dex)} l="DEX Mod" /> <span>+</span>
              <Box v={signed(d.evade.total - (d.flags.noDexAttackEvade ? 0 : d.mod.dex))} l="Buffs" w /> <span>=</span><Box v={signed(d.evade.total)} l="Evade Total" w />
              <Box v={d.move.total} l="Move" /><Box v={d.step} l="Step" />
            </div>
            <div className="pp-line">
              <span className="big">DAMAGE<br />RESISTANCE</span>
              <Box v={c.gear.reduce((a, g) => a + g.mods.filter((m) => m.target === 'dr').reduce((x, m) => x + m.value, 0), 0)} l="Armor" /> <span>+</span>
              <Box v={d.dr.total - c.gear.reduce((a, g) => a + g.mods.filter((m) => m.target === 'dr').reduce((x, m) => x + m.value, 0), 0)} l="Buffs" w /> <span>=</span>
              <Box v={d.dr.total} l="DR Total" w /><Box v={c.aiFavor} l="AI Favor" /><Box v={`${c.size} ${SIZES[c.size] ?? ''}`} l="Size" />
            </div>
            <div className="pp-line">
              <Box v={`${d.maxMana.total} / ${c.mana}`} l="Max Mana / Current" w />
              <div className="grow"><div className="lbl">Debuffs</div><div className="uline">{debuffs.map((e) => e.name + (e.stacks > 1 ? ` ×${e.stacks}` : '')).join(', ')}</div></div>
            </div>
          </div>
          <div className="pp-side">
            <div className="portrait">{c.portrait ? <img src={c.portrait} alt="" /> : <span>Portrait</span>}</div>
            <div className="lbl">External Buffs (Max 3)</div>
            {[0, 1, 2].map((i) => <div key={i} className="uline">{i + 1}. {external[i]?.name ?? ''}</div>)}
          </div>
        </div>
        <table className="pp-table">
          <thead><tr><th style={{ width: '24%' }}>Attack</th><th>To hit<br />Rank + Stat Mod</th><th>Damage<br />Dice + Stat Mod</th><th>Effects</th></tr></thead>
          <tbody>
            {Array.from({ length: Math.max(5, attacks.length) }, (_, i) => {
              const s = attacks[i]
              if (!s) return <tr key={i}><td /><td /><td /><td /></tr>
              const a = attackCalc(c, s, d)
              const stat = skillStat(s)
              return (
                <tr key={s.uid}>
                  <td><b>{s.name}</b>{a.mana !== undefined ? ` (${a.mana} Mana)` : ''}</td>
                  <td>{a.rank} + {stat ? `${STAT_ABBR[stat]} ${signed(stat === 'dex' && d.flags.noDexAttackEvade ? 0 : d.mod[stat])}` : '0'} = <b>{signed(a.toHit.total)}</b></td>
                  <td><b>{a.formula}</b> {a.types.join('/')}</td>
                  <td className="small">{[a.range, a.area, ...a.unlocked.map((u) => `R${u.rank}: ${u.text}`), `AS: +${c.floor} dmg`].filter(Boolean).join(' · ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="pp">
        <div className="pp-band">HOTLIST</div>
        <div className="pp-hot">
          {c.hotlist.slice(0, HOTLIST_SIZE).map((h, i) => (
            <div key={i} className="hs">{h && <><b>{h.name}</b>{h.kind !== 'spell' && <span> ×{h.qty}</span>}<div className="small">{h.kind === 'spell' ? `${findSkill(c.skills.find((s) => s.uid === h.skillUid)?.skillId)?.manaText ?? ''} Mana` : h.notes}</div></>}</div>
          ))}
        </div>
        <div className="pp-two">
          <div>
            <div className="pp-sub">GEAR SLOTS / TATTOOS / PATCHES</div>
            <table className="pp-table gear">
              <tbody>
                {GEAR_SLOTS.map((s) => {
                  const items = c.gear.filter((g) => g.slot === s.key)
                  return (
                    <tr key={s.key}>
                      <th>{s.label}{s.key === 'accessory' ? ' (Max 10)' : ''}</th>
                      <td>{items.map((g) => `${g.name}${g.mods.length ? ` (${g.mods.map(describeMod).join(', ')})` : ''}`).join('; ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="pp-boxes">
            <Area t="Popularity" v={String(c.popularity)} h={0.45} />
            <Area t="Past Trauma" v={c.story.trauma} />
            <Area t="Loose Ends" v={c.story.looseEnds} />
            <Area t="Regrets" v={c.story.regrets} />
            <Area t="Notes" v={[c.story.notes, c.deityId ? `Deity: ${c.deityId}${c.worshipTier ? ` (${c.worshipTier})` : ''}` : '', `Gold: ${c.gold} · Misc. Junk: ${c.miscJunk}`].filter(Boolean).join('\n')} h={1.3} />
          </div>
        </div>
      </section>

      {Array.from({ length: skillPages }, (_, p) => (
        <section className="pp" key={`s${p}`}>
          <div className="pp-band">SKILLS</div>
          <table className="pp-table">
            <thead><tr><th style={{ width: '26%' }}>Name</th><th>Rank</th><th>Stat &amp; Mod</th><th>Check Type</th><th style={{ width: '38%' }}>Notes &amp; Upgrades</th><th>✔</th></tr></thead>
            <tbody>
              {Array.from({ length: 20 }, (_, i) => {
                const s = skills[p * 20 + i]
                if (!s) return <tr key={i}><td /><td /><td /><td /><td /><td /></tr>
                const def = findSkill(s.skillId)
                const stat = skillStat(s)
                const unlocked = Object.entries(def?.upgrades ?? {}).filter(([r]) => Number(r) <= s.rank).map(([r]) => `R${r}`)
                return (
                  <tr key={s.uid}>
                    <td><b>{s.name}</b></td>
                    <td className="center">{s.rank}{s.max === 20 ? '/20' : ''}</td>
                    <td>{stat ? `${STAT_ABBR[stat]} ${signed(d.mod[stat])}` : 'None'} <span className="small">(d20 {signed(checkBonus(c, s, d).total)})</span></td>
                    <td>{def?.checkType ?? (stat ? '' : 'Passive')}</td>
                    <td className="small">{[s.notes, unlocked.length ? `Upgrades ${unlocked.join(', ')}` : '', def ? `p.${def.page}` : '', s.grindHours ? `${s.grindHours}h ground` : ''].filter(Boolean).join(' · ')}</td>
                    <td className="center">{s.marked ? '✔' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}

      {Array.from({ length: invPages }, (_, p) => (
        <section className="pp" key={`i${p}`}>
          <div className="pp-band">INVENTORY</div>
          <table className="pp-table">
            <thead><tr><th style={{ width: '30%' }}>Item</th><th style={{ width: '8%' }}>Quantity</th><th>Notes</th></tr></thead>
            <tbody>
              {Array.from({ length: 20 }, (_, i) => {
                const it = inv[p * 20 + i]
                return <tr key={i}><td>{it?.name}</td><td className="center">{it?.qty}</td><td className="small">{it?.notes}</td></tr>
              })}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}

/** 11in wide (landscape) or 8.5in wide (portrait) at 96 px/in; shrink the preview to fit narrow screens */
function fitScale(layout: Layout) {
  return Math.min(1, (window.innerWidth - 16) / (layout === 'portrait' ? 816 : 1056))
}

function F({ k, v, w = 1 }: { k: string; v: string | number; w?: number }) {
  return <div className="f" style={{ gridColumn: `span ${w}` }}><span className="k">{k}</span><span className="v">{v}</span></div>
}
function Box({ v, l, w }: { v: string | number; l: string; w?: boolean }) {
  return <div className={`bx${w ? ' w' : ''}`}><div className="bv">{v}</div><div className="bl">{l}</div></div>
}
function Area({ t, v, h = 1 }: { t: string; v: string; h?: number }) {
  return <div className="area" style={{ minHeight: `${h}in` }}><div className="at">{t}</div><div className="av">{v}</div></div>
}
