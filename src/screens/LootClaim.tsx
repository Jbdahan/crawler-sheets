import { useMemo, useState } from 'react'
import { applyClaim, claimSource, decodeClaim, planClaim, type Decision, type LootClaim } from '../engine/lootclaim'
import { Seg, toast } from '../components/ui'
import { useStore } from '../store/characters'
import { go } from '../router'

/** Full-screen claim, opened from a GM's link (#loot=…). */
export function LootClaimScreen({ data }: { data: string }) {
  const claim = useMemo(() => decodeClaim(data), [data])
  return (
    <div className="app">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go('/')} aria-label="Back">‹</button>
        <div className="title"><h1>Claim loot</h1><div className="sub">Review each reward before it goes on your sheet</div></div>
      </div>
      {claim ? <ClaimReview claim={claim} onDone={(id) => go(`/c/${id}/more`)} /> : (
        <div className="card">
          <p>That loot link is damaged or incomplete. Ask your GM to copy it again.</p>
          <button className="btn" onClick={() => go('/')}>Back to crawlers</button>
        </div>
      )}
    </div>
  )
}

/** Pick a crawler (unless fixed), approve or skip each change, then apply and log it. */
export function ClaimReview({ claim, charId, onDone }: { claim: LootClaim; charId?: string; onDone: (id: string) => void }) {
  const { characters, order, update } = useStore()
  const list = order.map((id) => characters[id]).filter(Boolean)
  const [pick, setPick] = useState(charId ?? (list.length === 1 ? list[0].id : ''))
  const c = characters[pick]
  const changes = useMemo(() => (c ? planClaim(c, claim) : []), [c, claim])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [again, setAgain] = useState(false)

  const alreadyClaimed = !!c?.lootClaims?.includes(claim.id)
  const decide = (key: string, dec: Decision) => setDecisions((x) => ({ ...x, [key]: dec }))
  const undecided = changes.filter((ch) => !decisions[ch.key]).length
  const approved = changes.filter((ch) => decisions[ch.key]?.accept).length

  const apply = () => {
    if (!c) return
    update(c.id, (x) => applyClaim(x, claim, planClaim(x, claim), decisions))
    toast(`Added ${approved} of ${changes.length} to ${c.name || 'your crawler'}`)
    onDone(c.id)
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="label">From your GM</div>
        <h2 style={{ marginTop: 4 }}>New Achievement! {claim.name}</h2>
        {claim.description && <p className="muted"><i>{claim.description}</i></p>}
        {claim.reward && <p><b>Reward:</b> {claim.reward}</p>}
      </div>

      {!charId && (
        <div className="card">
          <label><span className="label">Which crawler gets this?</span>
            <select value={pick} onChange={(e) => { setPick(e.target.value); setDecisions({}); setAgain(false) }}>
              <option value="">Choose a crawler…</option>
              {list.map((x) => <option key={x.id} value={x.id}>{x.name || 'Unnamed'} (Level {x.level})</option>)}
            </select>
          </label>
          {!list.length && (
            <p className="small muted">There are no crawlers on this device yet. Create or import yours first, then open this link again.
              If you use Crawler Sheets from your home screen, open the app and use <i>More → Claim loot</i> to paste the link there instead.</p>
          )}
        </div>
      )}

      {c && alreadyClaimed && !again && (
        <div className="warnbox">
          <b>{c.name || 'This crawler'}</b> already claimed this loot box. Claiming it again would add everything twice.
          <div style={{ marginTop: 8 }}><button className="btn small" onClick={() => setAgain(true)}>Claim it again anyway</button></div>
        </div>
      )}

      {c && (!alreadyClaimed || again) && (
        <>
          <div className="infobox">
            Check each reward and tap <b>Add</b> or <b>Skip</b>. Nothing changes on your sheet until you tap the button at the bottom.
            Everything you add or skip goes into <i>More → History</i> as <b>{claimSource(claim)}</b>.
          </div>
          {!changes.length && <div className="card empty">This loot box has nothing to add.</div>}
          {changes.map((ch, i) => {
            const dec = decisions[ch.key]
            return (
              <div key={ch.key} className={`card claim-item${dec ? (dec.accept ? ' ok' : ' skip') : ''}`}>
                <div className="small faint">{i + 1} of {changes.length}</div>
                <div style={{ fontWeight: 700 }}>{ch.title}</div>
                <div className="small muted" style={{ marginTop: 2 }}>{ch.detail}</div>
                {ch.choices && (
                  <div style={{ marginTop: 8 }}>
                    <Seg value={dec?.choice ?? ch.choices[0].key} options={ch.choices.map((o) => ({ value: o.key, label: o.label }))}
                      onChange={(choice) => decide(ch.key, { accept: true, choice })} />
                  </div>
                )}
                <div className="grid2" style={{ marginTop: 8 }}>
                  <button className={`btn${dec?.accept ? ' good' : ''}`} disabled={ch.noop}
                    onClick={() => decide(ch.key, { accept: true, choice: dec?.choice ?? ch.choices?.[0].key })}>
                    {dec?.accept ? '✓ Adding' : 'Add'}
                  </button>
                  <button className={`btn${dec && !dec.accept ? ' bad' : ''}`} onClick={() => decide(ch.key, { accept: false })}>
                    {dec && !dec.accept ? 'Skipped' : 'Skip'}
                  </button>
                </div>
              </div>
            )
          })}
          {changes.length > 0 && (
            <div className="card stack">
              <button className="btn primary" disabled={undecided > 0} onClick={apply}>
                {undecided > 0 ? `Decide on ${undecided} more` : `Add ${approved} of ${changes.length} to ${c.name || 'this crawler'}`}
              </button>
              {undecided > 0 && (
                <button className="btn ghost small" onClick={() => setDecisions((x) => {
                  const next = { ...x }
                  for (const ch of changes) if (!next[ch.key]) next[ch.key] = ch.noop ? { accept: false } : { accept: true, choice: ch.choices?.[0].key }
                  return next
                })}>Add all the rest</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
