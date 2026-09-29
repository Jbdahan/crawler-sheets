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
      .toEqual({ head: 'Custom Spell: Glitter Bomb', text: '', sub: [{ label: 'Mana Cost', text: '8' }, { label: '', text: 'Blinds everyone within 10 ft' }] })
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
    expect(lootBoxText(one)).toBe('Custom Spell: Glitter Bomb\n  Mana Cost: 8\n  Blinds everyone\nClaim it in Crawler Sheets: https://x/#loot=abc')
    expect(lootBoxHtml(one)).not.toContain('New Achievement')
    expect(lootBoxHtml(one)).not.toContain('<ul')
    const two = { ...one, claimUrl: undefined, rows: [...one.rows, { type: 'gold' as const, value: 5 }] }
    expect(lootBoxText(two)).toBe('• Custom Spell: Glitter Bomb\n    Mana Cost: 8\n    Blinds everyone\n• 5 Gold')
    expect(itemsTitle(two.rows)).toBe('Custom Spell: Glitter Bomb + 1 more')
    const titled = { ...two, name: "Goblin's Stash" }
    expect(lootBoxText(titled)).toBe("Goblin's Stash\n• Custom Spell: Glitter Bomb\n    Mana Cost: 8\n    Blinds everyone\n• 5 Gold")
    expect(lootBoxHtml(titled)).toContain("<b>Goblin's Stash</b>")
    const described = { ...titled, description: 'Smells faintly of socks.' }
    expect(lootBoxText(described)).toBe("Goblin's Stash\nSmells faintly of socks.\n• Custom Spell: Glitter Bomb\n    Mana Cost: 8\n    Blinds everyone\n• 5 Gold")
    expect(lootBoxHtml(described)).toContain('<i>Smells faintly of socks.</i>')
  })

  it('lays out a custom Spell like a Core Rulebook entry', () => {
    const spell = { type: 'custom' as const, kind: 'spell' as const, name: 'Glitter Bomb', mana: '8', effect: 'Blinds everyone',
      keywords: 'Attack, Force', quote: 'Sparkly.', range: '30 feet', duration: '1 minute', cooldown: 'Once per scene',
      limitations: 'Line of sight', aiFavor: '1', baseDamage: '1d6 + Int Force', upgrades: { '5': 'Range doubles', '15': 'Also Deafened' } }
    expect(formatLootRow(spell)?.sub?.map((x) => x.label || x.text)).toEqual([
      'Attack, Force', '“Sparkly.”', 'Mana Cost', 'Range', 'Duration', 'Cooldown', 'AI Favor', 'Limitations', 'Base Damage',
      'Blinds everyone', 'Rank 5', 'Rank 15',
    ])
    const box: LootBox = { name: 'Toe Stubber', description: '', reward: '', rows: [spell] }
    expect(lootBoxText(box)).toContain('• Custom Spell: Glitter Bomb\n    Attack, Force\n    “Sparkly.”\n    Mana Cost: 8\n    Range: 30 feet\n    Duration: 1 minute\n    Cooldown: Once per scene')
    const html = lootBoxHtml(box)
    expect(html).toContain('<br><b>Cooldown:</b> Once per scene')
    expect(html).toContain('<br><i>“Sparkly.”</i>')
    expect(html).toContain('<br><b>Rank 5:</b> Range doubles')
    expect(formatLootRow({ ...spell, mana: '', effect: '', keywords: '', quote: undefined, range: '', duration: '', cooldown: '',
      limitations: '', aiFavor: '', baseDamage: '', upgrades: undefined })?.sub).toBeUndefined()
  })
})
