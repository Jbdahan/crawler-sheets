// Rules catalog built by tools/build_data.py from the Core Rulebook (mechanics only).
import skillsJson from './skills.json'
import spellsJson from './spells.json'
import racesJson from './races.json'
import classesJson from './classes.json'
import debuffsJson from './debuffs.json'
import backgroundsJson from './backgrounds.json'
import storiesJson from './stories.json'
import deitiesJson from './deities.json'
import { BUFFS, ITEMS } from './extras'

export type StatKey = 'str' | 'int' | 'con' | 'dex' | 'cha'
export const STAT_KEYS: StatKey[] = ['str', 'int', 'con', 'dex', 'cha']
export const STAT_NAMES: Record<StatKey, string> = {
  str: 'Strength', int: 'Intelligence', con: 'Constitution', dex: 'Dexterity', cha: 'Charisma',
}
export const STAT_ABBR: Record<StatKey, string> = { str: 'Str', int: 'Int', con: 'Con', dex: 'Dex', cha: 'Cha' }

export interface Dice { count: number; sides: number }

export interface DamageDef extends Dice {
  stat: StatKey | null
  types: string[]
  area?: string
}

export interface UpgradeDef {
  text: string
  dice?: Dice
  rankDie?: boolean
  evade?: number
  dr?: number
  move?: number
}

export type SkillKind = 'attack' | 'damageEffect' | 'utility' | 'spell'

export interface HealDef {
  slots?: number
  dice?: string
  full?: boolean
  statMod?: StatKey
  rankDie?: boolean
}

export interface SkillDef {
  id: string
  name: string
  kind: SkillKind
  group?: string
  page: number
  keywords?: string[]
  stat?: StatKey
  passive: boolean
  attack: boolean
  attackType?: 'melee' | 'ranged'
  checkType?: string
  range?: string
  aiFavor?: string
  limitations?: string
  cooldown?: string
  duration?: string
  mana?: number
  manaText?: string
  damage?: DamageDef
  damageEffectOf?: string
  favored?: string[]
  upgrades?: Record<string, UpgradeDef>
  summary?: string
  /** Spells: a fuller plain-language description of what it does and how it's used */
  effect?: string
  effects?: { evade?: number; move?: number; dr?: number }
  heal?: HealDef
  castBuff?: { dr?: number; evade?: number }
}

export interface ChoiceDef {
  ranks: number
  count: number
  options?: string[]
  kind?: 'skill' | 'spell'
  group?: string
  text: string
}

export interface RaceClassDef {
  id: string
  name: string
  kind: 'race' | 'class'
  group?: string
  classType?: string
  page: number
  prerequisite?: string
  stats: Partial<Record<StatKey, number>>
  allStats: number
  statSplit?: { points: number; among: StatKey[] } | null
  skills: { name: string; ranks: number; kind: 'skill' | 'spell' }[]
  choices: ChoiceDef[]
  dr: number
  rank20: string[]
  benefits: string[]
  size?: string | null
  earthBox: boolean
  alien?: boolean
}

export interface DebuffDef {
  id: string
  name: string
  effect: string
  duration: string
  page: number
  stackable: boolean
  dot?: string
  allChecks?: number
}

export interface BackgroundDef {
  stage: string
  roll: string
  name: string
  rank: number
  skills: { name: string; stat: StatKey | null }[]
  page: number
}

export interface DeityDef {
  id: string
  name: string
  page: number
  signatureSkills?: string
  signatureStat?: string
  rival?: string
  sponsor?: string
  offering?: string
  symbol?: string
}

export const SKILLS = skillsJson as unknown as SkillDef[]
export const SPELLS = spellsJson as unknown as SkillDef[]
export const ALL_SKILLS: SkillDef[] = [...SKILLS, ...SPELLS]
export const RACES = racesJson as unknown as RaceClassDef[]
export const CLASSES = classesJson as unknown as RaceClassDef[]
export const DEBUFFS = debuffsJson as unknown as DebuffDef[]
export const BACKGROUNDS = backgroundsJson as unknown as BackgroundDef[]
export const STORIES = storiesJson as unknown as { trauma: string[]; looseEnd: string[]; regret: string[] }
export const DEITIES = deitiesJson as unknown as DeityDef[]
export { BUFFS, ITEMS }

export function normName(name: string): string {
  return name.toLowerCase().replace(/[’']/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

const byId = new Map(ALL_SKILLS.map((s) => [s.id, s]))
const byName = new Map(ALL_SKILLS.map((s) => [normName(s.name), s]))
const ALIASES: Record<string, string> = { intimidation: 'intimidate', 'heal other': 'heal-others', smite: 'paladins-smite' }

export function findSkill(idOrName: string | undefined): SkillDef | undefined {
  if (!idOrName) return undefined
  const direct = byId.get(idOrName)
  if (direct) return direct
  const n = normName(idOrName)
  const alias = ALIASES[n]
  if (alias) return byId.get(alias)
  return byName.get(n)
}

export const findRace = (id?: string) => RACES.find((r) => r.id === id)
export const findClass = (id?: string) => CLASSES.find((c) => c.id === id)
export const findDebuff = (id?: string) => DEBUFFS.find((d) => d.id === id)
export const findDeity = (id?: string) => DEITIES.find((d) => d.id === id)

/** Table 9: creature size names (Core p.85). */
export const SIZES = ['', 'Tiny', 'Small', 'Petite', 'Medium', 'Large', 'Huge', 'Colossal', 'Gargantuan']

/** Table 10: damage types (Core p.93). */
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Electric', 'Fire', 'Force', 'Holy', 'Ice', 'Necrotic',
  'Piercing', 'Poison', 'Psychic', 'Slashing', 'Sonic']
