# Loot Box generator for Google Docs

> **Easier option:** Crawler Sheets has a built-in **Loot Box Maker** page (Home → GM: Loot Box Maker). Fill it in, tap **Copy for Google Docs**, and paste into any Doc. Nothing to install. Use this sidebar only if you want the generator inside the Doc itself.

A sidebar for the GM's Google Doc. You fill in an achievement and its loot box with dropdowns, and **Insert into Doc** writes it at the cursor:

```
New Achievement!
<Achievement name>
<the AI's snarky description>
Reward: Gold Boss Box
[optional picture]
Contents:
  • +2 Strength
  • +1 Rank: Lockpicking
  • Spell Tome: Fire Fingers (Mana 3)
  • Enchanted Bigboi Boxers (Legs): +2 DR, Resist Fire. Wearer can't be tripped
  • Custom Spell: Glitter Bomb (Mana 8): Blinds everyone within 10 ft
```

Contents rows can be Stat boost, Skill (Rank boost or a new Skill), Spell (Mana filled in automatically), Gear (slot, bonuses, special condition), Defense (DR, Evade, Resistance, Immunity, Vulnerability), Consumable, Gold, or **Custom**. Custom covers a Spell with a Mana cost, an Object with a special condition, or anything else.

## Install (one time, about 2 minutes)
1. Open the Google Doc, then choose **Extensions → Apps Script**.
2. Paste the contents of [`Code.gs`](Code.gs) into the `Code.gs` file that's already there.
3. Click **+ → Script**, name it `Data`, and paste in [`Data.gs`](Data.gs).
4. Click **+ → HTML**, name it `Sidebar`, and paste in [`Sidebar.html`](Sidebar.html).
5. Click **Untitled project** at the top and rename it **Loot Box Generator**. Google names the menu after the project.
6. Save (💾), then reload the Doc.
7. Choose **Extensions → Loot Box Generator → Open generator**. Google asks you to authorize the script the first time. If you see "Google hasn't verified this app", click **Advanced → Go to (project)**. That warning is normal for a personal script.

The script can only edit the Doc it's attached to, plus fetch a picture when you use the **URL** option.

## Pictures
Choose **Upload** (PNG/JPG/GIF, up to 5 MB) or paste an image **URL**, then set the width. If a URL can't be fetched, the rest of the box is still inserted and the sidebar shows a warning.

## Updating the lists
The Skills, Spells, damage types, gear slots and consumables come from the Crawler Sheets catalog. After the app's data changes:
```bash
npm run lootbox
```
Then paste the new `Data.gs` into the Apps Script project. Only names and Mana costs are exported, with no rulebook text.

## Testing locally
`preview.html` runs the sidebar with Google's API stubbed out:
```bash
python3 -m http.server 8765 -d gdocs-lootbox
```
Then open http://localhost:8765/preview.html.
