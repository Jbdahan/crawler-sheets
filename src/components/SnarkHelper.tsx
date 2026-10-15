import { useState } from 'react'
import { SNARK_TAGS, generateNames, generateSnark, type SnarkTag } from '../engine/snark'
import { askClaude, loadApiKey, saveApiKey } from '../engine/snarkAi'
import { toast } from './ui'

/**
 * Generator under the achievement name and System AI text: pick what happened,
 * then roll snark and name ideas offline, or ask Claude with the GM's own key.
 */
export function SnarkHelper({ name, snark, tier, category, tags, notes, onTags, onNotes, onName, onSnark }: {
  name: string
  /** the current System AI text, kept so a roll can be undone */
  snark: string
  tier: string
  category: string
  tags: SnarkTag[]
  notes: string
  onTags: (tags: SnarkTag[]) => void
  onNotes: (notes: string) => void
  onName: (name: string) => void
  onSnark: (snark: string) => void
}) {
  const [names, setNames] = useState<string[]>([])
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  // the GM's own text from before the latest roll, and what the generator last wrote
  const [prev, setPrev] = useState<string | null>(null)
  const [rolled, setRolled] = useState<string | null>(null)
  const fill = (text: string) => {
    if (snark !== rolled) setPrev(snark)
    setRolled(text)
    onSnark(text)
  }

  const toggle = (t: SnarkTag) => onTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])
  const cat = category === '__custom' ? '' : category

  const ask = async () => {
    if (!apiKey) { setShowKey(true); return }
    setBusy(true)
    try {
      const out = await askClaude(apiKey, { name, tier, category: cat, tags, notes })
      fill(out.snark)
      setNames(out.names)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack snark-helper">
      <div>
        <div className="label">Snark generator · what happened? <span className="small muted">(pick any)</span></div>
        <div className="chips" style={{ marginTop: 6 }}>
          {SNARK_TAGS.map((t) => (
            <button key={t.id} type="button" className={`chip${tags.includes(t.id) ? ' on' : ''}`} aria-pressed={tags.includes(t.id)} onClick={() => toggle(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid2">
        <button type="button" className="btn" onClick={() => fill(generateSnark({ name, tier, tags, avoid: snark }))}>🎲 Roll snark</button>
        <button type="button" className="btn" onClick={() => setNames(generateNames(tags))}>🎲 Name ideas</button>
      </div>
      {prev !== null && prev.trim() && prev !== snark && (
        <button type="button" className="btn small ghost" onClick={() => { onSnark(prev); setPrev(null); setRolled(null) }}>↩ Put back my own text</button>
      )}
      {names.length > 0 && (
        <div>
          <div className="small muted">Tap a name to use it</div>
          <div className="chips" style={{ marginTop: 6 }}>
            {names.map((n) => <button key={n} type="button" className={`chip${n === name ? ' on' : ''}`} onClick={() => onName(n)}>{n}</button>)}
          </div>
        </div>
      )}

      <details>
        <summary className="small">Ask Claude for tailored snark <span className="muted">(optional, needs your API key)</span></summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <label><span className="label">What happened at the table</span>
            <textarea value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="e.g. Tripped into the goblin king's soup, then set it on fire to escape" />
          </label>
          {(showKey || !apiKey) ? (
            <div className="stack">
              <p className="small muted">Paste an Anthropic API key from console.anthropic.com. It stays on this device and is sent only to Anthropic. Each request costs a fraction of a cent on your account.</p>
              <input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" aria-label="Anthropic API key" />
              <button type="button" className="btn" disabled={!keyDraft.trim()} onClick={() => { saveApiKey(keyDraft); setApiKey(keyDraft.trim()); setKeyDraft(''); setShowKey(false); toast('Key saved on this device') }}>Save key</button>
            </div>
          ) : (
            <div className="row between">
              <button type="button" className="btn primary grow" disabled={busy} onClick={ask}>{busy ? 'Asking Claude…' : '✨ Ask Claude'}</button>
              <button type="button" className="btn small ghost" onClick={() => { saveApiKey(''); setApiKey(''); toast('Key removed') }}>Forget key</button>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
