// Turning a GM's loot box into changes on a player's character.
// Each row becomes a LootChange the player approves or skips one by one;
// approved and skipped changes are written to the character's History with the source.
import LZString from 'lz-string'
import { STAT_KEYS, STAT_NAMES, findSkill, normName, type StatKey } from '../data'
import { addSkillRanks, log, newSkill, uid } from './advancement'
import { derive } from './derived'
import { describeLootMod, detailText, formatLootRow, spellDetails, type LootMod, type LootRow } from './lootbox'
import { addToHotlist, hotlistSlotFor } from './inventory'
import { inferItem } from '../data/loot'
import { GEAR_SLOTS, type Character, type GearSlot, type Modifier } from './types'

/** What travels in a claim link (no picture: it would make the link too long). */
export interface LootClaim {
  v: 1
  /** stable per loot box, so the same box can't be claimed twice by one crawler */
  id: string
  name: string
  description: string
  reward: string
  rows: LootRow[]
  /** just item(s) from the GM, not an achievement */
  items?: boolean
}

export const CLAIM_PREFIX = '#loot='

export function encodeClaim(claim: LootClaim): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(claim))
}

export function claimUrl(claim: LootClaim, base = `${location.origin}${location.pathname}`): string {
  return `${base}${CLAIM_PREFIX}${encodeClaim(claim)}`
}

/** Accepts the encoded data, a full claim link, or a link with extra text around it. */
export function decodeClaim(input: string): LootClaim | null {
  const trimmed = input.trim()
  const at = trimmed.indexOf(CLAIM_PREFIX)
  const data = (at >= 0 ? trimmed.slice(at + CLAIM_PREFIX.length) : trimmed).split(/\s/)[0]
  try {
    const raw = JSON.parse(LZString.decompressFromEncodedURIComponent(data) ?? '')
    if (!raw || raw.v !== 1 || !Array.isArray(raw.rows) || typeof raw.id !== 'string') return null
    return raw as LootClaim
  } catch {
    return null
  }
}

export const claimSource = (claim: LootClaim) =>
  claim.items
    ? `From GM: ${claim.name || 'item'}`
    : `Loot: ${claim.name || 'Achievement'}${claim.reward ? ` (${claim.reward})` : ''}`

export interface LootChoice { key: string; label: string }

export interface LootChange {
  key: string
  /** the loot line as the GM wrote it */
  title: string
  /** what will change on this character, e.g. "Dexterity 5 → 7" */
  detail: string
  /** nothing would change (e.g. already at that Rank); skipped by default */
  noop?: boolean
  choices?: LootChoice[]
  apply: (c: Character, choice?: string) => Character
  /** short text for the History entry */
  summary: (choice?: string) => string
}

const STAT_BY_NAME: Record<string, StatKey> = Object.fromEntries(STAT_KEYS.map((k) => [STAT_NAMES[k], k]))
const SLOT_BY_LABEL: Record<string, GearSlot> = { ...Object.fromEntries(GEAR_SLOTS.map((s) => [s.label, s.key])), Weapon: 'hands' }
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

/** Add modifiers to the permanent trait for this loot box (stats count as Unenhanced). */
function addTraitMods(c: Character, source: string, mods: Modifier[]): Character {
  const existing = c.traits.find((t) => t.source === source)
  const traits = existing
    ? c.traits.map((t) => (t === existing ? { ...t, mods: [...t.mods, ...mods] } : t))
    : [...c.traits, { source, mods }]
  return { ...c, traits }
}

function addInventory(c: Character, name: string, qty: number, notes: string): Character {
  const same = c.inventory.find((i) => normName(i.name) === normName(name) && i.notes === notes)
  if (same) return { ...c, inventory: c.inventory.map((i) => (i === same ? { ...i, qty: i.qty + qty } : i)) }
  return { ...c, inventory: [...c.inventory, inferItem({ uid: uid(), name, qty, notes })] }
}

/**
 * A usable item (scroll, potion, custom object): Inventory, or straight onto the
 * Hotlist when a slot is free or already holds the same item.
 */
function stash(c: Character, name: string, qty: number, notes: string, inventoryDetail: string): Pick<LootChange, 'detail' | 'choices' | 'apply' | 'summary'> {
  const slot = hotlistSlotFor(c, name)
  const label = `${qty > 1 ? `${qty}× ` : ''}${name}`
  return {
    detail: slot >= 0 ? `${inventoryDetail}, or put it on the Hotlist` : `${inventoryDetail} (the Hotlist is full)`,
    choices: slot >= 0 ? [{ key: 'inventory', label: 'Inventory' }, { key: 'hotlist', label: 'Inventory + Hotlist' }] : undefined,
    apply: (x, choice) => (choice === 'hotlist' ? addToHotlist(x, name, qty, notes) ?? addInventory(x, name, qty, notes) : addInventory(x, name, qty, notes)),
    summary: (choice) => `${label}${choice === 'hotlist' ? ' (to Hotlist)' : ''}`,
  }
}

const findCharSkill = (c: Character, name: string) => {
  const def = findSkill(name)
  return c.skills.find((s) => (def && s.skillId === def.id) || normName(s.name) === normName(name))
}

/** Loot modifiers → engine modifiers. Skills without a catalog id can't be bonuses, so they become notes. */
function toModifiers(mods: LootMod[]): { mods: Modifier[]; notes: string[] } {
  const out: Modifier[] = []
  const notes: string[] = []
  for (const m of mods) {
    if (m.target === 'stat') {
      const k = STAT_BY_NAME[m.arg]
      if (k) out.push({ target: `stat:${k}`, value: m.value })
    } else if (m.target === 'skill') {
      const def = findSkill(m.arg)
      if (def) out.push({ target: `skill:${def.id}`, value: m.value })
      else if (m.arg) notes.push(describeLootMod(m))
    } else if (m.target === 'resist' || m.target === 'immune' || m.target === 'vuln') {
      out.push({ target: `${m.target}:${m.arg}`, value: 1 })
    } else {
      out.push({ target: m.target, value: m.value })
    }
  }
  return { mods: out, notes }
}

export function planClaim(c: Character, claim: LootClaim): LootChange[] {
  const source = claimSource(claim)
  const d = derive(c)
  const changes: LootChange[] = []
  claim.rows.forEach((r, i) => {
    const line = formatLootRow(r)
    if (!line) return
    const title = line.head + line.text
    const key = `${i}`
    const base = { key, title }
    switch (r.type) {
      case 'stat': {
        const k = STAT_BY_NAME[r.stat]
        if (!k) return
        changes.push({
          ...base,
          detail: `${STAT_NAMES[k]} ${d.unenhanced[k]} → ${Math.max(1, d.unenhanced[k] + r.value)} (permanent)`,
          apply: (x) => addTraitMods(x, source, [{ target: `stat:${k}`, value: r.value }]),
          summary: () => `${signed(r.value)} ${STAT_NAMES[k]}`,
        })
        return
      }
      case 'skill': {
        const have = findCharSkill(c, r.skill)
        if (r.mode === 'learn') {
          const gain = have ? Math.max(0, r.value - have.rank) : r.value
          changes.push({
            ...base,
            noop: gain === 0,
            detail: have
              ? gain ? `${have.name} Rank ${have.rank} → ${r.value}` : `Already ${have.name} Rank ${have.rank}; nothing changes`
              : `New Skill: ${r.skill} at Rank ${r.value}`,
            apply: (x) => (gain ? addSkillRanks(x, r.skill, gain, source) : x),
            summary: () => `${r.skill} at Rank ${r.value}`,
          })
        } else {
          changes.push({
            ...base,
            detail: have
              ? `${have.name} Rank ${have.rank} → ${Math.min(have.max, have.rank + r.value)}${have.rank + r.value > have.max ? ` (capped at ${have.max})` : ''}`
              : `New Skill: ${r.skill} at Rank ${r.value}`,
            apply: (x) => addSkillRanks(x, r.skill, r.value, source, have?.max),
            summary: () => `${signed(r.value)} Rank ${r.skill}`,
          })
        }
        return
      }
      case 'spell': {
        const mana = r.mana && r.mana !== 'None' ? `${r.mana} Mana` : ''
        if (r.prefix === 'Scroll') {
          changes.push({ ...base, ...stash(c, `Scroll of ${r.spell}`, 1, mana, `Inventory: Scroll of ${r.spell}${mana ? ` (${mana})` : ''}`) })
          return
        }
        const have = findCharSkill(c, r.spell)
        changes.push({
          ...base,
          detail: have ? `${have.name} Rank ${have.rank} → ${Math.min(have.max, have.rank + 1)}` : `Learn ${r.spell} at Rank 1`,
          apply: (x) => addSkillRanks(x, r.spell, 1, source, have?.max),
          summary: () => (have ? `+1 Rank ${r.spell}` : `Learned ${r.spell}`),
        })
        return
      }
      case 'gear': {
        const { mods, notes } = toModifiers(r.mods)
        const notesText = [...notes, r.condition.trim()].filter(Boolean).join(' · ')
        const slot = SLOT_BY_LABEL[r.slot] ?? 'accessory'
        const slotDef = GEAR_SLOTS.find((s) => s.key === slot)!
        const used = c.gear.filter((g) => g.slot === slot).length
        const room = used < slotDef.max
        const bonusText = r.mods.map(describeLootMod).filter(Boolean).join(', ')
        changes.push({
          ...base,
          detail: room
            ? `Equip in ${slotDef.label}${bonusText ? ` (${bonusText})` : ''}, or keep it in Inventory`
            : `${slotDef.label} slot is full (${used}/${slotDef.max}), so it goes to Inventory`,
          choices: room
            ? [{ key: 'equip', label: `Equip (${slotDef.label})` }, { key: 'inventory', label: 'Inventory' }]
            : undefined,
          apply: (x, choice) => {
            const name = r.name.trim()
            if (room && choice !== 'inventory') {
              return { ...x, gear: [...x.gear, { uid: uid(), slot, name, mods, notes: notesText }] }
            }
            return addInventory(x, name, 1, [bonusText, r.condition.trim()].filter(Boolean).join(' · '))
          },
          summary: (choice) => `${r.name.trim()} (${room && choice !== 'inventory' ? `equipped: ${slotDef.label}` : 'to Inventory'})`,
        })
        return
      }
      case 'defense': {
        const typed = r.target === 'resist' || r.target === 'immune' || r.target === 'vuln'
        const mod: Modifier = typed ? { target: `${r.target}:${r.dtype}`, value: 1 } : { target: r.target, value: r.value }
        const current = r.target === 'dr' ? d.dr.total : r.target === 'evade' ? d.evade.total : null
        changes.push({
          ...base,
          detail: current !== null
            ? `${r.target === 'dr' ? 'DR' : 'Evade'} ${current} → ${current + r.value} (permanent)`
            : `${title} (permanent)`,
          apply: (x) => addTraitMods(x, source, [mod]),
          summary: () => title,
        })
        return
      }
      case 'consumable': {
        const have = c.inventory.find((i) => normName(i.name) === normName(r.item) && !i.notes)
        changes.push({ ...base, ...stash(c, r.item.trim(), r.qty, '', have ? `Inventory: ${r.item} ${have.qty} → ${have.qty + r.qty}` : `Inventory: add ${r.qty}× ${r.item}`) })
        return
      }
      case 'gold':
        changes.push({
          ...base,
          detail: `Gold ${c.gold.toLocaleString('en-US')} → ${(c.gold + r.value).toLocaleString('en-US')}`,
          apply: (x) => ({ ...x, gold: x.gold + r.value }),
          summary: () => `${r.value.toLocaleString('en-US')} Gold`,
        })
        return
      case 'custom': {
        const name = r.name.trim()
        if (r.kind === 'spell') {
          const mana = Number(r.mana)
          changes.push({
            ...base,
            detail: `Learn custom Spell ${name} at Rank 1${r.mana.trim() ? ` (${r.mana.trim()} Mana)` : ''}${spellDetails({ ...r, mana: '' }).length ? '; its full Spell entry is saved in its notes' : ''}`,
            apply: (x) => {
              const notes = spellDetails({ ...r, mana: '' }).map(detailText).join(' · ')
              const s = { ...newSkill(undefined, name, 1, source), kind: 'spell' as const, notes }
              return { ...x, skills: [...x.skills, Number.isFinite(mana) && r.mana.trim() ? { ...s, customMana: mana } : s] }
            },
            summary: () => `Learned custom Spell ${name}`,
          })
        } else {
          changes.push({ ...base, ...stash(c, name, 1, r.effect.trim(), `Inventory: ${name}${r.effect.trim() ? `, with the note "${r.effect.trim()}"` : ''}`) })
        }
        return
      }
    }
  })
  return changes
}

export type Decision = { accept: boolean; choice?: string }

/** Apply the approved changes in order and write every decision to History. */
export function applyClaim(c: Character, claim: LootClaim, changes: LootChange[], decisions: Record<string, Decision>): Character {
  const source = claimSource(claim)
  let next = c
  const applied: string[] = []
  const skipped: string[] = []
  for (const ch of changes) {
    const dec = decisions[ch.key]
    if (dec?.accept) {
      next = ch.apply(next, dec.choice)
      applied.push(ch.summary(dec.choice))
    } else {
      skipped.push(ch.summary())
    }
  }
  // History shows newest first; write bottom-up so it reads: summary, each item, then skips
  if (skipped.length) next = log(next, `${source}: skipped ${skipped.join(', ')}`)
  for (const a of [...applied].reverse()) next = log(next, `${source}: ${a}`)
  next = log(next, `${source}: claimed ${applied.length} of ${changes.length} item${changes.length === 1 ? '' : 's'}`)
  return { ...next, lootClaims: [...(next.lootClaims ?? []), claim.id] }
}
