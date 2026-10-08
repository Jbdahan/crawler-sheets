import type { SkillDef } from '../data'

/**
 * What a Spell does, in plain words (our own paraphrase; the page reference has the full entry).
 * Pass the caster's Rank to also list the Rank upgrades they have unlocked so far.
 */
export function SpellEffect({ def, rank, small = false }: { def: SkillDef; rank?: number; small?: boolean }) {
  const text = def.effect ?? def.summary
  if (!text) return null
  const unlocked = rank === undefined ? [] : Object.entries(def.upgrades ?? {}).filter(([r]) => Number(r) <= rank)
  return (
    <div className="spell-effect">
      <p className={small ? 'small' : undefined} style={{ margin: 0 }}>{text}</p>
      {unlocked.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 8 }}>At Rank {rank}, you also have</div>
          <ul className="upgrades">
            {unlocked.map(([r, u]) => <li key={r}><span className="r">R{r}</span><span>{u.text}</span></li>)}
          </ul>
        </>
      )}
    </div>
  )
}
