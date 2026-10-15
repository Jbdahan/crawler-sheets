// Optional "Ask Claude" for achievement snark. The app has no server, so each
// GM pastes their own Anthropic API key; it stays in this browser and is sent
// only to Anthropic. The SDK is loaded on demand so the offline app stays small.
import { SNARK_TAGS, type SnarkTag } from './snark'

const KEY = 'snark.apiKey'

export function loadApiKey(): string {
  try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
}
export function saveApiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY, key.trim())
    else localStorage.removeItem(KEY)
  } catch { /* private mode: key lasts for this visit only */ }
}

export interface AiSnarkInput {
  name: string
  tier: string
  category: string
  tags: SnarkTag[]
  /** what actually happened at the table */
  notes: string
}
export interface AiSnark { names: string[]; snark: string }

const SYSTEM = `You write achievement announcements for a tabletop game inspired by the Dungeon Crawler Carl books. You are the dungeon's System AI: sarcastic, theatrical, smugly bureaucratic, secretly delighted by chaos, and contemptuous of the crawlers while obsessed with ratings and the audience.

Write original text. Do not quote or closely paraphrase lines from the books, and don't use the books' named characters.

The snark is 2 to 5 sentences, about 40 to 90 words, plain text with no markdown or emoji. It reacts to what the crawler did, ideally with a backhanded compliment and a parting jab. Achievement names are short, punny or ironic, 1 to 5 words each.`

const SCHEMA = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string' }, description: 'five achievement name ideas' },
    snark: { type: 'string', description: 'the System AI announcement text' },
  },
  required: ['names', 'snark'],
  additionalProperties: false,
}

export async function askClaude(apiKey: string, input: AiSnarkInput): Promise<AiSnark> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const labels = input.tags.map((t) => SNARK_TAGS.find((x) => x.id === t)?.label ?? t)
  const facts = [
    input.name.trim() && `Achievement name (keep it, and suggest alternatives anyway): ${input.name.trim()}`,
    `Reward: ${[input.tier, input.category, 'Box'].filter(Boolean).join(' ')}`,
    labels.length && `Themes: ${labels.join(', ')}`,
    input.notes.trim() && `What happened: ${input.notes.trim()}`,
  ].filter(Boolean).join('\n')

  try {
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: facts || 'Surprise me with a generic achievement.' }],
    })
    if (res.stop_reason === 'refusal') throw new Error('Claude declined that one. Try different notes.')
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const out = JSON.parse(text) as AiSnark
    return { names: out.names.filter(Boolean).slice(0, 6), snark: out.snark.trim() }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("That API key didn't work. Check it and try again.")
    if (e instanceof Anthropic.RateLimitError) throw new Error('Too many requests. Wait a moment and try again.')
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Claude. Are you online?")
    if (e instanceof Anthropic.APIError) throw new Error(`Claude error ${e.status ?? ''}: ${e.message}`)
    throw e
  }
}
