// GM loot box maker: turns form rows into the "New Achievement!" block,
// as HTML (pastes formatted into Google Docs/Word) and plain text (Discord).

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
  | { type: 'gold'; value: number }
  | { type: 'custom'; kind: 'object' | 'spell' | 'other'; name: string; mana: string; effect: string }

export type LootRowType = LootRow['type']

export interface LootBox {
  name: string
  description: string
  reward: string
  /** data: URL or http(s) URL */
  image?: { src: string; width: number }
  rows: LootRow[]
}

/** One Contents bullet: bold head + plain text. */
export interface LootLine { head: string; text: string }

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
    case 'gold': return { head: '', text: `${r.value.toLocaleString('en-US')} Gold` }
    case 'custom': {
      if (!r.name.trim()) return null
      if (r.kind === 'spell') {
        const mana = r.mana.trim()
        return { head: `Custom Spell: ${r.name.trim()}`, text: (mana ? ` (Mana ${mana})` : '') + detail(r.effect) }
      }
      return { head: r.name.trim(), text: detail(r.effect) }
    }
  }
}

export const lootLines = (box: LootBox) => box.rows.map(formatLootRow).filter((l): l is LootLine => !!l)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Inline-styled HTML: Google Docs and Word ignore classes when pasting. */
export function lootBoxHtml(box: LootBox): string {
  const p = (inner: string, style = '') => `<p style="margin:0 0 4pt;${style}">${inner}</p>`
  const out = [p('<b>New Achievement!</b>', 'font-size:14pt')]
  if (box.name.trim()) out.push(p(`<b>${esc(box.name.trim())}</b>`, 'font-size:16pt'))
  if (box.description.trim()) out.push(p(`<i>${esc(box.description.trim()).replace(/\n/g, '<br>')}</i>`))
  if (box.reward.trim()) out.push(p(`<b>Reward:</b> ${esc(box.reward.trim())}`))
  if (box.image) out.push(p(`<img src="${esc(box.image.src)}" width="${box.image.width}" alt="Loot box">`, 'text-align:center'))
  const lines = lootLines(box)
  if (lines.length) {
    out.push(p('<b>Contents:</b>'))
    out.push(`<ul style="margin:0">${lines.map((l) => `<li>${l.head ? `<b>${esc(l.head)}</b>` : ''}${esc(l.text)}</li>`).join('')}</ul>`)
  }
  return out.join('')
}

export function lootBoxText(box: LootBox): string {
  const out = ['New Achievement!']
  if (box.name.trim()) out.push(box.name.trim())
  if (box.description.trim()) out.push(box.description.trim())
  if (box.reward.trim()) out.push(`Reward: ${box.reward.trim()}`)
  const lines = lootLines(box)
  if (lines.length) out.push('Contents:', ...lines.map((l) => `• ${l.head}${l.text}`))
  return out.join('\n')
}
