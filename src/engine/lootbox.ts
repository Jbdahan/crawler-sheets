// GM loot box maker: turns form rows into the "New Achievement!" block,
// as HTML (pastes formatted into Google Docs/Word) and plain text (Discord).
import { ammoName, ammoWeaponName, describeAmmo } from './ammo'
import type { AmmoEffect } from './types'

export const LOOT_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legendary', 'Celestial']
export const LOOT_CATEGORIES = ['Adventurer', 'Boss', 'Fan', 'Benefactor', 'Mystery', 'Quest', 'Floor']

export type ModTarget = 'stat' | 'dr' | 'evade' | 'toHit' | 'damage' | 'allChecks' | 'move' | 'hbSlot' | 'maxMana' | 'skill' | 'resist' | 'immune' | 'vuln'
export const MOD_TARGETS: { value: ModTarget; label: string }[] = [
  { value: 'stat', label: 'Stat' },
  { value: 'dr', label: 'DR' },
  { value: 'evade', label: 'Evade' },
  { value: 'toHit', label: 'To-hit' },
  { value: 'damage', label: 'Damage' },
  { value: 'allChecks', label: 'All Checks' },
  { value: 'move', label: 'Move (ft)' },
  { value: 'hbSlot', label: 'HB slot value' },
  { value: 'maxMana', label: 'Max Mana' },
  { value: 'skill', label: 'Skill Rank' },
  { value: 'resist', label: 'Resist' },
  { value: 'immune', label: 'Immune' },
  { value: 'vuln', label: 'Vulnerable' },
]
const MOD_NAMES: Record<string, string> = {
  dr: 'DR', evade: 'Evade', toHit: 'to hit', damage: 'damage', allChecks: 'all Checks',
  move: 'ft Move', hbSlot: 'HB slot value', maxMana: 'Max Mana',
}
export const TYPED_TARGETS: Record<string, string> = { resist: 'Resist', immune: 'Immune', vuln: 'Vulnerable' }
const DEFENSE_NOUNS: Record<string, string> = { resist: 'Resistance', immune: 'Immunity', vuln: 'Vulnerability' }

export interface LootMod { target: ModTarget; arg: string; value: number }

export type LootRow =
  | { type: 'stat'; stat: string; value: number }
  | { type: 'skill'; mode: 'boost' | 'learn'; skill: string; value: number }
  | { type: 'spell'; prefix: string; spell: string; mana: string }
  | { type: 'gear'; name: string; slot: string; mods: LootMod[]; condition: string }
  | { type: 'defense'; target: 'dr' | 'evade' | 'resist' | 'immune' | 'vuln'; value: number; dtype: string }
  | { type: 'consumable'; item: string; qty: number }
  | ({ type: 'ammo'; weapon: string; prefix: string; qty: number } & AmmoEffect)
  | { type: 'gold'; value: number }
  | ({ type: 'custom'; kind: 'object' | 'spell' | 'other'; name: string; mana: string; effect: string } & SpellFields)

/** What a custom Spell gains at Ranks 5, 10 and 15, like the book's Spells. */
export type SpellUpgrades = Partial<Record<'5' | '10' | '15', string>>
export const UPGRADE_RANKS = ['5', '10', '15'] as const

/**
 * The rest of a Core Rulebook Spell entry (custom Spells only). All optional,
 * so older drafts and claim links still load.
 */
export interface SpellFields {
  /** e.g. "Attack, Fire, Area of Effect" */
  keywords?: string
  /** the flavor quote under the keywords */
  quote?: string
  range?: string
  duration?: string
  cooldown?: string
  limitations?: string
  aiFavor?: string
  /** e.g. "1d6 + Int Force, 10ft Blast radius" */
  baseDamage?: string
  upgrades?: SpellUpgrades
}

export type LootRowType = LootRow['type']

export interface LootBox {
  name: string
  description: string
  reward: string
  /** data: URL or http(s) URL */
  image?: { src: string; width: number }
  rows: LootRow[]
  /** link players open to add this loot to their character */
  claimUrl?: string
  /** just the item(s) under an optional title (name) and description: no achievement header or reward line */
  itemsOnly?: boolean
}

/** A detail line under a bullet; the label is bold ("Mana Cost:"), or empty for plain text. */
export interface LootDetail { label: string; text: string; italic?: boolean }

/** One Contents bullet: bold head + plain text, plus detail lines (a custom Spell's stat block). */
export interface LootLine {
  head: string
  text: string
  sub?: LootDetail[]
}

/**
 * A custom Spell laid out like a Core Rulebook entry: keywords, quote,
 * Mana Cost, Range, Duration, Cooldown, AI Favor, Limitations, Base Damage,
 * the description, then the Rank 5/10/15 upgrades.
 */
export function spellDetails(r: SpellFields & { mana?: string; effect?: string }): LootDetail[] {
  const t = (s?: string) => s?.trim() ?? ''
  const quote = t(r.quote)
  const rows: LootDetail[] = [
    { label: '', text: t(r.keywords) },
    { label: '', text: quote && !/^["“]/.test(quote) ? `“${quote}”` : quote, italic: true },
    { label: 'Mana Cost', text: t(r.mana) },
    { label: 'Range', text: t(r.range) },
    { label: 'Duration', text: t(r.duration) },
    { label: 'Cooldown', text: t(r.cooldown) },
    { label: 'AI Favor', text: t(r.aiFavor) },
    { label: 'Limitations', text: t(r.limitations) },
    { label: 'Base Damage', text: t(r.baseDamage) },
    { label: '', text: t(r.effect) },
    ...UPGRADE_RANKS.map((k) => ({ label: `Rank ${k}`, text: t(r.upgrades?.[k]) })),
  ]
  return rows.filter((x) => x.text)
}

export const detailText = (x: LootDetail) => (x.label ? `${x.label}: ${x.text}` : x.text)

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const detail = (...parts: string[]) => {
  const p = parts.map((s) => s.trim()).filter(Boolean)
  return p.length ? `: ${p.join('. ')}` : ''
}

export function describeLootMod(m: LootMod): string {
  if (m.target === 'stat') return `${signed(m.value)} ${m.arg}`
  if (m.target === 'skill') return m.arg ? `${signed(m.value)} ${m.arg}` : ''
  if (TYPED_TARGETS[m.target]) return `${TYPED_TARGETS[m.target]} ${m.arg}`
  return `${signed(m.value)} ${MOD_NAMES[m.target]}`
}

/** null while the row is still incomplete */
export function formatLootRow(r: LootRow): LootLine | null {
  switch (r.type) {
    case 'stat': return { head: '', text: `${signed(r.value)} ${r.stat}` }
    case 'skill':
      if (!r.skill) return null
      return r.mode === 'learn'
        ? { head: `New Skill: ${r.skill}`, text: ` (Rank ${r.value})` }
        : { head: '', text: `${signed(r.value)} Rank: ${r.skill}` }
    case 'spell': {
      if (!r.spell) return null
      const mana = r.mana.trim()
      return { head: `${r.prefix}: ${r.spell}`, text: mana && mana !== 'None' ? ` (Mana ${mana})` : '' }
    }
    case 'gear': {
      if (!r.name.trim()) return null
      const mods = r.mods.map(describeLootMod).filter(Boolean).join(', ')
      return { head: r.name.trim() + (r.slot ? ` (${r.slot})` : ''), text: detail(mods, r.condition) }
    }
    case 'defense':
      if (DEFENSE_NOUNS[r.target]) return { head: '', text: `${DEFENSE_NOUNS[r.target]} to ${r.dtype}` }
      return { head: '', text: `${signed(r.value)} ${MOD_NAMES[r.target]}` }
    case 'consumable':
      if (!r.item.trim()) return null
      return { head: '', text: (r.qty > 1 ? `${r.qty}× ` : '') + r.item.trim() }
    case 'ammo': {
      const fx = describeAmmo(r)
      return { head: `${r.qty > 1 ? `${r.qty}× ` : ''}${ammoName(r.prefix.trim(), r.weapon)}`, text: ` (${ammoWeaponName(r.weapon)})${fx === 'Basic ammo' ? '' : `: ${fx.replace(/ · /g, ', ')}`}` }
    }
    case 'gold': return { head: '', text: `${r.value.toLocaleString('en-US')} Gold` }
    case 'custom': {
      if (!r.name.trim()) return null
      if (r.kind === 'spell') {
        const sub = spellDetails(r)
        return { head: `Custom Spell: ${r.name.trim()}`, text: '', ...(sub.length ? { sub } : {}) }
      }
      return { head: r.name.trim(), text: detail(r.effect) }
    }
  }
}

export const lootLines = (box: LootBox) => box.rows.map(formatLootRow).filter((l): l is LootLine => !!l)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Inline-styled HTML: Google Docs and Word ignore classes when pasting. */
/** Short name for a set of items, e.g. "Custom Spell: Glitter Bomb + 2 more". */
export function itemsTitle(rows: LootRow[]): string {
  const lines = rows.map(formatLootRow).filter((l): l is LootLine => !!l)
  if (!lines.length) return ''
  const first = lines[0].head || lines[0].text
  return lines.length > 1 ? `${first} + ${lines.length - 1} more` : first
}

const subHtml = (l: LootLine) =>
  (l.sub ?? []).map((x) => `<br>${x.label ? `<b>${esc(x.label)}:</b> ` : ''}${x.italic ? `<i>${esc(x.text)}</i>` : esc(x.text)}`).join('')
const lineHtml = (l: LootLine) => `${l.head ? `<b>${esc(l.head)}</b>` : ''}${esc(l.text)}${subHtml(l)}`
const lineText = (l: LootLine, bullet: string, indent: string) =>
  [`${bullet}${l.head}${l.text}`, ...(l.sub ?? []).map((x) => `${indent}${detailText(x)}`)]

export function lootBoxHtml(box: LootBox): string {
  const p = (inner: string, style = '') => `<p style="margin:0 0 4pt;${style}">${inner}</p>`
  if (box.itemsOnly) {
    const lines = lootLines(box)
    const out = box.name.trim() ? [p(`<b>${esc(box.name.trim())}</b>`, 'font-size:14pt')] : []
    if (box.description.trim()) out.push(p(`<i>${esc(box.description.trim()).replace(/\n/g, '<br>')}</i>`))
    if (lines.length === 1) out.push(p(lineHtml(lines[0])))
    else if (lines.length) out.push(`<ul style="margin:0">${lines.map((l) => `<li>${lineHtml(l)}</li>`).join('')}</ul>`)
    if (box.claimUrl) out.push(p(`<b>Claim it:</b> <a href="${esc(box.claimUrl)}">add this to your Crawler Sheet</a>`, 'margin-top:6pt'))
    return out.join('')
  }
  const out = [p('<b>New Achievement!</b>', 'font-size:14pt')]
  if (box.name.trim()) out.push(p(`<b>${esc(box.name.trim())}</b>`, 'font-size:16pt'))
  if (box.description.trim()) out.push(p(`<i>${esc(box.description.trim()).replace(/\n/g, '<br>')}</i>`))
  if (box.reward.trim()) out.push(p(`<b>Reward:</b> ${esc(box.reward.trim())}`))
  if (box.image) out.push(p(`<img src="${esc(box.image.src)}" width="${box.image.width}" alt="Loot box">`, 'text-align:center'))
  const lines = lootLines(box)
  if (lines.length) {
    out.push(p('<b>Contents:</b>'))
    out.push(`<ul style="margin:0">${lines.map((l) => `<li>${lineHtml(l)}</li>`).join('')}</ul>`)
  }
  if (box.claimUrl) out.push(p(`<b>Claim it:</b> <a href="${esc(box.claimUrl)}">add this loot to your Crawler Sheet</a>`, 'margin-top:6pt'))
  return out.join('')
}

export function lootBoxText(box: LootBox): string {
  if (box.itemsOnly) {
    const lines = lootLines(box)
    const out = [box.name.trim(), box.description.trim()].filter(Boolean)
    out.push(...lines.flatMap((l) => (lines.length === 1 ? lineText(l, '', '  ') : lineText(l, '• ', '    '))))
    if (box.claimUrl) out.push(`Claim it in Crawler Sheets: ${box.claimUrl}`)
    return out.join('\n')
  }
  const out = ['New Achievement!']
  if (box.name.trim()) out.push(box.name.trim())
  if (box.description.trim()) out.push(box.description.trim())
  if (box.reward.trim()) out.push(`Reward: ${box.reward.trim()}`)
  const lines = lootLines(box)
  if (lines.length) out.push('Contents:', ...lines.flatMap((l) => lineText(l, '• ', '    ')))
  if (box.claimUrl) out.push(`Claim it in Crawler Sheets: ${box.claimUrl}`)
  return out.join('\n')
}
