import { describe, expect, it } from 'vitest'
import { SNARK_BANK, SNARK_TAGS, generateNames, generateSnark, type Rand } from './snark'

/** deterministic rand for repeatable output */
function seeded(seed: number): Rand {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

describe('snark generator', () => {
  it('names the achievement and ends with a sentence', () => {
    const s = generateSnark({ name: 'Toe Stubber!', tier: 'Bronze', tags: ['dumb'] }, seeded(1))
    expect(s).toContain('You have earned the Toe Stubber achievement.')
    expect(s).toMatch(/[.!?]$/)
  })

  it('works with no name, tier or tags', () => {
    const s = generateSnark({ tags: [] }, seeded(2))
    expect(s.length).toBeGreaterThan(20)
    expect(s).not.toContain('undefined')
  })

  it('every tag has lines and names', () => {
    for (const { id } of SNARK_TAGS) {
      for (let i = 0; i < 20; i++) expect(generateSnark({ tags: [id] }, seeded(i))).not.toContain('undefined')
      expect(generateNames([id], 5, seeded(3))).toHaveLength(5)
    }
  })

  it('suggests distinct names', () => {
    const names = generateNames(['boss', 'boom'], 8, seeded(4))
    expect(new Set(names).size).toBe(8)
    expect(generateNames([], 5, seeded(5))).toHaveLength(5)
  })

  it('stays fast and short', () => {
    const s = generateSnark({ name: 'X', tier: 'Celestial', tags: ['kill', 'boss', 'crowd'] }, seeded(6))
    expect(s.length).toBeLessThan(800)
  })
  it('has a big bank with no repeated lines', () => {
    const { OPENERS, CORES, GENERIC_CORES, TIER_REMARKS, CLOSERS, NAMES, GENERIC_NAMES } = SNARK_BANK
    const lines = [OPENERS, GENERIC_CORES, CLOSERS, GENERIC_NAMES, ...Object.values(CORES), ...Object.values(TIER_REMARKS), ...Object.values(NAMES)].flat()
    expect(new Set(lines).size).toBe(lines.length)
    expect(OPENERS.length).toBeGreaterThanOrEqual(40)
    expect(CLOSERS.length).toBeGreaterThanOrEqual(40)
    for (const xs of Object.values(CORES)) expect(xs.length).toBeGreaterThanOrEqual(14)
    for (const xs of Object.values(TIER_REMARKS)) expect(xs.length).toBeGreaterThanOrEqual(6)
    for (const xs of Object.values(NAMES)) expect(xs.length).toBeGreaterThanOrEqual(18)
  })
  it('re-rolls skip the previous roll\'s lines', () => {
    const rand = seeded(7)
    let last = generateSnark({ tags: ['boss'] }, rand)
    for (let i = 0; i < 30; i++) {
      const next = generateSnark({ tags: ['boss'], avoid: last }, rand)
      const sentences = (t: string) => t.split(/(?<=[.!?:])\s+(?=[A-Z])/)
      expect(sentences(next)[0]).not.toBe(sentences(last)[0])
      last = next
    }
  })
})
