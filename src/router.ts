import { useEffect, useState } from 'react'

export type Route =
  | { name: 'roster' }
  | { name: 'new' }
  | { name: 'char'; id: string; tab: string }
  | { name: 'print'; id: string; layout: 'landscape' | 'portrait' }
  | { name: 'catalog' }
  | { name: 'rolls' }
  | { name: 'loot' }
  | { name: 'claim'; data: string }
  | { name: 'import'; data: string }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('import=')) return { name: 'import', data: h.slice(7) }
  if (h.startsWith('loot=')) return { name: 'claim', data: h.slice(5) }
  const parts = h.replace(/^\//, '').split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new' }
  if (parts[0] === 'c' && parts[1]) return { name: 'char', id: parts[1], tab: parts[2] ?? 'hud' }
  if (parts[0] === 'print' && parts[1]) return { name: 'print', id: parts[1], layout: parts[2] === 'portrait' ? 'portrait' : 'landscape' }
  if (parts[0] === 'catalog') return { name: 'catalog' }
  if (parts[0] === 'rolls') return { name: 'rolls' }
  if (parts[0] === 'loot') return { name: 'loot' }
  return { name: 'roster' }
}

export function go(path: string) {
  window.location.hash = path
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
