// Hand-entered catalog pieces that aren't tables in the book: named Buffs,
// common consumables, and the Level 1 starting options. Page refs are Core Rulebook.
import type { HealDef } from './index'
import type { Modifier } from '../engine/types'

export interface BuffDef {
  id: string
  name: string
  external?: boolean
  page: number
  summary: string
  mods?: Modifier[]
  /** mods that scale with the current Floor */
  floorMods?: string[]
}

export const BUFFS: BuffDef[] = [
  { id: 'good-sleep', name: 'Good Sleep', page: 95, summary: '+Floor to all Stats for 30 hours.',
    floorMods: ['stat:str', 'stat:int', 'stat:con', 'stat:dex', 'stat:cha'] },
  { id: 'iron-skin', name: 'Iron Skin Potion', page: 95, summary: 'Doubles DR for 30 minutes (adds your current armor DR again).' },
  { id: 'invisible', name: 'Invisible', page: 95, summary: "Can't be targeted by sight; you count as an Unseen Attacker." },
  { id: 'anti-piercing', name: 'Anti-Piercing', page: 95, summary: 'Armor DR also applies against Armor-Piercing damage.' },
  { id: 'recovery', name: 'Recovery', page: 95, summary: 'Restore to full Health (once per 5 hours).', external: true },
  { id: 'replenish', name: 'Replenish', page: 95, summary: 'Gain Int Mana every 10 minutes.' },
  { id: 'restore', name: 'Restore', page: 95, summary: 'Restore to full Mana (once per 5 hours).', external: true },
  { id: 'rooted', name: 'Rooted in Place', page: 95, summary: "Can't be pushed, pulled or slid." },
  { id: 'sticky-feet', name: 'Sticky Feet', page: 95, summary: 'Climb Move for Dex minutes.' },
  { id: 'damage-reflection', name: 'Damage Reflection', page: 95, external: true,
    summary: 'After losing a set number of slots, the attacker loses 1 slot.' },
  { id: 'resistance', name: 'Resistance (choose type)', page: 95, external: true,
    summary: 'Take half damage from one damage type.' },
  { id: 'immunity', name: 'Immunity (choose type)', page: 95, external: true,
    summary: 'Take no damage (or Debuffs) from one damage type.' },
  { id: 'safe-fall', name: 'Safe Fall', page: 95, external: true, summary: 'No falling damage past a set distance.' },
  { id: 'dr-buff', name: 'DR Buff', page: 95, summary: 'Bonus Damage Resistance.', mods: [{ target: 'dr', value: 1 }] },
  { id: 'evade-buff', name: 'Evade Buff', page: 95, summary: 'Bonus to Evade.', mods: [{ target: 'evade', value: 1 }] },
  { id: 'stat-buff', name: 'Stat Buff', page: 95, summary: 'Bonus to a Stat (Enhanced).', mods: [{ target: 'stat:str', value: 1 }] },
  { id: 'damage-buff', name: 'Damage Buff', page: 115, summary: 'Bonus damage on attacks.', mods: [{ target: 'damage', value: 1 }] },
  { id: 'tactics', name: 'Tactics bonus', page: 200, summary: '+1 or more to Attack, Damage or Evade from a Tactics Check.', mods: [{ target: 'toHit', value: 1 }] },
  { id: 'advantage', name: 'Advantage (situational)', page: 60, summary: 'Roll an extra d20 and keep the best.' },
  { id: 'custom', name: 'Custom Buff', page: 95, summary: 'Build your own from modifiers.' },
]

export interface ItemDef {
  id: string
  name: string
  page: number
  summary: string
  heal?: HealDef
  restoreMana?: 'full' | number
  removesDebuff?: string
  consumable: boolean
}

export const ITEMS: ItemDef[] = [
  { id: 'healing-potion', name: 'Healing Potion', page: 116, summary: 'Heal 5 Health Bar slots (Interrupt).', heal: { slots: 5 }, consumable: true },
  { id: 'good-healing-potion', name: 'Good Healing Potion', page: 116, summary: 'Heal 6 Health Bar slots.', heal: { slots: 6 }, consumable: true },
  { id: 'gold-healing-potion', name: 'Gold Standard Healing Potion', page: 117, summary: 'Heal 7 slots and mend one Minor Injury.', heal: { slots: 7 }, removesDebuff: 'minor-injury', consumable: true },
  { id: 'mana-potion', name: 'Standard Mana Potion', page: 108, summary: 'Fully restore Mana.', restoreMana: 'full', consumable: true },
  { id: 'bandage', name: 'Bandage', page: 116, summary: 'Spend an Action to remove Blood Trail.', removesDebuff: 'blood-trail', consumable: true },
  { id: 'antidote', name: 'Poison Antidote', page: 116, summary: 'Cures the Poisoned Debuff.', removesDebuff: 'poisoned', consumable: true },
  { id: 'torch', name: 'Torch', page: 116, summary: '20ft bright + 20ft dim light for about an hour.', consumable: true },
  { id: 'dynamite', name: 'Dynamite', page: 116, summary: '1d6 Bludgeoning, 0ft Blast +5ft Splash. Thrown.', consumable: true },
  { id: 'goblin-dynamite', name: 'Good Goblin Dynamite', page: 116, summary: '2d6 Bludgeoning, 5ft Blast +5ft Splash. Thrown.', consumable: true },
  { id: 'snack-bar', name: 'Snack Bar', page: 115, summary: 'Food.', consumable: true },
]

/** Level 1 starting weapons (Core p.108) mapped to their Attack Skill ids. */
export const STARTING_WEAPONS: { group: string; skills: string[] }[] = [
  { group: 'Bashing', skills: ['club', 'improvised-weapons', 'warhammer'] },
  { group: 'Edged', skills: ['axe', 'dagger', 'longsword', 'rapier'] },
  { group: 'Ranged', skills: ['bow', 'crossbow', 'handgun', 'shotgun', 'javelin', 'shuriken', 'slingshot'] },
  { group: 'Reach', skills: ['herding-weapons', 'lance', 'polearm', 'quarterstaff'] },
]

/** Low-Mana starting Attack Spells (Core p.108). Pick one instead of a weapon; comes with 5 Mana Potions. */
export const STARTING_SPELLS = ['dirt-clod', 'fire-fingers', 'frost-scar', 'mind-tickle', 'shock-treatment', 'soul-collector', 'vine-porn']

/** Hand-to-hand option (Core p.109): attack + its Damage Effect, both at Rank 3. */
export const STARTING_HAND_TO_HAND: { attack: string; effect: string }[] = [
  { attack: 'pugilism', effect: 'iron-punch' },
  { attack: 'foot-soldier', effect: 'smush' },
  { attack: 'noggin-nocker', effect: 'skullcracker' },
  { attack: 'wrasslin', effect: 'toss' },
]

/** Boss kill Levels by tier (Core p.170). */
export const BOSS_TIERS = [
  { name: 'Neighborhood Boss', levels: 1 },
  { name: 'Borough Boss', levels: 2 },
  { name: 'City Boss', levels: 3 },
  { name: 'Province Boss', levels: 4 },
  { name: 'Country Boss', levels: 5 },
  { name: 'Floor Boss', levels: 6 },
]
