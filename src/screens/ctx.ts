import type { Derived } from '../engine/derived'
import type { Character } from '../engine/types'

export interface Ctx {
  c: Character
  d: Derived
  up: (fn: (c: Character) => Character) => void
}
