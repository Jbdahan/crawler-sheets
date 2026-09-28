# Crawler Sheets

A character sheet and tracker for the Dungeon Crawler Carl RPG, built for iPhone and iPad. It's an installable web app (PWA): open it in Safari, then Share → Add to Home Screen. Each device saves its own characters.

It's an unofficial fan tool. The app contains only mechanics (numbers, dice, upgrades) plus short paraphrased summaries, and every entry cites its page in the Core Rulebook. Use the book for the full rules.

## What it does
- **HUD:** the 10-slot Health Bar (each slot is worth your Con Mod), a Take-damage keypad that applies DR, then Resistance/Vulnerability/Immunity, then converts to slots, healing, Dying countdown, rests, Mana, Evade (tap to roll), DR, Move/Step, AI Favor, Size, and this floor's Difficulties.
- **Attacks:** to-hit and damage for every weapon and Attack Spell, recalculated from Rank, Stat Mods, Buffs/Debuffs, gear and Floor. Upgrade dice unlock at Ranks 5/10/15, the Rank damage die follows Table 37, a crit doubles the base dice, and an Amazing Success adds +Floor. Casting a Spell spends its Mana.
- **Hotlist:** 10 slots with quantities. Using an item spends one and applies its effect (healing, Mana, removing a Debuff). Spells cast from here.
- **Skills:** every Skill and Spell from the book, with advancement marks, 2-hour and end-of-floor Advancement Checks, and grinding.
- **Level up:** 2 hours of play, Quest, Boss tier, crawler kill (1d6 ± level difference) or a GM award. Each Level banks 3 Stat points. Points from the Tutorial Floors are applied on reaching Floor 3, which also opens the Race & Class wizard. Race & Class Skill bonuses stop at Rank 10, and Rank-20 permissions are applied.
- **Buffs & Debuffs:** all 27 Debuffs from Table 11 apply automatically (injuries, Fatigued, Woozy, Disadvantage flags, damage over time). Buffs are named or custom, with a limit of 3 External Buffs.
- **Gear & Inventory:** gear slots with bonus editors (Stats, Skills, DR, Evade, resistances), inventory, gold and Misc. Junk.
- **Dice roller:** Advantage/Disadvantage, AI Favor reroll, Intervene, Called Play, degree of success, and damage.
- **Share:** export a file (AirDrop/Messages), an import link, a QR code, and a printable 4-page landscape sheet.
- **Create:** a Level 1 wizard (backgrounds, starting weapon or Spell, Stats, story, gear), or a blank sheet for copying an existing character.

## Run it locally
```bash
npm install
npm run dev
```
Open http://localhost:5173 on this Mac.

**On your iPhone or iPad:** connect to the same Wi-Fi and open `http://<this Mac's IP>:5173` in Safari. `ipconfig getifaddr en0` prints the IP. You can Add to Home Screen for testing. Over plain HTTP on the LAN, offline mode and the share sheet are unavailable, and links are copied by long-press. Both work once the app is hosted over HTTPS.

Characters are stored per web address, so the LAN copy and a later hosted copy are separate. Move characters between them with Export/Import.

## Tests and checks
```bash
npm test          # rules engine tests, using the book's own worked examples
npx tsc -b        # type-check
npm run lint
```

## Rules data
`src/data/*.json` is generated from the indexed rulebooks in `../dcc-rules`:
```bash
npm run extract   # PDF → tools/raw/*.json (full text; gitignored, never publish)
npm run data      # tools/raw → src/data/*.json (mechanics + summaries only)
```
Hand fixes live in `tools/overrides.py`, and the one-line summaries live in `tools/summaries.py`.

## Hosting for other players (later)
`npm run build` produces a static `dist/` folder that works from any path. Deploy it to Cloudflare Pages or GitHub Pages. Players then open the URL in Safari → Share → Add to Home Screen, and it works offline after that.
