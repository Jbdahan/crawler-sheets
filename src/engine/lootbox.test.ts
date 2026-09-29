import { describe, expect, it } from 'vitest'
import { formatLootRow, itemsTitle, lootBoxHtml, lootBoxText, type LootBox } from './lootbox'

describe('loot box formatting', () => {
  it('formats each row type', () => {
    expect(formatLootRow({ type: 'stat', stat: 'Strength', value: 2 })).toEqual({ head: '', text: '+2 Strength' })
    expect(formatLootRow({ type: 'skill', mode: 'boost', skill: 'Lockpicking', value: 1 })?.text).toBe('+1 Rank: Lockpicking')
    expect(formatLootRow({ type: 'skill', mode: 'learn', skill: 'Cooking', value: 3 })).toEqual({ head: 'New Skill: Cooking', text: ' (Rank 3)' })
    expect(formatLootRow({ type: 'spell', prefix: 'Spell Tome', spell: 'Fireball', mana: '45' })).toEqual({ head: 'Spell Tome: Fireball', text: ' (Mana 45)' })
    expect(formatLootRow({ type: 'spell', prefix: 'Learn', spell: 'Tripper', mana: 'None' })?.text).toBe('')
    expect(formatLootRow({
      type: 'gear', name: 'Enchanted Bigboi Boxers', slot: 'Legs', condition: "Wearer can't be tripped",
      mods: [{ target: 'dr', arg: '', value: 2 }, { target: 'resist', arg: 'Fire', value: 0 }],
    })).toEqual({ head: 'Enchanted Bigboi Boxers (Legs)', text: ": +2 DR, Resist Fire. Wearer can't be tripped" })
    expect(formatLootRow({ type: 'defense', target: 'immune', value: 0, dtype: 'Poison' })?.text).toBe('Immunity to Poison')
    expect(formatLootRow({ type: 'defense', target: 'evade', value: 1, dtype: '' })?.text).toBe('+1 Evade')
    expect(formatLootRow({ type: 'consumable', item: 'Healing Potion', qty: 3 })?.text).toBe('3× Healing Potion')
    expect(formatLootRow({ type: 'gold', value: 1500 })?.text).toBe('1,500 Gold')
    expect(formatLootRow({ type: 'custom', kind: 'spell', name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone within 10 ft' }))
      .toEqual({ head: 'Custom Spell: Glitter Bomb', text: ' (Mana 8): Blinds everyone within 10 ft' })
    expect(formatLootRow({ type: 'custom', kind: 'object', name: 'Mimic Spoon', mana: '', effect: 'Glows near mimics' }))
      .toEqual({ head: 'Mimic Spoon', text: ': Glows near mimics' })
  })

  it('skips incomplete rows', () => {
    expect(formatLootRow({ type: 'skill', mode: 'boost', skill: '', value: 1 })).toBeNull()
    expect(formatLootRow({ type: 'gear', name: ' ', slot: 'Head', mods: [], condition: '' })).toBeNull()
  })

  it('builds the template as text and escaped HTML', () => {
    const box: LootBox = {
      name: 'Toe Stubber', description: 'Ouch <3', reward: 'Gold Boss Box',
      rows: [{ type: 'stat', stat: 'Dexterity', value: 1 }, { type: 'skill', mode: 'boost', skill: '', value: 1 }],
    }
    expect(lootBoxText(box)).toBe('New Achievement!\nToe Stubber\nOuch <3\nReward: Gold Boss Box\nContents:\n• +1 Dexterity')
    const html = lootBoxHtml(box)
    expect(html).toContain('<i>Ouch &lt;3</i>')
    expect(html).toContain('<li>+1 Dexterity</li>')
    expect(html).not.toContain('<img')
  })

  it('formats just the items, without the achievement parts', () => {
    const one: LootBox = { itemsOnly: true, name: '', description: '', reward: 'ignored', claimUrl: 'https://x/#loot=abc',
      rows: [{ type: 'custom', kind: 'spell', name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone' }] }
    expect(lootBoxText(one)).toBe('Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\nClaim it in Crawler Sheets: https://x/#loot=abc')
    expect(lootBoxHtml(one)).not.toContain('New Achievement')
    expect(lootBoxHtml(one)).not.toContain('<ul')
    const two = { ...one, claimUrl: undefined, rows: [...one.rows, { type: 'gold' as const, value: 5 }] }
    expect(lootBoxText(two)).toBe('• Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\n• 5 Gold')
    expect(itemsTitle(two.rows)).toBe('Custom Spell: Glitter Bomb + 1 more')
    const titled = { ...two, name: "Goblin's Stash" }
    expect(lootBoxText(titled)).toBe("Goblin's Stash\n• Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\n• 5 Gold")
    expect(lootBoxHtml(titled)).toContain("<b>Goblin's Stash</b>")
    const described = { ...titled, description: 'Smells faintly of socks.' }
    expect(lootBoxText(described)).toBe("Goblin's Stash\nSmells faintly of socks.\n• Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\n• 5 Gold")
    expect(lootBoxHtml(described)).toContain('<i>Smells faintly of socks.</i>')
  })

  it('lists a custom Spell range, duration and upgrades under its bullet', () => {
    const spell = { type: 'custom' as const, kind: 'spell' as const, name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone',
      range: '30 ft', duration: '1 minute', upgrades: { '5': 'Range doubles', '15': 'Also Deafened' } }
    expect(formatLootRow(spell)?.sub).toEqual(['Range: 30 ft', 'Duration: 1 minute', 'Rank 5 upgrade: Range doubles', 'Rank 15 upgrade: Also Deafened'])
    const box: LootBox = { name: 'Toe Stubber', description: '', reward: '', rows: [spell] }
    expect(lootBoxText(box)).toContain('• Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\n    ◦ Range: 30 ft\n    ◦ Duration: 1 minute')
    expect(lootBoxHtml(box)).toContain('<li>Rank 5 upgrade: Range doubles</li>')
    expect(lootBoxText({ ...box, itemsOnly: true, name: '' })).toBe('Custom Spell: Glitter Bomb (Mana 8): Blinds everyone\n  ◦ Range: 30 ft\n  ◦ Duration: 1 minute\n  ◦ Rank 5 upgrade: Range doubles\n  ◦ Rank 15 upgrade: Also Deafened')
    expect(formatLootRow({ ...spell, range: '', duration: undefined, upgrades: undefined })?.sub).toBeUndefined()
  })
})
