// Mob, NPC, crawler and Boss stat blocks built by tools/build_monsters.py (mechanics only:
// numbers, attack lines and short condensed effect tags; the books have the full text).
import monstersJson from './monsters.json'

export interface MonsterAttack {
  name: string
  /** Evade Difficulty, e.g. "15+F"; null when the attack auto-hits */
  hit: string | null
  /** damage, type and reach, e.g. "3d8+5 Bludg, 5ft" */
  text: string
  /** condensed effects, e.g. "Hit: Held", "Evade MF+: Blood Trail" */
  fx?: string[]
  /** the book has more to say about this attack than the tags */
  more?: boolean
}

export interface MonsterDef {
  id: string
  name: string
  /** a named character's heading above the block, e.g. "Annie Hariston" */
  character?: string
  tier: string
  boss: boolean
  size: string
  type: string
  level: number
  surprise: string
  evade: string
  move: string
  dr: string
  /** Health Bar: slot count and Health per slot (a list when slots differ) */
  hb: { slots: number; per: number | number[] }
  /** [score, mod] for Str, Int, Con, Dex, Cha */
  stats: ([number, number] | null)[]
  attacks: MonsterAttack[]
  /** names of the special rules in the book's Notes */
  notes: string[]
  book: string
  page: number
  alsoPages?: number[]
  /** e.g. "The Third Floor: The Over City" */
  part: string
  /** e.g. "Neighborhood: Heavensworth" */
  section: string
}

/** In the books' order (book, then page). */
export const MONSTERS = monstersJson as unknown as MonsterDef[]
export const findMonster = (id: string) => MONSTERS.find((m) => m.id === id)
