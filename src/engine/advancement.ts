import { ALL_SKILLS, STAT_KEYS, findSkill, normName, type RaceClassDef, type SkillDef, type StatKey } from '../data'
import type { Character, CharSkill, Modifier } from './types'

export const MAX_LEVEL = 250
export const STAT_POINTS_PER_LEVEL = 3
export const DEFAULT_MAX_RANK = 15
export const CREATION_RANK_CAP = 10

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function log(c: Character, text: string): Character {
  return { ...c, log: [{ at: Date.now(), text }, ...c.log].slice(0, 300) }
}

/** Each Level grants 3 Stat points (Core p.169). Humans also gain 1 AI Favor per level up (p.135). */
export function levelUp(c: Character, levels: number, reason: string): Character {
  const n = Math.max(0, Math.min(levels, MAX_LEVEL - c.level))
  if (!n) return c
  let next: Character = {
    ...c,
    level: c.level + n,
    pendingStatPoints: c.pendingStatPoints + n * STAT_POINTS_PER_LEVEL,
  }
  if (c.raceId === 'human') next = { ...next, aiFavor: next.aiFavor + n }
  return log(next, `Level ${c.level} → ${next.level} (${reason}); +${n * STAT_POINTS_PER_LEVEL} Stat points banked`)
}

/**
 * Stat points from the Tutorial Floors are applied on reaching the Third Floor;
 * from then on they're spent in a saferoom (Core p.128, 169).
 */
export const canAllocateStats = (c: Character) => c.floor >= 3

export function allocateStats(c: Character, alloc: Partial<Record<StatKey, number>>): Character {
  const spent = STAT_KEYS.reduce((a, k) => a + Math.max(0, alloc[k] ?? 0), 0)
  if (spent <= 0 || spent > c.pendingStatPoints) return c
  const statPoints = { ...c.statPoints }
  for (const k of STAT_KEYS) statPoints[k] += Math.max(0, alloc[k] ?? 0)
  const desc = STAT_KEYS.filter((k) => alloc[k]).map((k) => `+${alloc[k]} ${k.toUpperCase()}`).join(', ')
  return log({ ...c, statPoints, pendingStatPoints: c.pendingStatPoints - spent }, `Spent ${spent} Stat points: ${desc}`)
}

/** Crawler kill: 1d6 ± level difference, max 15, min 1 (Core p.169). */
export function crawlerKillLevels(roll: number, myLevel: number, victimLevel: number): number {
  if (myLevel < victimLevel) return Math.min(15, roll + (victimLevel - myLevel))
  return Math.max(1, roll - (myLevel - victimLevel))
}

export type AdvanceWindow = 'twoHours' | 'endOfFloor'

/** Source label on a Skill that only exists because equipped gear grants Ranks in it. */
export const GEAR_SKILL_SOURCE = 'Equipped gear'

/**
 * Skills that can be marked and advanced: any with Ranks, plus a Skill held only through
 * gear (Rank 0 + the gear's bonus): using it trains it, and its first Rank is then its own.
 */
export const canAdvance = (s: CharSkill) => (s.rank > 0 || s.source === GEAR_SKILL_SOURCE) && s.rank < s.max

/** Marked Skills eligible for an Advancement Check (Core p.169). */
export function eligibleForAdvancement(c: Character, when: AdvanceWindow): CharSkill[] {
  return c.skills.filter((s) => {
    if (!s.marked || !canAdvance(s)) return false
    return when === 'twoHours' ? s.rank <= 4 : s.rank >= 5
  })
}

/** d20 ≥ current Rank gains 1 Rank (Core p.169). */
export const advancementSucceeds = (roll: number, rank: number, bonus = 0) => roll + bonus >= rank

export function resolveAdvancement(c: Character, results: { uid: string; roll: number; bonus?: number }[]): Character {
  let next = c
  const lines: string[] = []
  const skills = c.skills.map((s) => {
    const r = results.find((x) => x.uid === s.uid)
    if (!r) return s
    if (advancementSucceeds(r.roll, s.rank, r.bonus)) {
      lines.push(`${s.name} ${s.rank} → ${s.rank + 1}`)
      return { ...s, rank: Math.min(s.max, s.rank + 1), marked: false }
    }
    return { ...s, marked: false }
  })
  next = { ...next, skills }
  return lines.length ? log(next, `Skill advancement: ${lines.join(', ')}`) : log(next, 'Skill advancement: no Ranks gained')
}

/** Grinding (Core p.170–171). Returns the character and which Skills now need an Advancement Check. */
export function addGrind(c: Character, perSkill: { uid: string; hours: number }[], totalHours: number): { c: Character; ready: string[]; levels: number } {
  const ready: string[] = []
  const skills = c.skills.map((s) => {
    const add = perSkill.find((p) => p.uid === s.uid)?.hours ?? 0
    if (!add) return s
    const hours = s.grindHours + add
    if (hours >= Math.max(1, s.rank)) ready.push(s.uid)
    return { ...s, grindHours: hours }
  })
  let next: Character = { ...c, skills, grindHoursTotal: c.grindHoursTotal + totalHours }
  let levels = 0
  // a Level each time grind hours reach your current Level; the tally resets on level up
  while (next.grindHoursTotal >= next.level + levels && next.level + levels < MAX_LEVEL) {
    next = { ...next, grindHoursTotal: next.grindHoursTotal - (next.level + levels) }
    levels++
  }
  if (levels) next = levelUp({ ...next }, levels, 'grinding')
  next = log(next, `Ground ${totalHours} h`)
  return { c: next, ready, levels }
}

export function resolveGrindCheck(c: Character, skillUid: string, roll: number, bonus = 0): Character {
  const s = c.skills.find((x) => x.uid === skillUid)
  if (!s) return c
  const ok = advancementSucceeds(roll, s.rank, bonus)
  const skills = c.skills.map((x) => x.uid !== skillUid ? x : {
    ...x,
    grindHours: Math.max(0, x.grindHours - Math.max(1, x.rank)),
    rank: ok ? Math.min(x.max, x.rank + 1) : x.rank,
  })
  return log({ ...c, skills }, `Grind check ${s.name}: rolled ${roll}${bonus ? `+${bonus}` : ''} vs ${s.rank} → ${ok ? `Rank ${s.rank + 1}` : 'no change'}`)
}

export function newSkill(def: SkillDef | undefined, name: string, rank: number, source?: string): CharSkill {
  return {
    uid: uid(),
    skillId: def?.id,
    name: def?.name ?? name,
    kind: def?.kind ?? 'utility',
    stat: def?.stat ?? null,
    rank,
    max: DEFAULT_MAX_RANK,
    marked: false,
    grindHours: 0,
    notes: '',
    source,
  }
}

/** Add Ranks to a Skill, creating it if needed. `cap` limits the result (10 during Race & Class selection). */
export function addSkillRanks(c: Character, name: string, ranks: number, source: string, cap = DEFAULT_MAX_RANK): Character {
  const def = findSkill(name)
  const existing = c.skills.find((s) => (def && s.skillId === def.id) || normName(s.name) === normName(name))
  if (existing) {
    const target = Math.max(existing.rank, Math.min(cap, existing.rank + ranks))
    return { ...c, skills: c.skills.map((s) => (s.uid === existing.uid ? { ...s, rank: target } : s)) }
  }
  return { ...c, skills: [...c.skills, newSkill(def, name, Math.min(cap, ranks), source)] }
}

export function parseSize(size?: string | null): number | null {
  const m = size?.match(/\((\d)\)/)
  return m ? Number(m[1]) : null
}

export interface RaceClassChoice {
  /** chosen skill/spell names with ranks, for "of your choice" bullets */
  picks: { name: string; ranks: number }[]
  /** City Elf style split */
  split?: Partial<Record<StatKey, number>>
}

/**
 * Apply a Race or Class (Core p.128): Stat bonuses become part of the Unenhanced layer,
 * Skill bonuses stop at Rank 10, DR is a permanent Buff, and Rank-20 permissions raise caps.
 */
export function applyRaceClass(c: Character, def: RaceClassDef, choice: RaceClassChoice): Character {
  const label = `${def.kind === 'race' ? 'Race' : 'Class'}: ${def.name}`
  const mods: Modifier[] = []
  for (const k of STAT_KEYS) {
    const v = (def.stats[k] ?? 0) + (def.allStats ?? 0) + (choice.split?.[k] ?? 0)
    if (v) mods.push({ target: `stat:${k}`, value: v })
  }
  if (def.dr) mods.push({ target: 'dr', value: def.dr })
  for (const b of def.benefits) {
    const m = b.match(/^(?:Resistance|Resist) to (\w+) damage/i)
    if (m) mods.push({ target: `resist:${m[1]}`, value: 1 })
    const im = b.match(/^Immunity to (\w+)/i)
    if (im) mods.push({ target: `immune:${im[1]}`, value: 1 })
    const vm = b.match(/^Vulnerab\w+:? .*?(\w+) damage/i)
    if (vm && vm[1] !== 'double') mods.push({ target: `vuln:${vm[1]}`, value: 1 })
  }
  let next: Character = {
    ...c,
    traits: [...c.traits.filter((t) => t.source !== label && !(def.kind === 'race' ? t.source.startsWith('Race:') : t.source.startsWith('Class:'))), { source: label, mods }],
  }
  for (const s of def.skills) next = addSkillRanks(next, s.name, s.ranks, label, CREATION_RANK_CAP)
  for (const p of choice.picks) if (p.name.trim()) next = addSkillRanks(next, p.name.trim(), p.ranks, label, CREATION_RANK_CAP)

  // Rank 20 permissions
  for (const line of def.rank20) {
    if (/^All Skills/i.test(line)) {
      next = { ...next, skills: next.skills.map((s) => ({ ...s, max: 20 })) }
      continue
    }
    const names = ALL_SKILLS.filter((s) => new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)).map((s) => s.id)
    next = { ...next, skills: next.skills.map((s) => (s.skillId && names.includes(s.skillId) ? { ...s, max: 20 } : s)) }
  }
  const size = def.kind === 'race' ? parseSize(def.size) : null
  if (size) next = { ...next, size }
  if (def.kind === 'race') next = { ...next, raceId: def.id, raceName: def.name }
  else next = { ...next, classId: def.id, className: def.name }
  return log(next, `Chose ${label}`)
}

/** Move to a new Floor. Rank 5+ marked Skills roll at the end of each floor (Core p.169). */
export function changeFloor(c: Character, floor: number): Character {
  return log({ ...c, floor: Math.max(1, floor) }, `Floor ${c.floor} → ${floor}`)
}

/** Move a skill up or down among the skills of the same type; other types keep their places. */
export function moveSkill(skills: CharSkill[], uid: string, dir: -1 | 1 | 'top' | 'bottom'): CharSkill[] {
  const s = skills.find((k) => k.uid === uid)
  if (!s) return skills
  const same = skills.filter((k) => k.kind === s.kind)
  const i = same.indexOf(s)
  const j = dir === 'top' ? 0 : dir === 'bottom' ? same.length - 1 : i + dir
  if (j < 0 || j >= same.length || j === i) return skills
  const reordered = [...same]
  reordered.splice(i, 1)
  reordered.splice(j, 0, s)
  // put the reordered group back into the slots that type already occupies
  let n = 0
  return skills.map((k) => (k.kind === s.kind ? reordered[n++] : k))
}

/** Drop a skill into another skill's place among skills of the same type (drag and drop). */
export function moveSkillTo(skills: CharSkill[], uid: string, targetUid: string): CharSkill[] {
  const s = skills.find((k) => k.uid === uid)
  const t = skills.find((k) => k.uid === targetUid)
  if (!s || !t || s === t || s.kind !== t.kind) return skills
  const same = skills.filter((k) => k.kind === s.kind)
  const reordered = same.filter((k) => k !== s)
  reordered.splice(same.indexOf(t), 0, s)
  let n = 0
  return skills.map((k) => (k.kind === s.kind ? reordered[n++] : k))
}

/** Remove one permanent bonus (e.g. a claimed loot Stat bonus); drops the source when it's empty. */
export function removeTraitMod(c: Character, source: string, index: number): Character {
  const traits = c.traits
    .map((t) => (t.source === source ? { ...t, mods: t.mods.filter((_, i) => i !== index) } : t))
    .filter((t) => t.mods.length > 0)
  return { ...c, traits }
}

/** Remove everything a source added: its permanent bonuses and the Skills/Spells it granted. */
export function removeSource(c: Character, source: string): Character {
  const gone = new Set(c.skills.filter((s) => s.source === source).map((s) => s.uid))
  return log({
    ...c,
    traits: c.traits.filter((t) => t.source !== source),
    skills: c.skills.filter((s) => !gone.has(s.uid)),
    hotlist: c.hotlist.map((h) => (h?.skillUid && gone.has(h.skillUid) ? null : h)),
  }, `Removed ${source}`)
}
