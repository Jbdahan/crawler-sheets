import type { HealDef, StatKey } from '../data'

/**
 * A numeric effect from gear, a Buff, a Debuff, a Race or a Class.
 * target:
 *   stat:<str|int|con|dex|cha>  Stat bonus (Enhanced layer, or Unenhanced for traits)
 *   skill:<skillId>             Skill Rank bonus
 *   dr | evade | move | hbSlot | maxMana | toHit | damage | allChecks
 *   resist:<Type> | immune:<Type> | vuln:<Type>   (value ignored)
 */
export interface Modifier {
  target: string
  value: number
}

export type GearSlot = 'head' | 'torso' | 'arms' | 'hands' | 'legs' | 'feet' | 'belt' | 'cape' | 'accessory'
export const GEAR_SLOTS: { key: GearSlot; label: string; max: number }[] = [
  { key: 'head', label: 'Head', max: 1 },
  { key: 'torso', label: 'Torso', max: 1 },
  { key: 'arms', label: 'Arms', max: 1 },
  { key: 'hands', label: 'Hands/Holding', max: 3 },
  { key: 'legs', label: 'Legs', max: 1 },
  { key: 'feet', label: 'Feet', max: 1 },
  { key: 'belt', label: 'Belt', max: 1 },
  { key: 'cape', label: 'Cape', max: 1 },
  { key: 'accessory', label: 'Accessories', max: 10 },
]

export interface CharSkill {
  uid: string
  /** catalog id; custom skills have none */
  skillId?: string
  name: string
  kind: 'attack' | 'damageEffect' | 'utility' | 'spell'
  stat: StatKey | null
  rank: number
  /** rank cap: 15 normally, 20 when a Race/Class allows */
  max: number
  marked: boolean
  grindHours: number
  notes: string
  /** weapon currently in hand: its Evade upgrades apply */
  wielded?: boolean
  /** ranged weapons: the special ammo loaded (Inventory uid); none = basic ammo */
  ammoUid?: string
  /** ranged weapons: also count basic ammo (off by default) */
  trackBasicAmmo?: boolean
  /** custom attack details */
  customDamage?: string
  customDamageType?: string
  customDamageStat?: StatKey | null
  customMana?: number
  source?: string
}

export interface ActiveEffect {
  uid: string
  kind: 'buff' | 'debuff'
  refId?: string
  name: string
  stacks: number
  /** External Buffs: max 3 active (Rule of Three, Core p.95) */
  external?: boolean
  active: boolean
  mods: Modifier[]
  notes: string
}

export interface GearItem {
  uid: string
  slot: GearSlot
  name: string
  mods: Modifier[]
  notes: string
  /** weapons: the Attack Skill (catalog id) this item is used with, e.g. 'dagger' */
  skillId?: string
  /** weapons: this item's own damage and range (instead of the Attack Skill's) */
  weapon?: WeaponStats
}

/**
 * A weapon item's own damage and range. Its Attack Skill still sets the to-hit
 * (Rank, Stats, Floor) and adds its Rank upgrade dice; these replace the Skill's
 * base damage die, damage type and range. Every field is optional.
 */
export interface WeaponStats {
  /** base damage dice, e.g. "1d10" or "2d6" (a flat part like "1d8+1" also works) */
  dice?: string
  /** flat damage modifier, e.g. +2 for a +2 sword */
  bonus?: number
  /** damage type, e.g. "Fire" */
  dtype?: string
  /** e.g. "Melee 10ft" or "120 feet" */
  range?: string
}

export interface HotlistEntry {
  uid: string
  name: string
  qty: number
  kind: 'item' | 'spell' | 'weapon'
  /** linked character skill (spells/weapons) */
  skillUid?: string
  /** items: the Inventory item this slot shows (the item stays in Inventory; its count is used) */
  invUid?: string
  /** items: the equipped Gear item this slot shows */
  gearUid?: string
  notes: string
  heal?: HealDef
  restoreMana?: 'full' | number
  removesDebuff?: string
  /** consumed when used */
  consumable?: boolean
}

/**
 * What an Inventory item does (Core p.99): a weapon used with an Attack Skill,
 * a Spell Scroll (cast once at its Rank, no Mana), a Spellbook (read to learn
 * the Spell at its Rank), a Potion of +N Skill, wearable gear, or ammunition.
 */

/** What a special arrow/bolt/round adds to each attack (GM-made: the book has no ammo table). */
export interface AmmoEffect {
  /** extra damage dice, e.g. "1d6"; not doubled on a Critical Hit */
  dice?: string
  /** damage type of the extra dice, e.g. "Fire" */
  dtype?: string
  toHit?: number
  damage?: number
  /** Debuff id the target gains */
  debuff?: string
  debuffOn?: 'hit' | 'amazing'
}
export type ItemKind = 'weapon' | 'scroll' | 'book' | 'skillPotion' | 'gear' | 'ammo'

export interface InventoryItem {
  uid: string
  name: string
  qty: number
  notes: string
  kind?: ItemKind
  /** weapon/ammo: Attack Skill id; scroll/book: Spell id */
  skillId?: string
  /** scroll/book: the Spell's Rank; skillPotion: Ranks gained */
  rank?: number
  /** gear/weapons: where it goes and what it gives when equipped */
  slot?: GearSlot
  mods?: Modifier[]
  /** ammo: what it adds (none: basic ammo) */
  ammo?: AmmoEffect
  /** weapons: this item's own damage and range (instead of the Attack Skill's) */
  weapon?: WeaponStats
}

export interface Trait {
  source: string
  /** stat:* mods here count toward Unenhanced Stats */
  mods: Modifier[]
}

export interface LogEntry {
  at: number
  text: string
}

export interface Character {
  id: string
  version: number
  name: string
  pronouns: string
  crawlerNumber: string
  species: 'human' | 'animal'
  animalType?: string
  portrait?: string
  level: number
  floor: number
  size: number
  baseMove: number
  step: number
  aiFavor: number
  popularity: number
  gold: number
  miscJunk: number
  /** starting scores from character creation */
  base: Record<StatKey, number>
  /** points spent from level ups */
  statPoints: Record<StatKey, number>
  pendingStatPoints: number
  raceId?: string
  classId?: string
  raceName?: string
  className?: string
  traits: Trait[]
  skills: CharSkill[]
  health: { lost: number; dying: number | null }
  mana: number
  effects: ActiveEffect[]
  gear: GearItem[]
  hotlist: (HotlistEntry | null)[]
  inventory: InventoryItem[]
  deityId?: string
  worshipTier?: string
  story: { trauma: string; looseEnds: string; regrets: string; notes: string }
  grindHoursTotal: number
  log: LogEntry[]
  /** ids of GM loot boxes already claimed, so a claim link can't be applied twice */
  lootClaims?: string[]
  createdAt: number
  updatedAt: number
}

export const HOTLIST_SIZE = 10
