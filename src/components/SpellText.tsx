import { useState } from 'react'

/**
 * A custom Spell's entry is saved in its notes as "Mana Cost: 5 · Range: 30 feet · … · Rank 5: …".
 * Show it one line per field, labels in bold, collapsed to a few lines with a Show more toggle.
 */
export function SpellText({ text, lines = 3, startOpen = false }: { text: string; lines?: number; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const parts = text.split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const shown = open ? parts : parts.slice(0, lines)
  return (
    <div className="spelltext">
      {shown.map((p, i) => {
        const m = p.match(/^([A-Z][A-Za-z ]{1,24}\d*):\s+(.*)$/)
        return (
          <div key={i}>
            {m ? <><b>{m[1]}:</b> {m[2]}</> : p}
          </div>
        )
      })}
      {parts.length > lines && (
        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
          {open ? 'Show less' : `Show more (${parts.length - lines})`}
        </button>
      )}
    </div>
  )
}
