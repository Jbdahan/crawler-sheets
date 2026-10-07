import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DAMAGE_TYPES, ITEMS, SKILLS, SPELLS, STAT_KEYS, STAT_NAMES, findSkill } from '../data'
import { LOOT } from '../data/loot'
import { AMMO_NOUN, ammoNoun } from '../engine/ammo'
import { AmmoSelect } from '../components/AmmoSelect'
import { AmmoDebuffFields } from '../components/AmmoDebuffFields'
import QRCode from 'qrcode'
import { uid } from '../engine/advancement'
import { claimUrl } from '../engine/lootclaim'
import { GEAR_SLOTS } from '../engine/types'
import {
  LOOT_CATEGORIES, LOOT_TIERS, UPGRADE_RANKS, itemsTitle, MOD_TARGETS, TYPED_TARGETS, lootBoxHtml, lootBoxText,
  type LootBox as Box, type LootMod, type LootRow, type LootRowType,
} from '../engine/lootbox'
import { Icon, Seg, toast } from '../components/ui'
import { go } from '../router'

const STATS = STAT_KEYS.map((k) => STAT_NAMES[k])
const SLOTS = [...GEAR_SLOTS.map((s) => s.label), 'Weapon']
const ITEM_NAMES = ITEMS.map((i) => i.name)
const SPELL_LIST = [...SPELLS].sort((a, b) => a.name.localeCompare(b.name))
const KIND_GROUP: Record<string, string> = { attack: 'Other Attack Skills', damageEffect: 'Other Damage Effect Skills', utility: 'Utility Skills' }
const SKILL_GROUPS = (() => {
  const groups = new Map<string, string[]>()
  for (const s of SKILLS) {
    const g = s.group ?? KIND_GROUP[s.kind] ?? 'Other Skills'
    groups.set(g, [...(groups.get(g) ?? []), s.name])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, names]) => [g, names.sort()] as const)
})()

const ROW_TYPES: { value: LootRowType; label: string }[] = [
  { value: 'stat', label: 'Stat boost' },
  { value: 'skill', label: 'Skill' },
  { value: 'spell', label: 'Spell' },
  { value: 'gear', label: 'Gear / equipment' },
  { value: 'defense', label: 'Defense (DR, Evade, Resistance…)' },
  { value: 'consumable', label: 'Potion / consumable' },
  { value: 'ammo', label: 'Ammunition (arrows, bolts…)' },
  { value: 'gold', label: 'Gold' },
  { value: 'custom', label: 'Custom (homebrew spell or item)' },
]

function newRow(type: LootRowType): LootRow {
  switch (type) {
    case 'stat': return { type, stat: STATS[0], value: 1 }
    case 'skill': return { type, mode: 'boost', skill: '', value: 1 }
    case 'spell': return { type, prefix: 'Spell Tome', spell: '', mana: '' }
    case 'gear': return { type, name: '', slot: SLOTS[0], mods: [], condition: '' }
    case 'defense': return { type, target: 'dr', value: 1, dtype: DAMAGE_TYPES[0] }
    case 'consumable': return { type, item: ITEM_NAMES[0], qty: 1 }
    case 'ammo': return { type, weapon: 'crossbow', prefix: 'Fire', qty: 10, ...AMMO_TEMPLATES.find((t) => t.ammoPrefix === 'Fire')?.ammo }
    case 'gold': return { type, value: 100 }
    case 'custom': return { type, kind: 'object', name: '', mana: '', effect: '' }
  }
}

/** The GM-made ammo templates from the Inventory loot catalog (Fire, Frost, Explosive…). */
const AMMO_TEMPLATES = LOOT.filter((l) => l.kind === 'ammo')

interface Draft {
  name: string
  description: string
  tier: string
  category: string
  customReward: string
  image?: { src: string; width: number }
  rows: LootRow[]
  /** identifies this loot box in claim links, so a crawler can't claim it twice */
  claimId: string
  /** put the claim link at the bottom of the Google Docs copy */
  includeLink: boolean
  /** a full achievement + loot box, or just item(s) */
  mode: 'achievement' | 'items'
  /** optional heading and description for item mode */
  itemTitle: string
  itemDescription: string
}
const empty = (): Draft => ({ name: '', description: '', tier: 'Bronze', category: 'Adventurer', customReward: '', rows: [], claimId: uid(), includeLink: true, mode: 'achievement', itemTitle: '', itemDescription: '' })
const KEY = 'lootbox.draft'

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...JSON.parse(raw) }
  } catch { /* private mode or bad JSON */ }
  return empty()
}

const num = (v: string) => Number(v.replace(/[^\d-]/g, '')) || 0

/** Shrink an uploaded picture so it pastes quickly and fits in the saved draft. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')) }
    img.src = url
  })
}

async function copyToClipboard(html: string | null, text: string): Promise<boolean> {
  try {
    if (html && navigator.clipboard && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      return true
    }
    if (!html && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall back below (e.g. plain HTTP on the LAN) */ }
  const el = document.createElement('div')
  el.contentEditable = 'true'
  el.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;color:#000'
  if (html) el.innerHTML = html
  else el.textContent = text
  document.body.appendChild(el)
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  sel?.removeAllRanges()
  el.remove()
  return ok
}

export function LootBox() {
  const [d, setD] = useState<Draft>(loadDraft)
  const [picMode, setPicMode] = useState<'none' | 'upload' | 'url'>(d.image ? (d.image.src.startsWith('data:') ? 'upload' : 'url') : 'none')

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* quota: draft just isn't saved */ }
  }, [d])

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const setRow = (i: number, r: LootRow) => setD((x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? r : y)) }))
  const moveRow = (i: number, to: number) => setD((x) => {
    const rows = [...x.rows]
    rows.splice(to, 0, rows.splice(i, 1)[0])
    return { ...x, rows }
  })

  const itemsMode = d.mode === 'items'
  const box: Box = useMemo(() => ({
    itemsOnly: d.mode === 'items',
    name: d.mode === 'items' ? d.itemTitle : d.name,
    description: d.mode === 'items' ? d.itemDescription : d.description,
    reward: d.category === '__custom' ? d.customReward : [d.tier, d.category, 'Box'].filter(Boolean).join(' '),
    image: d.image?.src && d.mode !== 'items' ? d.image : undefined,
    rows: d.rows,
  }), [d])
  const link = useMemo(() => claimUrl(d.mode === 'items'
    ? { v: 1, id: d.claimId, items: true, name: d.itemTitle.trim() || itemsTitle(d.rows), description: d.itemDescription.trim(), reward: '', rows: d.rows }
    : { v: 1, id: d.claimId, name: d.name.trim(), description: d.description.trim(), reward: box.reward.trim(), rows: d.rows }), [d, box.reward])
  const ready = itemsMode ? !!itemsTitle(d.rows) : !!d.name.trim()
  const html = useMemo(() => lootBoxHtml({ ...box, claimUrl: d.includeLink ? link : undefined }), [box, link, d.includeLink])
  // QR codes top out near 2,900 characters; keep the image paired with the link it encodes
  const [qrFor, setQrFor] = useState<{ link: string; src: string } | null>(null)
  useEffect(() => {
    if (link.length > 2900) return
    QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: 'L' }).then((src) => setQrFor({ link, src })).catch(() => {})
  }, [link])
  const qr = qrFor?.link === link ? qrFor.src : null

  const copy = async (rich: boolean) => {
    if (!ready) { toast(itemsMode ? 'Fill in the item first' : 'Give the achievement a name first'); return }
    const ok = await copyToClipboard(rich ? html : null, lootBoxText({ ...box, claimUrl: d.includeLink ? link : undefined }))
    toast(ok ? (rich ? 'Copied! Now paste it into your Google Doc' : 'Copied as plain text') : "Couldn't copy. Select the preview and copy it by hand")
  }

  const onUpload = async (f?: File) => {
    if (!f) return
    try { set({ image: { src: await resizeImage(f), width: d.image?.width ?? 250 } }) } catch { toast("That file isn't a picture") }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go('/')} aria-label="Back">‹</button>
        <div className="title"><h1>Loot Box Maker</h1><div className="sub">For GMs · build an achievement, then paste it into Google Docs</div></div>
      </div>

      <div className="card howto">
        <h2>How it works</h2>
        <ol>
          <li><b>Name the achievement</b> and write what the System AI says about it. Then pick the kind of box.</li>
          <li><b>Add what's inside</b> with <i>+ Add item</i>. Pick Stats, Skills, Spells, gear and potions from the lists. For anything homebrew, choose <i>Custom</i>: a spell with a Mana cost, or an object with a special rule.</li>
          <li><b>Tap “Copy for Google Docs”</b>, open your Doc and paste. Use <kbd>Ctrl</kbd>+<kbd>V</kbd> on Windows, <kbd>⌘</kbd>+<kbd>V</kbd> on a Mac, or press and hold → Paste on a phone or iPad. The bold, italics, bullets and picture come with it.</li>
        </ol>
        <p className="small muted">Just need one custom Skill, Spell or piece of gear? Choose <i>Just an item</i> below to skip the achievement. Want players to add the loot to their character sheets? See the last step. Nothing to install and no sign-in. Your draft stays on this device until you tap <i>Start over</i>.</p>
      </div>

      <div className="card stack">
        <div className="label">What are you making?</div>
        <Seg value={d.mode} onChange={(mode) => setD((x) => ({ ...x, mode, rows: mode === 'items' && !x.rows.length ? [newRow('custom')] : x.rows }))} options={[
          { value: 'achievement', label: 'Achievement + loot box' },
          { value: 'items', label: 'Just an item' },
        ]} />
        {itemsMode && <p className="small muted">Make one or more items with no achievement around them, like a custom Spell, a homebrew Skill or a piece of gear. Use <i>Custom</i> or the Skill list's <i>Custom skill…</i> for anything not in the book.</p>}
      </div>

      {!itemsMode && <>
      <div className="card stack">
        <h2>1 · Achievement</h2>
        <label><span className="label">Achievement name</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Toe Stubber" />
        </label>
        <label><span className="label">What the System AI says (the snark)</span>
          <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Congratulations, Crawler! You have…" />
        </label>
        <div>
          <div className="label">Reward (type of box)</div>
          <div className="grid2" style={{ marginTop: 4 }}>
            <select value={d.tier} onChange={(e) => set({ tier: e.target.value })} disabled={d.category === '__custom'} aria-label="Box tier">
              <option value="">(no tier)</option>
              {LOOT_TIERS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select value={d.category} onChange={(e) => set({ category: e.target.value })} aria-label="Box category">
              <option value="">(no category)</option>
              {LOOT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              <option value="__custom">Custom name…</option>
            </select>
          </div>
          {d.category === '__custom' && (
            <input style={{ marginTop: 8 }} value={d.customReward} onChange={(e) => set({ customReward: e.target.value })} placeholder="e.g. Fan Box of Questionable Origins" />
          )}
        </div>
      </div>

      <div className="card stack">
        <h2>Picture <span className="small muted">(optional)</span></h2>
        <div className="seg">
          {(['none', 'upload', 'url'] as const).map((m) => (
            <button key={m} type="button" className={picMode === m ? 'on' : ''}
              onClick={() => { setPicMode(m); if (m === 'none') set({ image: undefined }) }}>
              {m === 'none' ? 'No picture' : m === 'upload' ? 'Upload' : 'Web link'}
            </button>
          ))}
        </div>
        {picMode === 'upload' && <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />}
        {picMode === 'url' && (
          <input type="url" value={d.image?.src.startsWith('data:') ? '' : d.image?.src ?? ''} placeholder="https://…/loot-box.png"
            onChange={(e) => set({ image: { src: e.target.value.trim(), width: d.image?.width ?? 250 } })} />
        )}
        {picMode !== 'none' && d.image?.src && (
          <label><span className="label">Size in the Doc: {d.image.width}px</span>
            <input type="range" min={150} max={450} step={10} value={d.image.width}
              onChange={(e) => set({ image: { ...d.image!, width: Number(e.target.value) } })} />
          </label>
        )}
      </div>
      </>}

      <div className="card stack">
        <h2>{itemsMode ? '1 · The item' : "2 · What's inside"}</h2>
        {itemsMode && (
          <label><span className="label">Title (optional)</span>
            <input value={d.itemTitle} onChange={(e) => set({ itemTitle: e.target.value })} placeholder="e.g. Found in the Goblin's Stash" />
          </label>
        )}
        {itemsMode && (
          <label><span className="label">Description (optional)</span>
            <textarea value={d.itemDescription} onChange={(e) => set({ itemDescription: e.target.value })} placeholder="e.g. It smells faintly of socks. The System AI is not impressed." />
          </label>
        )}
        {d.rows.length === 0 && <div className="empty">Nothing yet. Tap <b>+ Add item</b> below.</div>}
        {d.rows.map((r, i) => (
          <div key={i} className="loot-row">
            <div className="row">
              <select className="grow" value={r.type} onChange={(e) => setRow(i, newRow(e.target.value as LootRowType))} aria-label="Item type">
                {ROW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="btn icon ghost" disabled={i === 0} onClick={() => moveRow(i, i - 1)} aria-label="Move up">↑</button>
              <button className="btn icon ghost" disabled={i === d.rows.length - 1} onClick={() => moveRow(i, i + 1)} aria-label="Move down">↓</button>
              <button className="btn icon ghost" onClick={() => setD((x) => ({ ...x, rows: x.rows.filter((_, j) => j !== i) }))} aria-label="Remove">✕</button>
            </div>
            <RowFields row={r} onChange={(x) => setRow(i, x)} />
          </div>
        ))}
        <button className="btn" onClick={() => setD((x) => ({ ...x, rows: [...x.rows, newRow(x.mode === 'items' ? 'custom' : 'stat')] }))}><Icon name="plus" size={18} /> {itemsMode ? 'Add another item' : 'Add item'}</button>
      </div>

      <div className="card stack">
        <h2>{itemsMode ? '2' : '3'} · Preview &amp; copy</h2>
        <div className="paper" dangerouslySetInnerHTML={{ __html: html }} />
        <button className="btn primary" onClick={() => copy(true)}>Copy for Google Docs</button>
        <div className="grid2">
          <button className="btn" onClick={() => copy(false)}>Copy as plain text</button>
          <button className="btn danger" onClick={() => { setD((x) => ({ ...empty(), mode: x.mode, rows: x.mode === 'items' ? [newRow('custom')] : [] })); setPicMode('none') }}>Start over</button>
        </div>
        <p className="small muted">Plain text is handy for Discord or a text message.</p>
      </div>

      <div className="card stack">
        <h2>{itemsMode ? '3' : '4'} · Let players add it to their sheet</h2>
        <p className="small muted">
          Players open the claim link (or scan the code) in Crawler Sheets, pick their crawler, and approve each reward one by one.
          Stats, Skills, Spells, gear, potions and gold go straight onto their sheet, and every change is logged in their History with {itemsMode ? '“From GM” as the source' : 'this achievement as the source'}.
          {!itemsMode && ' The picture isn\'t included in the link.'}
        </p>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" checked={d.includeLink} onChange={(e) => set({ includeLink: e.target.checked })} />
          <span>Put the claim link at the bottom of the Google Docs copy</span>
        </label>
        <button className="btn" disabled={!ready} onClick={async () => {
          const ok = await copyToClipboard(null, link)
          toast(ok ? 'Claim link copied' : "Couldn't copy the link")
        }}>Copy claim link only</button>
        {qr && ready && (
          <div className="center">
            <img src={qr} alt="QR code that opens this loot box in Crawler Sheets" style={{ width: 200, height: 200, background: '#fff', borderRadius: 8, padding: 6 }} />
            <div className="small muted">Players at the table can scan this with their phone camera.</div>
          </div>
        )}
      </div>
    </div>
  )
}

const ATTACK_SKILLS = SKILLS.filter((s) => s.kind === 'attack').sort((a, b) => a.name.localeCompare(b.name))

/** A loot weapon: the Attack Skill it uses, plus its own damage die, modifier, type and range. */
function LootWeaponFields({ row: r, onChange }: { row: Extract<LootRow, { type: 'gear' }>; onChange: (r: LootRow) => void }) {
  const def = findSkill(r.skillId)
  const w = r.weapon ?? {}
  const set = (patch: Partial<NonNullable<typeof r.weapon>>) => {
    const next = { ...w, ...patch }
    const has = !!next.dice?.trim() || !!next.bonus || !!next.dtype || !!next.range?.trim() || !!next.ammo?.trim()
    onChange({ ...r, weapon: has ? next : undefined })
  }
  const baseDie = def?.damage ? `${def.damage.count}d${def.damage.sides}` : ''
  const baseRange = def?.range ?? (def?.attackType === 'melee' ? 'Melee 5ft' : '')
  return (
    <>
      <Field label="Weapon Skill (attacks use its Rank)">
        <select value={r.skillId ?? ''} aria-label="Weapon Skill" onChange={(e) => onChange({ ...r, skillId: e.target.value || undefined, ...(e.target.value ? {} : { weapon: undefined }) })}>
          <option value="">Not a weapon</option>
          {ATTACK_SKILLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      {def && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Optional: give it its own damage and range. Blank fields use the {def.name} Skill's ({[baseDie, def.damage?.types.join('/'), baseRange].filter(Boolean).join(', ')}).
          </p>
          <div className="grid2">
            <Field label="Damage die"><input aria-label="Damage die" placeholder={`e.g. ${baseDie || '1d8'}`} value={w.dice ?? ''} onChange={(e) => set({ dice: e.target.value.replace(/\s+/g, '') || undefined })} /></Field>
            <Field label="Modifier"><input aria-label="Damage modifier" inputMode="numeric" placeholder="e.g. +2" value={w.bonus ? String(w.bonus) : ''} onChange={(e) => set({ bonus: num(e.target.value) || undefined })} /></Field>
          </div>
          <div className="grid2">
            <Field label="Damage type">
              <select aria-label="Damage type" value={w.dtype ?? ''} onChange={(e) => set({ dtype: e.target.value || undefined })}>
                <option value="">Same as Skill{def.damage?.types.length ? ` (${def.damage.types.join('/')})` : ''}</option>
                {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Range"><input aria-label="Range" placeholder={baseRange || 'e.g. Melee 10ft'} value={w.range ?? ''} onChange={(e) => set({ range: e.target.value || undefined })} /></Field>
          </div>
          <AmmoSelect label="Fires ammo" value={w.ammo} none={r.skillId && r.skillId in AMMO_NOUN ? `Same as Skill (${AMMO_NOUN[r.skillId]})` : 'No ammo'}
            onChange={(ammo) => set({ ammo })} />
        </>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function NumInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <input inputMode="numeric" aria-label={label} style={{ width: 80, flex: '0 0 80px' }} value={String(value)} onChange={(e) => onChange(num(e.target.value))} />
}

const SKILL_NAMES = new Set(SKILLS.map((s) => s.name))
const CUSTOM = '__custom'

/** Catalog Skills plus "Custom skill…", which swaps in a text box for homebrew names. */
function SkillSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [picked, setPicked] = useState(false)
  const custom = picked || (!!value && !SKILL_NAMES.has(value))
  return (
    <div className="grow" style={{ display: 'grid', gap: 6 }}>
      <select value={custom ? CUSTOM : value} aria-label="Skill" onChange={(e) => {
        const v = e.target.value
        setPicked(v === CUSTOM)
        onChange(v === CUSTOM ? '' : v)
      }}>
        <option value="">Choose a skill…</option>
        {SKILL_GROUPS.map(([g, names]) => (
          <optgroup key={g} label={g}>{names.map((n) => <option key={n}>{n}</option>)}</optgroup>
        ))}
        <option value={CUSTOM}>Custom skill…</option>
      </select>
      {custom && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Skill name, e.g. Mimic Wrangling" aria-label="Custom skill name" autoFocus />}
    </div>
  )
}

function RowFields({ row: r, onChange }: { row: LootRow; onChange: (r: LootRow) => void }) {
  switch (r.type) {
    case 'stat':
      return (
        <div className="row">
          <select className="grow" value={r.stat} onChange={(e) => onChange({ ...r, stat: e.target.value })} aria-label="Stat">
            {STATS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <NumInput label="Amount" value={r.value} onChange={(value) => onChange({ ...r, value })} />
        </div>
      )
    case 'skill':
      return (
        <>
          <select value={r.mode} onChange={(e) => onChange({ ...r, mode: e.target.value as 'boost' | 'learn' })} aria-label="Skill reward">
            <option value="boost">Raise a Skill by some Ranks</option>
            <option value="learn">Learn a new Skill at a Rank</option>
          </select>
          <div className="row">
            <SkillSelect value={r.skill} onChange={(skill) => onChange({ ...r, skill })} />
            <NumInput label="Ranks" value={r.value} onChange={(value) => onChange({ ...r, value })} />
          </div>
        </>
      )
    case 'spell':
      return (
        <>
          <select value={r.prefix} onChange={(e) => onChange({ ...r, prefix: e.target.value })} aria-label="Spell reward">
            <option>Spell Tome</option><option>Learn</option><option>Scroll</option>
          </select>
          <div className="row">
            <select className="grow" value={r.spell} aria-label="Spell" onChange={(e) => {
              if (e.target.value === CUSTOM) { onChange({ ...newRow('custom'), kind: 'spell' } as LootRow); return }
              const s = SPELL_LIST.find((x) => x.name === e.target.value)
              onChange({ ...r, spell: e.target.value, mana: s?.manaText ?? (s?.mana != null ? String(s.mana) : '') })
            }}>
              <option value="">Choose a spell…</option>
              {SPELL_LIST.map((s) => <option key={s.id} value={s.name}>{s.name}{s.manaText && s.manaText !== 'None' ? ` (${s.manaText} Mana)` : ''}</option>)}
              <option value={CUSTOM}>Custom spell…</option>
            </select>
            <input aria-label="Mana cost" placeholder="Mana" style={{ width: 80, flex: '0 0 80px' }} value={r.mana} onChange={(e) => onChange({ ...r, mana: e.target.value })} />
          </div>
        </>
      )
    case 'gear': {
      const setMod = (i: number, m: LootMod) => onChange({ ...r, mods: r.mods.map((x, j) => (j === i ? m : x)) })
      return (
        <>
          <div className="row">
            <input className="grow" value={r.name} onChange={(e) => onChange({ ...r, name: e.target.value })} placeholder="Item name, e.g. Enchanted Bigboi Boxers" aria-label="Item name" />
          </div>
          <select value={r.slot} aria-label="Slot" onChange={(e) => {
            const slot = e.target.value
            // only hand-held items can be weapons
            onChange(slot === 'Weapon' || slot === 'Hands/Holding' ? { ...r, slot } : { ...r, slot, skillId: undefined, weapon: undefined })
          }}>
            <option value="">(no slot)</option>
            {SLOTS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {(r.slot === 'Weapon' || r.slot === 'Hands/Holding') && <LootWeaponFields row={r} onChange={onChange} />}
          {r.mods.map((m, i) => (
            <div key={i} className="row">
              <select style={{ flex: '1 1 0' }} value={m.target} aria-label="Bonus type" onChange={(e) => {
                const target = e.target.value as LootMod['target']
                setMod(i, { target, value: m.value || 1, arg: target === 'stat' ? STATS[0] : TYPED_TARGETS[target] ? DAMAGE_TYPES[0] : '' })
              }}>
                {MOD_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {m.target === 'stat' && (
                <select style={{ flex: '1 1 0' }} value={m.arg} onChange={(e) => setMod(i, { ...m, arg: e.target.value })} aria-label="Stat">
                  {STATS.map((s) => <option key={s}>{s}</option>)}
                </select>
              )}
              {m.target === 'skill' && <SkillSelect value={m.arg} onChange={(arg) => setMod(i, { ...m, arg })} />}
              {TYPED_TARGETS[m.target] ? (
                <select style={{ flex: '1 1 0' }} value={m.arg} onChange={(e) => setMod(i, { ...m, arg: e.target.value })} aria-label="Damage type">
                  {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              ) : (
                <NumInput label="Amount" value={m.value} onChange={(value) => setMod(i, { ...m, value })} />
              )}
              <button className="btn icon ghost" onClick={() => onChange({ ...r, mods: r.mods.filter((_, j) => j !== i) })} aria-label="Remove bonus">✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => onChange({ ...r, mods: [...r.mods, { target: 'dr', arg: '', value: 1 }] })}>+ Add a bonus</button>
          <Field label="Special condition (optional)">
            <input value={r.condition} onChange={(e) => onChange({ ...r, condition: e.target.value })} placeholder="e.g. Wearer can't be tripped" />
          </Field>
        </>
      )
    }
    case 'defense':
      return (
        <div className="row">
          <select className="grow" value={r.target} onChange={(e) => onChange({ ...r, target: e.target.value as typeof r.target })} aria-label="Defense">
            <option value="dr">DR (Damage Resistance)</option>
            <option value="evade">Evade</option>
            <option value="resist">Resistance to…</option>
            <option value="immune">Immunity to…</option>
            <option value="vuln">Vulnerability to…</option>
          </select>
          {r.target === 'dr' || r.target === 'evade' ? (
            <NumInput label="Amount" value={r.value} onChange={(value) => onChange({ ...r, value })} />
          ) : (
            <select className="grow" value={r.dtype} onChange={(e) => onChange({ ...r, dtype: e.target.value })} aria-label="Damage type">
              {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
        </div>
      )
    case 'consumable': {
      const listed = ITEM_NAMES.includes(r.item)
      return (
        <>
          <div className="row">
            <select className="grow" value={listed ? r.item : '__other'} aria-label="Item"
              onChange={(e) => onChange({ ...r, item: e.target.value === '__other' ? '' : e.target.value })}>
              {ITEM_NAMES.map((n) => <option key={n}>{n}</option>)}
              <option value="__other">Something else…</option>
            </select>
            <NumInput label="How many" value={r.qty} onChange={(qty) => onChange({ ...r, qty })} />
          </div>
          {!listed && <input value={r.item} onChange={(e) => onChange({ ...r, item: e.target.value })} placeholder="Item name" aria-label="Item name" />}
        </>
      )
    }
    case 'ammo': {
      const set = (patch: Partial<typeof r>) => onChange({ ...r, ...patch })
      const tpl = AMMO_TEMPLATES.find((t) => (t.ammoPrefix ?? '') === r.prefix)
      return (
        <>
          <div className="row">
            <select className="grow" aria-label="Ammo template" value={tpl ? tpl.id : '__custom'}
              onChange={(e) => {
                const t = AMMO_TEMPLATES.find((x) => x.id === e.target.value)
                if (t) onChange({ type: 'ammo', weapon: r.weapon, qty: r.qty, prefix: t.ammoPrefix ?? '', ...t.ammo })
              }}>
              {AMMO_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.ammoPrefix || 'Basic'}</option>)}
              {!tpl && <option value="__custom">Custom</option>}
            </select>
            <NumInput label="How many" value={r.qty} onChange={(qty) => set({ qty })} />
          </div>
          <AmmoSelect label="Ammo type (fired by)" value={r.weapon} onChange={(weapon) => set({ weapon: weapon ?? '' })} />
          <Field label={`Name (before “${ammoNoun(r.weapon)}”)`}>
            <input value={r.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="e.g. Exploding Goblin" aria-label="Ammo name" />
          </Field>
          <div className="row">
            <Field label="Extra dice"><input aria-label="Extra dice" value={r.dice ?? ''} placeholder="e.g. 1d6" onChange={(e) => set({ dice: e.target.value.trim() || undefined })} /></Field>
            <Field label="Damage type">
              <select aria-label="Damage type" value={r.dtype ?? ''} onChange={(e) => set({ dtype: e.target.value || undefined })}>
                <option value="">Same as weapon</option>
                {DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="row">
            <Field label="To hit bonus"><NumInput label="To hit bonus" value={r.toHit ?? 0} onChange={(v) => set({ toHit: v || undefined })} /></Field>
            <Field label="Damage bonus"><NumInput label="Damage bonus" value={r.damage ?? 0} onChange={(v) => set({ damage: v || undefined })} /></Field>
          </div>
          <AmmoDebuffFields value={r} onChange={set} />
          <p className="small faint" style={{ margin: 0 }}>The book has no ammo table (Core p.181), so these are house rules. Claimed ammo loads on the weapon's attack card; each Attack fires one.</p>
        </>
      )
    }
    case 'gold':
      return <Field label="Amount of gold"><input inputMode="numeric" value={String(r.value)} onChange={(e) => onChange({ ...r, value: num(e.target.value) })} /></Field>
    case 'custom':
      return (
        <>
          <select value={r.kind} onChange={(e) => onChange({ ...r, kind: e.target.value as typeof r.kind })} aria-label="Custom kind">
            <option value="object">Object with a special condition</option>
            <option value="spell">Spell</option>
            <option value="other">Something else</option>
          </select>
          <input value={r.name} onChange={(e) => onChange({ ...r, name: e.target.value })} placeholder={r.kind === 'spell' ? 'Spell name, e.g. Glitter Bomb' : 'Name'} aria-label="Name" />
          {r.kind === 'spell' && (
            <>
              <p className="small muted" style={{ margin: 0 }}>Laid out like a Spell in the Core Rulebook. Fill in what applies and leave the rest blank.</p>
              <Field label="Keywords"><input aria-label="Keywords" placeholder="e.g. Attack, Force, Area of Effect" value={r.keywords ?? ''} onChange={(e) => onChange({ ...r, keywords: e.target.value })} /></Field>
              <Field label="Flavor quote"><input aria-label="Flavor quote" placeholder="e.g. Sparkly. Deadly. Mostly sparkly." value={r.quote ?? ''} onChange={(e) => onChange({ ...r, quote: e.target.value })} /></Field>
              <div className="grid3">
                <Field label="Mana Cost"><input aria-label="Mana cost" placeholder="e.g. 8" value={r.mana} onChange={(e) => onChange({ ...r, mana: e.target.value })} /></Field>
                <Field label="Range"><input aria-label="Range" placeholder="e.g. 30 feet" value={r.range ?? ''} onChange={(e) => onChange({ ...r, range: e.target.value })} /></Field>
                <Field label="Duration"><input aria-label="Duration" placeholder="e.g. 1 minute" value={r.duration ?? ''} onChange={(e) => onChange({ ...r, duration: e.target.value })} /></Field>
              </div>
              <div className="grid2">
                <Field label="Cooldown"><input aria-label="Cooldown" placeholder="e.g. Once per scene" value={r.cooldown ?? ''} onChange={(e) => onChange({ ...r, cooldown: e.target.value })} /></Field>
                <Field label="AI Favor"><input aria-label="AI Favor" placeholder="e.g. 1" value={r.aiFavor ?? ''} onChange={(e) => onChange({ ...r, aiFavor: e.target.value })} /></Field>
              </div>
              <Field label="Limitations"><input aria-label="Limitations" placeholder="e.g. You must be able to see the target" value={r.limitations ?? ''} onChange={(e) => onChange({ ...r, limitations: e.target.value })} /></Field>
              <Field label="Base Damage"><input aria-label="Base Damage" placeholder="e.g. 1d6 + Int Force, 10ft Blast radius" value={r.baseDamage ?? ''} onChange={(e) => onChange({ ...r, baseDamage: e.target.value })} /></Field>
            </>
          )}
          <Field label={r.kind === 'spell' ? 'Description (what the Spell does)' : r.kind === 'object' ? 'Special condition' : 'Details'}>
            <textarea value={r.effect} onChange={(e) => onChange({ ...r, effect: e.target.value })}
              placeholder={r.kind === 'spell' ? 'e.g. Blinds everyone within 10 ft' : 'e.g. Glows when a mimic is nearby'} />
          </Field>
          {r.kind === 'spell' && (
            <div className="stack">
              <div className="label">Upgrades</div>
              {UPGRADE_RANKS.map((k) => (
                <Field key={k} label={`Rank ${k}`}>
                  <input aria-label={`Rank ${k} upgrade`} value={r.upgrades?.[k] ?? ''}
                    placeholder={k === '5' ? 'e.g. Range doubles' : k === '10' ? 'e.g. +1d6 damage' : 'e.g. Targets are also Blinded'}
                    onChange={(e) => onChange({ ...r, upgrades: { ...r.upgrades, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          )}
        </>
      )
  }
}
