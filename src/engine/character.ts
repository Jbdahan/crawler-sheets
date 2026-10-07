import { findSkill } from '../data'
import { newSkill, uid } from './advancement'
import { HOTLIST_SIZE, type Character } from './types'
import { linkHotlistItems } from './inventory'
import { inferItems, syncGearSkills } from './items'

export const SCHEMA_VERSION = 1

export function blankCharacter(): Character {
  const now = Date.now()
  const heal = newSkill(findSkill('heal'), 'Heal', 1, 'Every crawler')
  heal.max = 1
  return {
    id: uid(),
    version: SCHEMA_VERSION,
    name: '',
    pronouns: '',
    crawlerNumber: String(500000 + Math.floor(Math.random() * 12400000)),
    species: 'human',
    level: 1,
    floor: 1,
    size: 4,
    baseMove: 20,
    step: 10,
    aiFavor: 1,
    popularity: 0,
    gold: 0,
    miscJunk: 0,
    base: { str: 3, int: 3, con: 3, dex: 3, cha: 3 },
    statPoints: { str: 0, int: 0, con: 0, dex: 0, cha: 0 },
    pendingStatPoints: 0,
    traits: [],
    skills: [heal],
    health: { lost: 0, dying: null },
    mana: 3,
    effects: [],
    gear: [],
    hotlist: [
      { uid: uid(), name: 'Heal', qty: 1, kind: 'spell', skillUid: heal.uid, notes: '2 Mana · heal 2 slots · Interrupt', heal: { slots: 2 } },
      ...Array(HOTLIST_SIZE - 1).fill(null),
    ],
    inventory: [],
    story: { trauma: '', looseEnds: '', regrets: '', notes: '' },
    grindHoursTotal: 0,
    log: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Bring older saved/imported characters up to the current schema. */
export function migrate(raw: unknown): Character {
  const c = { ...blankCharacter(), ...(raw as Partial<Character>) }
  const hot = Array.isArray(c.hotlist) ? c.hotlist.slice(0, HOTLIST_SIZE) : []
  while (hot.length < HOTLIST_SIZE) hot.push(null)
  return syncGearSkills(linkHotlistItems(inferItems({ ...c, hotlist: hot, version: SCHEMA_VERSION })))
}
