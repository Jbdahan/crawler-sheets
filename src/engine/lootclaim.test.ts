import { describe, expect, it } from 'vitest'
import { blankCharacter } from './character'
import { derive } from './derived'
import { applyClaim, claimSource, decodeClaim, encodeClaim, planClaim, type Decision, type LootClaim } from './lootclaim'

const claim: LootClaim = {
  v: 1,
  id: 'box1',
  name: 'Toe Stubber',
  description: 'Ouch',
  reward: 'Gold Boss Box',
  rows: [
    { type: 'stat', stat: 'Dexterity', value: 2 },
    { type: 'skill', mode: 'boost', skill: 'Lockpicking', value: 3 },
    { type: 'spell', prefix: 'Spell Tome', spell: 'Fireball', mana: '45' },
    { type: 'gear', name: 'Bigboi Boxers', slot: 'Legs', condition: "Can't be tripped",
      mods: [{ target: 'dr', arg: '', value: 2 }, { target: 'resist', arg: 'Fire', value: 1 }, { target: 'skill', arg: 'Glove Juggling', value: 1 }] },
    { type: 'defense', target: 'evade', value: 1, dtype: '' },
    { type: 'consumable', item: 'Healing Potion', qty: 3 },
    { type: 'gold', value: 500 },
    { type: 'custom', kind: 'spell', name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone' },
    { type: 'custom', kind: 'object', name: 'Mimic Spoon', mana: '', effect: 'Glows near mimics' },
    { type: 'skill', mode: 'boost', skill: '', value: 1 },
  ],
}

const acceptAll = (keys: string[]): Record<string, Decision> => Object.fromEntries(keys.map((k) => [k, { accept: true }]))

describe('loot claims', () => {
  it('round-trips through a link', () => {
    const url = `https://example.com/app/#loot=${encodeClaim(claim)}`
    expect(decodeClaim(url)).toEqual(claim)
    expect(decodeClaim(`Claim it here: ${url} thanks`)).toEqual(claim)
    expect(decodeClaim('garbage')).toBeNull()
  })

  it('plans one verifiable change per complete row, with before → after', () => {
    const c = blankCharacter()
    const changes = planClaim(c, claim)
    expect(changes).toHaveLength(9)
    expect(changes[0].detail).toBe('Dexterity 3 → 5 (permanent)')
    expect(changes[1].detail).toBe('New Skill: Lockpicking at Rank 3')
    expect(changes[2].detail).toBe('Learn Fireball at Rank 1')
    expect(changes[3].choices?.map((x) => x.key)).toEqual(['equip', 'inventory'])
    expect(changes[6].detail).toBe('Gold 0 → 500')
  })

  it('applies approved changes, skips the rest, and logs each with its source', () => {
    const c = blankCharacter()
    const changes = planClaim(c, claim)
    const decisions = acceptAll(changes.map((x) => x.key))
    decisions[changes[6].key] = { accept: false }
    const next = applyClaim(c, claim, changes, decisions)
    const d = derive(next)

    expect(d.unenhanced.dex).toBe(5)
    expect(next.skills.find((s) => s.name === 'Lockpicking')?.rank).toBe(3)
    expect(next.skills.find((s) => s.name === 'Fireball')?.kind).toBe('spell')
    const boxers = next.gear.find((g) => g.name === 'Bigboi Boxers')!
    expect(boxers.slot).toBe('legs')
    expect(boxers.mods).toContainEqual({ target: 'resist:Fire', value: 1 })
    expect(boxers.notes).toContain('+1 Glove Juggling')
    expect(next.inventory.find((i) => i.name === 'Healing Potion')?.qty).toBe(3)
    expect(next.gold).toBe(0)
    expect(next.skills.find((s) => s.name === 'Glitter Bomb')).toMatchObject({ kind: 'spell', customMana: 8 })
    expect(next.inventory.find((i) => i.name === 'Mimic Spoon')?.notes).toBe('Glows near mimics')
    expect(next.traits.find((t) => t.source === claimSource(claim))?.mods).toContainEqual({ target: 'evade', value: 1 })
    expect(next.lootClaims).toEqual(['box1'])

    const texts = next.log.map((l) => l.text)
    expect(texts[0]).toBe('Loot: Toe Stubber (Gold Boss Box): claimed 8 of 9 items')
    expect(texts[1]).toBe('Loot: Toe Stubber (Gold Boss Box): +2 Dexterity')
    expect(texts).toContain('Loot: Toe Stubber (Gold Boss Box): skipped 500 Gold')
  })

  it('sends gear to Inventory when its slot is full', () => {
    const c = blankCharacter()
    c.gear = [{ uid: 'x', slot: 'legs', name: 'Old pants', mods: [], notes: '' }]
    const [ch] = planClaim(c, { ...claim, rows: [claim.rows[3]] })
    expect(ch.choices).toBeUndefined()
    const next = ch.apply(c)
    expect(next.gear).toHaveLength(1)
    expect(next.inventory[0].name).toBe('Bigboi Boxers')
  })

  it('labels item-only claims as coming from the GM', () => {
    const item: LootClaim = { ...claim, items: true, name: 'Custom Spell: Glitter Bomb', rows: [claim.rows[7]] }
    const c = blankCharacter()
    const changes = planClaim(c, item)
    const next = applyClaim(c, item, changes, acceptAll(changes.map((x) => x.key)))
    expect(next.log[0].text).toBe('From GM: Custom Spell: Glitter Bomb: claimed 1 of 1 item')
  })

  it('saves a custom Spell range, duration and upgrades in its notes', () => {
    const c = blankCharacter()
    const spell: LootClaim = { ...claim, rows: [{ type: 'custom', kind: 'spell', name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone',
      range: '30 ft', duration: '1 minute', upgrades: { '10': '+1d6 damage' } }] }
    const [ch] = planClaim(c, spell)
    const s = ch.apply(c).skills.find((x) => x.name === 'Glitter Bomb')!
    expect(s.notes).toBe('Blinds everyone · Range: 30 ft · Duration: 1 minute · Rank 10 upgrade: +1d6 damage')
    expect(s.customMana).toBe(8)
  })
})
