import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { uid } from '../engine/advancement'
import { migrate } from '../engine/character'
import { syncGearSkills } from '../engine/items'
import type { Character } from '../engine/types'

export interface RollRecord {
  id: string
  at: number
  charName: string
  label: string
  detail: string
  total: number
}

interface State {
  characters: Record<string, Character>
  order: string[]
  rolls: RollRecord[]
  lastBackup: number
  add: (c: Character) => string
  update: (id: string, fn: (c: Character) => Character) => void
  remove: (id: string) => void
  duplicate: (id: string) => string | undefined
  importCharacter: (raw: unknown) => string
  logRoll: (r: Omit<RollRecord, 'id' | 'at'>) => void
  clearRolls: () => void
  markBackedUp: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      characters: {},
      order: [],
      rolls: [],
      lastBackup: 0,
      add: (c) => {
        set((s) => ({ characters: { ...s.characters, [c.id]: c }, order: [...s.order.filter((x) => x !== c.id), c.id] }))
        return c.id
      },
      update: (id, fn) =>
        set((s) => {
          const cur = s.characters[id]
          if (!cur) return s
          const next = syncGearSkills(fn(cur))
          if (next === cur) return s
          return { characters: { ...s.characters, [id]: { ...next, updatedAt: Date.now() } } }
        }),
      remove: (id) =>
        set((s) => {
          const characters = { ...s.characters }
          delete characters[id]
          return { characters, order: s.order.filter((x) => x !== id) }
        }),
      duplicate: (id) => {
        const src = get().characters[id]
        if (!src) return undefined
        const copy: Character = { ...structuredClone(src), id: uid(), name: `${src.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }
        return get().add(copy)
      },
      importCharacter: (raw) => {
        const c = migrate(raw)
        // imports never overwrite: give a fresh id if this one exists
        const exists = !!get().characters[c.id]
        return get().add(exists ? { ...c, id: uid() } : c)
      },
      logRoll: (r) => set((s) => ({ rolls: [{ ...r, id: uid(), at: Date.now() }, ...s.rolls].slice(0, 100) })),
      clearRolls: () => set({ rolls: [] }),
      markBackedUp: () => set({ lastBackup: Date.now() }),
    }),
    {
      name: 'dcc-crawler-sheets',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ characters: s.characters, order: s.order, rolls: s.rolls, lastBackup: s.lastBackup }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const characters: Record<string, Character> = {}
        for (const [id, c] of Object.entries(p.characters ?? {})) characters[id] = migrate(c)
        return { ...current, ...p, characters }
      },
    },
  ),
)

/** Ask the browser not to evict our storage (helps on iOS home-screen apps). */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {})
}

export function useCharacter(id: string | undefined) {
  return useStore((s) => (id ? s.characters[id] : undefined))
}
