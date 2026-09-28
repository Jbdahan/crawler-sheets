import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import type { Part, Total } from '../engine/derived'

export function Sheet({ title, onClose, children, wide, actions }: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className={`sheet${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="btn small" onClick={onClose} aria-label="Close">Done</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, editable }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  editable?: boolean
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label="Decrease">−</button>
      {editable ? (
        <input
          inputMode="numeric"
          value={String(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d-]/g, ''))
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
        />
      ) : (
        <span className="v">{value}</span>
      )}
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label="Increase">+</button>
    </span>
  )
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export function Breakdown({ total, title }: { total: Total | { total: number; parts: Part[] }; title?: string }) {
  return (
    <div className="breakdown">
      {title && <div className="label" style={{ marginBottom: 4 }}>{title}</div>}
      {total.parts.map((p, i) => (
        <div className="row" key={i}>
          <span>{p.label}</span>
          <span className="num">{signed(p.value)}</span>
        </div>
      ))}
      <div className="row">
        <span>Total</span>
        <span className="num">{signed(total.total)}</span>
      </div>
    </div>
  )
}

export function PageRef({ page, book = 'Core' }: { page?: number; book?: string }) {
  if (!page) return null
  return <span className="pageref">{book} p.{page}</span>
}

interface ToastState {
  msg: string | null
  show: (msg: string) => void
}
export const useToast = create<ToastState>((set) => ({
  msg: null,
  show: (msg) => {
    set({ msg })
    setTimeout(() => set((s) => (s.msg === msg ? { msg: null } : s)), 2200)
  },
}))
export const toast = (msg: string) => useToast.getState().show(msg)

export function Toast() {
  const msg = useToast((s) => s.msg)
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

export function Confirm({ text, onYes, onNo, yes = 'Delete' }: { text: string; onYes: () => void; onNo: () => void; yes?: string }) {
  return (
    <Sheet title="Are you sure?" onClose={onNo}>
      <p>{text}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn grow" onClick={onNo}>Cancel</button>
        <button className="btn danger grow" onClick={onYes}>{yes}</button>
      </div>
    </Sheet>
  )
}

export function useLocal<T>(initial: T) {
  return useState<T>(initial)
}

type IconName = 'hud' | 'sword' | 'bolt' | 'list' | 'bag' | 'more' | 'dice' | 'back' | 'plus' | 'share' | 'print' | 'book' | 'up' | 'stairs'
const PATHS: Record<IconName, string> = {
  hud: 'M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z',
  sword: 'M14.5 3H21v6.5L10 20.5l-2-2-2.5 2.5L3 18.5 5.5 16l-2-2zM6.5 14l3.5 3.5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  bag: 'M6 7h12l1 14H5zM9 7V5a3 3 0 0 1 6 0v2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z',
  up: 'M12 19V5M5 12l7-7 7 7',
  stairs: 'M3 20h5v-5h5v-5h5V5h3',
}
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
