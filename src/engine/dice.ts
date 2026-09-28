import type { Dice } from '../data'

/** Uniform integer in [1, sides] from the platform CSPRNG. */
export function rollDie(sides: number): number {
  if (sides <= 1) return 1
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / sides) * sides
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= limit)
  return (buf[0] % sides) + 1
}

export interface D20Roll {
  rolls: number[]
  kept: number
  mode: 'normal' | 'advantage' | 'disadvantage'
}

/** Advantage and Disadvantage cancel; multiples don't stack (Core p.60). */
export function netMode(advantages: number, disadvantages: number): D20Roll['mode'] {
  if (advantages > 0 && disadvantages === 0) return 'advantage'
  if (disadvantages > 0 && advantages === 0) return 'disadvantage'
  return 'normal'
}

export function rollD20(mode: D20Roll['mode'] = 'normal', rng = rollDie): D20Roll {
  const a = rng(20)
  if (mode === 'normal') return { rolls: [a], kept: a, mode }
  const b = rng(20)
  return { rolls: [a, b], kept: mode === 'advantage' ? Math.max(a, b) : Math.min(a, b), mode }
}

export type Degree = 'critical-hit' | 'amazing' | 'success' | 'near-miss' | 'fail' | 'major-fail' | 'critical-fail'

export const DEGREE_LABEL: Record<Degree, string> = {
  'critical-hit': 'Critical Hit!',
  amazing: 'Amazing Success',
  success: 'Success',
  'near-miss': 'Near Miss',
  fail: 'Fail',
  'major-fail': 'Major Fail',
  'critical-fail': 'Critical Fail',
}

/** Degrees of Success & Failure (Core p.60–61). Natural 20/1 override the margin. */
export function degreeOf(natural: number, total: number, difficulty: number): Degree {
  if (natural === 20) return 'critical-hit'
  if (natural === 1) return 'critical-fail'
  const diff = total - difficulty
  if (diff >= 10) return 'amazing'
  if (diff >= 0) return 'success'
  if (diff >= -2) return 'near-miss'
  if (diff > -10) return 'fail'
  return 'major-fail'
}

export const isSuccess = (d: Degree) => d === 'critical-hit' || d === 'amazing' || d === 'success'

export interface DicePool {
  /** grouped dice, e.g. [{count:3, sides:10}] */
  dice: Dice[]
  flat: number
}

export function addDice(pool: Dice[], d: Dice): Dice[] {
  const out = pool.map((x) => ({ ...x }))
  const same = out.find((x) => x.sides === d.sides)
  if (same) same.count += d.count
  else out.push({ ...d })
  return out.sort((a, b) => b.sides - a.sides)
}

export function formatDice(dice: Dice[], flat = 0): string {
  const parts = dice.filter((d) => d.count > 0).map((d) => `${d.count}d${d.sides}`)
  let s = parts.join(' + ')
  if (flat > 0) s += s ? `+${flat}` : `${flat}`
  else if (flat < 0) s += `${flat}`
  return s || '0'
}

/** Parse "2d6+3", "1d4", "3" (used for custom attacks and potions). */
export function parseDice(expr: string): DicePool | null {
  const s = expr.replace(/\s+/g, '').toLowerCase()
  if (!s) return null
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g
  let m: RegExpExecArray | null
  let dice: Dice[] = []
  let flat = 0
  let consumed = 0
  while ((m = re.exec(s))) {
    consumed += m[0].length
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1
      dice = addDice(dice, { count: sign * Number(m[2] || 1), sides: Number(m[3]) })
    } else {
      flat += (m[4] === '-' ? -1 : 1) * Number(m[5])
    }
  }
  if (consumed !== s.length) return null
  return { dice, flat }
}

export function rollPool(pool: DicePool, rng = rollDie): { total: number; faces: number[] } {
  const faces: number[] = []
  let total = pool.flat
  for (const d of pool.dice) {
    for (let i = 0; i < Math.abs(d.count); i++) {
      const f = rng(d.sides)
      faces.push(f)
      total += Math.sign(d.count) * f
    }
  }
  return { total, faces }
}

/** Table 37: Rank damage dice (Core p.176). Rank 1 is a flat +1. */
export function rankDamageDice(rank: number): DicePool {
  if (rank <= 0) return { dice: [], flat: 0 }
  if (rank === 1) return { dice: [], flat: 1 }
  if (rank <= 3) return { dice: [{ count: 1, sides: 2 }], flat: 0 }
  if (rank <= 5) return { dice: [{ count: 1, sides: 4 }], flat: 0 }
  if (rank <= 7) return { dice: [{ count: 1, sides: 6 }], flat: 0 }
  if (rank <= 9) return { dice: [{ count: 1, sides: 8 }], flat: 0 }
  if (rank <= 11) return { dice: [{ count: 1, sides: 10 }], flat: 0 }
  if (rank <= 13) return { dice: [{ count: 1, sides: 12 }], flat: 0 }
  if (rank <= 15) return { dice: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }], flat: 0 }
  if (rank <= 17) return { dice: [{ count: 2, sides: 8 }], flat: 0 }
  if (rank <= 19) return { dice: [{ count: 1, sides: 10 }, { count: 1, sides: 8 }], flat: 0 }
  return { dice: [{ count: 2, sides: 10 }], flat: 0 }
}
